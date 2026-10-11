import {
  db,
  driversTable,
  ridesTable,
  usersTable,
  rideStatusHistoryTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { haversineDistanceMeters } from "./routing";

export interface MatchRideParams {
  origin: { latitude: number; longitude: number; address?: string };
  destination: { latitude: number; longitude: number; address?: string };
  rideType?: "economy" | "premium" | "xl" | "shared";
  fareCents?: number;
  passengerId: string;
}

export interface MatchedDriver {
  id: string;
  name: string;
  phone: string | null;
  rating: number | null;
  model: string | null;
  plateNumber: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface MatchResult {
  matchFound: boolean;
  message: string;
  rideId?: string | null;
  driverId?: string | null;
  driver?: MatchedDriver | null;
  ride?: {
    id: string;
    status: string;
    fareCents: number | null;
    pickupAddress: string;
    destinationAddress: string;
    createdAt: string;
  } | null;
}

/**
 * Matches the nearest available, verified driver within 3,000 meters using PostGIS ST_DWithin and ST_Distance.
 * Executes atomically in a transaction: locks the driver, marks them unavailable, and creates the ride with status 'picking_up'.
 */
export async function matchNearestDriver(params: MatchRideParams): Promise<MatchResult> {
  const originLat = params.origin.latitude;
  const originLng = params.origin.longitude;

  return await db.transaction(async (tx) => {
    let matchedRow: {
      id: string;
      userId: string;
      model: string | null;
      plateNumber: string | null;
      averageRating: string | number | null;
      currentLatitude: string | number | null;
      currentLongitude: string | number | null;
      driverName: string;
      driverPhone: string | null;
      distanceMeters: number;
    } | null = null;

    try {
      const postgisQuery = sql`
        SELECT d.id, d.user_id as "userId", d.model, d.plate_number as "plateNumber",
               d.average_rating as "averageRating",
               d.current_latitude as "currentLatitude", d.current_longitude as "currentLongitude",
               u.name as "driverName", u.phone as "driverPhone",
               ST_Distance(
                 COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.current_longitude::float, d.current_latitude::float), 4326)::geography),
                 ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography
               ) as "distanceMeters"
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        WHERE d.is_available = true
          AND d.is_online = true
          AND d.is_blocked = false
          AND d.verification_status = 'approved'
          AND ST_DWithin(
            COALESCE(d.location, ST_SetSRID(ST_MakePoint(d.current_longitude::float, d.current_latitude::float), 4326)::geography),
            ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography,
            3000
          )
        ORDER BY "distanceMeters" ASC
        LIMIT 1
        FOR UPDATE OF d SKIP LOCKED
      `;
      const result = await tx.execute(postgisQuery);
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0] as any;
        matchedRow = {
          id: row.id,
          userId: row.userId,
          model: row.model,
          plateNumber: row.plateNumber,
          averageRating: row.averageRating,
          currentLatitude: row.currentLatitude,
          currentLongitude: row.currentLongitude,
          driverName: row.driverName ?? "Driver",
          driverPhone: row.driverPhone ?? null,
          distanceMeters: Number(row.distanceMeters),
        };
      }
    } catch {
      // In-memory / pure SQL fallback if PostGIS extension is not installed in the running environment
      const eligibleDrivers = await tx.query.driversTable.findMany({
        where: and(
          eq(driversTable.isAvailable, true),
          eq(driversTable.isOnline, true),
          eq(driversTable.isBlocked, false),
          eq(driversTable.verificationStatus, "approved"),
        ),
      });

      let closest: typeof matchedRow = null;
      let minDistance = 3000; // 3 km limit

      for (const d of eligibleDrivers) {
        if (!d.currentLatitude || !d.currentLongitude) continue;
        const dist = haversineDistanceMeters(
          { latitude: originLat, longitude: originLng },
          { latitude: Number(d.currentLatitude), longitude: Number(d.currentLongitude) }
        );
        if (dist <= 3000 && dist <= minDistance) {
          minDistance = dist;
          const u = await tx.query.usersTable.findFirst({ where: eq(usersTable.id, d.userId) });
          closest = {
            id: d.id,
            userId: d.userId,
            model: d.model ?? null,
            plateNumber: d.plateNumber ?? null,
            averageRating: d.averageRating ?? null,
            currentLatitude: d.currentLatitude,
            currentLongitude: d.currentLongitude,
            driverName: u?.name ?? "Driver",
            driverPhone: u?.phone ?? null,
            distanceMeters: dist,
          };
        }
      }
      matchedRow = closest;
    }

    if (!matchedRow) {
      return {
        matchFound: false,
        message: "No available driver found within 3 km.",
        rideId: null,
        driverId: null,
        driver: null,
        ride: null,
      };
    }

    // Mark matched driver as unavailable
    await tx
      .update(driversTable)
      .set({
        isAvailable: false,
        updatedAt: new Date(),
      })
      .where(eq(driversTable.id, matchedRow.id));

    const isSharedRide = params.rideType === "shared";

    // Create ride record
    const [newRide] = await tx
      .insert(ridesTable)
      .values({
        passengerId: params.passengerId,
        driverId: matchedRow.id,
        rideType: params.rideType ?? "economy",
        status: "picking_up",
        isShared: isSharedRide,
        coRiderCount: 0,
        coRiderName: null,
        coRiderPickupAddress: null,
        coRiderDropoffAddress: null,
        pickupAddress: params.origin.address || "Pickup Location",
        pickupLatitude: String(originLat),
        pickupLongitude: String(originLng),
        destinationAddress: params.destination.address || "Destination Location",
        destinationLatitude: String(params.destination.latitude),
        destinationLongitude: String(params.destination.longitude),
        originLocation: `SRID=4326;POINT(${originLng} ${originLat})`,
        destinationLocation: `SRID=4326;POINT(${params.destination.longitude} ${params.destination.latitude})`,
        fareCents: params.fareCents ? Math.round(params.fareCents) : null,
        estimatedFare: params.fareCents ? String((params.fareCents / 100).toFixed(2)) : isSharedRide ? "35.00" : "50.00",
        startTripOtp: crypto.randomInt(1000, 10_000).toString(),
        driverAssignedAt: new Date(),
      })
      .returning();

    // Record initial status in history
    await tx.insert(rideStatusHistoryTable).values({
      rideId: newRide.id,
      fromStatus: null,
      toStatus: "picking_up",
      changedBy: params.passengerId,
    });

    return {
      matchFound: true,
      message: "Driver matched successfully.",
      rideId: newRide.id,
      driverId: matchedRow.id,
      driver: {
        id: matchedRow.id,
        name: matchedRow.driverName,
        phone: matchedRow.driverPhone,
        rating: matchedRow.averageRating ? Number(matchedRow.averageRating) : 5.0,
        model: matchedRow.model ?? "Standard Vehicle",
        plateNumber: matchedRow.plateNumber ?? "MH-02-CD-5678",
        latitude: Number(matchedRow.currentLatitude),
        longitude: Number(matchedRow.currentLongitude),
        distanceMeters: Math.round(matchedRow.distanceMeters),
      },
      ride: {
        id: newRide.id,
        status: newRide.status,
        fareCents: newRide.fareCents ?? null,
        pickupAddress: newRide.pickupAddress,
        destinationAddress: newRide.destinationAddress,
        createdAt: newRide.createdAt.toISOString(),
      },
    };
  });
}

/**
 * Releases driver availability when a ride is completed or cancelled.
 */
export async function releaseDriverAvailability(driverId: string): Promise<void> {
  await db
    .update(driversTable)
    .set({
      isAvailable: true,
      updatedAt: new Date(),
    })
    .where(eq(driversTable.id, driverId));
}
