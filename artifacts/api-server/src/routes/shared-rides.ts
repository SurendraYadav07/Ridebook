import { Router, type IRouter } from "express";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import {
  db,
  sharedRidesTable,
  sharedRidePassengersTable,
  sharedRideStopsTable,
  usersTable,
  driversTable,
} from "@workspace/db";
import { authenticate } from "../middleware/auth";
import { calculateRoute, haversineDistanceMeters } from "../lib/routing";
import { computeFareBreakdown, getActiveFareConfiguration } from "../lib/fare";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /shared-rides — Request or match into a shared carpooling ride
// ---------------------------------------------------------------------------
router.post("/shared-rides", authenticate, async (req, res) => {
  const { pickup, destination, seatCount = 1 } = req.body;
  const validPoint = (point: any) => Number.isFinite(Number(point?.latitude)) && Number(point.latitude) >= -90 && Number(point.latitude) <= 90 && Number.isFinite(Number(point?.longitude)) && Number(point.longitude) >= -180 && Number(point.longitude) <= 180;
  if (typeof pickup?.address !== "string" || !pickup.address.trim() || !validPoint(pickup) || typeof destination?.address !== "string" || !destination.address.trim() || !validPoint(destination) || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 4) {
    res.status(400).json({ error: "invalid_request", message: "Valid pickup and destination required." });
    return;
  }

  const existingPassenger = await db.query.sharedRidePassengersTable.findFirst({
    where: and(eq(sharedRidePassengersTable.passengerId, req.auth!.userId), inArray(sharedRidePassengersTable.status, ["requested", "confirmed", "picked_up"])),
  });
  if (existingPassenger) {
    res.status(409).json({ error: "active_shared_ride_exists", message: "You already have an active shared ride." });
    return;
  }

  const route = await calculateRoute(
    { latitude: pickup.latitude, longitude: pickup.longitude },
    { latitude: destination.latitude, longitude: destination.longitude },
  );

  const config = await getActiveFareConfiguration("economy");
  const soloFare = computeFareBreakdown({
    config,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
  });

  const sharedSeatFare = Math.round(soloFare.totalAmount * 0.65 * 100) / 100;

  const candidates = await db.query.sharedRidesTable.findMany({
    where: and(eq(sharedRidesTable.status, "matching"), gte(sharedRidesTable.availableSeats, seatCount)),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
    limit: 50,
  });
  let candidateId: string | null = null;
  for (const candidate of candidates) {
    const members = await db.query.sharedRidePassengersTable.findMany({
      where: and(eq(sharedRidePassengersTable.sharedRideId, candidate.id), inArray(sharedRidePassengersTable.status, ["requested", "confirmed", "picked_up"])),
    });
    const routeCompatible = members.length > 0 && members.every((member) =>
      haversineDistanceMeters({ latitude: Number(member.pickupLatitude), longitude: Number(member.pickupLongitude) }, { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) }) <= 2_000 &&
      haversineDistanceMeters({ latitude: Number(member.destinationLatitude), longitude: Number(member.destinationLongitude) }, { latitude: Number(destination.latitude), longitude: Number(destination.longitude) }) <= 2_000,
    );
    if (routeCompatible) { candidateId = candidate.id; break; }
  }

  const sharedRideId = await db.transaction(async (tx) => {
    let sharedRideId: string | null = null;
    if (candidateId) {
      const [updated] = await tx.update(sharedRidesTable)
        .set({ availableSeats: sql`${sharedRidesTable.availableSeats} - ${seatCount}`, totalFare: sql`${sharedRidesTable.totalFare} + ${sharedSeatFare}`, updatedAt: new Date() })
        .where(and(eq(sharedRidesTable.id, candidateId), eq(sharedRidesTable.status, "matching"), gte(sharedRidesTable.availableSeats, seatCount)))
        .returning({ id: sharedRidesTable.id });
      if (updated) sharedRideId = updated.id;
      else candidateId = null;
    }
    if (!sharedRideId) {
      const [created] = await tx.insert(sharedRidesTable).values({
        status: "matching", maxSeats: 4, availableSeats: 4 - seatCount,
        totalDistanceMeters: String(Math.round(route.distanceMeters)),
        totalDurationSeconds: String(route.durationSeconds), totalFare: String(sharedSeatFare),
      }).returning({ id: sharedRidesTable.id });
      sharedRideId = created.id;
    }
    await tx.insert(sharedRidePassengersTable).values({
      sharedRideId, passengerId: req.auth!.userId, seatCount, status: "confirmed",
      pickupAddress: pickup.address.trim(), pickupLatitude: String(pickup.latitude), pickupLongitude: String(pickup.longitude),
      destinationAddress: destination.address.trim(), destinationLatitude: String(destination.latitude), destinationLongitude: String(destination.longitude), fare: String(sharedSeatFare),
    });
    await tx.insert(sharedRideStopsTable).values([
      { sharedRideId, passengerId: req.auth!.userId, stopType: "pickup", sequenceOrder: 1, address: pickup.address.trim(), latitude: String(pickup.latitude), longitude: String(pickup.longitude) },
      { sharedRideId, passengerId: req.auth!.userId, stopType: "dropoff", sequenceOrder: 2, address: destination.address.trim(), latitude: String(destination.latitude), longitude: String(destination.longitude) },
    ]);
    return sharedRideId;
  });

  const full = await getSharedRideProfile(sharedRideId);
  res.status(201).json(full);
});

// ---------------------------------------------------------------------------
// GET /shared-rides/:id — Get shared ride details
// ---------------------------------------------------------------------------
router.get("/shared-rides/:id", authenticate, async (req, res) => {
  const sharedRide = await db.query.sharedRidesTable.findFirst({ where: eq(sharedRidesTable.id, String(req.params.id)) });
  if (!sharedRide) {
    res.status(404).json({ error: "not_found", message: "Shared ride not found." });
    return;
  }
  const passenger = await db.query.sharedRidePassengersTable.findFirst({
    where: and(eq(sharedRidePassengersTable.sharedRideId, sharedRide.id), eq(sharedRidePassengersTable.passengerId, req.auth!.userId), inArray(sharedRidePassengersTable.status, ["requested", "confirmed", "picked_up", "dropped_off"])),
  });
  const driver = req.auth!.role === "driver" && sharedRide.driverId
    ? await db.query.driversTable.findFirst({ where: and(eq(driversTable.id, sharedRide.driverId), eq(driversTable.userId, req.auth!.userId)) })
    : null;
  if (!passenger && !driver && req.auth!.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "You are not a participant in this shared ride." });
    return;
  }
  const profile = await getSharedRideProfile(String(req.params.id));
  if (!profile) {
    res.status(404).json({ error: "not_found", message: "Shared ride not found." });
    return;
  }
  res.status(200).json(profile);
});

// ---------------------------------------------------------------------------
// POST /shared-rides/:id/cancel — Cancel individual passenger seat in shared ride
// ---------------------------------------------------------------------------
router.post("/shared-rides/:id/cancel", authenticate, async (req, res) => {
  const cancelled = await db.transaction(async (tx) => {
    const sharedRide = await tx.query.sharedRidesTable.findFirst({ where: eq(sharedRidesTable.id, String(req.params.id)) });
    if (!sharedRide || sharedRide.status !== "matching") return false;
    const [passenger] = await tx.update(sharedRidePassengersTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(sharedRidePassengersTable.sharedRideId, sharedRide.id),
        eq(sharedRidePassengersTable.passengerId, req.auth!.userId),
        inArray(sharedRidePassengersTable.status, ["requested", "confirmed"]),
      ))
      .returning({ seatCount: sharedRidePassengersTable.seatCount });
    if (!passenger) return false;
    await tx.update(sharedRidesTable)
      .set({
        availableSeats: sql`LEAST(${sharedRidesTable.maxSeats}, ${sharedRidesTable.availableSeats} + ${passenger.seatCount})`,
        updatedAt: new Date(),
      })
      .where(eq(sharedRidesTable.id, sharedRide.id));
    return true;
  });
  if (!cancelled) {
    res.status(409).json({ error: "ride_not_cancellable", message: "This shared ride is no longer accepting cancellations." });
    return;
  }

  res.status(200).json({ success: true });
});

async function getSharedRideProfile(sharedRideId: string) {
  const sharedRide = await db.query.sharedRidesTable.findFirst({
    where: eq(sharedRidesTable.id, sharedRideId),
  });
  if (!sharedRide) return null;

  const [passengers, stops] = await Promise.all([
    db.query.sharedRidePassengersTable.findMany({ where: eq(sharedRidePassengersTable.sharedRideId, sharedRideId) }),
    db.query.sharedRideStopsTable.findMany({ where: eq(sharedRideStopsTable.sharedRideId, sharedRideId) }),
  ]);

  const passengerProfiles = await Promise.all(
    passengers.map(async (p) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, p.passengerId) });
      return {
        passengerId: p.passengerId,
        passengerName: user?.name ?? "Passenger",
        seatCount: p.seatCount,
        fare: Number(p.fare),
        status: p.status,
        pickupAddress: p.pickupAddress,
        destinationAddress: p.destinationAddress,
      };
    }),
  );

  return {
    id: sharedRide.id,
    status: sharedRide.status,
    availableSeats: sharedRide.availableSeats,
    maxSeats: sharedRide.maxSeats,
    passengers: passengerProfiles,
    stops: stops.map(s => ({
      sequenceOrder: s.sequenceOrder,
      stopType: s.stopType,
      address: s.address,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      passengerId: s.passengerId,
      estimatedArrival: s.estimatedArrival ? s.estimatedArrival.toISOString() : null,
    })),
    createdAt: sharedRide.createdAt.toISOString(),
  };
}

export default router;
