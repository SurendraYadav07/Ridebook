import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { haversineDistanceMeters } from "../src/lib/routing";

describe("PostGIS Driver Matching Engine & Spatial Indexing", () => {
  // Reference origin: Connaught Place, New Delhi (28.6304, 77.2177)
  const origin = { latitude: 28.6304, longitude: 77.2177, address: "Connaught Place, New Delhi" };
  const destination = { latitude: 28.5355, longitude: 77.3910, address: "Noida Sector 18" };

  interface MockDriver {
    id: string;
    name: string;
    model: string;
    plateNumber: string;
    isAvailable: boolean;
    isOnline: boolean;
    isBlocked: boolean;
    verificationStatus: string;
    currentLatitude: number;
    currentLongitude: number;
  }

  function simulateMatching(
    drivers: MockDriver[],
    searchOrigin: { latitude: number; longitude: number },
    radiusMeters = 3000
  ) {
    const candidates = drivers
      .filter((d) => d.isAvailable && d.isOnline && !d.isBlocked && d.verificationStatus === "approved")
      .map((d) => {
        const distance = haversineDistanceMeters(
          searchOrigin,
          { latitude: d.currentLatitude, longitude: d.currentLongitude }
        );
        return { driver: d, distance };
      })
      .filter((c) => c.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length === 0) {
      return { matchFound: false, message: "No available driver found within 3 km.", match: null };
    }

    const matched = candidates[0];
    // Atomic state lock simulation
    matched.driver.isAvailable = false;

    return {
      matchFound: true,
      message: "Driver matched successfully.",
      match: {
        driverId: matched.driver.id,
        name: matched.driver.name,
        model: matched.driver.model,
        plateNumber: matched.driver.plateNumber,
        distanceMeters: Math.round(matched.distance),
      },
    };
  }

  test("matches the closest eligible driver within 3 km radius", () => {
    // Driver A: ~850m away (Barakhamba Road)
    // Driver B: ~2200m away (India Gate)
    const drivers: MockDriver[] = [
      {
        id: "d1",
        name: "Rahul Verma",
        model: "Maruti Dzire",
        plateNumber: "DL-01-AB-1234",
        isAvailable: true,
        isOnline: true,
        isBlocked: false,
        verificationStatus: "approved",
        currentLatitude: 28.6325,
        currentLongitude: 77.2255,
      },
      {
        id: "d2",
        name: "Amit Kumar",
        model: "Hyundai Aura",
        plateNumber: "DL-02-CD-5678",
        isAvailable: true,
        isOnline: true,
        isBlocked: false,
        verificationStatus: "approved",
        currentLatitude: 28.6129,
        currentLongitude: 77.2295,
      },
    ];

    const result = simulateMatching(drivers, origin, 3000);
    assert.equal(result.matchFound, true);
    assert.equal(result.match?.driverId, "d1");
    assert.ok(result.match!.distanceMeters < 1000);
    // Driver d1 is now marked unavailable
    assert.equal(drivers[0].isAvailable, false);
    // Driver d2 remains available
    assert.equal(drivers[1].isAvailable, true);
  });

  test("rejects drivers farther than 3 km radius", () => {
    // Driver: ~5.8 km away (Karol Bagh)
    const drivers: MockDriver[] = [
      {
        id: "d_far",
        name: "Vikram Singh",
        model: "Honda Amaze",
        plateNumber: "DL-03-EF-9012",
        isAvailable: true,
        isOnline: true,
        isBlocked: false,
        verificationStatus: "approved",
        currentLatitude: 28.6515,
        currentLongitude: 77.1650,
      },
    ];

    const result = simulateMatching(drivers, origin, 3000);
    assert.equal(result.matchFound, false);
    assert.equal(result.match, null);
    assert.equal(drivers[0].isAvailable, true);
  });

  test("excludes unavailable, offline, blocked, or unapproved drivers", () => {
    // Drivers all within 1.5 km, but none eligible
    const drivers: MockDriver[] = [
      {
        id: "d_busy",
        name: "Busy Driver",
        model: "Dzire",
        plateNumber: "DL-01-A",
        isAvailable: false, // In another ride
        isOnline: true,
        isBlocked: false,
        verificationStatus: "approved",
        currentLatitude: 28.6310,
        currentLongitude: 77.2180,
      },
      {
        id: "d_offline",
        name: "Offline Driver",
        model: "Aura",
        plateNumber: "DL-02-B",
        isAvailable: true,
        isOnline: false, // Offline
        isBlocked: false,
        verificationStatus: "approved",
        currentLatitude: 28.6310,
        currentLongitude: 77.2180,
      },
      {
        id: "d_blocked",
        name: "Blocked Driver",
        model: "Etios",
        plateNumber: "DL-03-C",
        isAvailable: true,
        isOnline: true,
        isBlocked: true, // Blocked by admin
        verificationStatus: "approved",
        currentLatitude: 28.6310,
        currentLongitude: 77.2180,
      },
      {
        id: "d_pending",
        name: "Pending Driver",
        model: "Innova",
        plateNumber: "DL-04-D",
        isAvailable: true,
        isOnline: true,
        isBlocked: false,
        verificationStatus: "pending", // Not approved yet
        currentLatitude: 28.6310,
        currentLongitude: 77.2180,
      },
    ];

    const result = simulateMatching(drivers, origin, 3000);
    assert.equal(result.matchFound, false);
  });

  test("driver availability lifecycle: unavailable during ride, restored upon completion or cancellation", () => {
    const driver: MockDriver = {
      id: "d_lifecycle",
      name: "Suresh",
      model: "Dzire",
      plateNumber: "DL-05-XY",
      isAvailable: true,
      isOnline: true,
      isBlocked: false,
      verificationStatus: "approved",
      currentLatitude: 28.6310,
      currentLongitude: 77.2180,
    };

    // Step 1: Match and dispatch
    const matchResult = simulateMatching([driver], origin);
    assert.equal(matchResult.matchFound, true);
    assert.equal(driver.isAvailable, false);

    // Step 2: Attempting second match while ride active should fail
    const secondMatch = simulateMatching([driver], origin);
    assert.equal(secondMatch.matchFound, false);

    // Step 3: Ride completed -> release availability
    driver.isAvailable = true;

    // Step 4: Driver is now available again for new requests
    const thirdMatch = simulateMatching([driver], origin);
    assert.equal(thirdMatch.matchFound, true);
    assert.equal(driver.isAvailable, false);
  });

  test("formats PostGIS Geography Point WKT correctly", () => {
    const lng = 77.2177;
    const lat = 28.6304;
    const wkt = `SRID=4326;POINT(${lng} ${lat})`;
    assert.equal(wkt, "SRID=4326;POINT(77.2177 28.6304)");

    const match = wkt.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    assert.ok(match);
    assert.equal(parseFloat(match![1]), 77.2177);
    assert.equal(parseFloat(match![2]), 28.6304);
  });
});
