import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  lostItemsTable,
} from "@workspace/db";
import { authenticate } from "../middleware/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /support/tickets — List user's support tickets
// ---------------------------------------------------------------------------
router.get("/support/tickets", authenticate, async (req, res) => {
  const tickets = await db.query.supportTicketsTable.findMany({
    where: eq(supportTicketsTable.userId, req.auth!.userId),
    orderBy: [desc(supportTicketsTable.createdAt)],
  });

  res.status(200).json(
    tickets.map(t => ({
      id: t.id,
      category: t.category,
      subject: t.subject,
      description: t.description,
      status: t.status,
      rideId: t.rideId,
      createdAt: t.createdAt.toISOString(),
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /support/tickets — Submit support ticket
// ---------------------------------------------------------------------------
router.post("/support/tickets", authenticate, async (req, res) => {
  const { category = "general", subject, description, rideId } = req.body;
  if (!subject || !description) {
    res.status(400).json({ error: "invalid_request", message: "Subject and description are required." });
    return;
  }

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      userId: req.auth!.userId,
      rideId: rideId || null,
      category,
      subject,
      description,
      status: "open",
    })
    .returning();

  res.status(201).json({
    id: ticket.id,
    category: ticket.category,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    rideId: ticket.rideId,
    createdAt: ticket.createdAt.toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /support/lost-and-found — List lost items reports
// ---------------------------------------------------------------------------
router.get("/support/lost-and-found", authenticate, async (req, res) => {
  const items = await db.query.lostItemsTable.findMany({
    where: eq(lostItemsTable.reportedBy, req.auth!.userId),
    orderBy: [desc(lostItemsTable.createdAt)],
  });

  res.status(200).json(
    items.map(i => ({
      id: i.id,
      rideId: i.rideId,
      description: i.description,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /support/lost-and-found — Report lost item
// ---------------------------------------------------------------------------
router.post("/support/lost-and-found", authenticate, async (req, res) => {
  const { rideId, description } = req.body;
  if (!rideId || !description) {
    res.status(400).json({ error: "invalid_request", message: "rideId and description are required." });
    return;
  }

  const [item] = await db
    .insert(lostItemsTable)
    .values({
      rideId,
      reportedBy: req.auth!.userId,
      description,
      status: "reported",
    })
    .returning();

  res.status(201).json({
    id: item.id,
    rideId: item.rideId,
    description: item.description,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  });
});

export default router;
