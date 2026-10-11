import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Driver Rating Summary & Calculations", () => {
  test("calculates aggregate average rating rounded to 2 decimal places and distribution breakdown", () => {
    const rawRatings = [
      { id: "r_1", stars: "5", review: "Excellent driver!", raterId: "u_1", createdAt: new Date() },
      { id: "r_2", stars: "5", review: "Clean car", raterId: "u_2", createdAt: new Date() },
      { id: "r_3", stars: "4", review: "Good ride", raterId: "u_3", createdAt: new Date() },
      { id: "r_4", stars: "3", review: "Slight delay", raterId: "u_4", createdAt: new Date() },
      { id: "r_5", stars: "5", review: null, raterId: "u_5", createdAt: new Date() },
    ];

    const totalRatings = rawRatings.length;
    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    let sum = 0;
    for (const r of rawRatings) {
      const s = Math.min(5, Math.max(1, Math.round(Number(r.stars))));
      distribution[s] = (distribution[s] || 0) + 1;
      sum += Number(r.stars);
    }

    const averageRating = Number((sum / totalRatings).toFixed(2));

    assert.equal(totalRatings, 5);
    // (5 + 5 + 4 + 3 + 5) / 5 = 22 / 5 = 4.40
    assert.equal(averageRating, 4.4);
    assert.equal(distribution[5], 3);
    assert.equal(distribution[4], 1);
    assert.equal(distribution[3], 1);
    assert.equal(distribution[2], 0);
    assert.equal(distribution[1], 0);
  });

  test("handles driver with zero ratings gracefully with fallback", () => {
    const driver = {
      id: "driver_new",
      userId: "user_new",
      averageRating: "5.00",
      totalRides: 0,
    };

    const ratings: any[] = [];
    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? Number((ratings.reduce((acc, r) => acc + Number(r.stars), 0) / totalRatings).toFixed(2))
      : Number(driver.averageRating ?? 5.0);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    assert.equal(totalRatings, 0);
    assert.equal(averageRating, 5.0);
    assert.equal(distribution[5], 0);
    assert.equal(distribution[1], 0);
  });

  test("half-star rounding logic conforms to mobile UI star representation", () => {
    const calculateStarIcons = (val: number, maxStars = 5) => {
      const clamped = Math.max(0, Math.min(maxStars, val));
      const roundedHalf = Math.round(clamped * 2) / 2;
      const icons: string[] = [];

      for (let i = 1; i <= maxStars; i++) {
        if (roundedHalf >= i) {
          icons.push("star");
        } else if (roundedHalf >= i - 0.5) {
          icons.push("star-half");
        } else {
          icons.push("star-outline");
        }
      }
      return icons;
    };

    // 4.8 -> rounded to 5.0 -> 5 stars
    assert.deepEqual(calculateStarIcons(4.8), ["star", "star", "star", "star", "star"]);

    // 4.6 -> rounded to 4.5 -> 4 stars + 1 half star
    assert.deepEqual(calculateStarIcons(4.6), ["star", "star", "star", "star", "star-half"]);

    // 3.4 -> rounded to 3.5 -> 3 stars + 1 half star + 1 outline
    assert.deepEqual(calculateStarIcons(3.4), ["star", "star", "star", "star-half", "star-outline"]);

    // 2.2 -> rounded to 2.0 -> 2 stars + 3 outline
    assert.deepEqual(calculateStarIcons(2.2), ["star", "star", "star-outline", "star-outline", "star-outline"]);
  });

  test("serializes recent reviews and associates rater names", () => {
    const users = [
      { id: "u_1", name: "Ananya Sharma" },
      { id: "u_2", name: "Vikram Patel" },
    ];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const ratingRecords = [
      { id: "rat_1", rideId: "ride_1", raterId: "u_1", stars: "5", review: "Super polite and smooth driving!", createdAt: new Date("2026-09-01T10:00:00Z") },
      { id: "rat_2", rideId: "ride_2", raterId: "u_2", stars: "4", review: null, createdAt: new Date("2026-09-02T15:30:00Z") },
    ];

    const recentReviews = ratingRecords.map((r) => ({
      id: r.id,
      rideId: r.rideId,
      raterName: userMap.get(r.raterId) || "Passenger",
      stars: Number(r.stars),
      review: r.review || null,
      createdAt: r.createdAt.toISOString(),
    }));

    assert.equal(recentReviews.length, 2);
    assert.equal(recentReviews[0].raterName, "Ananya Sharma");
    assert.equal(recentReviews[0].stars, 5);
    assert.equal(recentReviews[0].review, "Super polite and smooth driving!");
    assert.equal(recentReviews[1].raterName, "Vikram Patel");
    assert.equal(recentReviews[1].stars, 4);
    assert.equal(recentReviews[1].review, null);
  });
});
