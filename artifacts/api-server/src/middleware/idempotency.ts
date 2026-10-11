import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, idempotencyKeysTable } from "@workspace/db";

/**
 * Idempotency middleware for mutating endpoints.
 * If client passes `Idempotency-Key` header, duplicate requests within 24 hours
 * will safely return the cached response without re-executing business operations.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  if (!idempotencyKey || !req.auth?.userId) {
    return next();
  }

  const userId = req.auth.userId;
  const requestPath = req.path;
  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(req.body || {}))
    .digest("hex");

  try {
    const existing = await db.query.idempotencyKeysTable.findFirst({
      where: and(
        eq(idempotencyKeysTable.key, idempotencyKey),
        eq(idempotencyKeysTable.userId, userId),
      ),
    });

    if (existing) {
      if (existing.expiresAt <= new Date()) {
        await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.id, existing.id));
      } else if (existing.requestPath !== requestPath || existing.requestHash !== requestHash) {
        return res.status(409).json({
          error: "idempotency_key_reused",
          message: "This Idempotency-Key was already used for a different request.",
        });
      } else if (existing.responseStatusCode && existing.responseBody) {
        return res.status(existing.responseStatusCode).json(JSON.parse(existing.responseBody));
      } else {
        return res.status(409).json({
          error: "concurrent_request",
          message: "A request with this Idempotency-Key is currently in progress.",
        });
      }
    }

    // Insert lock record
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert(idempotencyKeysTable).values({
      key: idempotencyKey,
      userId,
      requestPath,
      requestHash,
      expiresAt,
    });

    // Intercept response to store status & body
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      res.once("finish", () => {
        db.update(idempotencyKeysTable)
          .set({ responseStatusCode: res.statusCode, responseBody: JSON.stringify(body) })
          .where(and(eq(idempotencyKeysTable.key, idempotencyKey), eq(idempotencyKeysTable.userId, userId)))
          .catch(() => {});
      });

      return originalJson(body);
    };

    next();
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "concurrent_request", message: "A request with this Idempotency-Key is currently in progress." });
    }
    return res.status(503).json({ error: "idempotency_unavailable", message: "Request safety storage is unavailable. Please retry." });
  }
}
