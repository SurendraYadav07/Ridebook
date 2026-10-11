import { and, eq, lte, gte } from "drizzle-orm";
import { db, ridesTable, rideStatusHistoryTable } from "@workspace/db";
import { dispatchNextOffer } from "../dispatch-engine";
import { broadcastToUser } from "../ws-server";
import { toRideProfile } from "../serializers";
import { logger } from "../logger";

const DISPATCH_LEAD_TIME_MINUTES = 30; // Dispatch driver 30 mins ahead of pickup

/**
 * Checks for scheduled rides that are due for driver dispatching.
 */
export async function processScheduledRides(): Promise<number> {
  const now = new Date();
  const dispatchThreshold = new Date(now.getTime() + DISPATCH_LEAD_TIME_MINUTES * 60 * 1000);

  try {
    const upcomingScheduledRides = await db.query.ridesTable.findMany({
      where: and(
        eq(ridesTable.status, "scheduled"),
        lte(ridesTable.scheduledFor, dispatchThreshold),
      ),
    });

    for (const ride of upcomingScheduledRides) {
      // Transition to scheduled_dispatching
      const [claimedRide] = await db
        .update(ridesTable)
        .set({
          status: "scheduled_dispatching",
          updatedAt: new Date(),
        })
        .where(and(eq(ridesTable.id, ride.id), eq(ridesTable.status, "scheduled")))
        .returning();
      if (!claimedRide) continue;

      await db.insert(rideStatusHistoryTable).values({
        rideId: ride.id,
        fromStatus: "scheduled",
        toStatus: "scheduled_dispatching",
      });

      // Dispatch to nearest available driver
      await dispatchNextOffer(ride.id);

      // Notify passenger
      const currentRide = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, ride.id) });
      if (currentRide) broadcastToUser(ride.passengerId, "ride:scheduled:dispatching", toRideProfile(currentRide));
    }

    return upcomingScheduledRides.length;
  } catch (error) {
    logger.error({ err: error }, "Scheduled ride processing failed");
    return 0;
  }
}

/**
 * Starts the scheduled rides background worker interval.
 */
export function startScheduledRidesWorker(intervalMs = 60_000): NodeJS.Timeout {
  // Run once immediately on startup
  processScheduledRides();

  // Run on recurring interval (every 60 seconds)
  return setInterval(async () => {
    await processScheduledRides();
  }, intervalMs);
}
