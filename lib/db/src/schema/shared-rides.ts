import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { driversTable, vehiclesTable } from "./drivers";
import {
  sharedRideStatusEnum,
  sharedRidePassengerStatusEnum,
  stopTypeEnum,
} from "./enums";

export const sharedRidesTable = pgTable(
  "shared_rides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id").references(() => driversTable.id),
    vehicleId: uuid("vehicle_id").references(() => vehiclesTable.id),
    status: sharedRideStatusEnum("status").notNull().default("requested"),
    maxSeats: integer("max_seats").notNull().default(4),
    availableSeats: integer("available_seats").notNull().default(4),
    routePolyline: text("route_polyline"),
    totalDistanceMeters: numeric("total_distance_meters", { precision: 10, scale: 2 }),
    totalDurationSeconds: numeric("total_duration_seconds", { precision: 10, scale: 0 }),
    totalFare: numeric("total_fare", { precision: 10, scale: 2 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_rides_driver_id_idx").on(table.driverId),
    index("shared_rides_status_idx").on(table.status),
  ],
);
export type SharedRide = typeof sharedRidesTable.$inferSelect;

export const sharedRidePassengersTable = pgTable(
  "shared_ride_passengers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sharedRideId: uuid("shared_ride_id")
      .notNull()
      .references(() => sharedRidesTable.id, { onDelete: "cascade" }),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => usersTable.id),
    seatCount: integer("seat_count").notNull().default(1),
    status: sharedRidePassengerStatusEnum("status").notNull().default("requested"),
    
    pickupAddress: text("pickup_address").notNull(),
    pickupLatitude: numeric("pickup_latitude", { precision: 10, scale: 7 }).notNull(),
    pickupLongitude: numeric("pickup_longitude", { precision: 10, scale: 7 }).notNull(),
    
    destinationAddress: text("destination_address").notNull(),
    destinationLatitude: numeric("destination_latitude", { precision: 10, scale: 7 }).notNull(),
    destinationLongitude: numeric("destination_longitude", { precision: 10, scale: 7 }).notNull(),

    fare: numeric("fare", { precision: 10, scale: 2 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    droppedOffAt: timestamp("dropped_off_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_ride_passengers_shared_ride_idx").on(table.sharedRideId),
    index("shared_ride_passengers_passenger_idx").on(table.passengerId),
    index("shared_ride_passengers_status_idx").on(table.status),
  ],
);
export type SharedRidePassenger = typeof sharedRidePassengersTable.$inferSelect;

export const sharedRideStopsTable = pgTable(
  "shared_ride_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sharedRideId: uuid("shared_ride_id")
      .notNull()
      .references(() => sharedRidesTable.id, { onDelete: "cascade" }),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => usersTable.id),
    stopType: stopTypeEnum("stop_type").notNull(),
    sequenceOrder: integer("sequence_order").notNull(),
    address: text("address").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    estimatedArrival: timestamp("estimated_arrival", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shared_ride_stops_shared_ride_idx").on(table.sharedRideId),
    index("shared_ride_stops_sequence_idx").on(table.sharedRideId, table.sequenceOrder),
  ],
);
export type SharedRideStop = typeof sharedRideStopsTable.$inferSelect;
