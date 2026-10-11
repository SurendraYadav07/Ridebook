import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifySignature } from "../src/lib/payments.ts";

describe("Payments & Security Engine", () => {
  const secret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret";

  test("verifies valid HMAC SHA256 payment signature", () => {
    const orderId = "order_12345";
    const paymentId = "pay_67890";
    const body = `${orderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    const verified = verifySignature({
      orderId,
      paymentId,
      signature: validSignature,
    });
    assert.equal(verified, true);
  });

  test("rejects forged or tampered payment signature", () => {
    const orderId = "order_12345";
    const paymentId = "pay_67890";
    const forgedSignature = "forged_invalid_signature_hex_string_12345";

    const verified = verifySignature({
      orderId,
      paymentId,
      signature: forgedSignature,
    });
    assert.equal(verified, false);
  });
});
