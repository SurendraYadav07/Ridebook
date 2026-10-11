import { logger } from "./logger";
import { env, isDevOtpAllowed } from "./env";

export interface SmsProviderConfig {
  provider: "twilio" | "msg91" | "custom" | null;
  isConfigured: boolean;
}

export function getSmsProviderConfig(): SmsProviderConfig {
  const provider = (process.env.SMS_PROVIDER || env.smsProvider || "").toLowerCase();
  if (provider === "twilio") {
    const hasCreds = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID),
    );
    return { provider: "twilio", isConfigured: hasCreds };
  }
  if (provider === "msg91") {
    const hasCreds = Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
    return { provider: "msg91", isConfigured: hasCreds };
  }
  if (provider === "custom") {
    const hasCreds = Boolean(process.env.SMS_WEBHOOK_URL);
    return { provider: "custom", isConfigured: hasCreds };
  }
  return { provider: null, isConfigured: false };
}

/**
 * Sends real SMS OTP via configured SMS Provider (Twilio / MSG91 / Custom Webhook),
 * falling back gracefully to development logger if credentials are not configured.
 */
export async function sendOtpSms(phone: string, code: string): Promise<{ success: boolean; provider: string; messageId?: string }> {
  const { provider, isConfigured } = getSmsProviderConfig();

  // Normalize phone number (defaulting to +91 India if 10 digits without leading +)
  let normalizedPhone = phone.trim().replace(/[\s-]/g, "");
  if (!normalizedPhone.startsWith("+")) {
    if (normalizedPhone.length === 10) {
      normalizedPhone = `+91${normalizedPhone}`;
    } else {
      normalizedPhone = `+${normalizedPhone}`;
    }
  }

  const messageBody = `Your RideGo verification code is: ${code}. Valid for 5 minutes. Do not share this OTP with anyone.`;

  // 1. Twilio SMS Integration
  if (provider === "twilio") {
    if (!isConfigured) {
      throw new Error("SMS provider is configured but its required credentials are missing.");
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append("To", normalizedPhone);
    params.append("Body", messageBody);
    if (messagingServiceSid) {
      params.append("MessagingServiceSid", messagingServiceSid);
    } else if (fromNumber) {
      params.append("From", fromNumber);
    }

    try {
      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText, phone: normalizedPhone }, "Twilio SMS delivery failed.");
        throw new Error(`Twilio SMS failed with status ${res.status}: ${errText}`);
      }

      const data: any = await res.json();
      logger.info({ sid: data.sid, phone: normalizedPhone }, "Twilio SMS sent successfully.");
      return { success: true, provider: "twilio", messageId: data.sid };
    } catch (err: any) {
      logger.error({ error: err.message, phone: normalizedPhone }, "Failed to send SMS via Twilio.");
      throw err;
    }
  }

  // 2. MSG91 SMS Integration (Popular Indian SMS Gateway)
  if (provider === "msg91") {
    if (!isConfigured) {
      throw new Error("SMS provider is configured but its required credentials are missing.");
    }

    const authKey = process.env.MSG91_AUTH_KEY!;
    const templateId = process.env.MSG91_TEMPLATE_ID!;
    const senderId = process.env.MSG91_SENDER_ID || "RIDEGO";

    // Clean phone number without '+' for MSG91 format
    const cleanMobile = normalizedPhone.replace(/^\+/, "");
    const url = `https://api.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${cleanMobile}&authkey=${authKey}&otp=${code}&sender=${senderId}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error({ status: res.status, errText, phone: normalizedPhone }, "MSG91 SMS delivery failed.");
        throw new Error(`MSG91 SMS failed with status ${res.status}: ${errText}`);
      }

      const data: any = await res.json();
      logger.info({ type: data.type, phone: normalizedPhone }, "MSG91 SMS sent successfully.");
      return { success: true, provider: "msg91", messageId: data.message };
    } catch (err: any) {
      logger.error({ error: err.message, phone: normalizedPhone }, "Failed to send SMS via MSG91.");
      throw err;
    }
  }

  // 3. Custom Webhook SMS Integration
  if (provider === "custom") {
    if (!isConfigured) {
      throw new Error("SMS provider is configured but its required credentials are missing.");
    }

    const webhookUrl = process.env.SMS_WEBHOOK_URL!;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.SMS_WEBHOOK_SECRET
            ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ phone: normalizedPhone, code, message: messageBody }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new Error(`Custom SMS webhook failed with status ${res.status}`);
      }

      logger.info({ phone: normalizedPhone }, "Custom Webhook SMS dispatched successfully.");
      return { success: true, provider: "custom" };
    } catch (err: any) {
      logger.error({ error: err.message, phone: normalizedPhone }, "Failed to send SMS via custom webhook.");
      throw err;
    }
  }

  if (!isDevOtpAllowed) {
    throw new Error("SMS delivery is unavailable. Configure SMS_PROVIDER and its credentials.");
  }

  // Development-only fallback (the API returns the code only outside production).
  logger.warn(
    { phone: normalizedPhone, code },
    "SMS_PROVIDER is not configured — OTP code logged in dev console. Set SMS_PROVIDER (twilio / msg91) for production SMS delivery.",
  );

  return { success: true, provider: "dev_mock" };
}

export { isDevOtpAllowed };
