import { eq, and } from "drizzle-orm";
import { db, notificationDevicesTable, notificationsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, any>;
}

export interface RegisterTokenParams {
  userId: string;
  pushToken: string;
  platform?: "ios" | "android" | "web";
}

/**
 * Registers or updates a device push token for a user.
 */
export async function registerPushDeviceToken(params: RegisterTokenParams) {
  const { userId, pushToken, platform = "android" } = params;
  if (!userId || !pushToken) return null;

  try {
    const existing = await db.query.notificationDevicesTable.findFirst({
      where: eq(notificationDevicesTable.pushToken, pushToken),
    });

    if (existing) {
      const [updated] = await db
        .update(notificationDevicesTable)
        .set({
          userId,
          platform,
          isActive: true,
        })
        .where(eq(notificationDevicesTable.id, existing.id))
        .returning();
      return updated;
    }

    const [device] = await db
      .insert(notificationDevicesTable)
      .values({
        userId,
        pushToken,
        platform,
        isActive: true,
      })
      .returning();

    return device;
  } catch (err: any) {
    logger.error({ error: err.message, userId }, "Failed to register push device token.");
    return null;
  }
}

/**
 * Sends a push notification to all active devices of a user and records it in database.
 */
export async function sendPushNotification(payload: PushNotificationPayload): Promise<{
  success: boolean;
  sentCount: number;
  notificationId?: string;
}> {
  const { userId, title, body, type, data = {} } = payload;

  try {
    // 1. Record notification in notificationsTable
    const [savedNotification] = await db
      .insert(notificationsTable)
      .values({
        userId,
        type,
        title,
        body,
        data: JSON.stringify(data),
      })
      .returning();

    // 2. Fetch active device push tokens
    const devices = await db.query.notificationDevicesTable.findMany({
      where: and(
        eq(notificationDevicesTable.userId, userId),
        eq(notificationDevicesTable.isActive, true),
      ),
    });

    if (devices.length === 0) {
      logger.info({ userId, type }, "No active push devices registered for user — recorded in database only.");
      return { success: true, sentCount: 0, notificationId: savedNotification.id };
    }

    // 3. Expo Push tokens are the supported mobile delivery provider.
    const expoTokens = devices.filter((d) => d.pushToken.startsWith("ExponentPushToken[") || d.pushToken.startsWith("ExpoPushToken["));
    let sentCount = 0;

    // Send in provider-sized batches and count accepted tickets rather than HTTP responses.
    for (let offset = 0; offset < expoTokens.length; offset += 100) {
      const batch = expoTokens.slice(offset, offset + 100);
      try {
        const messages = batch.map((d) => ({
          to: d.pushToken,
          sound: "default",
          title,
          body,
          data: { ...data, type },
          priority: "high",
          channelId: "ride-updates",
        }));

        const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(6000),
        });

        if (!expoRes.ok) {
          logger.warn({ status: expoRes.status, userId, type }, "Expo push request failed.");
          continue;
        }
        const payload = await expoRes.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
        const tickets = Array.isArray(payload.data) ? payload.data : [];
        for (let index = 0; index < batch.length; index++) {
          const ticket = tickets[index];
          if (ticket?.status === "ok") sentCount++;
          else if (ticket?.details?.error === "DeviceNotRegistered") {
            await db.update(notificationDevicesTable).set({ isActive: false }).where(eq(notificationDevicesTable.id, batch[index].id));
          }
        }
      } catch (expoErr: any) {
        logger.warn({ error: expoErr.message, userId }, "Failed to deliver Expo push message.");
      }
    }

    return {
      success: true,
      sentCount,
      notificationId: savedNotification.id,
    };
  } catch (err: any) {
    logger.error({ error: err.message, userId, type }, "Push notification delivery failed.");
    return { success: false, sentCount: 0 };
  }
}
