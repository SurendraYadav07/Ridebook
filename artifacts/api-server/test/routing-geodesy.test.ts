import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  calculateRoute,
  searchPlacesAutocomplete,
  geocodeAddress,
  reverseGeocode,
} from "../src/lib/routing.ts";

describe("Routing & Geodesy Engine", () => {
  // Indian State Landmarks (Telangana, Karnataka, Maharashtra)
  const hydHitecCity = { latitude: 17.4504, longitude: 78.3808 }; // Hyderabad, Telangana
  const hydAirport = { latitude: 17.2403, longitude: 78.4294 }; // Rajiv Gandhi International Airport, Telangana

  test("computes accurate great-circle spherical distance across Indian cities", () => {
    const distMeters = haversineDistanceMeters(hydHitecCity, hydAirport);
    assert.ok(distMeters > 20_000 && distMeters < 28_000);
  });

  test("calculates realistic urban road distance and travel time in India", async () => {
    const route = await calculateRoute(hydHitecCity, hydAirport);
    assert.ok(route.distanceMeters > 22_000);
    assert.ok(route.durationSeconds >= 1200 && route.durationSeconds <= 4000);
  });

  test("autocompletes known Indian landmarks and airport hubs", async () => {
    const results = await searchPlacesAutocomplete("airport");
    assert.ok(results.length > 0);
    assert.match(results[0].mainText.toLowerCase(), /airport/);
  });

  test("geocodes and reverse geocodes Indian coordinates reliably", async () => {
    const geo = await geocodeAddress("Charminar");
    assert.ok(Math.abs(geo.latitude - 17.3616) < 0.01);

    const reverse = await reverseGeocode({ latitude: 17.2403, longitude: 78.4294 });
    assert.match(reverse.address, /Airport|Shamshabad|Hyderabad/);
  });

  test("gracefully handles unset and invalid API key without throwing", async () => {
    const originalKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

    // Test with unset key
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    const fallbackAutocomplete = await searchPlacesAutocomplete("Cyber Towers");
    assert.ok(Array.isArray(fallbackAutocomplete));

    const fallbackGeocode = await geocodeAddress("Charminar");
    assert.ok(fallbackGeocode.latitude !== 0);

    const fallbackRoute = await calculateRoute(
      { latitude: 17.4435, longitude: 78.3772 },
      { latitude: 17.2403, longitude: 78.4294 }
    );
    assert.ok(fallbackRoute.distanceMeters > 500);

    // Test with deliberately invalid key
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "AIzaSy_INVALID_KEY_TESTING_1234567890";
    const invalidAutocomplete = await searchPlacesAutocomplete("Secunderabad");
    assert.ok(Array.isArray(invalidAutocomplete));

    const invalidGeocode = await geocodeAddress("Inorbit Mall");
    assert.ok(invalidGeocode.latitude !== 0);

    // Restore original
    if (originalKey !== undefined) {
      process.env.GOOGLE_MAPS_SERVER_API_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    }
  });

  test("serves repeated requests from in-memory cache", async () => {
    const first = await calculateRoute(
      { latitude: 17.4435, longitude: 78.3772 },
      { latitude: 17.4319, longitude: 78.4073 }
    );
    const second = await calculateRoute(
      { latitude: 17.4435, longitude: 78.3772 },
      { latitude: 17.4319, longitude: 78.4073 }
    );
    assert.deepEqual(first, second);
  });
});
