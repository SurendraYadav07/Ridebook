import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { ridesTable } from "./rides";
import { financialTransactionTypeEnum, payoutStatusEnum } from "./enums";

export const driverWalletsTable = pgTable(
  "driver_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    availableBalance: numeric("available_balance", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    pendingBalance: numeric("pending_balance", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    totalEarned: numeric("total_earned", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    totalPaidOut: numeric("total_paid_out", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    currency: text("currency").notNull().default("INR"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("driver_wallets_driver_id_unique").on(table.driverId),
  ],
);
export type DriverWallet = typeof driverWalletsTable.$inferSelect;

export const walletTransactionsTable = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => driverWalletsTable.id, { onDelete: "cascade" }),
    rideId: uuid("ride_id").references(() => ridesTable.id),
    type: financialTransactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    description: text("description").notNull(),
    referenceId: text("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wallet_transactions_wallet_id_idx").on(table.walletId),
    index("wallet_transactions_ride_id_idx").on(table.rideId),
  ],
);
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

export const driverPayoutsTable = pgTable(
  "driver_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driversTable.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    status: payoutStatusEnum("status").notNull().default("pending"),
    payoutMethod: text("payout_method").notNull().default("bank_transfer"),
    accountDetails: text("account_details"), // masked bank / UPI details
    referenceId: text("reference_id"),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("driver_payouts_driver_id_idx").on(table.driverId),
    index("driver_payouts_status_idx").on(table.status),
  ],
);
export type DriverPayout = typeof driverPayoutsTable.$inferSelect;
