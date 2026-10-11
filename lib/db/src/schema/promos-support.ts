import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ridesTable } from "./rides";
import {
  promoDiscountTypeEnum,
  rideTypeEnum,
  supportTicketStatusEnum,
} from "./enums";

export const promoCodesTable = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    discountType: promoDiscountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value", {
      precision: 10,
      scale: 2,
    }).notNull(),
    maxDiscount: numeric("max_discount", { precision: 10, scale: 2 }),
    minRideValue: numeric("min_ride_value", { precision: 10, scale: 2 }),
    rideTypeRestriction: rideTypeEnum("ride_type_restriction"),
    firstRideOnly: boolean("first_ride_only").notNull().default(false),
    globalUsageLimit: integer("global_usage_limit"),
    perUserUsageLimit: integer("per_user_usage_limit").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("promo_codes_code_unique").on(table.code)],
);
export type PromoCode = typeof promoCodesTable.$inferSelect;

export const promoUsageTable = pgTable(
  "promo_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id),
    discountApplied: numeric("discount_applied", {
      precision: 10,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("promo_usage_promo_code_id_idx").on(table.promoCodeId),
    index("promo_usage_user_id_idx").on(table.userId),
  ],
);
export type PromoUsage = typeof promoUsageTable.$inferSelect;

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    rideId: uuid("ride_id").references(() => ridesTable.id),
    category: text("category").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("support_tickets_user_id_idx").on(table.userId),
    index("support_tickets_status_idx").on(table.status),
  ],
);
export type SupportTicket = typeof supportTicketsTable.$inferSelect;

export const supportMessagesTable = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => usersTable.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("support_messages_ticket_id_idx").on(table.ticketId)],
);
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
