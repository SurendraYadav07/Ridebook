import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  tripShareTokensTable,
  ridesTable,
  driversTable,
  vehiclesTable,
  usersTable,
} from "@workspace/db";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /trips/share/:token — Public live trip tracking
// ---------------------------------------------------------------------------
router.get("/trips/share/:token", async (req, res) => {
  const tokenRecord = await db.query.tripShareTokensTable.findFirst({
    where: and(
      eq(tripShareTokensTable.token, String(req.params.token)),
      sql`${tripShareTokensTable.expiresAt} > NOW()`,
      sql`${tripShareTokensTable.revokedAt} IS NULL`,
    ),
  });

  if (!tokenRecord) {
    res.status(404).json({ error: "invalid_token", message: "Share link is invalid or has expired." });
    return;
  }

  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, tokenRecord.rideId) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }

  let driverInfo = undefined;
  let driverLocation = undefined;
  if (ride.driverId) {
    const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.id, ride.driverId) });
    if (driver) {
      const [driverUser, vehicle] = await Promise.all([
        db.query.usersTable.findFirst({ where: eq(usersTable.id, driver.userId) }),
        db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, driver.id) }),
      ]);
      driverInfo = {
        name: driverUser?.name ?? "Driver",
        vehicleMake: vehicle?.make ?? "Toyota",
        vehicleModel: vehicle?.model ?? "Camry",
        vehicleColor: vehicle?.color ?? "Black",
        plateNumber: vehicle?.plateNumber ?? "ABC 1234",
        rating: Number(driver.averageRating ?? 4.9),
      };
      if (driver.currentLatitude && driver.currentLongitude) {
        driverLocation = {
          latitude: Number(driver.currentLatitude),
          longitude: Number(driver.currentLongitude),
          heading: 0,
        };
      }
    }
  }

  const passenger = await db.query.usersTable.findFirst({ where: eq(usersTable.id, ride.passengerId) });
  const firstName = passenger?.name?.split(" ")[0] ?? "Passenger";

  res.status(200).json({
    status: ride.status,
    pickupAddress: ride.pickupAddress,
    destinationAddress: ride.destinationAddress,
    currentDriverLocation: driverLocation,
    driver: driverInfo,
    passengerFirstName: firstName,
  });
});

export default router;
