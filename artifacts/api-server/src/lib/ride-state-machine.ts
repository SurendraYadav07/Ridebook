import type { Ride } from "@workspace/db";

type RideStatus = Ride["status"];
type UserRole = "passenger" | "driver" | "admin" | "system";

/**
 * Complete, authoritative transition map for all 18 statuses.
 */
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  scheduled: ["scheduled_dispatching", "passenger_cancelled", "cancelled"],
  scheduled_dispatching: ["searching_driver", "driver_offer_sent", "passenger_cancelled", "expired", "cancelled"],
  requested: ["searching_driver", "driver_offer_sent", "passenger_cancelled", "expired", "cancelled"],
  searching_driver: ["driver_offer_sent", "driver_assigned", "passenger_cancelled", "expired", "cancelled"],
  driver_offer_sent: ["driver_assigned", "searching_driver", "passenger_cancelled", "expired", "cancelled"],
  driver_assigned: ["driver_arriving", "passenger_cancelled", "driver_cancelled", "cancelled"],
  driver_arriving: ["driver_arrived", "passenger_cancelled", "driver_cancelled", "cancelled"],
  driver_arrived: ["trip_started", "passenger_no_show", "passenger_cancelled", "driver_cancelled", "cancelled"],
  passenger_no_show: ["payment_pending", "payment_completed", "cancelled"],
  trip_started: ["trip_completed", "disputed"],
  trip_completed: ["payment_pending", "payment_completed"],
  payment_pending: ["payment_completed", "payment_failed", "disputed"],
  payment_failed: ["payment_completed", "disputed"],
  payment_completed: ["disputed"],
  passenger_cancelled: [],
  driver_cancelled: [],
  expired: [],
  disputed: ["payment_completed", "payment_failed"],
  cancelled: [],
  picking_up: ["riding", "trip_started", "driver_arrived", "passenger_cancelled", "driver_cancelled", "cancelled"],
  riding: ["completed", "trip_completed", "disputed"],
  completed: ["payment_pending", "payment_completed"],
};

/**
 * Role-based transition permissions to ensure:
 * - Passenger CANNOT start trip or complete trip
 * - Driver CANNOT complete trip before starting
 * - Client CANNOT forge payment completion
 */
const ROLE_PERMISSIONS: Partial<Record<RideStatus, Record<string, UserRole[]>>> = {
  trip_started: {
    trip_started: ["driver", "admin", "system"],
  },
  riding: {
    riding: ["driver", "admin", "system"],
  },
  trip_completed: {
    trip_completed: ["driver", "admin", "system"],
  },
  completed: {
    completed: ["driver", "admin", "system"],
  },
  driver_arrived: {
    driver_arrived: ["driver", "admin", "system"],
  },
  driver_arriving: {
    driver_arriving: ["driver", "admin", "system"],
  },
  passenger_no_show: {
    passenger_no_show: ["driver", "admin", "system"],
  },
  payment_completed: {
    payment_completed: ["system", "admin"],
  },
  payment_failed: {
    payment_failed: ["system", "admin"],
  },
};

export interface TransitionCheckResult {
  allowed: boolean;
  reason?: string;
}

export function canTransition(
  from: RideStatus,
  to: RideStatus,
  role?: UserRole,
): TransitionCheckResult {
  if (from === to) {
    return { allowed: false, reason: `Ride is already in status "${from}".` };
  }
  const allowedNext = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowedNext.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot move ride from "${from}" to "${to}". Allowed next states: ${allowedNext.join(", ") || "none"}.`,
    };
  }

  if (role && ROLE_PERMISSIONS[to]?.[to]) {
    const allowedRoles = ROLE_PERMISSIONS[to][to];
    if (!allowedRoles.includes(role)) {
      return {
        allowed: false,
        reason: `Role "${role}" is not authorized to transition ride to "${to}".`,
      };
    }
  }

  return { allowed: true };
}

/** Statuses in which a ride may still be cancelled by the passenger or driver. */
export const CANCELLABLE_STATUSES: RideStatus[] = [
  "scheduled",
  "scheduled_dispatching",
  "requested",
  "searching_driver",
  "driver_offer_sent",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "picking_up",
];

/** Statuses that represent an active, in-progress ride for a passenger/driver. */
export const ACTIVE_STATUSES: RideStatus[] = [
  "scheduled",
  "scheduled_dispatching",
  "requested",
  "searching_driver",
  "driver_offer_sent",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "picking_up",
  "riding",
  "trip_started",
  "payment_pending",
];
