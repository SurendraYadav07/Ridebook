import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  ridesTable,
  driversTable,
  vehiclesTable,
  rideStatusHistoryTable,
  promoUsageTable,
  ratingsTable,
  rideMessagesTable,
  tripShareTokensTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middleware/auth";
import { toRideProfile } from "../lib/serializers";
import {
  getActiveFareConfiguration,
  computeFareBreakdown,
  calculateWaitingCharges,
  calculateCancellationFee,
  validatePromoCode,
} from "../lib/fare";
import { calculateRoute, calculateMultiStopRoute, haversineDistanceMeters } from "../lib/routing";
import { canTransition, CANCELLABLE_STATUSES, ACTIVE_STATUSES } from "../lib/ride-state-machine";
import { dispatchNextOffer } from "../lib/dispatch-engine";
import { recordTripEarnings } from "../lib/ledger";
import { broadcastToRide, broadcastToUser, broadcastToDriver } from "../lib/ws-server";
import { sendPushNotification } from "../lib/notifications";
import { idempotencyMiddleware } from "../middleware/idempotency";
import { matchNearestDriver, releaseDriverAvailability } from "../lib/postgis-matcher";

const router: IRouter = Router();

function validCoordinate(value: unknown, min: number, max: number): value is number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validPoint(point: any): boolean {
  return validCoordinate(point?.latitude, -90, 90) && validCoordinate(point?.longitude, -180, 180);
}

// ---------------------------------------------------------------------------
// POST /rides/match — Match passenger with closest driver within 3 km (PostGIS)
// ---------------------------------------------------------------------------
router.post("/rides/match", authenticate, async (req, res) => {
  const { origin, destination, rideType = "economy" } = req.body ?? {};

  if (!validPoint(origin) || !validPoint(destination) || !["economy", "premium", "xl", "shared"].includes(rideType)) {
    res.status(400).json({ error: "invalid_request", message: "Valid origin and destination coordinates are required." });
    return;
  }

  try {
    const route = await calculateRoute(
      { latitude: Number(origin.latitude), longitude: Number(origin.longitude) },
      { latitude: Number(destination.latitude), longitude: Number(destination.longitude) },
    );
    const config = await getActiveFareConfiguration(rideType);
    const fare = computeFareBreakdown({ config, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
    const result = await matchNearestDriver({
      origin: {
        latitude: Number(origin.latitude),
        longitude: Number(origin.longitude),
        address: origin.address,
      },
      destination: {
        latitude: Number(destination.latitude),
        longitude: Number(destination.longitude),
        address: destination.address,
      },
      rideType,
      fareCents: Math.round(fare.totalAmount * 100),
      passengerId: req.auth!.userId,
    });

    if (result.matchFound && result.rideId) {
      broadcastToRide(result.rideId, "ride:matched", result);
      if (result.driverId) {
        broadcastToDriver(result.driverId, "driver:ride:assigned", result);
      }
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error("[POST /rides/match] Matching error:", err);
    res.status(500).json({ error: "matching_failed", message: err.message || "Failed to process driver matching." });
  }
});

// ---------------------------------------------------------------------------
// POST /rides/quote — Upfront server-calculated fare quote for all ride types
// ---------------------------------------------------------------------------
router.post("/rides/quote", authenticate, async (req, res) => {
  const { pickup, destination, stops, promoCode } = req.body;
  if (!validPoint(pickup) || !validPoint(destination) || (stops !== undefined && !Array.isArray(stops))) {
    res.status(400).json({ error: "invalid_request", message: "Valid pickup and destination coordinates are required." });
    return;
  }

  const rawStops = Array.isArray(stops) ? stops : [];
  if (rawStops.length > 5 || rawStops.some((stop: any) => !validPoint(stop))) {
    res.status(400).json({ error: "invalid_stops", message: "Provide at most five stops with valid coordinates." });
    return;
  }
  const points = [
    { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
    ...rawStops.map((s: any) => ({ latitude: Number(s.latitude), longitude: Number(s.longitude) })),
    { latitude: Number(destination.latitude), longitude: Number(destination.longitude) },
  ];

  const route = points.length > 2
    ? await calculateMultiStopRoute(points)
    : await calculateRoute(points[0], points[1]);

  const rideTypes = [
    { type: "shared" as const, name: "Share & Save (Carpool)", seats: 1, etaMinutes: 5 },
    { type: "economy" as const, name: "Economy", seats: 4, etaMinutes: 4 },
    { type: "premium" as const, name: "Premium", seats: 4, etaMinutes: 6 },
    { type: "xl" as const, name: "XL", seats: 6, etaMinutes: 8 },
  ];

  const options = [];

  for (const rt of rideTypes) {
    const config = await getActiveFareConfiguration(rt.type);
    let discountAmount = 0;
    if (promoCode) {
      const validation = await validatePromoCode({
        code: promoCode,
        userId: req.auth!.userId,
        rideType: rt.type,
        fareBeforeDiscount: Number(config.baseFare) + (route.distanceMeters / 1000) * Number(config.perKm),
      });
      if (validation.valid) {
        discountAmount = validation.discountAmount ?? 0;
      }
    }

    const breakdown = computeFareBreakdown({
      config,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      discountAmount,
    });

    options.push({
      rideType: rt.type,
      name: rt.name,
      seats: rt.seats,
      etaMinutes: rt.etaMinutes,
      baseFare: breakdown.baseFare,
      distanceFare: breakdown.distanceCharge,
      timeFare: breakdown.timeCharge,
      surgeMultiplier: breakdown.surgeMultiplier,
      discountAmount: breakdown.discount,
      finalFare: breakdown.totalAmount,
    });
  }

  res.status(200).json({
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    options,
  });
});

// ---------------------------------------------------------------------------
// POST /rides/available-drivers — Fetch available drivers & pricing for route
// ---------------------------------------------------------------------------
router.post("/rides/available-drivers", authenticate, async (req, res) => {
  const { pickup, destination, stops, promoCode } = req.body ?? {};

  if (!pickup?.latitude || !pickup?.longitude || !destination?.latitude || !destination?.longitude) {
    res.status(400).json({ error: "invalid_request", message: "Valid pickup and destination coordinates are required." });
    return;
  }

  const pickupLat = Number(pickup.latitude);
  const pickupLng = Number(pickup.longitude);
  const destLat = Number(destination.latitude);
  const destLng = Number(destination.longitude);

  const rawStops = Array.isArray(stops) ? stops : [];
  const points = [
    { latitude: pickupLat, longitude: pickupLng },
    ...rawStops.map((s: any) => ({ latitude: Number(s.latitude), longitude: Number(s.longitude) })),
    { latitude: destLat, longitude: destLng },
  ];

  const route = points.length > 2
    ? await calculateMultiStopRoute(points)
    : await calculateRoute(points[0], points[1]);

  const routeDistanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
  const routeDurationMin = Math.max(1, Math.round(route.durationSeconds / 60));

  // Compute fare quotes per vehicle category
  const fareQuotes: Record<string, { raw: number; final: number; discount: number }> = {};
  for (const rt of ["shared", "economy", "premium", "xl"] as const) {
    const config = await getActiveFareConfiguration(rt);
    let discountAmount = 0;
    if (promoCode) {
      const validation = await validatePromoCode({
        code: promoCode,
        userId: req.auth!.userId,
        rideType: rt,
        fareBeforeDiscount: Number(config.baseFare) + (route.distanceMeters / 1000) * Number(config.perKm),
      });
      if (validation.valid) {
        discountAmount = validation.discountAmount ?? 0;
      }
    }

    const rawBreakdown = computeFareBreakdown({
      config,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      discountAmount: 0,
    });
    const discountedBreakdown = computeFareBreakdown({
      config,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      discountAmount,
    });

    fareQuotes[rt] = {
      raw: rawBreakdown.totalAmount,
      final: discountedBreakdown.totalAmount,
      discount: discountedBreakdown.discount,
    };
  }

  // 1. Query online, approved drivers from DB within 10 km
  const drivers: any[] = [];
  try {
    const onlineDrivers = await db.query.driversTable.findMany({
      where: and(
        eq(driversTable.isOnline, true),
        eq(driversTable.verificationStatus, "approved"),
        eq(driversTable.isBlocked, false),
      ),
    });

    for (const d of onlineDrivers) {
      if (!d.currentLatitude || !d.currentLongitude) continue;
      const driverLat = Number(d.currentLatitude);
      const driverLng = Number(d.currentLongitude);
      const distMeters = haversineDistanceMeters(
        { latitude: pickupLat, longitude: pickupLng },
        { latitude: driverLat, longitude: driverLng },
      );

      if (distMeters <= 10_000) {
        const [user, vehicle] = await Promise.all([
          db.query.usersTable.findFirst({ where: eq(usersTable.id, d.userId) }),
          db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, d.id) }),
        ]);

        const rideType = vehicle?.category ?? (d.model?.toLowerCase().includes("innova") ? "xl" : d.model?.toLowerCase().includes("honda") ? "premium" : "economy");
        const fareInfo = fareQuotes[rideType] ?? fareQuotes.economy;
        const etaMinutes = Math.max(2, Math.round(distMeters / 400));
        const distanceToPickupKm = Math.round((distMeters / 1000) * 10) / 10;

        drivers.push({
          id: `opt_${d.id}`,
          driverId: d.id,
          driverName: user?.name ?? "Nearby Partner",
          rating: Number(d.averageRating ?? 4.9),
          totalTrips: Number(d.totalRides ?? 50),
          rideType,
          vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : (d.model ?? "Sedan / Hatchback"),
          plateNumber: vehicle?.plateNumber ?? d.plateNumber ?? undefined,
          estimatedFare: fareInfo.final,
          originalFare: fareInfo.raw,
          discountAmount: fareInfo.discount,
          etaMinutes,
          distanceToPickupKm,
          seats: rideType === "xl" ? 6 : 4,
        });
      }
    }
  } catch (err) {
    console.warn("[POST /rides/available-drivers] Error querying live drivers:", err);
  }

  // Only show verified, online drivers returned from the database.
  drivers.sort((a, b) => a.etaMinutes - b.etaMinutes);

  res.status(200).json({
    routeDistanceKm,
    routeDurationMin,
    drivers,
  });
});

// ---------------------------------------------------------------------------
// POST /rides — Create instant or scheduled ride request
// ---------------------------------------------------------------------------
router.post("/rides", authenticate, idempotencyMiddleware, async (req, res) => {
  const { rideType = "economy", pickup, destination, stops, promoCode, scheduledFor } = req.body;

  if (!pickup?.address || typeof pickup.address !== "string" || !validPoint(pickup) ||
      !destination?.address || typeof destination.address !== "string" || !validPoint(destination) ||
      !["economy", "premium", "xl", "shared"].includes(rideType) ||
      (stops !== undefined && !Array.isArray(stops))) {
    res.status(400).json({ error: "invalid_request", message: "Valid pickup and destination details are required." });
    return;
  }

  const rawStops = Array.isArray(stops) ? stops : [];
  if (rawStops.length > 5 || rawStops.some((stop: any) => !stop || typeof stop.address !== "string" || !stop.address.trim() || !validPoint(stop))) {
    res.status(400).json({ error: "invalid_stops", message: "Provide at most five stops with addresses and valid coordinates." });
    return;
  }
  let scheduledDate: Date | null = null;
  if (scheduledFor !== undefined && scheduledFor !== null) {
    scheduledDate = new Date(scheduledFor);
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() + 10 * 60 * 1000) {
      res.status(400).json({ error: "invalid_schedule", message: "Scheduled rides must be at least 10 minutes in the future." });
      return;
    }
  }
  const formattedStops = rawStops.map((s: any, idx: number) => ({
    address: String(s.address),
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    name: s.name ? String(s.name) : undefined,
    sequenceOrder: typeof s.sequenceOrder === 'number' ? s.sequenceOrder : idx + 1,
  }));

  const points = [
    { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
    ...formattedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    { latitude: Number(destination.latitude), longitude: Number(destination.longitude) },
  ];

  const config = await getActiveFareConfiguration(rideType);
  const route = points.length > 2
    ? await calculateMultiStopRoute(points)
    : await calculateRoute(points[0], points[1]);

  const preDiscountFare = computeFareBreakdown({
    config,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
  });

  let discountAmount = 0;
  let promoCodeId: string | null = null;
  if (promoCode) {
    const validation = await validatePromoCode({
      code: promoCode,
      userId: req.auth!.userId,
      rideType,
      fareBeforeDiscount: preDiscountFare.totalAmount,
    });
    if (!validation.valid) {
      res.status(400).json({ error: "invalid_promo", message: validation.reason ?? "Invalid promo code." });
      return;
    }
    discountAmount = validation.discountAmount ?? 0;
    promoCodeId = validation.promoCodeId ?? null;
  }

  const finalEstimate = computeFareBreakdown({
    config,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    discountAmount,
  });

  const startTripOtp = crypto.randomInt(1000, 10_000).toString();
  const isScheduled = Boolean(scheduledDate);
  const initialStatus = isScheduled ? "scheduled" : "searching_driver";
  const isSharedRide = rideType === "shared";

  const [ride] = await db
    .insert(ridesTable)
    .values({
      passengerId: req.auth!.userId,
      rideType,
      status: initialStatus,
      isShared: isSharedRide,
      coRiderCount: 0,
      coRiderName: null,
      coRiderPickupAddress: null,
      coRiderDropoffAddress: null,
      pickupAddress: pickup.address,
      pickupLatitude: String(pickup.latitude),
      pickupLongitude: String(pickup.longitude),
      destinationAddress: destination.address,
      destinationLatitude: String(destination.latitude),
      destinationLongitude: String(destination.longitude),
      stops: formattedStops.length > 0 ? formattedStops : null,
      distanceMeters: String(Math.round(route.distanceMeters)),
      etaSeconds: String(route.durationSeconds),
      estimatedFare: String(finalEstimate.totalAmount),
      promoCodeId,
      scheduledFor: scheduledDate,
      startTripOtp,
    })
    .returning();

  await db.insert(rideStatusHistoryTable).values({
    rideId: ride.id,
    fromStatus: null,
    toStatus: initialStatus,
    changedBy: req.auth!.userId,
  });

  if (promoCodeId && discountAmount > 0) {
    await db.insert(promoUsageTable).values({
      promoCodeId,
      userId: req.auth!.userId,
      rideId: ride.id,
      discountApplied: String(discountAmount),
    });
  }

  if (!isScheduled) {
    dispatchNextOffer(ride.id).catch(() => {});
  }

  res.status(201).json(toRideProfile(ride, { includeStartTripOtp: true }));
});

// ---------------------------------------------------------------------------
// GET /rides/history — Completed / cancelled rides
// ---------------------------------------------------------------------------
router.get("/rides/history", authenticate, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);

  const ownerFilter = await buildOwnerFilter(req.auth!.userId, req.auth!.role);
  const statusFilter = inArray(ridesTable.status, ["trip_completed", "payment_completed", "passenger_cancelled", "driver_cancelled", "cancelled"]);
  const where = and(ownerFilter, statusFilter);

  const [rides, totalRow] = await Promise.all([
    db.query.ridesTable.findMany({
      where,
      orderBy: [desc(ridesTable.createdAt)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(ridesTable).where(where),
  ]);

  const profiles = await Promise.all(rides.map(r => enrichRideProfile(r)));

  res.status(200).json({
    rides: profiles,
    total: totalRow[0]?.count ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /rides/upcoming — Active and scheduled rides
// ---------------------------------------------------------------------------
router.get("/rides/upcoming", authenticate, async (req, res) => {
  const ownerFilter = await buildOwnerFilter(req.auth!.userId, req.auth!.role);
  const where = and(ownerFilter, inArray(ridesTable.status, ACTIVE_STATUSES));

  const rides = await db.query.ridesTable.findMany({
    where,
    orderBy: [desc(ridesTable.createdAt)],
  });

  const profiles = await Promise.all(rides.map(r => enrichRideProfile(r, req.auth!.role === "passenger")));

  res.status(200).json({ rides: profiles, total: rides.length });
});

// ---------------------------------------------------------------------------
// GET /rides/:id — Single ride details
// ---------------------------------------------------------------------------
router.get("/rides/:id", authenticate, async (req, res) => {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  const authorized = await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role);
  if (!authorized) {
    res.status(403).json({ error: "forbidden", message: "You are not authorized to view this ride." });
    return;
  }

  const enriched = await enrichRideProfile(ride, req.auth!.role === "passenger");
  res.status(200).json(enriched);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/cancel — Cancel ride and compute cancellation fee
// ---------------------------------------------------------------------------
router.post("/rides/:id/cancel", authenticate, idempotencyMiddleware, async (req, res) => {
  const { reason } = req.body ?? {};
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  const authorized = await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role);
  if (!authorized) {
    res.status(403).json({ error: "forbidden", message: "You are not authorized to cancel this ride." });
    return;
  }

  if (!CANCELLABLE_STATUSES.includes(ride.status)) {
    res.status(409).json({
      error: "not_cancellable",
      message: `Ride in status "${ride.status}" can no longer be cancelled.`,
    });
    return;
  }

  const nextStatus = req.auth!.role === "driver" ? "driver_cancelled" : "passenger_cancelled";
  const transition = canTransition(ride.status, nextStatus, req.auth!.role);
  if (!transition.allowed) {
    res.status(409).json({ error: "invalid_transition", message: transition.reason });
    return;
  }

  const cancellationFee = await calculateCancellationFee({
    ride,
    cancelledByRole: req.auth!.role === "driver" ? "driver" : "passenger",
  });

  // Update the ride and its audit record together. The status predicate also
  // prevents two concurrent cancel requests from both succeeding.
  const updated = await db.transaction(async (tx) => {
    const [cancelledRide] = await tx
      .update(ridesTable)
      .set({
        status: nextStatus,
        cancelledBy: req.auth!.userId,
        cancellationReason: reason ?? null,
        cancellationFeeCharged: String(cancellationFee),
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ridesTable.id, ride.id), eq(ridesTable.status, ride.status)))
      .returning();

    if (!cancelledRide) return null;

    await tx.insert(rideStatusHistoryTable).values({
      rideId: ride.id,
      fromStatus: ride.status,
      toStatus: nextStatus,
      changedBy: req.auth!.userId,
    });

    return cancelledRide;
  });

  if (!updated) {
    res.status(409).json({
      error: "not_cancellable",
      message: "This ride has already changed and can no longer be cancelled.",
    });
    return;
  }

  if (ride.driverId) {
    await releaseDriverAvailability(ride.driverId).catch(() => {});
  }

  const enriched = await enrichRideProfile(updated);
  broadcastToRide(ride.id, "ride:status:change", enriched);

  res.status(200).json(enriched);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/arrive — Driver marks arrived at pickup
// ---------------------------------------------------------------------------
router.post("/rides/:id/arrive", authenticate, async (req, res) => {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not assigned to this ride." });
    return;
  }

  const transition = canTransition(ride.status, "driver_arrived", req.auth!.role);
  if (!transition.allowed) {
    res.status(409).json({ error: "invalid_transition", message: transition.reason });
    return;
  }

  const [updated] = await db
    .update(ridesTable)
    .set({
      status: "driver_arrived",
      driverArrivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ridesTable.id, ride.id))
    .returning();

  await db.insert(rideStatusHistoryTable).values({
    rideId: ride.id,
    fromStatus: ride.status,
    toStatus: "driver_arrived",
    changedBy: req.auth!.userId,
  });

  const enriched = await enrichRideProfile(updated!);
  broadcastToRide(ride.id, "ride:status:change", enriched);
  broadcastToUser(ride.passengerId, "ride:driver:arrived", enriched);

  sendPushNotification({
    userId: ride.passengerId,
    title: "Driver Arrived! 📍",
    body: "Your driver is waiting at the pickup location.",
    type: "driver_arrived",
    data: { rideId: ride.id },
  }).catch(() => {});

  res.status(200).json(enriched);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/start — Driver starts trip (with OTP check)
// ---------------------------------------------------------------------------
router.post("/rides/:id/start", authenticate, async (req, res) => {
  const { otpCode } = req.body ?? {};
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not assigned to this ride." });
    return;
  }

  if (!ride.startTripOtp || !otpCode || otpCode !== ride.startTripOtp) {
    res.status(400).json({ error: "invalid_otp", message: "Incorrect trip start OTP code." });
    return;
  }

  const transition = canTransition(ride.status, "trip_started", req.auth!.role);
  if (!transition.allowed) {
    res.status(409).json({ error: "invalid_transition", message: transition.reason });
    return;
  }

  const [updated] = await db
    .update(ridesTable)
    .set({
      status: "trip_started",
      tripStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ridesTable.id, ride.id))
    .returning();

  await db.insert(rideStatusHistoryTable).values({
    rideId: ride.id,
    fromStatus: ride.status,
    toStatus: "trip_started",
    changedBy: req.auth!.userId,
  });

  const enriched = await enrichRideProfile(updated!);
  broadcastToRide(ride.id, "ride:status:change", enriched);
  broadcastToUser(ride.passengerId, "ride:trip:started", enriched);

  res.status(200).json(enriched);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/complete — Driver completes trip & credits wallet
// ---------------------------------------------------------------------------
router.post("/rides/:id/complete", authenticate, async (req, res) => {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not assigned to this ride." });
    return;
  }

  const transition = canTransition(ride.status, "trip_completed", req.auth!.role);
  if (!transition.allowed) {
    res.status(409).json({ error: "invalid_transition", message: transition.reason });
    return;
  }

  const wait = calculateWaitingCharges({
    arrivedAt: ride.driverArrivedAt ? new Date(ride.driverArrivedAt) : null,
    startedAt: ride.tripStartedAt ? new Date(ride.tripStartedAt) : null,
    freeWaitingMinutes: Number(ride.freeWaitingMinutes ?? 3),
  });

  const baseFare = Number(ride.estimatedFare ?? 50);
  const finalFare = Math.round((baseFare + wait.waitingCharges) * 100) / 100;

  const [updated] = await db
    .update(ridesTable)
    .set({
      status: "trip_completed",
      paidWaitingMinutes: String(wait.paidMinutes),
      waitingCharges: String(wait.waitingCharges),
      finalFare: String(finalFare),
      tripCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ridesTable.id, ride.id))
    .returning();

  await db.insert(rideStatusHistoryTable).values({
    rideId: ride.id,
    fromStatus: ride.status,
    toStatus: "trip_completed",
    changedBy: req.auth!.userId,
  });

  if (ride.driverId) {
    await recordTripEarnings({
      rideId: ride.id,
      driverId: ride.driverId,
      fareAmount: finalFare,
      waitingCharges: wait.waitingCharges,
    });
    await releaseDriverAvailability(ride.driverId).catch(() => {});
  }

  const enriched = await enrichRideProfile(updated!);
  broadcastToRide(ride.id, "ride:status:change", enriched);
  broadcastToUser(ride.passengerId, "ride:trip:completed", enriched);

  sendPushNotification({
    userId: ride.passengerId,
    title: "Trip Completed! 🎉",
    body: `Your ride is complete. Total fare: ₹${Math.round(finalFare)}. Tap to rate your experience.`,
    type: "trip_completed",
    data: { rideId: ride.id },
  }).catch(() => {});

  res.status(200).json(enriched);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/rate — Rate ride and tip driver
// ---------------------------------------------------------------------------
router.post("/rides/:id/rate", authenticate, async (req, res) => {
  const { stars, tip = 0, compliments, review } = req.body;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5 || !Number.isFinite(Number(tip)) || Number(tip) < 0) {
    res.status(400).json({ error: "invalid_request", message: "Stars rating must be between 1 and 5." });
    return;
  }

  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role)) || !["trip_completed", "payment_pending", "payment_completed", "completed"].includes(ride.status)) {
    res.status(403).json({ error: "forbidden", message: "Only ride participants can rate a completed ride." });
    return;
  }
  const priorRating = await db.query.ratingsTable.findFirst({
    where: and(eq(ratingsTable.rideId, ride.id), eq(ratingsTable.raterId, req.auth!.userId)),
  });
  if (priorRating) {
    res.status(409).json({ error: "already_rated", message: "You have already rated this ride." });
    return;
  }

  const rateeId = req.auth!.userId === ride.passengerId ? (ride.driverId ? (await db.query.driversTable.findFirst({ where: eq(driversTable.id, ride.driverId) }))?.userId ?? ride.passengerId : ride.passengerId) : ride.passengerId;

  const [rating] = await db
    .insert(ratingsTable)
    .values({
      rideId: ride.id,
      raterId: req.auth!.userId,
      rateeId,
      stars: String(stars),
      review: review || (compliments ? compliments.join(", ") : null),
    })
    .returning();

  if (ride.driverId) {
    if (tip > 0) {
      await recordTripEarnings({
        rideId: ride.id,
        driverId: ride.driverId,
        fareAmount: 0,
        tipAmount: Number(tip),
      });
    }

    // Update driver's average rating in driversTable
    const driver = await db.query.driversTable.findFirst({
      where: eq(driversTable.id, ride.driverId),
    });
    if (driver) {
      const driverRatings = await db.query.ratingsTable.findMany({
        where: eq(ratingsTable.rateeId, driver.userId),
      });
      if (driverRatings.length > 0) {
        const sum = driverRatings.reduce((acc, r) => acc + Number(r.stars), 0);
        const avg = (sum / driverRatings.length).toFixed(2);
        await db
          .update(driversTable)
          .set({ averageRating: avg, updatedAt: new Date() })
          .where(eq(driversTable.id, driver.id));
      }
    }
  }

  res.status(200).json({
    ratingId: rating.id,
    stars: Number(rating.stars),
    tip: Number(tip),
  });
});

// ---------------------------------------------------------------------------
// GET /rides/:id/messages — In-app chat messages
// ---------------------------------------------------------------------------
router.get("/rides/:id/messages", authenticate, async (req, res) => {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }
  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not a participant in this ride." });
    return;
  }
  const messages = await db.query.rideMessagesTable.findMany({
    where: eq(rideMessagesTable.rideId, String(req.params.id)),
    orderBy: [desc(rideMessagesTable.createdAt)],
    limit: 50,
  });

  const serialized = messages.map(m => ({
    id: m.id,
    rideId: m.rideId,
    senderId: m.senderId,
    senderRole: req.auth!.role,
    body: m.body,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  }));

  res.status(200).json(serialized.reverse());
});

// ---------------------------------------------------------------------------
// POST /rides/:id/messages — Send chat message
// ---------------------------------------------------------------------------
router.post("/rides/:id/messages", authenticate, async (req, res) => {
  const { body } = req.body;
  if (typeof body !== "string" || !body.trim() || body.trim().length > 1000) {
    res.status(400).json({ error: "invalid_request", message: "Message body is required." });
    return;
  }

  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }
  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not a participant in this ride." });
    return;
  }

  const [msg] = await db
    .insert(rideMessagesTable)
    .values({
      rideId: String(req.params.id),
      senderId: req.auth!.userId,
      body: body.trim(),
    })
    .returning();

  const serialized = {
    id: msg.id,
    rideId: msg.rideId,
    senderId: msg.senderId,
    senderRole: req.auth!.role,
    body: msg.body,
    readAt: null,
    createdAt: msg.createdAt.toISOString(),
  };

  broadcastToRide(msg.rideId, "chat:message", serialized);

  res.status(201).json(serialized);
});

// ---------------------------------------------------------------------------
// POST /rides/:id/share-token — Generate public tracking link
// ---------------------------------------------------------------------------
router.post("/rides/:id/share-token", authenticate, async (req, res) => {
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, String(req.params.id)) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  if (!(await isAuthorizedForRide(ride, req.auth!.userId, req.auth!.role))) {
    res.status(403).json({ error: "forbidden", message: "You are not a participant in this ride." });
    return;
  }

  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(tripShareTokensTable).values({
    rideId: ride.id,
    token,
    expiresAt,
  });

  res.status(200).json({
    token,
    shareUrl: `/trips/share/${token}`,
    expiresAt: expiresAt.toISOString(),
  });
});

async function enrichRideProfile(ride: typeof ridesTable.$inferSelect, includeStartTripOtp = false) {
  const base = toRideProfile(ride, { includeStartTripOtp });
  if (ride.driverId) {
    const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.id, ride.driverId) });
    if (driver) {
      const [driverUser, vehicle] = await Promise.all([
        db.query.usersTable.findFirst({ where: eq(usersTable.id, driver.userId) }),
        db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, driver.id) }),
      ]);
      return {
        ...base,
        driver: {
          id: driver.id,
          name: driverUser?.name ?? "Driver",
          phone: driverUser?.phone ?? "",
          rating: Number(driver.averageRating ?? 4.9),
          vehicleMake: vehicle?.make ?? "Toyota",
          vehicleModel: vehicle?.model ?? "Camry",
          vehicleColor: vehicle?.color ?? "Black",
          plateNumber: vehicle?.plateNumber ?? "ABC 1234",
        },
      };
    }
  }
  return base;
}

async function buildOwnerFilter(userId: string, role: "passenger" | "driver" | "admin") {
  if (role === "admin") return sql`true`;
  if (role === "driver") {
    const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.userId, userId) });
    if (!driver) return sql`false`;
    return eq(ridesTable.driverId, driver.id);
  }
  return eq(ridesTable.passengerId, userId);
}

async function isAuthorizedForRide(
  ride: { passengerId: string; driverId: string | null },
  userId: string,
  role: "passenger" | "driver" | "admin",
): Promise<boolean> {
  if (role === "admin") return true;
  if (ride.passengerId === userId) return true;
  if (role === "driver" && ride.driverId) {
    const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.id, ride.driverId) });
    return driver?.userId === userId;
  }
  return false;
}

export default router;
