import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  emergencyEventsTable,
  emergencyContactsTable,
  ridesTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middleware/auth";
import { broadcastToRoom } from "../lib/ws-server";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /safety/sos — Trigger emergency SOS incident
// ---------------------------------------------------------------------------
router.post("/safety/sos", authenticate, async (req, res) => {
  const { rideId, latitude, longitude, details } = req.body;
  if (latitude == null || longitude == null) {
    res.status(400).json({ error: "invalid_request", message: "Latitude and longitude are required." });
    return;
  }

  const [event] = await db
    .insert(emergencyEventsTable)
    .values({
      userId: req.auth!.userId,
      rideId: rideId || null,
      type: "sos_button",
      status: "active",
      latitude: String(latitude),
      longitude: String(longitude),
      details: details || "Emergency SOS Button Triggered from Mobile App",
    })
    .returning();

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.auth!.userId) });

  const payload = {
    id: event.id,
    userId: event.userId,
    userName: user?.name,
    userPhone: user?.phone,
    rideId: event.rideId,
    type: event.type,
    status: event.status,
    latitude: Number(event.latitude),
    longitude: Number(event.longitude),
    createdAt: event.createdAt.toISOString(),
  };

  broadcastToRoom("admin:ops", "safety:sos:alert", payload);
  if (rideId) {
    broadcastToRoom(`ride:${rideId}`, "safety:sos:alert", payload);
  }

  res.status(201).json(payload);
});

// ---------------------------------------------------------------------------
// GET /safety/emergency-contacts — List trusted emergency contacts
// ---------------------------------------------------------------------------
router.get("/safety/emergency-contacts", authenticate, async (req, res) => {
  const contacts = await db.query.emergencyContactsTable.findMany({
    where: eq(emergencyContactsTable.userId, req.auth!.userId),
    orderBy: [desc(emergencyContactsTable.createdAt)],
  });

  res.status(200).json(
    contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      relationship: c.relationship,
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /safety/emergency-contacts — Add trusted emergency contact
// ---------------------------------------------------------------------------
router.post("/safety/emergency-contacts", authenticate, async (req, res) => {
  const { name, phone, relationship } = req.body;
  if (!name || !phone) {
    res.status(400).json({ error: "invalid_request", message: "Name and phone are required." });
    return;
  }

  const [contact] = await db
    .insert(emergencyContactsTable)
    .values({
      userId: req.auth!.userId,
      name,
      phone,
      relationship: relationship || "Family",
    })
    .returning();

  res.status(201).json({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    relationship: contact.relationship,
  });
});

// ---------------------------------------------------------------------------
// DELETE /safety/emergency-contacts/:id — Remove emergency contact
// ---------------------------------------------------------------------------
router.delete("/safety/emergency-contacts/:id", authenticate, async (req, res) => {
  const deleted = await db
    .delete(emergencyContactsTable)
    .where(
      and(
        eq(emergencyContactsTable.id, String(req.params.id)),
        eq(emergencyContactsTable.userId, req.auth!.userId)
      )
    )
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "not_found", message: "Emergency contact not found." });
    return;
  }

  res.status(204).send();
});

export default router;
