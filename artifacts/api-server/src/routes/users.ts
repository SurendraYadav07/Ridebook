import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, usersTable, savedLocationsTable, notificationsTable } from "@workspace/db";
import { UpdateCurrentUserBody } from "@workspace/api-zod";
import { authenticate } from "../middleware/auth";
import { toUserProfile } from "../lib/serializers";
import { registerPushDeviceToken } from "../lib/notifications";

const router: IRouter = Router();

router.get("/users/me", authenticate, async (req, res) => {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.auth!.userId) });
  if (!user) {
    res.status(404).json({ error: "not_found", message: "User not found." });
    return;
  }
  res.status(200).json(toUserProfile(user));
});

router.patch("/users/me", authenticate, async (req, res) => {
  const parsed = UpdateCurrentUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const updates: { name?: string; profilePhotoUrl?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.profilePhotoUrl !== undefined) updates.profilePhotoUrl = parsed.data.profilePhotoUrl;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.auth!.userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "User not found." });
    return;
  }
  res.status(200).json(toUserProfile(updated));
});

// ---------------------------------------------------------------------------
// GET /users/saved-locations — List saved locations
// ---------------------------------------------------------------------------
router.get("/users/saved-locations", authenticate, async (req, res) => {
  const locations = await db.query.savedLocationsTable.findMany({
    where: eq(savedLocationsTable.userId, req.auth!.userId),
    orderBy: [desc(savedLocationsTable.createdAt)],
  });

  res.status(200).json(
    locations.map(l => ({
      id: l.id,
      label: l.label,
      address: l.address,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /users/saved-locations — Save favorite location
// ---------------------------------------------------------------------------
router.post("/users/saved-locations", authenticate, async (req, res) => {
  const { label, address, latitude, longitude } = req.body;
  if (!label || !address || latitude == null || longitude == null) {
    res.status(400).json({ error: "invalid_request", message: "label, address, latitude, and longitude are required." });
    return;
  }

  const [saved] = await db
    .insert(savedLocationsTable)
    .values({
      userId: req.auth!.userId,
      label,
      address,
      latitude: String(latitude),
      longitude: String(longitude),
    })
    .returning();

  res.status(201).json({
    id: saved.id,
    label: saved.label,
    address: saved.address,
    latitude: Number(saved.latitude),
    longitude: Number(saved.longitude),
  });
});

// ---------------------------------------------------------------------------
// DELETE /users/saved-locations/:id — Remove saved location
// ---------------------------------------------------------------------------
router.delete("/users/saved-locations/:id", authenticate, async (req, res) => {
  await db
    .delete(savedLocationsTable)
    .where(
      and(
        eq(savedLocationsTable.id, String(req.params.id)),
        eq(savedLocationsTable.userId, req.auth!.userId),
      ),
    );

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /users/devices — Register device push token (Expo Push / FCM)
// ---------------------------------------------------------------------------
router.post("/users/devices", authenticate, async (req, res) => {
  const { pushToken, platform = "android" } = req.body;
  if (typeof pushToken !== "string" || !/^Expo(?:nent)?PushToken\[[^\]]+\]$/.test(pushToken) || !["ios", "android"].includes(platform)) {
    res.status(400).json({ error: "invalid_request", message: "A valid Expo push token and ios or android platform are required." });
    return;
  }

  const registered = await registerPushDeviceToken({
    userId: req.auth!.userId,
    pushToken,
    platform: platform as any,
  });

  res.status(200).json({
    success: true,
    deviceId: registered?.id,
    platform,
  });
});

// ---------------------------------------------------------------------------
// GET /users/notifications — List notifications for current user
// ---------------------------------------------------------------------------
router.get("/users/notifications", authenticate, async (req, res) => {
  const notifications = await db.query.notificationsTable.findMany({
    where: eq(notificationsTable.userId, req.auth!.userId),
    orderBy: [desc(notificationsTable.createdAt)],
    limit: 30,
  });

  res.status(200).json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ? JSON.parse(n.data) : null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

// ---------------------------------------------------------------------------
// PATCH /users/notifications/:id/read — Mark notification as read
// ---------------------------------------------------------------------------
router.patch("/users/notifications/:id/read", authenticate, async (req, res) => {
  const [updated] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, String(req.params.id)),
        eq(notificationsTable.userId, req.auth!.userId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Notification not found." });
    return;
  }

  res.status(200).json({ success: true, readAt: updated.readAt?.toISOString() });
});

export default router;
