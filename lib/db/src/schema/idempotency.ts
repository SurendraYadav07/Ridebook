import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    requestPath: text("request_path").notNull(),
    requestHash: text("request_hash"),
    responseStatusCode: integer("response_status_code"),
    responseBody: text("response_body"),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_key_user_unique").on(table.key, table.userId),
  ],
);
export type IdempotencyKey = typeof idempotencyKeysTable.$inferSelect;
