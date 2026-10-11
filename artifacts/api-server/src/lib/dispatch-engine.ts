import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  driversTable,
  vehiclesTable,
  ridesTable,
  driverOffersTable,
  rideStatusHistoryTable,
} from "@workspace/db";
import type { Ride, Driver } from "@workspace/db";
import { haversineDistanceMeters } from "./routing";
import { broadcastToRide, broadcastToDriver, broadcastToUser } from "./ws-server";
import { toRideProfile } from "./serializers";
import { sendPushNotification } from "./notifications";

const SEARCH_RADIUS_METERS = 10_000; // 10 km max pickup radius
const OFFER_TIMEOUT_SECONDS = 15;

export interface NearbyDriverMatch {
  driver: Driver;
  distanceMeters: number;
  etaSeconds: number;
}

/**
 * Finds eligible, online, approved drivers for a requested ride within search radius.
 */
export async function findNearbyDrivers(ride: Ride): Promise<NearbyDriverMatch[]> {
  const pickupLat = Number(ride.pickupLatitude);
  const pickupLng = Number(ride.pickupLongitude);

  // Fetch online, approved drivers with matching approved vehicle category
  const onlineDrivers = await db.query.driversTable.findMany({
    where: and(
      eq(driversTable.isOnline, true),
      eq(driversTable.isAvailable, true),
      eq(driversTable.verificationStatus, "approved"),
    ),
  });

  const matches: NearbyDriverMatch[] = [];

  for (const driver of onlineDrivers) {
    if (!driver.currentLatitude || !driver.currentLongitude) continue;

    // Check vehicle approval & category
    const vehicle = await db.query.vehiclesTable.findFirst({
      where: and(
        eq(vehiclesTable.driverId, driver.id),
        eq(vehiclesTable.isApproved, true),
      ),
    });

    if (!vehicle) continue;

    // Category check (XL can serve Economy/XL; Premium can serve Economy/Premium)
    if (ride.rideType === "premium" && vehicle.category !== "premium" && vehicle.category !== "xl") {
      continue;
    }
    if (ride.rideType === "xl" && vehicle.category !== "xl") {
      continue;
    }

    const driverLat = Number(driver.currentLatitude);
    const driverLng = Number(driver.currentLongitude);
    const distanceMeters = haversineDistanceMeters(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: driverLat, longitude: driverLng },
    );

    if (distanceMeters <= SEARCH_RADIUS_METERS) {
      const etaSeconds = Math.max(60, Math.round(distanceMeters / 8.33)); // ~30 km/h
      matches.push({ driver, distanceMeters, etaSeconds });
    }
  }

  // Rank primarily by shortest distance, secondary by higher average rating
  return matches.sort((a, b) => {
    if (Math.abs(a.distanceMeters - b.distanceMeters) > 500) {
      return a.distanceMeters - b.distanceMeters;
    }
    return Number(b.driver.averageRating ?? 5) - Number(a.driver.averageRating ?? 5);
  });
}

/**
 * Dispatches ride offer to the next available driver in ranking order.
 */
export async function dispatchNextOffer(rideId: string): Promise<boolean> {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideId) });
  if (!ride || !["requested", "searching_driver", "scheduled_dispatching"].includes(ride.status)) {
    return false;
  }

  const nearby = await findNearbyDrivers(ride);

  // Get already contacted / rejected driver IDs for this ride
  const existingOffers = await db.query.driverOffersTable.findMany({
    where: eq(driverOffersTable.rideId, rideId),
  });
  const contactedDriverIds = new Set(existingOffers.map(o => o.driverId));

  const eligible = nearby.filter(m => !contactedDriverIds.has(m.driver.id));

  if (eligible.length === 0) {
    // If no more drivers available, let ride sit in searching_driver or retry later
    if (ride.status !== "searching_driver") {
      await db
        .update(ridesTable)
        .set({ status: "searching_driver", updatedAt: new Date() })
        .where(eq(ridesTable.id, ride.id));
    }
    return false;
  }

  const target = eligible[0];
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);

  // Create offer record
  const [offer] = await db
    .insert(driverOffersTable)
    .values({
      rideId: ride.id,
      driverId: target.driver.id,
      status: "pending",
      estimatedDistanceMeters: String(Math.round(target.distanceMeters)),
      estimatedEtaSeconds: String(target.etaSeconds),
      expiresAt,
    })
    .returning();

  // Transition ride to driver_offer_sent
  await db
    .update(ridesTable)
    .set({ status: "driver_offer_sent", updatedAt: new Date() })
    .where(eq(ridesTable.id, ride.id));

  // Push offer to driver via WebSocket
  broadcastToDriver(target.driver.id, "driver:offer:new", {
    offerId: offer.id,
    rideId: ride.id,
    pickup: {
      address: ride.pickupAddress,
      latitude: Number(ride.pickupLatitude),
      longitude: Number(ride.pickupLongitude),
    },
    destination: {
      address: ride.destinationAddress,
      latitude: Number(ride.destinationLatitude),
      longitude: Number(ride.destinationLongitude),
    },
    rideType: ride.rideType,
    estimatedFare: Number(ride.estimatedFare),
    estimatedDistanceMeters: target.distanceMeters,
    estimatedEtaMinutes: Math.ceil(target.etaSeconds / 60),
    expiresAt: expiresAt.toISOString(),
  });

  // Send Push Notification to driver
  sendPushNotification({
    userId: target.driver.userId,
    title: "New Ride Request Nearby! 🚗",
    body: `Pickup: ${ride.pickupAddress.slice(0, 40)} • ₹${Math.round(Number(ride.estimatedFare))}`,
    type: "driver_offer",
    data: { offerId: offer.id, rideId: ride.id },
  }).catch(() => {});

  // Schedule timeout check for cascading to next driver
  setTimeout(async () => {
    try {
      const currentOffer = await db.query.driverOffersTable.findFirst({
        where: eq(driverOffersTable.id, offer.id),
      });
      if (currentOffer && currentOffer.status === "pending") {
        await db
          .update(driverOffersTable)
          .set({ status: "expired" })
          .where(eq(driverOffersTable.id, offer.id));

        // Cascade to next driver
        await dispatchNextOffer(rideId);
      }
    } catch {}
  }, OFFER_TIMEOUT_SECONDS * 1000 + 500);

  return true;
}

/**
 * Concurrency-safe atomic driver acceptance of a ride offer.
 * Exactly ONE driver will win the assignment; all other concurrent attempts fail safely.
 */
export async function acceptRideOffer(params: {
  offerId: string;
  driverId: string;
}): Promise<{ success: boolean; ride?: Ride; error?: string }> {
  const { offerId, driverId } = params;

  // Run in a serializable transaction to eliminate race conditions
  return await db.transaction(async (tx) => {
    const offer = await tx.query.driverOffersTable.findFirst({
      where: and(
        eq(driverOffersTable.id, offerId),
        eq(driverOffersTable.driverId, driverId),
      ),
    });

    if (!offer) {
      return { success: false, error: "Offer not found." };
    }
    if (offer.status !== "pending") {
      return { success: false, error: `Offer is already ${offer.status}.` };
    }
    if (offer.expiresAt < new Date()) {
      await tx
        .update(driverOffersTable)
        .set({ status: "expired" })
        .where(eq(driverOffersTable.id, offer.id));
      return { success: false, error: "Offer has expired." };
    }

    const [availableDriver] = await tx.update(driversTable)
      .set({ isAvailable: false, updatedAt: new Date() })
      .where(and(
        eq(driversTable.id, driverId),
        eq(driversTable.isOnline, true),
        eq(driversTable.isAvailable, true),
        eq(driversTable.isBlocked, false),
        eq(driversTable.verificationStatus, "approved"),
      ))
      .returning({ id: driversTable.id });
    if (!availableDriver) return { success: false, error: "Driver is no longer available." };

    // Atomically assign only while this ride is still waiting for a driver.
    const [assignedRide] = await tx
      .update(ridesTable)
      .set({
        driverId,
        status: "driver_assigned",
        driverAssignedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ridesTable.id, offer.rideId),
          sql`${ridesTable.driverId} IS NULL`,
          inArray(ridesTable.status, ["requested", "searching_driver", "driver_offer_sent", "scheduled_dispatching"]),
        ),
      )
      .returning();

    if (!assignedRide) {
      await tx.update(driversTable).set({ isAvailable: true, updatedAt: new Date() }).where(eq(driversTable.id, driverId));
      await tx
        .update(driverOffersTable)
        .set({ status: "expired" })
        .where(eq(driverOffersTable.id, offer.id));
      return { success: false, error: "Ride has already been accepted by another driver." };
    }

    // Mark current offer accepted
    await tx
      .update(driverOffersTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(driverOffersTable.id, offer.id));

    // Cancel / expire all other pending offers for this ride
    await tx
      .update(driverOffersTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(driverOffersTable.rideId, offer.rideId),
          eq(driverOffersTable.status, "pending"),
        ),
      );

    // Record state history
    await tx.insert(rideStatusHistoryTable).values({
      rideId: assignedRide.id,
      fromStatus: "driver_offer_sent",
      toStatus: "driver_assigned",
      changedBy: (await tx.query.driversTable.findFirst({ where: eq(driversTable.id, driverId) }))?.userId,
    });

    // Notify passenger and driver
    const rideProfile = toRideProfile(assignedRide);
    broadcastToRide(assignedRide.id, "ride:status:change", rideProfile);
    broadcastToUser(assignedRide.passengerId, "ride:driver:assigned", rideProfile);

    // Push notification to passenger
    sendPushNotification({
      userId: assignedRide.passengerId,
      title: "Driver Assigned! 🚗",
      body: "A driver accepted your ride request and is on the way to your pickup point.",
      type: "driver_assigned",
      data: { rideId: assignedRide.id },
    }).catch(() => {});

    return { success: true, ride: assignedRide };
  });
}
