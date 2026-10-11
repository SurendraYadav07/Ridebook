import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { driversTable, vehiclesTable } from "./drivers";
import { rideTypeEnum, rideStatusEnum } from "./enums";
import { geographyPoint } from "./spatial";

export interface RideStop {
  address: string;
  latitude: number;
  longitude: number;
  name?: string;
  sequenceOrder: number;
}

export const ridesTable = pgTable(
  "rides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => usersTable.id),
    driverId: uuid("driver_id").references(() => driversTable.id),
    vehicleId: uuid("vehicle_id").references(() => vehiclesTable.id),

    rideType: rideTypeEnum("ride_type").notNull(),
    status: rideStatusEnum("status").notNull().default("requested"),

    isShared: boolean("is_shared").notNull().default(false),
    coRiderCount: integer("co_rider_count").notNull().default(0),
    coRiderName: text("co_rider_name"),
    coRiderPickupAddress: text("co_rider_pickup_address"),
    coRiderDropoffAddress: text("co_rider_dropoff_address"),

    originLocation: geographyPoint("origin_location"),
    destinationLocation: geographyPoint("destination_location"),

    pickupAddress: text("pickup_address").notNull(),
    pickupLatitude: numeric("pickup_latitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    pickupLongitude: numeric("pickup_longitude", {
      precision: 10,
      scale: 7,
    }).notNull(),

    destinationAddress: text("destination_address").notNull(),
    destinationLatitude: numeric("destination_latitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    destinationLongitude: numeric("destination_longitude", {
      precision: 10,
      scale: 7,
    }).notNull(),

    stops: jsonb("stops").$type<RideStop[]>(),

    distanceMeters: numeric("distance_meters", { precision: 10, scale: 2 }),
    etaSeconds: numeric("eta_seconds", { precision: 10, scale: 0 }),

    fareCents: integer("fare_cents"),
    estimatedFare: numeric("estimated_fare", { precision: 10, scale: 2 }),
    finalFare: numeric("final_fare", { precision: 10, scale: 2 }),
    surgeMultiplier: numeric("surge_multiplier", { precision: 4, scale: 2 })
      .notNull()
      .default("1.00"),

    promoCodeId: uuid("promo_code_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),

    startTripOtp: text("start_trip_otp"),
    freeWaitingMinutes: numeric("free_waiting_minutes", { precision: 4, scale: 0 })
      .notNull()
      .default("3"),
    paidWaitingMinutes: numeric("paid_waiting_minutes", { precision: 6, scale: 0 })
      .notNull()
      .default("0"),
    waitingCharges: numeric("waiting_charges", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    cancellationFeeCharged: numeric("cancellation_fee_charged", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),

    cancelledBy: uuid("cancelled_by").references(() => usersTable.id),
    cancellationReason: text("cancellation_reason"),

    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    driverAssignedAt: timestamp("driver_assigned_at", { withTimezone: true }),
    driverArrivedAt: timestamp("driver_arrived_at", { withTimezone: true }),
    tripStartedAt: timestamp("trip_started_at", { withTimezone: true }),
    tripCompletedAt: timestamp("trip_completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

  },
  (table) => [
    index("rides_passenger_id_idx").on(table.passengerId),
    index("rides_driver_id_idx").on(table.driverId),
    index("rides_status_idx").on(table.status),
    index("rides_scheduled_for_idx").on(table.scheduledFor),
  ],
);
export const insertRideSchema = createInsertSchema(ridesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRide = z.infer<typeof insertRideSchema>;
export type Ride = typeof ridesTable.$inferSelect;

/**
 * Time-series breadcrumb trail for a ride's driver, written by the
 * real-time location-ingest endpoint (PHASE 7). Distinct from
 * `drivers.currentLatitude/Longitude`, which is just the latest point for
 * fast lookups; this table is the durable, queryable history for a
 * specific ride (used for trip-sharing links, support investigations,
 * fraud checks, etc).
 */
export const rideLocationsTable = pgTable(
  "ride_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    heading: numeric("heading", { precision: 6, scale: 2 }),
    speedMetersPerSecond: numeric("speed_mps", { precision: 6, scale: 2 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ride_locations_ride_id_idx").on(table.rideId),
    index("ride_locations_ride_id_recorded_idx").on(
      table.rideId,
      table.recordedAt,
    ),
  ],
);
export type RideLocation = typeof rideLocationsTable.$inferSelect;

/**
 * Append-only audit trail of every status transition, so state-machine
 * violations and dispute investigations have a durable record independent
 * of `rides.status` (which only holds the current value).
 */
export const rideStatusHistoryTable = pgTable(
  "ride_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    fromStatus: rideStatusEnum("from_status"),
    toStatus: rideStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ride_status_history_ride_id_idx").on(table.rideId)],
);
export type RideStatusHistory = typeof rideStatusHistoryTable.$inferSelect;

export const rideMessagesTable = pgTable(
  "ride_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => usersTable.id),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ride_messages_ride_id_idx").on(table.rideId)],
);
export type RideMessage = typeof rideMessagesTable.$inferSelect;

export const ratingsTable = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    raterId: uuid("rater_id")
      .notNull()
      .references(() => usersTable.id),
    rateeId: uuid("ratee_id")
      .notNull()
      .references(() => usersTable.id),
    stars: numeric("stars", { precision: 1, scale: 0 }).notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ratings_ride_id_idx").on(table.rideId),
    index("ratings_ratee_id_idx").on(table.rateeId),
  ],
);
export type Rating = typeof ratingsTable.$inferSelect;
