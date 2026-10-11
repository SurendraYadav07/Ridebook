import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canTransition, CANCELLABLE_STATUSES, ACTIVE_STATUSES } from "../src/lib/ride-state-machine.ts";

describe("Authoritative Ride State Machine", () => {
  test("allows valid passenger booking to dispatching lifecycle", () => {
    assert.equal(canTransition("requested", "searching_driver").allowed, true);
    assert.equal(canTransition("searching_driver", "driver_offer_sent").allowed, true);
    assert.equal(canTransition("driver_offer_sent", "driver_assigned").allowed, true);
    assert.equal(canTransition("driver_assigned", "driver_arriving").allowed, true);
    assert.equal(canTransition("driver_arriving", "driver_arrived").allowed, true);
    assert.equal(canTransition("driver_arrived", "trip_started", "driver").allowed, true);
    assert.equal(canTransition("trip_started", "trip_completed", "driver").allowed, true);
    assert.equal(canTransition("trip_completed", "payment_pending").allowed, true);
    assert.equal(canTransition("payment_pending", "payment_completed", "system").allowed, true);
  });

  test("rejects illegal transitions that violate physical invariants", () => {
    assert.equal(canTransition("requested", "trip_started").allowed, false);
    assert.equal(canTransition("driver_arriving", "trip_started").allowed, false);
    assert.equal(canTransition("trip_completed", "cancelled").allowed, false);
    assert.equal(canTransition("payment_completed", "cancelled").allowed, false);
  });

  test("enforces strict role-based transition security", () => {
    const passengerStart = canTransition("driver_arrived", "trip_started", "passenger");
    assert.equal(passengerStart.allowed, false);
    assert.match(passengerStart.reason ?? "", /not authorized/);

    const passengerComplete = canTransition("trip_started", "trip_completed", "passenger");
    assert.equal(passengerComplete.allowed, false);

    assert.equal(canTransition("driver_arrived", "trip_started", "driver").allowed, true);
    assert.equal(canTransition("trip_started", "trip_completed", "driver").allowed, true);

    const driverPay = canTransition("payment_pending", "payment_completed", "driver");
    assert.equal(driverPay.allowed, false);
    assert.equal(canTransition("payment_pending", "payment_completed", "system").allowed, true);
  });

  test("correctly identifies cancellable and active states", () => {
    assert.equal(CANCELLABLE_STATUSES.includes("requested"), true);
    assert.equal(CANCELLABLE_STATUSES.includes("driver_arriving"), true);
    assert.equal(CANCELLABLE_STATUSES.includes("trip_started"), false);
    assert.equal(CANCELLABLE_STATUSES.includes("trip_completed"), false);

    assert.equal(ACTIVE_STATUSES.includes("trip_started"), true);
    assert.equal(ACTIVE_STATUSES.includes("cancelled"), false);
  });
});
