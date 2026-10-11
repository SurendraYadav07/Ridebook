import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeFareBreakdown, getActiveFareConfiguration, validatePromoCode } from "../src/lib/fare.ts";
import { toRideProfile } from "../src/lib/serializers.ts";

describe("Share & Save (Carpooling) Matching & Fare Engine", () => {
  const mockSharedConfig = {
    id: "cfg_shared",
    rideType: "shared" as const,
    baseFare: "35.00",
    perKm: "8.50",
    perMinute: "1.50",
    minimumFare: "55.00",
    bookingFee: "10.00",
    serviceFeePercent: "4.00",
    taxPercent: "5.00",
    cancellationFee: "30.00",
    isActive: true,
  };

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

  test("computes ~35% discounted fare for Share & Save compared to solo Economy", () => {
    const distanceMeters = 8000; // 8 km
    const durationSeconds = 900; // 15 mins

    const sharedFare = computeFareBreakdown({
      config: mockSharedConfig,
      distanceMeters,
      durationSeconds,
    });

    const economyFare = computeFareBreakdown({
      config: mockEconomyConfig,
      distanceMeters,
      durationSeconds,
    });

    assert.ok(sharedFare.totalAmount < economyFare.totalAmount, "Shared fare must be lower than Economy");
    const savingsPercent = ((economyFare.totalAmount - sharedFare.totalAmount) / economyFare.totalAmount) * 100;
    assert.ok(savingsPercent >= 25 && savingsPercent <= 45, `Savings percent should be ~30-35%, got ${savingsPercent.toFixed(1)}%`);
  });

  test("retrieves active fallback fare configuration for 'shared' ride type", async () => {
    const config = await getActiveFareConfiguration("shared");
    assert.equal(config.rideType, "shared");
    assert.equal(config.baseFare, "35.00");
    assert.equal(config.perKm, "8.50");
    assert.equal(config.minimumFare, "55.00");
  });

  test("validates promo codes successfully against shared ride fare", async () => {
    const promoRes = await validatePromoCode({
      code: "RIDEGO20",
      userId: "u_test_passenger",
      rideType: "shared",
      fareBeforeDiscount: 150,
    });

    assert.equal(promoRes.valid, true);
    assert.equal(promoRes.discountAmount, 30); // 20% of 150
  });

  test("serializes shared ride profile with co-rider and multi-stop details", () => {
    const mockRide: any = {
      id: "ride_shared_123",
      passengerId: "u_passenger_1",
      driverId: "d_driver_1",
      vehicleId: null,
      rideType: "shared",
      status: "picking_up",
      isShared: true,
      coRiderCount: 1,
      coRiderName: "Pooja V.",
      coRiderPickupAddress: "Tech Park Main Gate",
      coRiderDropoffAddress: "Metro Station Exit 3",
      pickupAddress: "Cheri Manatu Campus",
      pickupLatitude: "23.4682",
      pickupLongitude: "85.3402",
      destinationAddress: "Ranchi Railway Station",
      destinationLatitude: "23.3512",
      destinationLongitude: "85.3340",
      distanceMeters: "8500",
      etaSeconds: "1050",
      estimatedFare: "98.50",
      finalFare: "98.50",
      surgeMultiplier: "1.00",
      scheduledFor: null,
      startTripOtp: "5421",
      waitingCharges: "0",
      cancellationFeeCharged: "0",
      cancellationReason: null,
      requestedAt: new Date("2026-09-08T10:00:00Z"),
      driverAssignedAt: new Date("2026-09-08T10:01:00Z"),
      driverArrivedAt: null,
      tripStartedAt: null,
      tripCompletedAt: null,
      cancelledAt: null,
      createdAt: new Date("2026-09-08T10:00:00Z"),
      updatedAt: new Date("2026-09-08T10:01:00Z"),
    };

    const profile = toRideProfile(mockRide);
    assert.equal(profile.id, "ride_shared_123");
    assert.equal(profile.rideType, "shared");
    assert.equal(profile.isShared, true);
    assert.equal(profile.coRiderCount, 1);
    assert.equal(profile.coRiderName, "Pooja V.");
    assert.equal(profile.coRiderPickupAddress, "Tech Park Main Gate");
    assert.equal(profile.coRiderDropoffAddress, "Metro Station Exit 3");
    assert.equal(profile.estimatedFare, 98.5);
  });
});
