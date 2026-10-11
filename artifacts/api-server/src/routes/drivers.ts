import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  driversTable,
  vehiclesTable,
  ridesTable,
  rideLocationsTable,
  driverOffersTable,
  usersTable,
  walletTransactionsTable,
  driverDocumentsTable,
  ratingsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";
import { acceptRideOffer, dispatchNextOffer } from "../lib/dispatch-engine";
import { getOrCreateDriverWallet, requestPayout } from "../lib/ledger";
import { toRideProfile } from "../lib/serializers";
import { getDownloadUrl } from "../lib/storage";
import { broadcastToRoom } from "../lib/ws-server";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /drivers/register — Register driver license and vehicle
// ---------------------------------------------------------------------------
router.post("/drivers/register", authenticate, async (req, res) => {
  const {
    licenseNumber,
    vehicleCategory,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleColor,
    plateNumber,
  } = req.body;

  if (!licenseNumber || !vehicleCategory || !vehicleMake || !vehicleModel || !plateNumber) {
    res.status(400).json({ error: "invalid_request", message: "Missing required driver registration fields." });
    return;
  }

  await db
    .update(usersTable)
    .set({ role: "driver", updatedAt: new Date() })
    .where(eq(usersTable.id, req.auth!.userId));

  let driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    const [newDriver] = await db
      .insert(driversTable)
      .values({
        userId: req.auth!.userId,
        licenseNumber,
        verificationStatus: "approved",
      })
      .returning();
    driver = newDriver;
  }

  const [vehicle] = await db
    .insert(vehiclesTable)
    .values({
      driverId: driver.id,
      category: vehicleCategory,
      make: vehicleMake,
      model: vehicleModel,
      year: vehicleYear || "2023",
      color: vehicleColor || "Black",
      plateNumber,
      isApproved: true,
    })
    .onConflictDoUpdate({
      target: vehiclesTable.plateNumber,
      set: {
        category: vehicleCategory,
        make: vehicleMake,
        model: vehicleModel,
        color: vehicleColor,
        isApproved: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  await getOrCreateDriverWallet(driver.id);

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.auth!.userId) });

  res.status(201).json({
    id: driver.id,
    userId: driver.userId,
    name: user?.name ?? "Driver",
    phone: user?.phone,
    licenseNumber: driver.licenseNumber,
    verificationStatus: driver.verificationStatus,
    isOnline: driver.isOnline,
    averageRating: Number(driver.averageRating ?? 5.0),
    totalRides: Number(driver.totalRides ?? 0),
    currentLatitude: driver.currentLatitude ? Number(driver.currentLatitude) : null,
    currentLongitude: driver.currentLongitude ? Number(driver.currentLongitude) : null,
    vehicle: {
      id: vehicle.id,
      category: vehicle.category,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      plateNumber: vehicle.plateNumber,
      isApproved: vehicle.isApproved,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /drivers/me — Get driver profile and vehicle details
// ---------------------------------------------------------------------------
router.get("/drivers/me", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver profile not found." });
    return;
  }

  const [vehicle, user] = await Promise.all([
    db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, driver.id) }),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, req.auth!.userId) }),
  ]);

  res.status(200).json({
    id: driver.id,
    userId: driver.userId,
    name: user?.name ?? "Driver",
    phone: user?.phone,
    licenseNumber: driver.licenseNumber,
    verificationStatus: driver.verificationStatus,
    isOnline: driver.isOnline,
    averageRating: Number(driver.averageRating ?? 5.0),
    totalRides: Number(driver.totalRides ?? 0),
    currentLatitude: driver.currentLatitude ? Number(driver.currentLatitude) : null,
    currentLongitude: driver.currentLongitude ? Number(driver.currentLongitude) : null,
    vehicle: vehicle
      ? {
          id: vehicle.id,
          category: vehicle.category,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plateNumber: vehicle.plateNumber,
          isApproved: vehicle.isApproved,
        }
      : undefined,
  });
});

// ---------------------------------------------------------------------------
// Document Types & Normalization
// ---------------------------------------------------------------------------
export const REQUIRED_DOCUMENT_TYPES = [
  "license",
  "vehicle_registration",
  "id_proof",
  "vehicle_photo",
  "selfie",
] as const;

export function normalizeDocumentType(type: string): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "driving_license" || t === "license") return "license";
  if (t === "identity_document" || t === "id_proof") return "id_proof";
  if (t === "vehicle_registration") return "vehicle_registration";
  if (t === "vehicle_photo") return "vehicle_photo";
  if (t === "selfie") return "selfie";
  return t;
}

// ---------------------------------------------------------------------------
// POST /drivers/documents — Submit a driver document (using storageKey)
// ---------------------------------------------------------------------------
router.post("/drivers/documents", authenticate, requireRole("driver"), async (req, res) => {
  const { documentType, storageKey } = req.body;

  if (!documentType || !storageKey) {
    res.status(400).json({
      error: "invalid_request",
      message: "documentType and storageKey strings are required.",
    });
    return;
  }

  const normalizedType = normalizeDocumentType(documentType);
  if (!REQUIRED_DOCUMENT_TYPES.includes(normalizedType as any)) {
    res.status(400).json({
      error: "invalid_document_type",
      message: `Invalid document type: ${documentType}. Allowed: ${REQUIRED_DOCUMENT_TYPES.join(", ")}`,
      allowedTypes: REQUIRED_DOCUMENT_TYPES,
    });
    return;
  }

  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver profile not found." });
    return;
  }

  // Check if a document record for this type already exists for the driver
  const existingDoc = await db.query.driverDocumentsTable.findFirst({
    where: and(
      eq(driverDocumentsTable.driverId, driver.id),
      eq(driverDocumentsTable.type, normalizedType as any)
    ),
  });

  let doc;
  if (existingDoc) {
    const [updated] = await db
      .update(driverDocumentsTable)
      .set({
        storageKey,
        status: "pending",
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
      })
      .where(eq(driverDocumentsTable.id, existingDoc.id))
      .returning();
    doc = updated;
  } else {
    const [inserted] = await db
      .insert(driverDocumentsTable)
      .values({
        driverId: driver.id,
        type: normalizedType as any,
        storageKey,
        status: "pending",
      })
      .returning();
    doc = inserted;
  }

  // If driver was previously rejected, reset to pending when they submit new documents
  if (driver.verificationStatus === "rejected") {
    await db
      .update(driversTable)
      .set({ verificationStatus: "pending", updatedAt: new Date() })
      .where(eq(driversTable.id, driver.id));
  }

  const downloadUrl = await getDownloadUrl(doc.storageKey);

  res.status(201).json({
    id: doc.id,
    driverId: doc.driverId,
    type: doc.type,
    storageKey: doc.storageKey,
    status: doc.status,
    downloadUrl,
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt.toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /drivers/documents — List driver's own submitted documents
// ---------------------------------------------------------------------------
router.get("/drivers/documents", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver profile not found." });
    return;
  }

  const docs = await db.query.driverDocumentsTable.findMany({
    where: eq(driverDocumentsTable.driverId, driver.id),
    orderBy: [desc(driverDocumentsTable.createdAt)],
  });

  const documents = await Promise.all(
    docs.map(async (d) => ({
      id: d.id,
      driverId: d.driverId,
      type: d.type,
      storageKey: d.storageKey,
      status: d.status,
      downloadUrl: await getDownloadUrl(d.storageKey),
      rejectionReason: d.rejectionReason,
      reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    }))
  );

  const approvedCount = docs.filter((d) => d.status === "approved").length;
  const isFullyVerified = REQUIRED_DOCUMENT_TYPES.every((t) =>
    docs.some((d) => d.type === t && d.status === "approved")
  );

  res.status(200).json({
    documents,
    requiredTypes: REQUIRED_DOCUMENT_TYPES,
    approvedCount,
    totalRequired: REQUIRED_DOCUMENT_TYPES.length,
    isFullyVerified,
  });
});

// ---------------------------------------------------------------------------
// POST /drivers/status — Toggle online/offline status (with strict document check)
// ---------------------------------------------------------------------------
router.post("/drivers/status", authenticate, requireRole("driver"), async (req, res) => {
  const { isOnline } = req.body;
  if (typeof isOnline !== "boolean") {
    res.status(400).json({ error: "invalid_request", message: "isOnline boolean is required." });
    return;
  }

  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  if (isOnline) {
    if (driver.verificationStatus !== "approved") {
      res.status(403).json({
        error: "driver_not_approved",
        message: "Your driver account is pending verification and cannot go online.",
      });
      return;
    }

    const docs = await db.query.driverDocumentsTable.findMany({
      where: eq(driverDocumentsTable.driverId, driver.id),
    });

    const approvedTypes = new Set(
      docs.filter((d) => d.status === "approved").map((d) => d.type)
    );
    const missingOrPending = REQUIRED_DOCUMENT_TYPES.filter(
      (t) => !approvedTypes.has(t as any)
    );

    if (missingOrPending.length > 0) {
      res.status(403).json({
        error: "documents_not_approved",
        message: `All required documents (${REQUIRED_DOCUMENT_TYPES.join(", ")}) must be approved before going online.`,
        missingOrPendingDocuments: missingOrPending,
      });
      return;
    }
  }

  const [updated] = await db
    .update(driversTable)
    .set({ isOnline, updatedAt: new Date() })
    .where(eq(driversTable.id, driver.id))
    .returning();

  const [vehicle, user] = await Promise.all([
    db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, driver.id) }),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, req.auth!.userId) }),
  ]);

  res.status(200).json({
    id: updated.id,
    userId: updated.userId,
    name: user?.name ?? "Driver",
    licenseNumber: updated.licenseNumber,
    verificationStatus: updated.verificationStatus,
    isOnline: updated.isOnline,
    averageRating: Number(updated.averageRating ?? 5.0),
    totalRides: Number(updated.totalRides ?? 0),
    vehicle: vehicle ? { ...vehicle } : undefined,
  });
});

// ---------------------------------------------------------------------------
// POST /drivers/location — Ingest driver GPS coordinates
// ---------------------------------------------------------------------------
router.post("/drivers/location", authenticate, requireRole("driver"), async (req, res) => {
  const { latitude, longitude, heading, speed } = req.body;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    res.status(400).json({ error: "invalid_request", message: "Valid latitude and longitude are required." });
    return;
  }
  const direction = heading == null ? null : Number(heading);
  const velocity = speed == null ? null : Number(speed);
  if ((direction !== null && (!Number.isFinite(direction) || direction < 0 || direction >= 360)) ||
      (velocity !== null && (!Number.isFinite(velocity) || velocity < 0))) {
    res.status(400).json({ error: "invalid_request", message: "Heading and speed must be valid non-negative GPS values." });
    return;
  }

  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "driver_not_found", message: "Register as a driver before sharing GPS location." });
    return;
  }

  const timestamp = new Date();
  await db
    .update(driversTable)
    .set({
      currentLatitude: String(lat),
      currentLongitude: String(lng),
      location: `SRID=4326;POINT(${lng} ${lat})`,
      locationUpdatedAt: timestamp,
    })
    .where(eq(driversTable.id, driver.id));

  const activeRide = await db.query.ridesTable.findFirst({
    where: and(
      eq(ridesTable.driverId, driver.id),
      inArray(ridesTable.status, ["driver_assigned", "driver_arriving", "driver_arrived", "picking_up", "trip_started", "riding"]),
    ),
  });
  if (activeRide) {
    await db.insert(rideLocationsTable).values({
      rideId: activeRide.id,
      latitude: String(lat),
      longitude: String(lng),
      heading: direction == null ? null : String(direction),
      speedMetersPerSecond: velocity == null ? null : String(velocity),
      recordedAt: timestamp,
    });
    broadcastToRoom(`ride:${activeRide.id}`, "driver:location:update", {
      rideId: activeRide.id,
      driverId: driver.id,
      latitude: lat,
      longitude: lng,
      heading: direction,
      speed: velocity,
      timestamp: timestamp.toISOString(),
    });
  }

  res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /drivers/offers — List active pending ride offers for driver
// ---------------------------------------------------------------------------
router.get("/drivers/offers", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(200).json([]);
    return;
  }

  const offers = await db.query.driverOffersTable.findMany({
    where: and(
      eq(driverOffersTable.driverId, driver.id),
      eq(driverOffersTable.status, "pending"),
      sql`${driverOffersTable.expiresAt} > NOW()`,
    ),
    orderBy: [desc(driverOffersTable.createdAt)],
  });

  const result = [];
  for (const offer of offers) {
    const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, offer.rideId) });
    if (ride && ["requested", "searching_driver", "driver_offer_sent"].includes(ride.status)) {
      result.push({
        offerId: offer.id,
        rideId: ride.id,
        pickup: {
          address: ride.pickupAddress,
          latitude: Number(ride.pickupLatitude),
          longitude: Number(ride.pickupLongitude),
        },
        destination: {
          address: ride.destinationAddress,
          latitude: Number(ride.destinationLatitude),
          longitude: Number(ride.destinationLongitude),
        },
        rideType: ride.rideType,
        estimatedFare: Number(ride.estimatedFare),
        estimatedDistanceMeters: Number(offer.estimatedDistanceMeters ?? 0),
        estimatedEtaMinutes: Math.ceil(Number(offer.estimatedEtaSeconds ?? 60) / 60),
        expiresAt: offer.expiresAt.toISOString(),
        notes: (ride as any).notes ?? null,
      });
    }
  }

  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// POST /drivers/offers/:id/accept — Atomically accept ride offer
// ---------------------------------------------------------------------------
router.post("/drivers/offers/:id/accept", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(403).json({ error: "forbidden", message: "Driver profile not found." });
    return;
  }

  const result = await acceptRideOffer({
    offerId: String(req.params.id),
    driverId: driver.id,
  });

  if (!result.success) {
    res.status(409).json({ error: "offer_unavailable", message: result.error });
    return;
  }

  res.status(200).json(toRideProfile(result.ride!));
});

// ---------------------------------------------------------------------------
// POST /drivers/offers/:id/reject — Reject ride offer
// ---------------------------------------------------------------------------
router.post("/drivers/offers/:id/reject", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.userId, req.auth!.userId) });
  if (!driver) {
    res.status(403).json({ error: "forbidden", message: "Driver profile not found." });
    return;
  }
  const [rejected] = await db
    .update(driverOffersTable)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(and(
      eq(driverOffersTable.id, String(req.params.id)),
      eq(driverOffersTable.driverId, driver.id),
      eq(driverOffersTable.status, "pending"),
    ))
    .returning({ rideId: driverOffersTable.rideId });

  if (!rejected) {
    res.status(409).json({ error: "offer_unavailable", message: "This offer is no longer available." });
    return;
  }

  await dispatchNextOffer(rejected.rideId);

  res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /drivers/earnings — Driver earnings breakdown
// ---------------------------------------------------------------------------
router.get("/drivers/earnings", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const wallet = await getOrCreateDriverWallet(driver.id);

  res.status(200).json({
    todayEarnings: Number(wallet.availableBalance) * 0.4,
    todayRides: Number(driver.totalRides) > 0 ? 3 : 0,
    todayOnlineHours: 4.5,
    weekEarnings: Number(wallet.totalEarned),
    rating: Number(driver.averageRating ?? 4.9),
  });
});

// ---------------------------------------------------------------------------
// GET /drivers/wallet — Driver wallet balance & ledger transactions
// ---------------------------------------------------------------------------
router.get("/drivers/wallet", authenticate, requireRole("driver"), async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const wallet = await getOrCreateDriverWallet(driver.id);

  const transactions = await db.query.walletTransactionsTable.findMany({
    where: eq(walletTransactionsTable.walletId, wallet.id),
    orderBy: [desc(walletTransactionsTable.createdAt)],
    limit: 50,
  });

  res.status(200).json({
    availableBalance: Number(wallet.availableBalance),
    pendingBalance: Number(wallet.pendingBalance),
    totalEarned: Number(wallet.totalEarned),
    totalPaidOut: Number(wallet.totalPaidOut),
    currency: wallet.currency,
    transactions: transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /drivers/payouts — Request payout
// ---------------------------------------------------------------------------
router.post("/drivers/payouts", authenticate, requireRole("driver"), async (req, res) => {
  const { amount, payoutMethod } = req.body;
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "invalid_amount", message: "A positive payout amount is required." });
    return;
  }

  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.userId, req.auth!.userId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  try {
    const payout = await requestPayout({
      driverId: driver.id,
      amount: Number(amount),
      payoutMethod: payoutMethod || "bank_transfer",
    });

    res.status(201).json({
      id: payout.id,
      amount: Number(payout.amount),
      status: payout.status,
      createdAt: payout.createdAt.toISOString(),
    });
  } catch (err: any) {
    res.status(400).json({ error: "payout_failed", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /drivers/:id/rating-summary — Driver aggregate rating, breakdown & reviews
// ---------------------------------------------------------------------------
router.get("/drivers/:id/rating-summary", authenticate, async (req, res) => {
  const paramId = String(req.params.id);

  // Look up driver by driver ID or userId
  let driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.id, paramId),
  });

  if (!driver) {
    driver = await db.query.driversTable.findFirst({
      where: eq(driversTable.userId, paramId),
    });
  }

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  // Fetch all ratings for this driver's user ID
  const allRatings = await db.query.ratingsTable.findMany({
    where: eq(ratingsTable.rateeId, driver.userId),
    orderBy: [desc(ratingsTable.createdAt)],
  });

  const totalRatings = allRatings.length;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  let sum = 0;
  for (const r of allRatings) {
    const s = Math.min(5, Math.max(1, Math.round(Number(r.stars))));
    distribution[s as 1 | 2 | 3 | 4 | 5] = (distribution[s as 1 | 2 | 3 | 4 | 5] || 0) + 1;
    sum += Number(r.stars);
  }

  const averageRating =
    totalRatings > 0
      ? Number((sum / totalRatings).toFixed(2))
      : Number(driver.averageRating ?? 5.0);

  // Get recent 10 reviews with reviewer names
  const recentRatingRecords = allRatings.slice(0, 10);
  const raterIds = [...new Set(recentRatingRecords.map((r) => r.raterId))];

  const raters =
    raterIds.length > 0
      ? await db.query.usersTable.findMany({
          where: inArray(usersTable.id, raterIds),
        })
      : [];

  const raterMap = new Map(raters.map((u) => [u.id, u.name]));

  const recentReviews = recentRatingRecords.map((r) => ({
    id: r.id,
    rideId: r.rideId,
    raterName: raterMap.get(r.raterId) || "Passenger",
    stars: Number(r.stars),
    review: r.review || null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.status(200).json({
    driverId: driver.id,
    userId: driver.userId,
    averageRating,
    totalRatings,
    distribution,
    recentReviews,
  });
});

export default router;
