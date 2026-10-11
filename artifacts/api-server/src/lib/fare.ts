import { eq, and, desc } from "drizzle-orm";
import { db, fareConfigurationsTable, promoCodesTable, promoUsageTable, ridesTable } from "@workspace/db";
import type { FareConfiguration, Ride } from "@workspace/db";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Built-in default fare rates per vehicle class if DB is not yet seeded
const DEFAULT_CONFIGS: Record<string, Omit<FareConfiguration, "id" | "effectiveFrom" | "createdAt">> = {
  shared: {
    rideType: "shared",
    baseFare: "35.00",
    perKm: "8.50",
    perMinute: "1.50",
    minimumFare: "55.00",
    bookingFee: "10.00",
    serviceFeePercent: "4.00",
    taxPercent: "5.00",
    cancellationFee: "30.00",
    isActive: true,
  },
  economy: {
    rideType: "economy",
    baseFare: "50.00",
    perKm: "12.00",
    perMinute: "2.00",
    minimumFare: "80.00",
    bookingFee: "15.00",
    serviceFeePercent: "5.00",
    taxPercent: "5.00",
    cancellationFee: "40.00",
    isActive: true,
  },
  premium: {
    rideType: "premium",
    baseFare: "100.00",
    perKm: "20.00",
    perMinute: "3.50",
    minimumFare: "150.00",
    bookingFee: "25.00",
    serviceFeePercent: "7.50",
    taxPercent: "5.00",
    cancellationFee: "75.00",
    isActive: true,
  },
  xl: {
    rideType: "xl",
    baseFare: "150.00",
    perKm: "26.00",
    perMinute: "4.50",
    minimumFare: "200.00",
    bookingFee: "30.00",
    serviceFeePercent: "8.00",
    taxPercent: "5.00",
    cancellationFee: "100.00",
    isActive: true,
  },
};

export async function getActiveFareConfiguration(
  rideType: FareConfiguration["rideType"],
): Promise<FareConfiguration | { [K in keyof FareConfiguration]: any }> {
  try {
    const config = await db.query.fareConfigurationsTable.findFirst({
      where: and(eq(fareConfigurationsTable.rideType, rideType), eq(fareConfigurationsTable.isActive, true)),
      orderBy: [desc(fareConfigurationsTable.effectiveFrom)],
    });
    if (config) return config;
  } catch {}

  const fallback = DEFAULT_CONFIGS[rideType] ?? DEFAULT_CONFIGS.economy;
  return {
    id: `default_${rideType}`,
    ...fallback,
    effectiveFrom: new Date(),
    createdAt: new Date(),
  };
}

export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  bookingFee: number;
  serviceFee: number;
  surgeMultiplier: number;
  taxes: number;
  discount: number;
  totalAmount: number;
  currency: string;
}

export function computeFareBreakdown(params: {
  config: FareConfiguration | any;
  distanceMeters: number;
  durationSeconds: number;
  surgeMultiplier?: number;
  discountAmount?: number;
}): FareBreakdown {
  const { config, distanceMeters, durationSeconds } = params;
  const surgeMultiplier = params.surgeMultiplier ?? 1;

  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;

  const baseFare = Number(config.baseFare);
  const distanceCharge = distanceKm * Number(config.perKm) * surgeMultiplier;
  const timeCharge = durationMinutes * Number(config.perMinute) * surgeMultiplier;
  const bookingFee = Number(config.bookingFee);

  const subtotalBeforeFees = baseFare + distanceCharge + timeCharge;
  const flooredSubtotal = Math.max(subtotalBeforeFees, Number(config.minimumFare));

  const serviceFee = flooredSubtotal * (Number(config.serviceFeePercent) / 100);
  const taxableAmount = flooredSubtotal + bookingFee + serviceFee;
  const taxes = taxableAmount * (Number(config.taxPercent) / 100);

  const discount = Math.min(params.discountAmount ?? 0, flooredSubtotal + bookingFee + serviceFee + taxes);
  const totalAmount = Math.max(0, flooredSubtotal + bookingFee + serviceFee + taxes - discount);

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    baseFare: round2(baseFare),
    distanceCharge: round2(distanceCharge),
    timeCharge: round2(timeCharge),
    bookingFee: round2(bookingFee),
    serviceFee: round2(serviceFee),
    surgeMultiplier,
    taxes: round2(taxes),
    discount: round2(discount),
    totalAmount: round2(totalAmount),
    currency: "INR",
  };
}

/**
 * Calculates waiting charges when driver has arrived and waited past the free grace period.
 */
export function calculateWaitingCharges(params: {
  arrivedAt?: Date | null;
  startedAt?: Date | null;
  freeWaitingMinutes?: number;
  perMinuteRate?: number;
}): { paidMinutes: number; waitingCharges: number } {
  const { arrivedAt, startedAt, freeWaitingMinutes = 3, perMinuteRate = 2.5 } = params;
  if (!arrivedAt || !startedAt) {
    return { paidMinutes: 0, waitingCharges: 0 };
  }

  const waitDurationMs = startedAt.getTime() - arrivedAt.getTime();
  const totalMinutes = Math.max(0, Math.floor(waitDurationMs / 60000));
  const paidMinutes = Math.max(0, totalMinutes - freeWaitingMinutes);
  const waitingCharges = Math.round(paidMinutes * perMinuteRate * 100) / 100;

  return { paidMinutes, waitingCharges };
}

/**
 * Calculates authoritative cancellation fee based on ride state and timing.
 */
export async function calculateCancellationFee(params: {
  ride: Ride;
  cancelledByRole: "passenger" | "driver";
}): Promise<number> {
  const { ride, cancelledByRole } = params;

  // Driver cancellations do not charge the passenger
  if (cancelledByRole === "driver") {
    return 0;
  }

  // Scheduled rides have not entered dispatch, so cancellation is free.
  // Keep this before fare configuration lookup so scheduled cancellation does
  // not depend on fare configuration being present in the database.
  if (["scheduled", "requested", "searching_driver", "driver_offer_sent"].includes(ride.status)) {
    return 0;
  }

  // If driver was assigned, check if cancelled within 2 minutes of assignment
  if (ride.driverAssignedAt) {
    const elapsedSinceAssignmentMs = Date.now() - new Date(ride.driverAssignedAt).getTime();
    if (elapsedSinceAssignmentMs <= 120_000) {
      return 0; // Free cancellation within 2 minutes of driver assignment
    }
  }

  // Otherwise, apply cancellation fee from fare configuration
  const config = await getActiveFareConfiguration(ride.rideType);
  return Number(config.cancellationFee ?? 40);
}

const DEFAULT_PROMOS: Record<string, {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscount?: number;
  minRideValue?: number;
  firstRideOnly?: boolean;
  rideTypeRestriction?: FareConfiguration["rideType"];
  description: string;
}> = {
  RIDEGO20: {
    code: "RIDEGO20",
    discountType: "percentage",
    discountValue: 20,
    maxDiscount: 100,
    minRideValue: 50,
    description: "20% off up to ₹100",
  },
  WELCOME50: {
    code: "WELCOME50",
    discountType: "fixed",
    discountValue: 50,
    minRideValue: 80,
    firstRideOnly: true,
    description: "₹50 off first ride",
  },
  SAVE10: {
    code: "SAVE10",
    discountType: "percentage",
    discountValue: 10,
    maxDiscount: 50,
    description: "10% off any ride",
  },
  AIRPORT15: {
    code: "AIRPORT15",
    discountType: "percentage",
    discountValue: 15,
    maxDiscount: 150,
    description: "15% off airport trips",
  },
};

export interface PromoValidationResult {
  valid: boolean;
  reason?: string;
  message?: string;
  promoCodeId?: string;
  discountAmount?: number;
}

export async function validatePromoCode(params: {
  code: string;
  userId: string;
  rideType: FareConfiguration["rideType"];
  fareBeforeDiscount: number;
}): Promise<PromoValidationResult> {
  const normalizedCode = params.code.trim().toUpperCase();

  try {
    const promo = await db.query.promoCodesTable.findFirst({
      where: eq(promoCodesTable.code, normalizedCode),
    });

    if (promo) {
      if (!promo.isActive) {
        return { valid: false, reason: "Promo code is inactive." };
      }
      if (promo.expiresAt && promo.expiresAt < new Date()) {
        return { valid: false, reason: "Promo code has expired." };
      }
      if (promo.rideTypeRestriction && promo.rideTypeRestriction !== params.rideType) {
        return { valid: false, reason: `Promo code only applies to ${promo.rideTypeRestriction} rides.` };
      }
      if (promo.minRideValue && params.fareBeforeDiscount < Number(promo.minRideValue)) {
        return { valid: false, reason: `Minimum ride value of ₹${promo.minRideValue} not met.` };
      }

      const usageByUser = await db.query.promoUsageTable.findMany({
        where: and(eq(promoUsageTable.promoCodeId, promo.id), eq(promoUsageTable.userId, params.userId)),
      });
      if (usageByUser.length >= promo.perUserUsageLimit) {
        return { valid: false, reason: "You have already used this promo code." };
      }

      if (promo.firstRideOnly) {
        const priorRides = await db.query.ridesTable.findFirst({
          where: and(eq(ridesTable.passengerId, params.userId), eq(ridesTable.status, "trip_completed")),
        });
        if (priorRides) {
          return { valid: false, reason: "This promo code is only valid for a first ride." };
        }
      }

      if (promo.globalUsageLimit != null) {
        const totalUsage = await db.query.promoUsageTable.findMany({
          where: eq(promoUsageTable.promoCodeId, promo.id),
        });
        if (totalUsage.length >= promo.globalUsageLimit) {
          return { valid: false, reason: "This promo code has reached its usage limit." };
        }
      }

      let discountAmount: number;
      if (promo.discountType === "percentage") {
        discountAmount = params.fareBeforeDiscount * (Number(promo.discountValue) / 100);
        if (promo.maxDiscount != null) {
          discountAmount = Math.min(discountAmount, Number(promo.maxDiscount));
        }
      } else {
        discountAmount = Number(promo.discountValue);
      }
      discountAmount = Math.round(Math.min(discountAmount, params.fareBeforeDiscount) * 100) / 100;

      const message =
        promo.discountType === "percentage"
          ? `${promo.discountValue}% off applied (-₹${discountAmount})`
          : `₹${discountAmount} off applied`;

      return { valid: true, promoCodeId: promo.id, discountAmount, message };
    }
  } catch (err) {
    console.warn("[validatePromoCode] DB lookup failed, checking fallback definitions:", err);
  }

  // Check fallback promo definitions if not in DB or DB unseeded
  const fallback = DEFAULT_PROMOS[normalizedCode];
  if (!fallback) {
    return { valid: false, reason: "Invalid promo code." };
  }

  if (fallback.rideTypeRestriction && fallback.rideTypeRestriction !== params.rideType) {
    return { valid: false, reason: `Promo code only applies to ${fallback.rideTypeRestriction} rides.` };
  }
  if (fallback.minRideValue && params.fareBeforeDiscount < fallback.minRideValue) {
    return { valid: false, reason: `Minimum ride value of ₹${fallback.minRideValue} not met.` };
  }

  let discountAmount: number;
  if (fallback.discountType === "percentage") {
    discountAmount = params.fareBeforeDiscount * (fallback.discountValue / 100);
    if (fallback.maxDiscount != null) {
      discountAmount = Math.min(discountAmount, fallback.maxDiscount);
    }
  } else {
    discountAmount = fallback.discountValue;
  }
  discountAmount = Math.round(Math.min(discountAmount, params.fareBeforeDiscount) * 100) / 100;

  return {
    valid: true,
    discountAmount,
    message: `${fallback.description} applied (-₹${discountAmount})`,
  };
}
