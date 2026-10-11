import { test, describe } from "node:test";
import assert from "node:assert/strict";

interface DriverOption {
  id: string;
  driverName: string;
  estimatedFare: number;
  etaMinutes: number;
}

function computeRideOptionBadges(options: DriverOption[]): {
  cheapestId: string | null;
  fastestId: string | null;
} {
  if (!options || options.length < 2) {
    return { cheapestId: null, fastestId: null };
  }

  const minFare = Math.min(...options.map((d) => d.estimatedFare));
  const cheapest = options.find((d) => d.estimatedFare === minFare);

  const minEta = Math.min(...options.map((d) => d.etaMinutes));
  const fastest = options.find((d) => d.etaMinutes === minEta);

  return {
    cheapestId: cheapest?.id ?? null,
    fastestId: fastest?.id ?? null,
  };
}

describe("Ride Option Highlight Badges (Cheapest & Fastest)", () => {
  const options: DriverOption[] = [
    { id: 'opt_1', driverName: 'Rajesh Kumar', estimatedFare: 160, etaMinutes: 6 },
    { id: 'opt_2', driverName: 'Suresh Patel', estimatedFare: 290, etaMinutes: 2 },
    { id: 'opt_3', driverName: 'Mohammed Farooq', estimatedFare: 380, etaMinutes: 8 },
    { id: 'opt_4', driverName: 'Anita Sharma', estimatedFare: 210, etaMinutes: 4 },
  ];

  test("correctly identifies cheapest and fastest on different options", () => {
    const badges = computeRideOptionBadges(options);
    assert.equal(badges.cheapestId, 'opt_1'); // ₹160
    assert.equal(badges.fastestId, 'opt_2');  // 2 min
  });

  test("correctly flags same option when it is both cheapest and fastest", () => {
    const customOptions: DriverOption[] = [
      { id: 'opt_super', driverName: 'Vijay Singh', estimatedFare: 120, etaMinutes: 2 },
      { id: 'opt_other', driverName: 'Sunita Rao', estimatedFare: 240, etaMinutes: 5 },
    ];
    const badges = computeRideOptionBadges(customOptions);
    assert.equal(badges.cheapestId, 'opt_super');
    assert.equal(badges.fastestId, 'opt_super');
  });

  test("returns null badges when fewer than 2 options are available", () => {
    assert.deepEqual(computeRideOptionBadges([]), { cheapestId: null, fastestId: null });
    assert.deepEqual(
      computeRideOptionBadges([{ id: 'opt_1', driverName: 'Rajesh', estimatedFare: 160, etaMinutes: 4 }]),
      { cheapestId: null, fastestId: null }
    );
  });

  test("picks first option predictably when fares or ETAs are tied", () => {
    const tiedOptions: DriverOption[] = [
      { id: 'opt_a', driverName: 'Driver A', estimatedFare: 150, etaMinutes: 5 },
      { id: 'opt_b', driverName: 'Driver B', estimatedFare: 150, etaMinutes: 5 },
    ];
    const badges = computeRideOptionBadges(tiedOptions);
    assert.equal(badges.cheapestId, 'opt_a');
    assert.equal(badges.fastestId, 'opt_a');
  });
});
