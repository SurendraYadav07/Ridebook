import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { getSmsProviderConfig, sendOtpSms } from "../src/lib/sms";
import { verifySignature } from "../src/lib/payments";

describe("SMS, Notifications & Payments Engine", () => {
  describe("SMS & OTP Provider Integration", () => {
    test("detects unconfigured SMS provider and returns safe dev fallback", async () => {
      const originalEnv = process.env.SMS_PROVIDER;
      delete process.env.SMS_PROVIDER;

      const config = getSmsProviderConfig();
      assert.equal(config.provider, null);
      assert.equal(config.isConfigured, false);

      const result = await sendOtpSms("9876543210", "482910");
      assert.equal(result.success, true);
      assert.equal(result.provider, "dev_mock");

      if (originalEnv) process.env.SMS_PROVIDER = originalEnv;
    });

    test("normalizes Indian 10-digit phone numbers with +91 country code prefix", async () => {
      const normalize = (phone: string) => {
        let n = phone.trim().replace(/[\s-]/g, "");
        if (!n.startsWith("+")) {
          if (n.length === 10) n = `+91${n}`;
          else n = `+${n}`;
        }
        return n;
      };

      assert.equal(normalize("9876543210"), "+919876543210");
      assert.equal(normalize("+91 98765-43210"), "+919876543210");
      assert.equal(normalize("+14155552671"), "+14155552671");
    });

    test("detects twilio configuration status correctly", () => {
      process.env.SMS_PROVIDER = "twilio";
      process.env.TWILIO_ACCOUNT_SID = "AC_test_sid_12345";
      process.env.TWILIO_AUTH_TOKEN = "test_auth_token_secret";
      process.env.TWILIO_FROM_NUMBER = "+12025550199";

      const config = getSmsProviderConfig();
      assert.equal(config.provider, "twilio");
      assert.equal(config.isConfigured, true);

      delete process.env.TWILIO_ACCOUNT_SID;
      const unconfig = getSmsProviderConfig();
      assert.equal(unconfig.isConfigured, false);

      delete process.env.SMS_PROVIDER;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
    });
  });

  describe("Push Notifications Engine", () => {
    test("formats Expo Push notification payload correctly", () => {
      const expoTokens = ["ExponentPushToken[AbCdEf123456]", "ExpoPushToken[ZyXwVu789012]"];
      const title = "Driver Assigned! 🚗";
      const body = "Your ride is confirmed and driver is en route.";
      const data = { rideId: "ride_123", type: "driver_assigned" };

      const messages = expoTokens.map((token) => ({
        to: token,
        sound: "default",
        title,
        body,
        data,
        priority: "high",
        channelId: "ride-updates",
      }));

      assert.equal(messages.length, 2);
      assert.equal(messages[0].to, "ExponentPushToken[AbCdEf123456]");
      assert.equal(messages[0].title, title);
      assert.equal(messages[0].sound, "default");
      assert.deepEqual(messages[0].data, data);
    });
  });

  describe("Razorpay HMAC SHA256 Signature Verification", () => {
    test("verifies authentic cryptographic signature correctly", () => {
      const secret = "test_razorpay_secret_key_12345";
      const orderId = "order_O123456789";
      const paymentId = "pay_P987654321";

      const payload = `${orderId}|${paymentId}`;
      const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

      const verifyCustom = (params: { orderId: string; paymentId: string; signature: string; secret: string }) => {
        const body = `${params.orderId}|${params.paymentId}`;
        const expected = crypto.createHmac("sha256", params.secret).update(body).digest("hex");
        return expected === params.signature;
      };

      const isValid = verifyCustom({ orderId, paymentId, signature: validSignature, secret });
      assert.equal(isValid, true);

      const isForged = verifyCustom({ orderId, paymentId, signature: "forged_signature_hex", secret });
      assert.equal(isForged, false);
    });

    test("signature verification rejects mismatched order ID or payment ID tampering", () => {
      const secret = "test_razorpay_secret_key_12345";
      const orderId = "order_O123456789";
      const paymentId = "pay_P987654321";

      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      // Tampered orderId
      const checkTamperedOrder = crypto
        .createHmac("sha256", secret)
        .update(`order_tampered_000|${paymentId}`)
        .digest("hex");

      assert.notEqual(validSignature, checkTamperedOrder);
    });
  });
});
