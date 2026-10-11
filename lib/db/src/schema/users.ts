import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userRoleEnum, userStatusEnum, otpPurposeEnum } from "./enums";

/**
 * A single account can hold multiple roles conceptually, but for this app a
 * row represents one login identity with one primary role. Admins are
 * provisioned manually (see PHASE 18 notes) — there is no public
 * "sign up as admin" path.
 */
export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: userRoleEnum("role").notNull().default("passenger"),
    status: userStatusEnum("status").notNull().default("active"),

    // At least one of phone/email must be set; enforced in application code
    // (Postgres doesn't have a clean native "at least one of" constraint
    // across nullable unique columns without a generated column trick).
    phone: text("phone"),
    email: text("email"),
    passwordHash: text("password_hash"), // null for phone-only/OTP accounts

    name: text("name").notNull(),
    profilePhotoUrl: text("profile_photo_url"),

    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

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
    uniqueIndex("users_phone_unique").on(table.phone),
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_idx").on(table.role),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    email: z.email().optional().nullable(),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .optional()
      .nullable(),
  });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

/**
 * Refresh tokens for session persistence. Access tokens (short-lived JWTs)
 * are never stored — only the long-lived refresh token is persisted, and
 * only as a hash, so a leaked database dump can't be replayed directly.
 */
export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("refresh_tokens_user_id_idx").on(table.userId),
    uniqueIndex("refresh_tokens_token_hash_unique").on(table.tokenHash),
  ],
);
export type RefreshToken = typeof refreshTokensTable.$inferSelect;

/**
 * OTP codes for phone verification / login / password reset. The code
 * itself is stored hashed. `attempts` + `expiresAt` enforce brute-force
 * limits at the data layer as a backstop to the request-rate-limit
 * middleware.
 */
export const otpCodesTable = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("otp_codes_phone_purpose_idx").on(table.phone, table.purpose),
  ],
);
export type OtpCode = typeof otpCodesTable.$inferSelect;

export const emergencyContactsTable = pgTable(
  "emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    relationship: text("relationship"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("emergency_contacts_user_id_idx").on(table.userId)],
);
export const insertEmergencyContactSchema = createInsertSchema(
  emergencyContactsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type EmergencyContact = typeof emergencyContactsTable.$inferSelect;

export const savedLocationsTable = pgTable(
  "saved_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "Home", "Work", etc.
    address: text("address").notNull(),
    latitude: text("latitude").notNull(),
    longitude: text("longitude").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("saved_locations_user_id_idx").on(table.userId)],
);
export type SavedLocation = typeof savedLocationsTable.$inferSelect;

export const notificationDevicesTable = pgTable(
  "notification_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    pushToken: text("push_token").notNull(),
    platform: text("platform").notNull(), // "ios" | "android" | "web"
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("notification_devices_token_unique").on(table.pushToken),
    index("notification_devices_user_id_idx").on(table.userId),
  ],
);
export type NotificationDevice = typeof notificationDevicesTable.$inferSelect;

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: text("data"), // JSON-encoded deep-link payload
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_id_read_idx").on(table.userId, table.readAt),
  ],
);
export type Notification = typeof notificationsTable.$inferSelect;
