import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ridesTable } from "./rides";
import { emergencyEventStatusEnum, emergencyTypeEnum, lostItemStatusEnum } from "./enums";

export const tripShareTokensTable = pgTable(
  "trip_share_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trip_share_tokens_token_unique").on(table.token),
    index("trip_share_tokens_ride_id_idx").on(table.rideId),
  ],
);
export type TripShareToken = typeof tripShareTokensTable.$inferSelect;

export const emergencyEventsTable = pgTable(
  "emergency_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id").references(() => ridesTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    type: emergencyTypeEnum("type").notNull().default("sos_button"),
    status: emergencyEventStatusEnum("status").notNull().default("active"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    details: text("details"),
    resolvedBy: uuid("resolved_by").references(() => usersTable.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("emergency_events_ride_id_idx").on(table.rideId),
    index("emergency_events_user_id_idx").on(table.userId),
    index("emergency_events_status_idx").on(table.status),
  ],
);
export type EmergencyEvent = typeof emergencyEventsTable.$inferSelect;

export const lostItemsTable = pgTable(
  "lost_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => usersTable.id),
    description: text("description").notNull(),
    status: lostItemStatusEnum("status").notNull().default("reported"),
    driverNotifiedAt: timestamp("driver_notified_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("lost_items_ride_id_idx").on(table.rideId),
    index("lost_items_reported_by_idx").on(table.reportedBy),
    index("lost_items_status_idx").on(table.status),
  ],
);
export type LostItem = typeof lostItemsTable.$inferSelect;
