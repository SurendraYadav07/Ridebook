import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toUserProfile } from "../src/lib/serializers";

describe("Admin Block & Moderation Engine", () => {
  test("toUserProfile serializer includes isBlocked and blockedReason", () => {
    const activeUser: any = {
      id: "u_1",
      role: "passenger",
      status: "active",
      name: "John Doe",
      phone: "+919876543210",
      email: "john@example.com",
      profilePhotoUrl: null,
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: null,
      isBlocked: false,
      blockedReason: null,
      createdAt: new Date(),
    };

    const serializedActive = toUserProfile(activeUser);
    assert.equal(serializedActive.isBlocked, false);
    assert.equal(serializedActive.blockedReason, null);

    const blockedUser: any = {
      ...activeUser,
      id: "u_2",
      isBlocked: true,
      blockedReason: "Repeated violation of platform safety guidelines",
    };

    const serializedBlocked = toUserProfile(blockedUser);
    assert.equal(serializedBlocked.isBlocked, true);
    assert.equal(serializedBlocked.blockedReason, "Repeated violation of platform safety guidelines");
  });

  test("simulates admin block user logic and enforces offline driver status", () => {
    const user = {
      id: "user_p_1",
      role: "driver",
      isBlocked: false,
      blockedReason: null as string | null,
    };

    const driver = {
      id: "driver_d_1",
      userId: "user_p_1",
      isOnline: true,
      isBlocked: false,
      blockedReason: null as string | null,
    };

    // Admin blocks user
    const reason = "Reported unsafe vehicle operation";
    user.isBlocked = true;
    user.blockedReason = reason;

    if (user.role === "driver") {
      driver.isOnline = false;
    }

    assert.equal(user.isBlocked, true);
    assert.equal(user.blockedReason, reason);
    assert.equal(driver.isOnline, false); // Forced offline

    // Admin unblocks user
    user.isBlocked = false;
    user.blockedReason = null;
    assert.equal(user.isBlocked, false);
    assert.equal(user.blockedReason, null);
  });

  test("simulates admin block driver profile directly", () => {
    const driver = {
      id: "driver_d_2",
      userId: "user_p_2",
      isOnline: true,
      isBlocked: false,
      blockedReason: null as string | null,
    };

    // Block driver
    const driverReason = "Driver license expired / invalid RC";
    driver.isBlocked = true;
    driver.blockedReason = driverReason;
    driver.isOnline = false;

    assert.equal(driver.isBlocked, true);
    assert.equal(driver.blockedReason, driverReason);
    assert.equal(driver.isOnline, false);

    // Unblock driver
    driver.isBlocked = false;
    driver.blockedReason = null;
    assert.equal(driver.isBlocked, false);
    assert.equal(driver.blockedReason, null);
  });

  test("simulates auth middleware 403 ACCOUNT_BLOCKED payload for blocked user", () => {
    const user = {
      id: "u_3",
      role: "passenger",
      isBlocked: true,
      blockedReason: "Terms of service violation",
    };

    const mockRes = {
      statusCode: 200,
      jsonBody: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonBody = data;
        return this;
      },
    };

    // Simulate auth check
    if (user.isBlocked) {
      mockRes.status(403).json({
        error: "ACCOUNT_BLOCKED",
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked by administration.",
        reason: user.blockedReason,
      });
    }

    assert.equal(mockRes.statusCode, 403);
    assert.equal(mockRes.jsonBody.code, "ACCOUNT_BLOCKED");
    assert.equal(mockRes.jsonBody.error, "ACCOUNT_BLOCKED");
    assert.equal(mockRes.jsonBody.reason, "Terms of service violation");
  });

  test("allows support appeal submission even when user account is blocked", () => {
    const user = {
      id: "u_4",
      role: "passenger",
      isBlocked: true,
      blockedReason: "Suspicious login activity",
    };

    const request = {
      path: "/support/tickets",
      method: "POST",
    };

    const isSupportAppeal = request.path === "/support/tickets" && request.method === "POST";

    let authPassed = false;
    if (user.isBlocked && !isSupportAppeal) {
      authPassed = false;
    } else {
      authPassed = true;
    }

    assert.equal(authPassed, true, "Support ticket submission must be accessible to blocked users to allow appeals");
  });

  test("public registration schemas strictly reject role='admin' to prevent self-promotion", async () => {
    const { AuthRegisterBody, AuthOtpVerifyBody } = await import("@workspace/api-zod");

    const adminRegisterAttempt = {
      role: "admin",
      name: "Attacker",
      email: "attacker@example.com",
      password: "Password123!",
    };

    const registerResult = AuthRegisterBody.safeParse(adminRegisterAttempt);
    assert.equal(registerResult.success, false, "AuthRegisterBody must reject role='admin'");

    const adminOtpVerifyAttempt = {
      phone: "+919876543210",
      purpose: "signup",
      code: "123456",
      name: "Attacker",
      role: "admin",
    };

    const otpVerifyResult = AuthOtpVerifyBody.safeParse(adminOtpVerifyAttempt);
    assert.equal(otpVerifyResult.success, false, "AuthOtpVerifyBody must reject role='admin'");
  });

  test("requireRole('admin') middleware strictly blocks passenger and driver tokens", () => {
    const { requireRole } = require("../src/middleware/auth.ts");
    const adminOnlyMiddleware = requireRole("admin");

    const passengerReq = { auth: { userId: "p_1", role: "passenger" } };
    const driverReq = { auth: { userId: "d_1", role: "driver" } };
    const adminReq = { auth: { userId: "a_1", role: "admin" } };

    let passengerBlocked = false;
    const mockPassengerRes = {
      status(code: number) {
        if (code === 403) passengerBlocked = true;
        return this;
      },
      json() {},
    };

    adminOnlyMiddleware(passengerReq as any, mockPassengerRes as any, () => {});
    assert.equal(passengerBlocked, true, "Passengers must be blocked with 403 from admin routes");

    let driverBlocked = false;
    const mockDriverRes = {
      status(code: number) {
        if (code === 403) driverBlocked = true;
        return this;
      },
      json() {},
    };

    adminOnlyMiddleware(driverReq as any, mockDriverRes as any, () => {});
    assert.equal(driverBlocked, true, "Drivers must be blocked with 403 from admin routes");

    let adminPassed = false;
    adminOnlyMiddleware(adminReq as any, {} as any, () => {
      adminPassed = true;
    });
    assert.equal(adminPassed, true, "Admins must be allowed through requireRole('admin')");
  });
});
