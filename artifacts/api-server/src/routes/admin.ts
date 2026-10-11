import { Router, type IRouter } from "express";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import {
  db,
  usersTable,
  driversTable,
  vehiclesTable,
  ridesTable,
  emergencyEventsTable,
  fareConfigurationsTable,
  driverDocumentsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";
import { toRideProfile, toUserProfile } from "../lib/serializers";
import { getDownloadUrl } from "../lib/storage";
import { sendPushNotification } from "../lib/notifications";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /admin/users — Search & paginate users
// ---------------------------------------------------------------------------
router.get("/admin/users", authenticate, requireRole("admin"), async (req, res) => {
  const search = req.query.search ? String(req.query.search).trim() : null;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);

  let whereClause = undefined;
  if (search) {
    whereClause = ilike(usersTable.name, `%${search}%`);
  }

  const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const totalRowPromise = whereClause ? countQuery.where(whereClause) : countQuery;

  const [users, totalRow] = await Promise.all([
    db.query.usersTable.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(usersTable.createdAt)],
    }),
    totalRowPromise,
  ]);

  res.status(200).json({
    users: users.map(u => ({
      id: u.id,
      role: u.role,
      status: u.status,
      name: u.name,
      phone: u.phone,
      email: u.email,
      phoneVerified: Boolean(u.phoneVerifiedAt),
      emailVerified: Boolean(u.emailVerifiedAt),
      isBlocked: Boolean(u.isBlocked),
      blockedReason: u.blockedReason ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/drivers — List drivers with verification filter
// ---------------------------------------------------------------------------
router.get("/admin/drivers", authenticate, requireRole("admin"), async (req, res) => {
  const status = req.query.status as any;
  const where = status ? eq(driversTable.verificationStatus, status) : undefined;

  const drivers = await db.query.driversTable.findMany({
    where,
    orderBy: [desc(driversTable.createdAt)],
  });

  const result = await Promise.all(
    drivers.map(async (d) => {
      const [user, vehicle, docs] = await Promise.all([
        db.query.usersTable.findFirst({ where: eq(usersTable.id, d.userId) }),
        db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, d.id) }),
        db.query.driverDocumentsTable.findMany({ where: eq(driverDocumentsTable.driverId, d.id) }),
      ]);

      const approvedDocs = docs.filter((doc) => doc.status === "approved").length;
      const pendingDocs = docs.filter((doc) => doc.status === "pending").length;
      const rejectedDocs = docs.filter((doc) => doc.status === "rejected").length;

      return {
        id: d.id,
        userId: d.userId,
        name: user?.name ?? "Driver",
        phone: user?.phone,
        licenseNumber: d.licenseNumber,
        verificationStatus: d.verificationStatus,
        isOnline: d.isOnline,
        isBlocked: Boolean(d.isBlocked),
        blockedReason: d.blockedReason ?? null,
        averageRating: Number(d.averageRating ?? 5),
        totalRides: Number(d.totalRides ?? 0),
        currentLatitude: d.currentLatitude ? Number(d.currentLatitude) : null,
        currentLongitude: d.currentLongitude ? Number(d.currentLongitude) : null,
        vehicle: vehicle ? { ...vehicle } : undefined,
        documentSummary: {
          total: docs.length,
          approved: approvedDocs,
          pending: pendingDocs,
          rejected: rejectedDocs,
        },
      };
    }),
  );

  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// GET /admin/drivers/:id/documents — List driver documents with download URLs
// ---------------------------------------------------------------------------
router.get("/admin/drivers/:id/documents", authenticate, requireRole("admin"), async (req, res) => {
  const driverId = String(req.params.id);
  const driver = await db.query.driversTable.findFirst({
    where: eq(driversTable.id, driverId),
  });

  if (!driver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const docs = await db.query.driverDocumentsTable.findMany({
    where: eq(driverDocumentsTable.driverId, driverId),
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
      reviewedBy: d.reviewedBy,
      reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    }))
  );

  res.status(200).json({
    driverId,
    documents,
  });
});

// ---------------------------------------------------------------------------
// POST /admin/drivers/:id/documents/:docId/review — Approve or reject a document
// ---------------------------------------------------------------------------
router.post("/admin/drivers/:id/documents/:docId/review", authenticate, requireRole("admin"), async (req, res) => {
  const driverId = String(req.params.id);
  const docId = String(req.params.docId);
  const { status, rejectionReason } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({
      error: "invalid_status",
      message: "Status must be 'approved' or 'rejected'.",
    });
    return;
  }

  const existingDoc = await db.query.driverDocumentsTable.findFirst({
    where: and(
      eq(driverDocumentsTable.id, docId),
      eq(driverDocumentsTable.driverId, driverId)
    ),
  });

  if (!existingDoc) {
    res.status(404).json({ error: "not_found", message: "Document not found for this driver." });
    return;
  }

  const [updatedDoc] = await db
    .update(driverDocumentsTable)
    .set({
      status,
      rejectionReason: status === "rejected" ? rejectionReason || "Document does not meet requirements" : null,
      reviewedBy: req.auth!.userId,
      reviewedAt: new Date(),
    })
    .where(eq(driverDocumentsTable.id, docId))
    .returning();

  // Check if all 5 required documents for this driver are now approved
  const REQUIRED = ["license", "vehicle_registration", "id_proof", "vehicle_photo", "selfie"];
  const allDocs = await db.query.driverDocumentsTable.findMany({
    where: eq(driverDocumentsTable.driverId, driverId),
  });

  const approvedTypes = new Set(
    allDocs.filter((d) => d.status === "approved").map((d) => d.type)
  );
  const allRequiredApproved = REQUIRED.every((t) => approvedTypes.has(t as any));

  const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.id, driverId) });

  if (allRequiredApproved) {
    await db
      .update(driversTable)
      .set({ verificationStatus: "approved", rejectionReason: null, updatedAt: new Date() })
      .where(eq(driversTable.id, driverId));

    if (driver) {
      sendPushNotification({
        userId: driver.userId,
        title: "KYC Verification Approved! 🎉",
        body: "All 5 documents have been approved. You can now go online and start accepting ride requests!",
        type: "kyc_approved",
      }).catch(() => {});
    }
  } else if (status === "rejected") {
    await db
      .update(driversTable)
      .set({
        verificationStatus: "rejected",
        rejectionReason: rejectionReason || `Document ${updatedDoc.type} was rejected`,
        updatedAt: new Date(),
      })
      .where(eq(driversTable.id, driverId));

    if (driver) {
      sendPushNotification({
        userId: driver.userId,
        title: "KYC Document Update",
        body: `Your ${updatedDoc.type} was rejected: ${rejectionReason || "Please upload a clearer image."}`,
        type: "kyc_rejected",
        data: { documentId: updatedDoc.id, type: updatedDoc.type },
      }).catch(() => {});
    }
  } else if (status === "approved" && driver) {
    sendPushNotification({
      userId: driver.userId,
      title: "Document Verified",
      body: `Your ${updatedDoc.type} has been verified successfully.`,
      type: "kyc_doc_approved",
      data: { documentId: updatedDoc.id, type: updatedDoc.type },
    }).catch(() => {});
  }

  const downloadUrl = await getDownloadUrl(updatedDoc.storageKey);

  res.status(200).json({
    id: updatedDoc.id,
    driverId: updatedDoc.driverId,
    type: updatedDoc.type,
    storageKey: updatedDoc.storageKey,
    status: updatedDoc.status,
    downloadUrl,
    rejectionReason: updatedDoc.rejectionReason,
    reviewedBy: updatedDoc.reviewedBy,
    reviewedAt: updatedDoc.reviewedAt ? updatedDoc.reviewedAt.toISOString() : null,
    allRequiredApproved,
  });
});

// ---------------------------------------------------------------------------
// POST /admin/drivers/:id/review — Approve, reject, or suspend driver
// ---------------------------------------------------------------------------
router.post("/admin/drivers/:id/review", authenticate, requireRole("admin"), async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected", "suspended"].includes(status)) {
    res.status(400).json({ error: "invalid_status", message: "Status must be approved, rejected, or suspended." });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set({
      verificationStatus: status,
      isOnline: status === "approved" ? undefined : false,
      updatedAt: new Date(),
    })
    .where(eq(driversTable.id, String(req.params.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const [user, vehicle] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.userId) }),
    db.query.vehiclesTable.findFirst({ where: eq(vehiclesTable.driverId, updated.id) }),
  ]);

  res.status(200).json({
    id: updated.id,
    userId: updated.userId,
    name: user?.name ?? "Driver",
    licenseNumber: updated.licenseNumber,
    verificationStatus: updated.verificationStatus,
    isOnline: updated.isOnline,
    isBlocked: Boolean(updated.isBlocked),
    blockedReason: updated.blockedReason ?? null,
    vehicle: vehicle ? { ...vehicle } : undefined,
  });
});

// ---------------------------------------------------------------------------
// POST /admin/users/:id/block — Block user account
// ---------------------------------------------------------------------------
router.post("/admin/users/:id/block", authenticate, requireRole("admin"), async (req, res) => {
  const userId = String(req.params.id);
  const { reason } = req.body ?? {};

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      isBlocked: true,
      blockedReason: reason ? String(reason).trim() : "Account blocked by administration",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updatedUser) {
    res.status(404).json({ error: "not_found", message: "User not found." });
    return;
  }

  // Also set associated driver offline if user is a driver
  if (updatedUser.role === "driver") {
    await db
      .update(driversTable)
      .set({ isOnline: false, updatedAt: new Date() })
      .where(eq(driversTable.userId, userId));
  }

  res.status(200).json(toUserProfile(updatedUser));
});

// ---------------------------------------------------------------------------
// POST /admin/users/:id/unblock — Unblock user account
// ---------------------------------------------------------------------------
router.post("/admin/users/:id/unblock", authenticate, requireRole("admin"), async (req, res) => {
  const userId = String(req.params.id);

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      isBlocked: false,
      blockedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updatedUser) {
    res.status(404).json({ error: "not_found", message: "User not found." });
    return;
  }

  res.status(200).json(toUserProfile(updatedUser));
});

// ---------------------------------------------------------------------------
// POST /admin/drivers/:id/block — Block driver profile
// ---------------------------------------------------------------------------
router.post("/admin/drivers/:id/block", authenticate, requireRole("admin"), async (req, res) => {
  const driverId = String(req.params.id);
  const { reason } = req.body ?? {};

  const [updatedDriver] = await db
    .update(driversTable)
    .set({
      isBlocked: true,
      blockedReason: reason ? String(reason).trim() : "Driver account blocked by administration",
      isOnline: false,
      updatedAt: new Date(),
    })
    .where(eq(driversTable.id, driverId))
    .returning();

  if (!updatedDriver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updatedDriver.userId) });

  res.status(200).json({
    id: updatedDriver.id,
    userId: updatedDriver.userId,
    name: user?.name ?? "Driver",
    licenseNumber: updatedDriver.licenseNumber,
    verificationStatus: updatedDriver.verificationStatus,
    isOnline: updatedDriver.isOnline,
    isBlocked: Boolean(updatedDriver.isBlocked),
    blockedReason: updatedDriver.blockedReason ?? null,
  });
});

// ---------------------------------------------------------------------------
// POST /admin/drivers/:id/unblock — Unblock driver profile
// ---------------------------------------------------------------------------
router.post("/admin/drivers/:id/unblock", authenticate, requireRole("admin"), async (req, res) => {
  const driverId = String(req.params.id);

  const [updatedDriver] = await db
    .update(driversTable)
    .set({
      isBlocked: false,
      blockedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(driversTable.id, driverId))
    .returning();

  if (!updatedDriver) {
    res.status(404).json({ error: "not_found", message: "Driver not found." });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updatedDriver.userId) });

  res.status(200).json({
    id: updatedDriver.id,
    userId: updatedDriver.userId,
    name: user?.name ?? "Driver",
    licenseNumber: updatedDriver.licenseNumber,
    verificationStatus: updatedDriver.verificationStatus,
    isOnline: updatedDriver.isOnline,
    isBlocked: Boolean(updatedDriver.isBlocked),
    blockedReason: updatedDriver.blockedReason ?? null,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/rides — Live ride monitoring
// ---------------------------------------------------------------------------
router.get("/admin/rides", authenticate, requireRole("admin"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const status = req.query.status as any;
  const where = status ? eq(ridesTable.status, status) : undefined;

  const [rides, totalRow] = await Promise.all([
    db.query.ridesTable.findMany({
      where,
      limit,
      orderBy: [desc(ridesTable.createdAt)],
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(ridesTable),
  ]);

  res.status(200).json({
    rides: rides.map((ride) => toRideProfile(ride)),
    total: totalRow[0]?.count ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/emergency-events — List active SOS emergency events
// ---------------------------------------------------------------------------
router.get("/admin/emergency-events", authenticate, requireRole("admin"), async (req, res) => {
  const events = await db.query.emergencyEventsTable.findMany({
    orderBy: [desc(emergencyEventsTable.createdAt)],
  });

  res.status(200).json(
    events.map(e => ({
      id: e.id,
      userId: e.userId,
      rideId: e.rideId,
      type: e.type,
      status: e.status,
      latitude: Number(e.latitude),
      longitude: Number(e.longitude),
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /admin/emergency-events/:id/resolve — Mark emergency event resolved
// ---------------------------------------------------------------------------
router.post("/admin/emergency-events/:id/resolve", authenticate, requireRole("admin"), async (req, res) => {
  const { notes } = req.body ?? {};

  await db
    .update(emergencyEventsTable)
    .set({
      status: "resolved",
      resolvedBy: req.auth!.userId,
      resolvedAt: new Date(),
      details: notes ? sql`concat(${emergencyEventsTable.details}, ' | Resolution: ', ${notes})` : undefined,
      updatedAt: new Date(),
    })
    .where(eq(emergencyEventsTable.id, String(req.params.id)));

  res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /admin/pricing — Get active fare configurations
// ---------------------------------------------------------------------------
router.get("/admin/pricing", authenticate, requireRole("admin"), async (req, res) => {
  const configs = await db.query.fareConfigurationsTable.findMany({
    where: eq(fareConfigurationsTable.isActive, true),
  });

  res.status(200).json(
    configs.map(c => ({
      id: c.id,
      rideType: c.rideType,
      baseFare: Number(c.baseFare),
      perKm: Number(c.perKm),
      perMinute: Number(c.perMinute),
      minimumFare: Number(c.minimumFare),
      bookingFee: Number(c.bookingFee),
      surgeMultiplier: 1.0,
      cancellationFee: Number(c.cancellationFee ?? 40),
    })),
  );
});

export default router;
