import { test, describe } from "node:test";
import assert from "node:assert/strict";

interface SortableRideOption {
  id: string;
  driverName: string;
  rating: number;
  estimatedFare: number;
  etaMinutes: number;
  rideType: 'economy' | 'premium' | 'xl';
}

type RideSortField = 'eta' | 'price' | 'rating';
type RideSortDirection = 'asc' | 'desc';

interface RideSortOption {
  field: RideSortField;
  direction: RideSortDirection;
}

function sortRideOptions(options: SortableRideOption[], sort: RideSortOption): SortableRideOption[] {
  return [...options].sort((a, b) => {
    let comparison = 0;
    if (sort.field === 'price') {
      comparison = a.estimatedFare - b.estimatedFare;
    } else if (sort.field === 'rating') {
      comparison = a.rating - b.rating;
    } else {
      // 'eta'
      comparison = a.etaMinutes - b.etaMinutes;
    }

    // Tie-breakers
    if (comparison === 0) {
      comparison = a.etaMinutes - b.etaMinutes;
    }
    if (comparison === 0) {
      comparison = a.estimatedFare - b.estimatedFare;
    }
    if (comparison === 0) {
      comparison = b.rating - a.rating;
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

describe("Ride Options Sorting Engine", () => {
  const mockOptions: SortableRideOption[] = [
    { id: 'opt_1', driverName: 'Rajesh Kumar', rating: 4.88, estimatedFare: 180, etaMinutes: 4, rideType: 'economy' },
    { id: 'opt_2', driverName: 'Suresh Patel', rating: 4.95, estimatedFare: 290, etaMinutes: 2, rideType: 'premium' },
    { id: 'opt_3', driverName: 'Mohammed Farooq', rating: 4.79, estimatedFare: 380, etaMinutes: 7, rideType: 'xl' },
    { id: 'opt_4', driverName: 'Anita Sharma', rating: 4.92, estimatedFare: 180, etaMinutes: 5, rideType: 'economy' },
  ];

  test("default sort: ETA ascending (fastest pickup first)", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'eta', direction: 'asc' });
    assert.equal(sorted[0].driverName, 'Suresh Patel'); // 2 min
    assert.equal(sorted[1].driverName, 'Rajesh Kumar'); // 4 min
    assert.equal(sorted[2].driverName, 'Anita Sharma'); // 5 min
    assert.equal(sorted[3].driverName, 'Mohammed Farooq'); // 7 min
  });

  test("sort by ETA descending", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'eta', direction: 'desc' });
    assert.equal(sorted[0].driverName, 'Mohammed Farooq'); // 7 min
    assert.equal(sorted[3].driverName, 'Suresh Patel'); // 2 min
  });

  test("sort by Price ascending (lowest fare first)", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'price', direction: 'asc' });
    // opt_1 and opt_4 both cost 180, but opt_1 has lower ETA (4 min vs 5 min)
    assert.equal(sorted[0].id, 'opt_1');
    assert.equal(sorted[0].estimatedFare, 180);
    assert.equal(sorted[1].id, 'opt_4');
    assert.equal(sorted[1].estimatedFare, 180);
    assert.equal(sorted[2].estimatedFare, 290);
    assert.equal(sorted[3].estimatedFare, 380);
  });

  test("sort by Price descending (highest fare first)", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'price', direction: 'desc' });
    assert.equal(sorted[0].estimatedFare, 380);
    assert.equal(sorted[1].estimatedFare, 290);
    assert.equal(sorted[2].estimatedFare, 180);
    assert.equal(sorted[3].estimatedFare, 180);
  });

  test("sort by Rating descending (highest rated first)", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'rating', direction: 'desc' });
    assert.equal(sorted[0].driverName, 'Suresh Patel'); // 4.95
    assert.equal(sorted[1].driverName, 'Anita Sharma'); // 4.92
    assert.equal(sorted[2].driverName, 'Rajesh Kumar'); // 4.88
    assert.equal(sorted[3].driverName, 'Mohammed Farooq'); // 4.79
  });

  test("sort by Rating ascending (lowest rated first)", () => {
    const sorted = sortRideOptions(mockOptions, { field: 'rating', direction: 'asc' });
    assert.equal(sorted[0].driverName, 'Mohammed Farooq'); // 4.79
    assert.equal(sorted[3].driverName, 'Suresh Patel'); // 4.95
  });

  test("handles empty and single-element lists gracefully without errors", () => {
    assert.deepEqual(sortRideOptions([], { field: 'price', direction: 'asc' }), []);
    assert.deepEqual(
      sortRideOptions([mockOptions[0]], { field: 'rating', direction: 'desc' }),
      [mockOptions[0]]
    );
  });
});
