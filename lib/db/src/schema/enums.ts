import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "passenger",
  "driver",
  "admin",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
]);

export const driverVerificationStatusEnum = pgEnum(
  "driver_verification_status",
  ["pending", "approved", "rejected", "suspended"],
);

export const driverDocumentTypeEnum = pgEnum("driver_document_type", [
  "license",
  "driving_license",
  "vehicle_registration",
  "id_proof",
  "identity_document",
  "insurance",
  "vehicle_photo",
  "selfie",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "approved",
  "rejected",
]);

export const rideTypeEnum = pgEnum("ride_type", [
  "economy",
  "premium",
  "xl",
  "shared",
]);

export const rideStatusEnum = pgEnum("ride_status", [
  "scheduled",
  "scheduled_dispatching",
  "requested",
  "searching_driver",
  "driver_offer_sent",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "picking_up",
  "passenger_no_show",
  "trip_started",
  "riding",
  "trip_completed",
  "completed",
  "payment_pending",
  "payment_completed",
  "payment_failed",
  "passenger_cancelled",
  "driver_cancelled",
  "expired",
  "disputed",
  "cancelled",
]);

export const driverOfferStatusEnum = pgEnum("driver_offer_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

export const sharedRideStatusEnum = pgEnum("shared_ride_status", [
  "requested",
  "matching",
  "active",
  "completed",
  "cancelled",
]);

export const sharedRidePassengerStatusEnum = pgEnum("shared_ride_passenger_status", [
  "requested",
  "confirmed",
  "picked_up",
  "dropped_off",
  "cancelled",
]);

export const stopTypeEnum = pgEnum("stop_type", [
  "pickup",
  "dropoff",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "rejected",
]);

export const emergencyEventStatusEnum = pgEnum("emergency_event_status", [
  "active",
  "dispatched",
  "resolved",
  "false_alarm",
]);

export const emergencyTypeEnum = pgEnum("emergency_type", [
  "sos_button",
  "crash_detected",
  "route_deviation",
  "passenger_report",
  "driver_report",
]);

export const lostItemStatusEnum = pgEnum("lost_item_status", [
  "reported",
  "driver_contacted",
  "item_found",
  "returned_to_passenger",
  "closed_unresolved",
]);

export const financialTransactionTypeEnum = pgEnum("financial_transaction_type", [
  "fare_credit",
  "platform_commission_debit",
  "tax_debit",
  "cancellation_fee_credit",
  "cancellation_fee_debit",
  "tip_credit",
  "surge_credit",
  "waiting_charge_credit",
  "payout_debit",
  "refund_debit",
  "bonus_credit",
]);

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "card",
  "upi",
  "netbanking",
  "wallet",
  "cash",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "processed",
  "failed",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "ride_update",
  "payment_update",
  "promo",
  "account",
  "safety",
  "support",
]);

export const promoDiscountTypeEnum = pgEnum("promo_discount_type", [
  "percentage",
  "fixed",
]);

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "waiting_for_user",
  "resolved",
  "closed",
]);

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "signup",
  "login",
  "password_reset",
]);

