import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ridesTable } from "./rides";
import { rideTypeEnum, paymentMethodTypeEnum, paymentStatusEnum, refundStatusEnum } from "./enums";

export const paymentMethodsTable = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: paymentMethodTypeEnum("type").notNull(),
    // Only the payment provider's own opaque token is stored — never raw
    // card/account numbers. See PHASE 9 CRITICAL SECURITY.
    providerToken: text("provider_token"),
    label: text("label").notNull(), // Display label for the selected payment option.
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("payment_methods_user_id_idx").on(table.userId)],
);
export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;

export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideId: uuid("ride_id")
      .notNull()
      .references(() => ridesTable.id),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => usersTable.id),
    paymentMethodId: uuid("payment_method_id").references(
      () => paymentMethodsTable.id,
    ),

    // Fare breakdown — persisted so a ride's charge is auditable even if
    // fare_configurations change later. Never accept these from the client;
    // always recomputed server-side (PHASE 8).
    baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
    distanceCharge: numeric("distance_charge", {
      precision: 10,
      scale: 2,
    }).notNull(),
    timeCharge: numeric("time_charge", { precision: 10, scale: 2 }).notNull(),
    bookingFee: numeric("booking_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    serviceFee: numeric("service_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    surgeMultiplier: numeric("surge_multiplier", { precision: 4, scale: 2 })
      .notNull()
      .default("1.00"),
    taxes: numeric("taxes", { precision: 10, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    currency: text("currency").notNull().default("INR"),

    status: paymentStatusEnum("status").notNull().default("pending"),

    // Razorpay (or other provider) identifiers for reconciliation.
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    providerSignature: text("provider_signature"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payments_ride_id_idx").on(table.rideId),
    index("payments_payer_id_idx").on(table.payerId),
    index("payments_provider_order_id_idx").on(table.providerOrderId),
  ],
);
export type Payment = typeof paymentsTable.$inferSelect;

/**
 * Raw log of every provider webhook/callback event, kept verbatim for
 * idempotency (duplicate-callback protection) and dispute resolution.
 */
export const paymentTransactionsTable = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id, { onDelete: "cascade" }),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    rawPayload: text("raw_payload").notNull(), // JSON string
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payment_transactions_payment_id_idx").on(table.paymentId),
    index("payment_transactions_provider_event_id_idx").on(
      table.providerEventId,
    ),
  ],
);
export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;

export const refundsTable = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    providerRefundId: text("provider_refund_id"),
    initiatedBy: uuid("initiated_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("refunds_payment_id_idx").on(table.paymentId)],
);
export type Refund = typeof refundsTable.$inferSelect;

/**
 * Configurable, versioned fare rules per ride type — the backend reads the
 * active row instead of hard-coding numbers in the client (PHASE 8).
 */
export const fareConfigurationsTable = pgTable(
  "fare_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rideType: rideTypeEnum("ride_type").notNull(),
    baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
    perKm: numeric("per_km", { precision: 10, scale: 2 }).notNull(),
    perMinute: numeric("per_minute", { precision: 10, scale: 2 }).notNull(),
    minimumFare: numeric("minimum_fare", {
      precision: 10,
      scale: 2,
    }).notNull(),
    bookingFee: numeric("booking_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    serviceFeePercent: numeric("service_fee_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    taxPercent: numeric("tax_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    cancellationFee: numeric("cancellation_fee", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("fare_configurations_ride_type_active_idx").on(
      table.rideType,
      table.isActive,
    ),
  ],
);
export type FareConfiguration = typeof fareConfigurationsTable.$inferSelect;
