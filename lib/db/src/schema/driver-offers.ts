import {
  pgTable,
  uuid,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { ridesTable } from "./rides";
import { driverOfferStatusEnum } from "./enums";

export const driverOffersTable = pgTable(
  "driver_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    status: driverOfferStatusEnum("status").notNull().default("pending"),
    estimatedDistanceMeters: numeric("estimated_distance_meters", { precision: 10, scale: 2 }),
    estimatedEtaSeconds: numeric("estimated_eta_seconds", { precision: 10, scale: 0 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("driver_offers_ride_driver_unique").on(table.rideId, table.driverId),
    index("driver_offers_driver_id_idx").on(table.driverId),
    index("driver_offers_status_expires_idx").on(table.status, table.expiresAt),
  ],
);
export type DriverOffer = typeof driverOffersTable.$inferSelect;
