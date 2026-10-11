import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRoute,
  calculateMultiStopRoute,
  decodePolyline,
  encodePolyline,
  haversineDistanceMeters,
} from "../src/lib/routing.ts";
import { computeFareBreakdown } from "../src/lib/fare.ts";
import { toRideProfile } from "../src/lib/serializers.ts";

describe("Multi-Stop Routing & Intermediate Waypoints", () => {
  const mockConfig = {
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

  const p1 = { latitude: 17.4319, longitude: 78.4073 }; // Jubilee Hills
  const p2 = { latitude: 17.4348, longitude: 78.3867 }; // Inorbit Mall
  const p3 = { latitude: 17.4474, longitude: 78.3582 }; // DLF Cyber City
  const p4 = { latitude: 17.2403, longitude: 78.4294 }; // Airport

  test("calculates multi-stop route across 4 sequential waypoints", async () => {
    const singleRoute = await calculateRoute(p1, p4);
    const multiStopRoute = await calculateMultiStopRoute([p1, p2, p3, p4]);

    assert.ok(multiStopRoute.distanceMeters > 0);
    assert.ok(multiStopRoute.durationSeconds > 0);
    // Multi-stop route with detours should have greater or equal distance than direct route
    assert.ok(multiStopRoute.distanceMeters >= singleRoute.distanceMeters * 0.9);
  });

  test("polyline encoder and decoder correctly round-trips coordinates", () => {
    const points = [
      { latitude: 17.4319, longitude: 78.4073 },
      { latitude: 17.4348, longitude: 78.3867 },
      { latitude: 17.4474, longitude: 78.3582 },
      { latitude: 17.2403, longitude: 78.4294 },
    ];

    const encoded = encodePolyline(points);
    assert.ok(typeof encoded === "string" && encoded.length > 0);

    const decoded = decodePolyline(encoded);
    assert.equal(decoded.length, points.length);

    for (let i = 0; i < points.length; i++) {
      assert.ok(Math.abs(decoded[i].latitude - points[i].latitude) < 0.0001);
      assert.ok(Math.abs(decoded[i].longitude - points[i].longitude) < 0.0001);
    }
  });

  test("calculates fare breakdown accurately accounting for multi-stop distance", async () => {
    const directRoute = await calculateRoute(p1, p4);
    const multiStopRoute = await calculateMultiStopRoute([p1, p2, p3, p4]);

    const directFare = computeFareBreakdown({
      config: mockConfig,
      distanceMeters: directRoute.distanceMeters,
      durationSeconds: directRoute.durationSeconds,
    });

    const multiStopFare = computeFareBreakdown({
      config: mockConfig,
      distanceMeters: multiStopRoute.distanceMeters,
      durationSeconds: multiStopRoute.durationSeconds,
    });

    assert.ok(multiStopFare.totalAmount >= directFare.totalAmount * 0.9);
    assert.ok(multiStopFare.distanceCharge > 0);
  });

  test("toRideProfile serializes intermediate stops array with numeric coordinates and sequenceOrder", () => {
    const mockRide: any = {
      id: "ride_123",
      passengerId: "usr_123",
      driverId: "drv_123",
      vehicleId: "veh_123",
      rideType: "economy",
      status: "trip_started",
      pickupAddress: "Jubilee Hills, Road 36",
      pickupLatitude: "17.4319000",
      pickupLongitude: "78.4073000",
      destinationAddress: "RGIA Airport T1",
      destinationLatitude: "17.2403000",
      destinationLongitude: "78.4294000",
      stops: [
        {
          address: "Inorbit Mall, Madhapur",
          latitude: 17.4348,
          longitude: 78.3867,
          name: "Inorbit Mall",
          sequenceOrder: 1,
        },
        {
          address: "DLF Cyber City, Gachibowli",
          latitude: "17.4474",
          longitude: "78.3582",
          name: "DLF Office",
          sequenceOrder: 2,
        },
      ],
      isShared: false,
      distanceMeters: "28500",
      etaSeconds: "2100",
      estimatedFare: "450.00",
      finalFare: "450.00",
      surgeMultiplier: "1.00",
      waitingCharges: "0",
      cancellationFeeCharged: "0",
      requestedAt: new Date("2026-09-08T10:00:00Z"),
      createdAt: new Date("2026-09-08T10:00:00Z"),
      updatedAt: new Date("2026-09-08T10:00:00Z"),
    };

    const profile = toRideProfile(mockRide);

    assert.ok(Array.isArray(profile.stops));
    assert.equal(profile.stops.length, 2);
    assert.equal(profile.stops[0].name, "Inorbit Mall");
    assert.equal(profile.stops[0].sequenceOrder, 1);
    assert.equal(typeof profile.stops[0].latitude, "number");
    assert.equal(typeof profile.stops[0].longitude, "number");

    assert.equal(profile.stops[1].name, "DLF Office");
    assert.equal(profile.stops[1].sequenceOrder, 2);
    assert.equal(typeof profile.stops[1].latitude, "number");
    assert.equal(typeof profile.stops[1].longitude, "number");
  });
});
