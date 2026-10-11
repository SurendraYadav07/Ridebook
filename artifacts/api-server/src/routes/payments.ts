import { Router, type IRouter } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db, ridesTable, paymentsTable, refundsTable } from "@workspace/db";
import { authenticate } from "../middleware/auth";
import {
  createPaymentOrder,
  verifySignature,
  verifyCapturedGatewayPayment,
  markPaymentCompleted,
  processRefund,
} from "../lib/payments";
import { idempotencyMiddleware } from "../middleware/idempotency";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /payments/create-order — Create payment order for ride
// ---------------------------------------------------------------------------
router.post("/payments/create-order", authenticate, idempotencyMiddleware, async (req, res) => {
  const { rideId, paymentMethodType = "card" } = req.body;
  if (!rideId) {
    res.status(400).json({ error: "invalid_request", message: "rideId is required." });
    return;
  }

  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideId) });
  if (!ride) {
    res.status(404).json({ error: "not_found", message: "Ride not found." });
    return;
  }
  if (ride.passengerId !== req.auth!.userId) {
    res.status(403).json({ error: "forbidden", message: "Only the passenger can pay for this ride." });
    return;
  }
  if (!["trip_completed", "payment_pending", "payment_failed"].includes(ride.status)) {
    res.status(409).json({ error: "invalid_ride_status", message: "Payment can only be collected after the trip is complete." });
    return;
  }
  if (!["card", "upi", "netbanking", "wallet", "cash"].includes(paymentMethodType)) {
    res.status(400).json({ error: "invalid_payment_method", message: "Unsupported payment method." });
    return;
  }

  const amount = Number(ride.finalFare ?? ride.estimatedFare ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(409).json({ error: "invalid_fare", message: "This ride has no payable fare." });
    return;
  }

  const order = await createPaymentOrder({
    rideId: ride.id,
    payerId: req.auth!.userId,
    amount,
    paymentMethodType,
  });

  res.status(200).json(order);
});

// ---------------------------------------------------------------------------
// POST /payments/verify — Server-side signature & transaction verification
// ---------------------------------------------------------------------------
router.post("/payments/verify", authenticate, idempotencyMiddleware, async (req, res) => {
  const { rideId, orderId, paymentId, signature } = req.body;
  if (!rideId || !orderId || !paymentId) {
    res.status(400).json({ error: "invalid_request", message: "rideId, orderId, and paymentId are required." });
    return;
  }

  const payment = await db.query.paymentsTable.findFirst({
    where: and(eq(paymentsTable.providerOrderId, String(orderId)), eq(paymentsTable.rideId, String(rideId)), eq(paymentsTable.payerId, req.auth!.userId)),
  });
  if (!payment) {
    res.status(404).json({ error: "payment_not_found", message: "Payment order not found for this account." });
    return;
  }
  const ride = await db.query.ridesTable.findFirst({ where: eq(ridesTable.id, payment.rideId) });
  if (!ride || ride.passengerId !== req.auth!.userId) {
    res.status(403).json({ error: "forbidden", message: "Payment does not belong to this account." });
    return;
  }

  const isValid = verifySignature({ orderId, paymentId, signature });
  if (!isValid) {
    res.status(400).json({ error: "invalid_signature", message: "Payment signature verification failed." });
    return;
  }

  const captured = await verifyCapturedGatewayPayment({
    orderId: String(orderId),
    paymentId: String(paymentId),
    amount: Number(payment.totalAmount),
    currency: payment.currency,
  });
  if (!captured) {
    res.status(400).json({ error: "payment_not_captured", message: "The payment provider has not confirmed this captured payment." });
    return;
  }

  await markPaymentCompleted({
    rideId,
    orderId,
    paymentId,
    signature,
  });

  res.status(200).json({
    id: payment.id,
    rideId,
    totalAmount: Number(payment.totalAmount),
    status: "captured",
    currency: payment.currency,
  });
});

// ---------------------------------------------------------------------------
// POST /payments/webhook — Server-to-server webhook
// ---------------------------------------------------------------------------
router.post("/payments/webhook", async (req, res) => {
  const signature = req.header("x-razorpay-signature") ?? "";
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || !rawBody || !signature) {
    res.status(503).json({ error: "webhook_unavailable", message: "Payment webhook verification is not configured." });
    return;
  }
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest();
  let provided: Buffer;
  try { provided = Buffer.from(signature, "hex"); } catch { provided = Buffer.alloc(0); }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: "invalid_signature", message: "Webhook signature verification failed." });
    return;
  }
  const event = req.body?.event;
  const payload = req.body?.payload;

  if (event === "payment.captured" && payload?.payment?.entity) {
    const paymentEntity = payload.payment.entity;
    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    const payment = await db.query.paymentsTable.findFirst({
      where: eq(paymentsTable.providerOrderId, orderId),
    });

    if (payment) {
      if (paymentEntity.amount !== Math.round(Number(payment.totalAmount) * 100) || paymentEntity.currency !== payment.currency) {
        res.status(400).json({ error: "payment_mismatch", message: "Captured payment amount or currency does not match the order." });
        return;
      }
      await markPaymentCompleted({
        rideId: payment.rideId,
        orderId,
        paymentId,
      });
    }
  } else if (event === "refund.processed" && payload?.refund?.entity) {
    const refundEntity = payload.refund.entity;
    if (refundEntity.id) {
      const [refund] = await db.update(refundsTable)
        .set({ status: "processed" })
        .where(eq(refundsTable.providerRefundId, String(refundEntity.id)))
        .returning();
      if (refund) {
        const payment = await db.query.paymentsTable.findFirst({ where: eq(paymentsTable.id, refund.paymentId) });
        if (payment) {
          const totalRefunded = await db.query.refundsTable.findMany({ where: eq(refundsTable.paymentId, payment.id) });
          const refundedAmount = totalRefunded.reduce((sum, item) => sum + Number(item.amount), 0);
          await db.update(paymentsTable).set({
            status: refundedAmount >= Number(payment.totalAmount) ? "refunded" : "partially_refunded",
            updatedAt: new Date(),
          }).where(eq(paymentsTable.id, payment.id));
        }
      }
    }
  }

  res.status(200).json({ received: true });
});

// ---------------------------------------------------------------------------
// POST /payments/:id/refund — Process refund
// ---------------------------------------------------------------------------
router.post("/payments/:id/refund", authenticate, async (req, res) => {
  if (req.auth!.role !== "admin") {
    res.status(403).json({ error: "forbidden", message: "Only an administrator can issue a refund." });
    return;
  }
  const { amount, reason } = req.body;
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "invalid_amount", message: "Valid refund amount required." });
    return;
  }

  try {
    const refund = await processRefund({
      paymentId: String(req.params.id),
      amount: Number(amount),
      reason: reason || "Customer support refund",
      initiatedByUserId: req.auth!.userId,
    });

    res.status(200).json({
      id: refund.id,
      amount: Number(refund.amount),
      status: refund.status,
    });
  } catch (err: any) {
    res.status(400).json({ error: "refund_failed", message: err.message });
  }
});

export default router;
