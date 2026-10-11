/**
 * One-off CLI script to safely seed or promote an admin account in the database.
 * Usage:
 *   ADMIN_SEED_TOKEN=my_secret_token npx tsx scripts/seed-admin.ts --email=admin@ridego.in --password=StrongPassword123!
 *
 * This script runs directly against the database via Drizzle and is NEVER exposed
 * as a public runtime API endpoint.
 */
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { hashPassword } from "../src/lib/crypto";

function parseArgs() {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      params[key] = rest.join("=");
    }
  }

  return params;
}

async function main() {
  const cliArgs = parseArgs();

  const envToken = process.env.ADMIN_SEED_TOKEN?.trim();
  const cliToken = cliArgs.token?.trim();
  const isProduction = (process.env.NODE_ENV ?? "production") === "production";

  // Security gate: In production, or if ADMIN_SEED_TOKEN is configured in the environment,
  // the execution token MUST match ADMIN_SEED_TOKEN.
  if (envToken) {
    if (!cliToken) {
      console.error("❌ Error: Missing required admin seed token.");
      process.exit(1);
    }
    if (cliToken && cliToken !== envToken) {
      console.error("❌ Error: Invalid admin seed token provided.");
      process.exit(1);
    }
  } else if (isProduction) {
    console.error("❌ Error: ADMIN_SEED_TOKEN environment variable must be set in production.");
    process.exit(1);
  }

  const email = (cliArgs.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = (cliArgs.password || process.env.ADMIN_PASSWORD || "").trim();
  const name = (cliArgs.name || process.env.ADMIN_NAME || "RideGo Operations Admin").trim();
  const phone = (cliArgs.phone || process.env.ADMIN_PHONE || "").trim();

  if (!email || !email.includes("@") || !password) {
    console.error("❌ Error: Provide an admin email and password via --email/--password or ADMIN_EMAIL/ADMIN_PASSWORD.");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("❌ Error: Admin password must be at least 12 characters long.");
    process.exit(1);
  }

  console.log(`🔐 Seeding admin user: ${email} (${phone})...`);

  const passwordHash = await hashPassword(password);

  const existingUser = await db.query.usersTable.findFirst({
    where: phone ? or(eq(usersTable.email, email), eq(usersTable.phone, phone)) : eq(usersTable.email, email),
  });

  if (existingUser) {
    const [updated] = await db
      .update(usersTable)
      .set({
        name,
        role: "admin",
        status: "active",
        isBlocked: false,
        blockedReason: null,
        passwordHash,
        emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        phoneVerifiedAt: existingUser.phoneVerifiedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existingUser.id))
      .returning();

    console.log(`✅ Successfully upgraded existing account (${updated.email}) to role 'admin'.`);
    console.log(`   User ID: ${updated.id}`);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        phone,
        passwordHash,
        role: "admin",
        status: "active",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      })
      .returning();

    console.log(`✅ Successfully created new admin account: ${created.email}`);
    console.log(`   User ID: ${created.id}`);
  }

  console.log("🚀 Admin account ready for operations portal access.");
  await (await import("@workspace/db")).pool.end();
}

main().catch((err) => {
  console.error("❌ Failed to seed admin user:", err);
  console.error("❌ Failed to seed admin user.");
  process.exitCode = 1;
  void (await import("@workspace/db")).pool.end();
});
