/**
 * Seeds one active fare_configurations row per ride type. Run with:
 *   DATABASE_URL=... npx tsx scripts/seed-fare-config.ts
 *
 * These starting numbers (INR) are illustrative placeholders, not
 * researched market rates — an admin should update them via the
 * PHASE 18 admin dashboard (fare_configurations CRUD) before launch.
 */
import { db, fareConfigurationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEED_CONFIGS = [
  {
    rideType: "economy" as const,
    baseFare: "40.00",
    perKm: "12.00",
    perMinute: "1.50",
    minimumFare: "60.00",
    bookingFee: "5.00",
    serviceFeePercent: "5.00",
    taxPercent: "5.00",
    cancellationFee: "30.00",
  },
  {
    rideType: "premium" as const,
    baseFare: "70.00",
    perKm: "18.00",
    perMinute: "2.25",
    minimumFare: "100.00",
    bookingFee: "8.00",
    serviceFeePercent: "5.00",
    taxPercent: "5.00",
    cancellationFee: "50.00",
  },
  {
    rideType: "xl" as const,
    baseFare: "90.00",
    perKm: "22.00",
    perMinute: "2.75",
    minimumFare: "130.00",
    bookingFee: "10.00",
    serviceFeePercent: "5.00",
    taxPercent: "5.00",
    cancellationFee: "60.00",
  },
];

async function main() {
  for (const cfg of SEED_CONFIGS) {
    const existing = await db.query.fareConfigurationsTable.findFirst({
      where: eq(fareConfigurationsTable.rideType, cfg.rideType),
    });
    if (existing) {
      console.log(`Skipping ${cfg.rideType} — active configuration already exists.`);
      continue;
    }
    await db.insert(fareConfigurationsTable).values({ ...cfg, isActive: true });
    console.log(`Seeded fare configuration for ${cfg.rideType}.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
