import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { geographyPoint } from "./spatial";
import {
  driverVerificationStatusEnum,
  driverDocumentTypeEnum,
  documentStatusEnum,
  rideTypeEnum,
} from "./enums";

export const driversTable = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    licenseNumber: text("license_number").notNull(),
    model: text("model"),
    plateNumber: text("plate_number"),
    verificationStatus: driverVerificationStatusEnum("verification_status")
      .notNull()
      .default("pending"),
    rejectionReason: text("rejection_reason"),

    isOnline: boolean("is_online").notNull().default(false),
    isAvailable: boolean("is_available").notNull().default(true),
    location: geographyPoint("location"),
    currentLatitude: numeric("current_latitude", {
      precision: 10,
      scale: 7,
    }),
    currentLongitude: numeric("current_longitude", {
      precision: 10,
      scale: 7,
    }),
    locationUpdatedAt: timestamp("location_updated_at", {
      withTimezone: true,
    }),

    averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
    totalRides: numeric("total_rides", { precision: 10, scale: 0 })
      .notNull()
      .default("0"),

    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("drivers_user_id_unique").on(table.userId),
    uniqueIndex("drivers_license_number_unique").on(table.licenseNumber),
    index("drivers_online_status_idx").on(
      table.isOnline,
      table.verificationStatus,
    ),
  ],
);
export const insertDriverSchema = createInsertSchema(driversTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;

export const vehiclesTable = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    category: rideTypeEnum("category").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: text("year").notNull(),
    color: text("color").notNull(),
    plateNumber: text("plate_number").notNull(),
    isApproved: boolean("is_approved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vehicles_plate_number_unique").on(table.plateNumber),
    index("vehicles_driver_id_idx").on(table.driverId),
  ],
);
export type Vehicle = typeof vehiclesTable.$inferSelect;

export const driverDocumentsTable = pgTable(
  "driver_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    type: driverDocumentTypeEnum("type").notNull(),
    // Private object-storage key, never a public URL — see PHASE 12.
    storageKey: text("storage_key").notNull(),
    status: documentStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("driver_documents_driver_id_idx").on(table.driverId)],
);
export type DriverDocument = typeof driverDocumentsTable.$inferSelect;

/**
 * Append-only log of online/offline toggles, used for earnings/utilization
 * analytics (PHASE 23) without overloading the mutable `drivers` row.
 */
export const driverAvailabilityTable = pgTable(
  "driver_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    wentOnlineAt: timestamp("went_online_at", {
      withTimezone: true,
    }).notNull(),
    wentOfflineAt: timestamp("went_offline_at", { withTimezone: true }),
  },
  (table) => [index("driver_availability_driver_id_idx").on(table.driverId)],
);
export type DriverAvailability = typeof driverAvailabilityTable.$inferSelect;
