import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "test" ? "postgresql://postgres:postgres@localhost:5432/ridebooker_test" : undefined);
if (!connectionString) throw new Error("DATABASE_URL is required to connect to the application database.");

export const pool = new Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
export const db = drizzle(pool, { schema });

export * from "./schema";
