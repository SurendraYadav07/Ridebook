import type { User, Ride } from "@workspace/db";

/**
 * Strips sensitive data like password hashes before sending user profiles over the wire.
 */
export function toUserProfile(user: User) {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    name: user.name,
    phone: user.phone,
    email: user.email,
    profilePhotoUrl: user.profilePhotoUrl,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    emailVerified: Boolean(user.emailVerifiedAt),
    isBlocked: Boolean(user.isBlocked),
    blockedReason: user.blockedReason ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Public authoritative ride shape with proper numeric conversions.
 */
export function toRideProfile(ride: Ride, options: { includeStartTripOtp?: boolean } = {}) {
  return {
    id: ride.id,
    passengerId: ride.passengerId,
    driverId: ride.driverId,
    vehicleId: ride.vehicleId,
    rideType: ride.rideType,
    status: ride.status,
    pickup: {
      address: ride.pickupAddress,
      latitude: Number(ride.pickupLatitude),
      longitude: Number(ride.pickupLongitude),
    },
    destination: {
      address: ride.destinationAddress,
      latitude: Number(ride.destinationLatitude),
      longitude: Number(ride.destinationLongitude),
    },
    stops: Array.isArray(ride.stops)
      ? ride.stops.map((s: any, idx: number) => ({
          address: s.address,
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          name: s.name ?? null,
          sequenceOrder: typeof s.sequenceOrder === 'number' ? s.sequenceOrder : idx + 1,
        }))
      : null,
    isShared: Boolean(ride.isShared),
    coRiderCount: ride.coRiderCount != null ? Number(ride.coRiderCount) : 0,
    coRiderName: ride.coRiderName ?? null,
    coRiderPickupAddress: ride.coRiderPickupAddress ?? null,
    coRiderDropoffAddress: ride.coRiderDropoffAddress ?? null,
    distanceMeters: ride.distanceMeters != null ? Number(ride.distanceMeters) : null,
    etaSeconds: ride.etaSeconds != null ? Number(ride.etaSeconds) : null,
    estimatedFare: ride.estimatedFare != null ? Number(ride.estimatedFare) : null,
    finalFare: ride.finalFare != null ? Number(ride.finalFare) : null,
    surgeMultiplier: ride.surgeMultiplier != null ? Number(ride.surgeMultiplier) : 1,
    scheduledFor: ride.scheduledFor?.toISOString() ?? null,
    ...(options.includeStartTripOtp ? { startTripOtp: ride.startTripOtp } : {}),
    waitingCharges: ride.waitingCharges != null ? Number(ride.waitingCharges) : 0,
    cancellationFeeCharged: ride.cancellationFeeCharged != null ? Number(ride.cancellationFeeCharged) : 0,
    cancellationReason: ride.cancellationReason,
    requestedAt: ride.requestedAt.toISOString(),
    driverAssignedAt: ride.driverAssignedAt?.toISOString() ?? null,
    driverArrivedAt: ride.driverArrivedAt?.toISOString() ?? null,
    tripStartedAt: ride.tripStartedAt?.toISOString() ?? null,
    tripCompletedAt: ride.tripCompletedAt?.toISOString() ?? null,
    cancelledAt: ride.cancelledAt?.toISOString() ?? null,
    createdAt: ride.createdAt.toISOString(),
    updatedAt: ride.updatedAt.toISOString(),
  };
}
