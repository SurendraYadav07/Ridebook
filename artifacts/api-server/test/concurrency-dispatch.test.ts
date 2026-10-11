import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Concurrency Dispatch & Atomic Acceptance", () => {
  test("simulates atomic driver assignment lock preventing race condition", async () => {
    let assignedDriverId: string | null = null;
    let rideStatus = "driver_offer_sent";
    let conflictsEncountered = 0;

    // Simulate atomic DB CAS (Compare-And-Swap) transaction:
    // UPDATE rides SET status = 'driver_assigned', driver_id = $1 WHERE id = $2 AND status = 'driver_offer_sent'
    async function tryAcceptOffer(driverId: string): Promise<boolean> {
      if (rideStatus === "driver_offer_sent") {
        // Atomic update success
        rideStatus = "driver_assigned";
        assignedDriverId = driverId;
        return true;
      } else {
        // 409 Conflict: another driver already claimed the ride
        conflictsEncountered++;
        return false;
      }
    }

    // Driver A and Driver B both click "Accept Offer" concurrently
    const [resultA, resultB] = await Promise.all([
      tryAcceptOffer("driver_alice_123"),
      tryAcceptOffer("driver_bob_456"),
    ]);

    // Exactly one driver must succeed, and exactly one driver must fail
    const successes = [resultA, resultB].filter(Boolean).length;
    assert.equal(successes, 1);
    assert.equal(conflictsEncountered, 1);
    assert.equal(rideStatus, "driver_assigned");
    assert.ok(assignedDriverId === "driver_alice_123" || assignedDriverId === "driver_bob_456");
  });

  test("deduplicates requests with Idempotency Key cache", async () => {
    const idempotencyStore = new Map<string, any>();

    function handleMutatingRequest(idempotencyKey: string, payload: any) {
      if (idempotencyStore.has(idempotencyKey)) {
        return { isReplay: true, response: idempotencyStore.get(idempotencyKey) };
      }
      const response = { id: "ride_" + Math.random().toString(36).substring(7), fare: payload.fare };
      idempotencyStore.set(idempotencyKey, response);
      return { isReplay: false, response };
    }

    const key = "req_uuid_ idempotency_12345";
    const req1 = handleMutatingRequest(key, { fare: 25.5 });
    const req2 = handleMutatingRequest(key, { fare: 25.5 }); // duplicate network retry

    assert.equal(req1.isReplay, false);
    assert.equal(req2.isReplay, true);
    assert.equal(req1.response.id, req2.response.id);
  });
});
