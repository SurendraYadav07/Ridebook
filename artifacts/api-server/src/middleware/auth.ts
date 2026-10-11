import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../lib/crypto";
import { db, usersTable, driversTable, type User } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: User["role"];
      };
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <accessToken>` header and validates
 * that the user account and driver profile are not blocked.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res
      .status(401)
      .json({ error: "unauthenticated", message: "Missing access token." });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      error: "unauthenticated",
      message: "Access token is invalid or expired.",
    });
    return;
  }

  req.auth = { userId: payload.sub, role: payload.role };

  try {
    // Exempt support ticket creation from blocking so suspended users can submit appeals
    const isSupportAppeal = req.path === "/support/tickets" && req.method === "POST";

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, payload.sub),
    });

    if (!user) {
      res.status(401).json({ error: "unauthenticated", message: "User not found." });
      return;
    }

    if (user.isBlocked && !isSupportAppeal) {
      res.status(403).json({
        error: "ACCOUNT_BLOCKED",
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked by administration.",
        reason: user.blockedReason || "Account suspended due to policy violations.",
      });
      return;
    }

    if (user.role === "driver" && !isSupportAppeal) {
      const driver = await db.query.driversTable.findFirst({
        where: eq(driversTable.userId, user.id),
      });
      if (driver?.isBlocked) {
        res.status(403).json({
          error: "ACCOUNT_BLOCKED",
          code: "ACCOUNT_BLOCKED",
          message: "Your driver account has been blocked by administration.",
          reason: driver.blockedReason || "Driver account suspended due to policy violations.",
        });
        return;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces role-based access. A passenger must never reach a driver-only
 * route and a driver must never reach an admin-only route — this is the
 * single choke point that guarantees that, so individual route handlers
 * don't each have to remember to check it.
 */
export function requireRole(...roles: Array<User["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res
        .status(401)
        .json({ error: "unauthenticated", message: "Missing access token." });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({
        error: "forbidden",
        message: "You do not have permission to access this resource.",
      });
      return;
    }
    next();
  };
}
