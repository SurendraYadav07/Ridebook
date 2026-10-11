import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db, usersTable, otpCodesTable, refreshTokensTable } from "@workspace/db";
import {
  AuthRegisterBody,
  AuthLoginBody,
  AuthOtpRequestBody,
  AuthOtpVerifyBody,
  AuthRefreshBody,
  AuthForgotPasswordBody,
} from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from "../lib/crypto";
import { sendOtpSms, isDevOtpAllowed } from "../lib/sms";
import { env } from "../lib/env";
import { authRateLimit, otpRequestRateLimit, otpVerifyRateLimit } from "../middleware/rate-limit";
import { authenticate } from "../middleware/auth";
import { toUserProfile } from "../lib/serializers";
import type { User } from "@workspace/db";

const router: IRouter = Router();

async function issueSession(user: User, req: { header(name: string): string | undefined }, ip: string | undefined) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = generateRefreshToken();

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    userAgent: req.header("user-agent") ?? null,
    ipAddress: ip ?? null,
    expiresAt: new Date(Date.now() + env.refreshTokenTtlSeconds * 1000),
  });

  return {
    user: toUserProfile(user),
    accessToken,
    accessTokenExpiresInSeconds: env.accessTokenTtlSeconds,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// POST /auth/register — email/password signup for passenger or driver.
// Driver accounts are created here but land in verificationStatus="pending"
// (see the drivers table) — they cannot receive ride requests until an
// admin approves their documents (PHASE 12/18), so this alone does not
// grant driver access to driver-only APIs beyond viewing their own status.
// ---------------------------------------------------------------------------
router.post("/auth/register", authRateLimit, async (req, res) => {
  const parsed = AuthRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { role, name, email, phone, password } = parsed.data;

  if (!email && !phone) {
    res.status(400).json({
      error: "invalid_request",
      message: "Either email or phone is required.",
    });
    return;
  }

  if (email) {
    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
    if (existing) {
      res.status(409).json({ error: "email_taken", message: "An account with this email already exists." });
      return;
    }
  }
  if (phone) {
    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone) });
    if (existing) {
      res.status(409).json({ error: "phone_taken", message: "An account with this phone number already exists." });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ role, name, email: email ?? null, phone: phone ?? null, passwordHash })
    .returning();

  if (!user) {
    res.status(500).json({ error: "internal_error", message: "Failed to create account." });
    return;
  }

  const session = await issueSession(user, req, req.ip);
  res.status(201).json(session);
});

// ---------------------------------------------------------------------------
// POST /auth/login — email/password.
// ---------------------------------------------------------------------------
router.post("/auth/login", authRateLimit, async (req, res) => {
  const parsed = AuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });

  // Deliberately identical error for "no such user" and "wrong password" —
  // distinguishing them lets an attacker enumerate valid accounts.
  const invalid = () =>
    res.status(401).json({ error: "invalid_credentials", message: "Incorrect email or password." });

  if (!user || !user.passwordHash) {
    invalid();
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    invalid();
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({
      error: "ACCOUNT_BLOCKED",
      code: "ACCOUNT_BLOCKED",
      message: "This account has been blocked.",
      reason: user.blockedReason || "Account suspended due to policy violations.",
    });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "account_suspended", message: "This account is not active." });
    return;
  }

  const session = await issueSession(user, req, req.ip);
  res.status(200).json(session);
});

// ---------------------------------------------------------------------------
// POST /auth/otp/request — sends (or, without an SMS provider, logs) a
// 6-digit code for a phone number. Rate-limited per IP by middleware and
// per-phone by the DB-backed cooldown check below.
// ---------------------------------------------------------------------------
router.post("/auth/otp/request", otpRequestRateLimit, async (req, res) => {
  const parsed = AuthOtpRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { phone, purpose } = parsed.data;

  const cooldownStart = new Date(Date.now() - env.otpRequestCooldownSeconds * 1000);
  const recent = await db.query.otpCodesTable.findFirst({
    where: and(
      eq(otpCodesTable.phone, phone),
      eq(otpCodesTable.purpose, purpose),
      gt(otpCodesTable.createdAt, cooldownStart),
    ),
  });
  if (recent) {
    res.status(429).json({
      error: "rate_limited",
      message: `Please wait before requesting another code.`,
    });
    return;
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);

  const [createdOtp] = await db.insert(otpCodesTable).values({
    phone,
    purpose,
    codeHash,
    maxAttempts: env.otpMaxAttempts,
    expiresAt: new Date(Date.now() + env.otpTtlSeconds * 1000),
  }).returning({ id: otpCodesTable.id });

  try {
    await sendOtpSms(phone, code);
  } catch (error) {
    await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, createdOtp.id));
    res.status(503).json({ error: "sms_unavailable", message: "Verification code delivery is unavailable. Try again later." });
    return;
  }

  res.status(200).json({
    expiresInSeconds: env.otpTtlSeconds,
    devOtpCode: isDevOtpAllowed ? code : null,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/otp/verify — verifies the code and either logs in an existing
// user or completes signup for a new one (purpose=signup).
// ---------------------------------------------------------------------------
router.post("/auth/otp/verify", otpVerifyRateLimit, async (req, res) => {
  const parsed = AuthOtpVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { phone, purpose, code, name, role, newPassword } = parsed.data;

  if (purpose === "password_reset" && !newPassword) {
    res.status(400).json({ error: "invalid_request", message: "`newPassword` is required to complete a password reset." });
    return;
  }

  const otp = await db.query.otpCodesTable.findFirst({
    where: and(
      eq(otpCodesTable.phone, phone),
      eq(otpCodesTable.purpose, purpose),
      isNull(otpCodesTable.consumedAt),
      gt(otpCodesTable.expiresAt, new Date()),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const invalid = () =>
    res.status(400).json({ error: "invalid_otp", message: "Code is invalid or expired." });

  if (!otp) {
    invalid();
    return;
  }
  if (otp.attempts >= otp.maxAttempts) {
    res.status(400).json({ error: "otp_locked", message: "Too many incorrect attempts. Request a new code." });
    return;
  }

  const ok = await verifyOtpCode(code, otp.codeHash);
  if (!ok) {
    await db
      .update(otpCodesTable)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(otpCodesTable.id, otp.id));
    invalid();
    return;
  }

  await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, otp.id));

  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone) });

  if (!user) {
    if (purpose !== "signup") {
      res.status(400).json({ error: "no_account", message: "No account found for this phone number." });
      return;
    }
    if (!name) {
      res.status(400).json({ error: "invalid_request", message: "`name` is required to complete signup." });
      return;
    }
    const [created] = await db
      .insert(usersTable)
      .values({
        role: role ?? "passenger",
        name,
        phone,
        phoneVerifiedAt: new Date(),
      })
      .returning();
    user = created;
  } else if (!user.phoneVerifiedAt) {
    await db.update(usersTable).set({ phoneVerifiedAt: new Date() }).where(eq(usersTable.id, user.id));
    user.phoneVerifiedAt = new Date();
  }

  if (!user) {
    res.status(500).json({ error: "internal_error", message: "Failed to resolve account." });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({
      error: "ACCOUNT_BLOCKED",
      code: "ACCOUNT_BLOCKED",
      message: "This account has been blocked.",
      reason: user.blockedReason || "Account suspended due to policy violations.",
    });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "account_suspended", message: "This account is not active." });
    return;
  }

  if (purpose === "password_reset" && newPassword) {
    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
    // Reset every other active session — a password reset should invalidate
    // any refresh token issued before the account owner regained control.
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokensTable.userId, user.id), isNull(refreshTokensTable.revokedAt)));
  }

  const session = await issueSession(user, req, req.ip);
  res.status(200).json(session);
});

// ---------------------------------------------------------------------------
// POST /auth/refresh — rotates the refresh token on every use (single-use
// tokens) so a stolen-but-unused refresh token becomes worthless the moment
// the legitimate client uses theirs, and reuse is detectable.
// ---------------------------------------------------------------------------
router.post("/auth/refresh", async (req, res) => {
  const parsed = AuthRefreshBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const tokenHash = hashRefreshToken(parsed.data.refreshToken);

  const stored = await db.query.refreshTokensTable.findFirst({
    where: and(eq(refreshTokensTable.tokenHash, tokenHash), isNull(refreshTokensTable.revokedAt)),
  });

  const invalid = () =>
    res.status(401).json({ error: "invalid_refresh_token", message: "Refresh token is invalid, expired, or revoked." });

  if (!stored || stored.expiresAt < new Date()) {
    invalid();
    return;
  }

  await db.update(refreshTokensTable).set({ revokedAt: new Date() }).where(eq(refreshTokensTable.id, stored.id));

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, stored.userId) });
  if (!user || user.status !== "active" || user.isBlocked) {
    if (user?.isBlocked) {
      res.status(403).json({
        error: "ACCOUNT_BLOCKED",
        code: "ACCOUNT_BLOCKED",
        message: "This account has been blocked.",
        reason: user.blockedReason || "Account suspended due to policy violations.",
      });
      return;
    }
    invalid();
    return;
  }

  const session = await issueSession(user, req, req.ip);
  res.status(200).json(session);
});

// ---------------------------------------------------------------------------
// POST /auth/logout — revokes the given refresh token so it can't be
// exchanged again. Access tokens remain valid until their short TTL
// naturally expires (by design — see accessTokenTtlSeconds).
// ---------------------------------------------------------------------------
router.post("/auth/logout", async (req, res) => {
  const parsed = AuthRefreshBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  await db.update(refreshTokensTable).set({ revokedAt: new Date() }).where(eq(refreshTokensTable.tokenHash, tokenHash));
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password — always returns 200 regardless of whether the
// email exists, to avoid leaking account existence. If it exists, an OTP
// is sent to the phone on file (email-based reset-link flow requires an
// email provider — see EMAIL_PROVIDER in .env.example).
// ---------------------------------------------------------------------------
router.post("/auth/forgot-password", otpRequestRateLimit, async (req, res) => {
  const parsed = AuthForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, parsed.data.email) });

  if (user?.phone) {
    const cooldownStart = new Date(Date.now() - env.otpRequestCooldownSeconds * 1000);
    const recent = await db.query.otpCodesTable.findFirst({
      where: and(
        eq(otpCodesTable.phone, user.phone),
        eq(otpCodesTable.purpose, "password_reset"),
        gt(otpCodesTable.createdAt, cooldownStart),
      ),
    });
    if (!recent) {
      const code = generateOtpCode();
      const codeHash = await hashOtpCode(code);
      const [otp] = await db.insert(otpCodesTable).values({
        phone: user.phone,
        purpose: "password_reset",
        codeHash,
        maxAttempts: env.otpMaxAttempts,
        expiresAt: new Date(Date.now() + env.otpTtlSeconds * 1000),
      }).returning({ id: otpCodesTable.id });
      try {
        await sendOtpSms(user.phone, code);
      } catch {
        await db.update(otpCodesTable).set({ consumedAt: new Date() }).where(eq(otpCodesTable.id, otp.id));
      }
      res.status(200).json({
        expiresInSeconds: env.otpTtlSeconds,
        devOtpCode: isDevOtpAllowed ? code : null,
      });
      return;
    }
  }

  res.status(200).json({
    expiresInSeconds: env.otpTtlSeconds,
    devOtpCode: null,
  });
});

export default router;
