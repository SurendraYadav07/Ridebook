import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeFareBreakdown,
  calculateWaitingCharges,
  calculateCancellationFee,
} from "../src/lib/fare.ts";

describe("Fare Engine & Financial Calculations", () => {
  const mockEconomyConfig = {
    id: "cfg_economy",
    rideType: "economy" as const,
    baseFare: "50.00",
    perKm: "12.00",
    perMinute: "2.00",
    minimumFare: "80.00",
    bookingFee: "15.00",
    serviceFeePercent: "5.00",
    taxPercent: "5.00",
    cancellationFee: "40.00",
    isActive: true,
    effectiveFrom: new Date(),
    createdAt: new Date(),
  };

  test("computes exact breakdown for standard 10 km, 15 min ride", () => {
    const result = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters: 10_000,
      durationSeconds: 900,
    });

    assert.equal(result.baseFare, 50);
    assert.equal(result.distanceCharge, 120);
    assert.equal(result.timeCharge, 30);
    assert.equal(result.bookingFee, 15);
    assert.equal(result.serviceFee, 10);
    assert.equal(result.taxes, 11.25);
    assert.equal(result.totalAmount, 236.25);
  });

  test("floors fare to minimumFare if distance is very short", () => {
    const result = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters: 500,
      durationSeconds: 120,
    });

    assert.equal(result.totalAmount, 103.95);
  });

  test("applies promo discount accurately without exceeding fare", () => {
    const result = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters: 10_000,
      durationSeconds: 900,
      discountAmount: 50,
    });

    assert.equal(result.discount, 50);
    assert.equal(result.totalAmount, 236.25 - 50);
  });

  test("calculates waiting charges with free grace window", () => {
    const arrivedAt = new Date("2026-09-02T10:00:00Z");
    const startedAtGrace = new Date("2026-09-02T10:02:30Z");
    const startedAtPaid = new Date("2026-09-02T10:08:00Z");

    const waitGrace = calculateWaitingCharges({
      arrivedAt,
      startedAt: startedAtGrace,
      freeWaitingMinutes: 3,
      perMinuteRate: 2.5,
    });
    assert.equal(waitGrace.paidMinutes, 0);
    assert.equal(waitGrace.waitingCharges, 0);

    const waitPaid = calculateWaitingCharges({
      arrivedAt,
      startedAt: startedAtPaid,
      freeWaitingMinutes: 3,
      perMinuteRate: 2.5,
    });
    assert.equal(waitPaid.paidMinutes, 5);
    assert.equal(waitPaid.waitingCharges, 12.5);
  });

  test("cancellation fee rules protect passengers within initial window", async () => {
    const scheduledRide: any = {
      status: "scheduled",
      rideType: "economy",
      driverAssignedAt: null,
    };
    const scheduledFee = await calculateCancellationFee({
      ride: scheduledRide,
      cancelledByRole: "passenger",
    });
    assert.equal(scheduledFee, 0);

    const unassignedRide: any = {
      status: "requested",
      rideType: "economy",
      driverAssignedAt: null,
    };
    const fee1 = await calculateCancellationFee({
      ride: unassignedRide,
      cancelledByRole: "passenger",
    });
    assert.equal(fee1, 0);

    const quickCancelRide: any = {
      status: "driver_arriving",
      rideType: "economy",
      driverAssignedAt: new Date(Date.now() - 30_000),
    };
    const fee2 = await calculateCancellationFee({
      ride: quickCancelRide,
      cancelledByRole: "passenger",
    });
    assert.equal(fee2, 0);

    const lateCancelRide: any = {
      status: "driver_arrived",
      rideType: "economy",
      driverAssignedAt: new Date(Date.now() - 300_000),
    };
    const fee3 = await calculateCancellationFee({
      ride: lateCancelRide,
      cancelledByRole: "passenger",
    });
    assert.equal(fee3, 40);
  });

  test("validates percentage promo codes accurately with maximum discount cap", async () => {
    const { validatePromoCode } = await import("../src/lib/fare.ts");
    const result = await validatePromoCode({
      code: "RIDEGO20",
      userId: "user_test_1",
      rideType: "economy",
      fareBeforeDiscount: 200,
    });
    assert.equal(result.valid, true);
    assert.equal(result.discountAmount, 40); // 20% of 200 = 40

    // Test cap at ₹100
    const highFareResult = await validatePromoCode({
      code: "RIDEGO20",
      userId: "user_test_1",
      rideType: "economy",
      fareBeforeDiscount: 1000,
    });
    assert.equal(highFareResult.valid, true);
    assert.equal(highFareResult.discountAmount, 100);
  });

  test("validates fixed promo codes correctly", async () => {
    const { validatePromoCode } = await import("../src/lib/fare.ts");
    const result = await validatePromoCode({
      code: "WELCOME50",
      userId: "user_test_new",
      rideType: "economy",
      fareBeforeDiscount: 150,
    });
    assert.equal(result.valid, true);
    assert.equal(result.discountAmount, 50);
  });

  test("rejects invalid promo codes with clear explanation", async () => {
    const { validatePromoCode } = await import("../src/lib/fare.ts");
    const result = await validatePromoCode({
      code: "INVALID_CODE_999",
      userId: "user_test_1",
      rideType: "economy",
      fareBeforeDiscount: 200,
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason);
  });

  test("rejects promo codes when minimum ride value is not met", async () => {
    const { validatePromoCode } = await import("../src/lib/fare.ts");
    const result = await validatePromoCode({
      code: "WELCOME50",
      userId: "user_test_1",
      rideType: "economy",
      fareBeforeDiscount: 30, // below min ₹80
    });
    assert.equal(result.valid, false);
    assert.match(result.reason!, /Minimum ride value/);
  });
});
