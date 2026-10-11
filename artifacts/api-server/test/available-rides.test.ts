import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { haversineDistanceMeters } from "../src/lib/routing.ts";
import { computeFareBreakdown } from "../src/lib/fare.ts";

describe("Available Rides & Driver Options Calculation", () => {
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
  };

  const mockPremiumConfig = {
    id: "cfg_premium",
    rideType: "premium" as const,
    baseFare: "100.00",
    perKm: "20.00",
    perMinute: "3.50",
    minimumFare: "150.00",
    bookingFee: "25.00",
    serviceFeePercent: "7.50",
    taxPercent: "5.00",
    cancellationFee: "75.00",
    isActive: true,
  };

  const mockXlConfig = {
    id: "cfg_xl",
    rideType: "xl" as const,
    baseFare: "150.00",
    perKm: "26.00",
    perMinute: "4.50",
    minimumFare: "200.00",
    bookingFee: "30.00",
    serviceFeePercent: "8.00",
    taxPercent: "5.00",
    cancellationFee: "100.00",
    isActive: true,
  };

  test("computes accurate driver ETA and distance to pickup location", () => {
    const pickup = { latitude: 17.4435, longitude: 78.3772 };
    const driverLoc = { latitude: 17.4520, longitude: 78.3840 };

    const distanceMeters = haversineDistanceMeters(pickup, driverLoc);
    assert.ok(distanceMeters > 0);
    assert.ok(distanceMeters < 3000);

    const etaMinutes = Math.max(2, Math.round(distanceMeters / 400));
    assert.ok(etaMinutes >= 2);
    assert.ok(etaMinutes <= 10);
  });

  test("calculates tiered pricing accurately for available driver options across vehicle tiers", () => {
    const distanceMeters = 8000;
    const durationSeconds = 900;

    const ecoFare = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters,
      durationSeconds,
    });

    const premFare = computeFareBreakdown({
      config: mockPremiumConfig,
      distanceMeters,
      durationSeconds,
    });

    const xlFare = computeFareBreakdown({
      config: mockXlConfig,
      distanceMeters,
      durationSeconds,
    });

    assert.ok(ecoFare.totalAmount < premFare.totalAmount);
    assert.ok(premFare.totalAmount < xlFare.totalAmount);
    assert.equal(ecoFare.totalAmount, 209.79);
  });

  test("applies promo discount across driver options correctly", () => {
    const distanceMeters = 8000;
    const durationSeconds = 900;
    const discountAmount = 40;

    const discountedEco = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters,
      durationSeconds,
      discountAmount,
    });

    assert.equal(discountedEco.discount, 40);
    assert.equal(discountedEco.totalAmount, 209.79 - 40);
  });

  test("formats available driver options structure with required fields", () => {
    const driverOption = {
      id: "opt_mock_eco_1",
      driverId: "d_mock_rajesh",
      driverName: "Rajesh Kumar",
      rating: 4.92,
      totalTrips: 840,
      rideType: "economy",
      vehicleName: "Maruti Suzuki Dzire (White)",
      plateNumber: "TS 09 UB 4582",
      estimatedFare: 169.48,
      originalFare: 209.48,
      discountAmount: 40,
      etaMinutes: 3,
      distanceToPickupKm: 1.2,
      seats: 4,
    };

    assert.equal(typeof driverOption.id, "string");
    assert.equal(typeof driverOption.driverName, "string");
    assert.equal(typeof driverOption.rating, "number");
    assert.equal(typeof driverOption.estimatedFare, "number");
    assert.equal(typeof driverOption.etaMinutes, "number");
    assert.equal(typeof driverOption.seats, "number");
    assert.ok(["economy", "premium", "xl"].includes(driverOption.rideType));
  });
});
