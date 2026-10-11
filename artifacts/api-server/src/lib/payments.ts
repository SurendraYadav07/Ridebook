import crypto from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  paymentsTable,
  paymentTransactionsTable,
  refundsTable,
  ridesTable,
  rideStatusHistoryTable,
} from "@workspace/db";
import { broadcastToRide } from "./ws-server";
import { toRideProfile } from "./serializers";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const isProduction = (process.env.NODE_ENV ?? "production") === "production";

/**
 * Creates a payment order for a completed or active ride.
 */
export async function createPaymentOrder(params: {
  rideId: string;
  payerId: string;
  amount: number;
  paymentMethodType: "card" | "upi" | "netbanking" | "wallet" | "cash";
  currency?: string;
}) {
  const { rideId, payerId, amount, paymentMethodType, currency = "INR" } = params;

  const pendingPayment = await db.query.paymentsTable.findFirst({
    where: and(
      eq(paymentsTable.rideId, rideId),
      eq(paymentsTable.payerId, payerId),
      inArray(paymentsTable.status, ["pending", "authorized"]),
    ),
  });
  if (pendingPayment?.providerOrderId) {
    return {
      orderId: pendingPayment.providerOrderId,
      amount: Number(pendingPayment.totalAmount),
      currency: pendingPayment.currency,
      keyId: RAZORPAY_KEY_ID || (isProduction ? "" : "rzp_test_key_id"),
      paymentId: pendingPayment.id,
    };
  }

  let providerOrderId = `dev_order_${crypto.randomUUID()}`;

  // Use real gateway orders whenever online payments are enabled. Synthetic IDs are
  // reserved for non-production development flows and must never look like a live order.
  const isRazorpayConfigured = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  if (paymentMethodType !== "cash" && !isRazorpayConfigured && isProduction) {
    throw new Error("Online payments are unavailable because the Razorpay gateway is not configured.");
  }

  if (isRazorpayConfigured && paymentMethodType !== "cash") {
    try {
      const authHeader = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // amount in paise
          currency,
          receipt: `rcpt_${rideId.slice(0, 10)}`,
          notes: { rideId, payerId },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const orderData: any = await res.json();
        if (orderData.id) {
          providerOrderId = orderData.id;
        } else {
          throw new Error("Razorpay did not return an order ID.");
        }
      } else {
        throw new Error(`Razorpay order creation failed (${res.status}).`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
      // Local development may use the Expo Go payment simulator.
    }
  }

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      rideId,
      payerId,
      baseFare: String(amount),
      distanceCharge: "0.00",
      timeCharge: "0.00",
      totalAmount: String(amount),
      currency,
      status: paymentMethodType === "cash" ? "pending" : "authorized",
      providerOrderId,
    })
    .returning();

  return {
    orderId: providerOrderId,
    amount,
    currency,
    keyId: RAZORPAY_KEY_ID || (isProduction ? "" : "rzp_test_key_id"),
    paymentId: payment.id,
  };
}

/**
 * Verifies Razorpay signature server-side.
 */
export function verifySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { orderId, paymentId, signature } = params;
  if (!isProduction && orderId.startsWith("dev_order_") && paymentId.startsWith("pay_dev_") && signature.startsWith("sig_dev_")) return true;
  if (!RAZORPAY_KEY_SECRET) return false;
  if (!signature) return !isProduction && orderId.startsWith("dev_order_");

  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function verifyCapturedGatewayPayment(params: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return !isProduction && params.orderId.startsWith("dev_order_") && params.paymentId.startsWith("pay_dev_");
  }

  const authHeader = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(params.paymentId)}`, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return false;
  const payment = await response.json() as { order_id?: string; status?: string; amount?: number; currency?: string };
  return payment.order_id === params.orderId && payment.status === "captured" &&
    payment.amount === Math.round(params.amount * 100) && payment.currency === params.currency;
}

/**
 * Marks payment verified and completes the ride payment state.
 */
export async function markPaymentCompleted(params: {
  rideId: string;
  orderId: string;
  paymentId: string;
  signature?: string;
}) {
  const { rideId, orderId, paymentId, signature } = params;

  return await db.transaction(async (tx) => {
    const existing = await tx.query.paymentsTable.findFirst({
      where: eq(paymentsTable.providerOrderId, orderId),
    });

    if (!existing) throw new Error("Payment order was not found.");
    if (existing.rideId !== rideId) throw new Error("Payment order does not belong to this ride.");
    if (existing.status === "captured") {
      const ride = await tx.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideId) });
      return { success: true, payment: existing, ride };
    }
    if (existing.status === "refunded" || existing.status === "failed") throw new Error("Payment is no longer payable.");

    const currentRide = await tx.query.ridesTable.findFirst({ where: eq(ridesTable.id, rideId) });
    if (!currentRide || !["trip_completed", "payment_pending", "payment_failed"].includes(currentRide.status)) {
      throw new Error("Ride is not in a payable state.");
    }

    await tx.update(paymentsTable).set({
      status: "captured",
      providerPaymentId: paymentId,
      providerSignature: signature ?? null,
      updatedAt: new Date(),
    }).where(eq(paymentsTable.id, existing.id));

    const [ride] = await tx
      .update(ridesTable)
      .set({
        status: "payment_completed",
        updatedAt: new Date(),
      })
      .where(and(
        eq(ridesTable.id, rideId),
        inArray(ridesTable.status, ["trip_completed", "payment_pending", "payment_failed"]),
      ))
      .returning();

    if (!ride) throw new Error("Ride is no longer in a payable state.");
    await tx.insert(rideStatusHistoryTable).values({
      rideId,
      fromStatus: currentRide.status,
      toStatus: "payment_completed",
    });

    if (ride) {
      broadcastToRide(ride.id, "ride:status:change", toRideProfile(ride));
    }

    return { success: true, payment: existing, ride };
  });
}

/**
 * Processes refund for a payment.
 */
export async function processRefund(params: {
  paymentId: string;
  amount: number;
  reason: string;
  initiatedByUserId?: string;
}) {
  const { paymentId, amount, reason, initiatedByUserId } = params;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Refunds are unavailable because Razorpay is not configured.");
  const payment = await db.query.paymentsTable.findFirst({ where: eq(paymentsTable.id, paymentId) });
  if (!payment || !["captured", "partially_refunded"].includes(payment.status) || !payment.providerPaymentId) throw new Error("Only captured payments can be refunded.");
  const amountPaise = Math.round(amount * 100);
  const priorRefunds = await db.query.refundsTable.findMany({ where: eq(refundsTable.paymentId, paymentId) });
  const reservedRefundAmount = priorRefunds.filter((refund) => refund.status !== "failed").reduce((sum, refund) => sum + Number(refund.amount), 0);
  if (!Number.isFinite(amountPaise) || amountPaise < 1 || reservedRefundAmount + amount > Number(payment.totalAmount)) {
    throw new Error("Refund amount exceeds the remaining captured payment amount.");
  }

  const authHeader = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.providerPaymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, notes: { reason } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Razorpay refund failed (${response.status}).`);
  const providerRefund = await response.json() as { id?: string; status?: string };
  if (!providerRefund.id) throw new Error("Razorpay did not return a refund ID.");

  const [refund] = await db
    .insert(refundsTable)
    .values({
      paymentId,
      amount: String(amount),
      reason,
      status: providerRefund.status === "processed" ? "processed" : "pending",
      providerRefundId: providerRefund.id,
      initiatedBy: initiatedByUserId ?? null,
    })
    .returning();

  if (providerRefund.status === "processed") {
    const refunds = await db.query.refundsTable.findMany({ where: eq(refundsTable.paymentId, paymentId) });
    const refundedAmount = refunds.filter((item) => item.status === "processed").reduce((sum, item) => sum + Number(item.amount), 0) + Number(refund.amount);
    await db.update(paymentsTable).set({
      status: refundedAmount >= Number(payment.totalAmount) ? "refunded" : "partially_refunded",
      updatedAt: new Date(),
    }).where(eq(paymentsTable.id, paymentId));
  }

  return refund;
}
