CREATE TYPE "public"."document_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."driver_document_type" AS ENUM('license', 'driving_license', 'vehicle_registration', 'id_proof', 'identity_document', 'insurance', 'vehicle_photo', 'selfie');--> statement-breakpoint
CREATE TYPE "public"."driver_offer_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."driver_verification_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."emergency_event_status" AS ENUM('active', 'dispatched', 'resolved', 'false_alarm');--> statement-breakpoint
CREATE TYPE "public"."emergency_type" AS ENUM('sos_button', 'crash_detected', 'route_deviation', 'passenger_report', 'driver_report');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_type" AS ENUM('fare_credit', 'platform_commission_debit', 'tax_debit', 'cancellation_fee_credit', 'cancellation_fee_debit', 'tip_credit', 'surge_credit', 'waiting_charge_credit', 'payout_debit', 'refund_debit', 'bonus_credit');--> statement-breakpoint
CREATE TYPE "public"."lost_item_status" AS ENUM('reported', 'driver_contacted', 'item_found', 'returned_to_passenger', 'closed_unresolved');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ride_update', 'payment_update', 'promo', 'account', 'safety', 'support');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('signup', 'login', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('card', 'upi', 'netbanking', 'wallet', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."promo_discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('scheduled', 'scheduled_dispatching', 'requested', 'searching_driver', 'driver_offer_sent', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'picking_up', 'passenger_no_show', 'trip_started', 'riding', 'trip_completed', 'completed', 'payment_pending', 'payment_completed', 'payment_failed', 'passenger_cancelled', 'driver_cancelled', 'expired', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ride_type" AS ENUM('economy', 'premium', 'xl', 'shared');--> statement-breakpoint
CREATE TYPE "public"."shared_ride_passenger_status" AS ENUM('requested', 'confirmed', 'picked_up', 'dropped_off', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shared_ride_status" AS ENUM('requested', 'matching', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stop_type" AS ENUM('pickup', 'dropoff');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('passenger', 'driver', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"push_token" text NOT NULL,
	"platform" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" DEFAULT 'passenger' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"phone" text,
	"email" text,
	"password_hash" text,
	"name" text NOT NULL,
	"profile_photo_url" text,
	"phone_verified_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"went_online_at" timestamp with time zone NOT NULL,
	"went_offline_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"type" "driver_document_type" NOT NULL,
	"storage_key" text NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"license_number" text NOT NULL,
	"model" text,
	"plate_number" text,
	"verification_status" "driver_verification_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"location" "geography",
	"current_latitude" numeric(10, 7),
	"current_longitude" numeric(10, 7),
	"location_updated_at" timestamp with time zone,
	"average_rating" numeric(3, 2),
	"total_rides" numeric(10, 0) DEFAULT '0' NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"category" "ride_type" NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" text NOT NULL,
	"color" text NOT NULL,
	"plate_number" text NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"stars" numeric(1, 0) NOT NULL,
	"review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"heading" numeric(6, 2),
	"speed_mps" numeric(6, 2),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"from_status" "ride_status",
	"to_status" "ride_status" NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"ride_type" "ride_type" NOT NULL,
	"status" "ride_status" DEFAULT 'requested' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"co_rider_count" integer DEFAULT 0 NOT NULL,
	"co_rider_name" text,
	"co_rider_pickup_address" text,
	"co_rider_dropoff_address" text,
	"origin_location" "geography",
	"destination_location" "geography",
	"pickup_address" text NOT NULL,
	"pickup_latitude" numeric(10, 7) NOT NULL,
	"pickup_longitude" numeric(10, 7) NOT NULL,
	"destination_address" text NOT NULL,
	"destination_latitude" numeric(10, 7) NOT NULL,
	"destination_longitude" numeric(10, 7) NOT NULL,
	"stops" jsonb,
	"distance_meters" numeric(10, 2),
	"eta_seconds" numeric(10, 0),
	"fare_cents" integer,
	"estimated_fare" numeric(10, 2),
	"final_fare" numeric(10, 2),
	"surge_multiplier" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"promo_code_id" uuid,
	"scheduled_for" timestamp with time zone,
	"start_trip_otp" text,
	"free_waiting_minutes" numeric(4, 0) DEFAULT '3' NOT NULL,
	"paid_waiting_minutes" numeric(6, 0) DEFAULT '0' NOT NULL,
	"waiting_charges" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"cancellation_fee_charged" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"driver_assigned_at" timestamp with time zone,
	"driver_arrived_at" timestamp with time zone,
	"trip_started_at" timestamp with time zone,
	"trip_completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fare_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_type" "ride_type" NOT NULL,
	"base_fare" numeric(10, 2) NOT NULL,
	"per_km" numeric(10, 2) NOT NULL,
	"per_minute" numeric(10, 2) NOT NULL,
	"minimum_fare" numeric(10, 2) NOT NULL,
	"booking_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"service_fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cancellation_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "payment_method_type" NOT NULL,
	"provider_token" text,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"payment_method_id" uuid,
	"base_fare" numeric(10, 2) NOT NULL,
	"distance_charge" numeric(10, 2) NOT NULL,
	"time_charge" numeric(10, 2) NOT NULL,
	"booking_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"service_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"surge_multiplier" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"taxes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"provider_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"initiated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"discount_type" "promo_discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"max_discount" numeric(10, 2),
	"min_ride_value" numeric(10, 2),
	"ride_type_restriction" "ride_type",
	"first_ride_only" boolean DEFAULT false NOT NULL,
	"global_usage_limit" integer,
	"per_user_usage_limit" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ride_id" uuid NOT NULL,
	"discount_applied" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ride_id" uuid,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_ride_passengers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_ride_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"seat_count" integer DEFAULT 1 NOT NULL,
	"status" "shared_ride_passenger_status" DEFAULT 'requested' NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_latitude" numeric(10, 7) NOT NULL,
	"pickup_longitude" numeric(10, 7) NOT NULL,
	"destination_address" text NOT NULL,
	"destination_latitude" numeric(10, 7) NOT NULL,
	"destination_longitude" numeric(10, 7) NOT NULL,
	"fare" numeric(10, 2) NOT NULL,
	"paid_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"dropped_off_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_ride_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_ride_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"stop_type" "stop_type" NOT NULL,
	"sequence_order" integer NOT NULL,
	"address" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"estimated_arrival" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"status" "shared_ride_status" DEFAULT 'requested' NOT NULL,
	"max_seats" integer DEFAULT 4 NOT NULL,
	"available_seats" integer DEFAULT 4 NOT NULL,
	"route_polyline" text,
	"total_distance_meters" numeric(10, 2),
	"total_duration_seconds" numeric(10, 0),
	"total_fare" numeric(10, 2),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"payout_method" text DEFAULT 'bank_transfer' NOT NULL,
	"account_details" text,
	"reference_id" text,
	"failure_reason" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"available_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"pending_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_earned" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_paid_out" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"ride_id" uuid,
	"type" "financial_transaction_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"balance_before" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid,
	"user_id" uuid NOT NULL,
	"type" "emergency_type" DEFAULT 'sos_button' NOT NULL,
	"status" "emergency_event_status" DEFAULT 'active' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"details" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"description" text NOT NULL,
	"status" "lost_item_status" DEFAULT 'reported' NOT NULL,
	"driver_notified_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"request_path" text NOT NULL,
	"request_hash" text,
	"response_status_code" integer,
	"response_body" text,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" "driver_offer_status" DEFAULT 'pending' NOT NULL,
	"estimated_distance_meters" numeric(10, 2),
	"estimated_eta_seconds" numeric(10, 0),
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_devices" ADD CONSTRAINT "notification_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_availability" ADD CONSTRAINT "driver_availability_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_locations" ADD CONSTRAINT "ride_locations_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_ride_passengers" ADD CONSTRAINT "shared_ride_passengers_shared_ride_id_shared_rides_id_fk" FOREIGN KEY ("shared_ride_id") REFERENCES "public"."shared_rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_ride_passengers" ADD CONSTRAINT "shared_ride_passengers_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_ride_stops" ADD CONSTRAINT "shared_ride_stops_shared_ride_id_shared_rides_id_fk" FOREIGN KEY ("shared_ride_id") REFERENCES "public"."shared_rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_ride_stops" ADD CONSTRAINT "shared_ride_stops_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_rides" ADD CONSTRAINT "shared_rides_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_rides" ADD CONSTRAINT "shared_rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_wallets" ADD CONSTRAINT "driver_wallets_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_driver_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."driver_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lost_items" ADD CONSTRAINT "lost_items_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lost_items" ADD CONSTRAINT "lost_items_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_share_tokens" ADD CONSTRAINT "trip_share_tokens_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_contacts_user_id_idx" ON "emergency_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_devices_token_unique" ON "notification_devices" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "notification_devices_user_id_idx" ON "notification_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_purpose_idx" ON "otp_codes" USING btree ("phone","purpose");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "saved_locations_user_id_idx" ON "saved_locations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "driver_availability_driver_id_idx" ON "driver_availability" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_documents_driver_id_idx" ON "driver_documents" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_id_unique" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_license_number_unique" ON "drivers" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "drivers_online_status_idx" ON "drivers" USING btree ("is_online","verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_number_unique" ON "vehicles" USING btree ("plate_number");--> statement-breakpoint
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "ratings_ride_id_idx" ON "ratings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ratings_ratee_id_idx" ON "ratings" USING btree ("ratee_id");--> statement-breakpoint
CREATE INDEX "ride_locations_ride_id_idx" ON "ride_locations" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_locations_ride_id_recorded_idx" ON "ride_locations" USING btree ("ride_id","recorded_at");--> statement-breakpoint
CREATE INDEX "ride_messages_ride_id_idx" ON "ride_messages" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_status_history_ride_id_idx" ON "ride_status_history" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "rides_passenger_id_idx" ON "rides" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "rides_driver_id_idx" ON "rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_scheduled_for_idx" ON "rides" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "fare_configurations_ride_type_active_idx" ON "fare_configurations" USING btree ("ride_type","is_active");--> statement-breakpoint
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_payment_id_idx" ON "payment_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_provider_event_id_idx" ON "payment_transactions" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_ride_id_idx" ON "payments" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "payments_payer_id_idx" ON "payments" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "payments_provider_order_id_idx" ON "payments" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_id_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_usage_promo_code_id_idx" ON "promo_usage" USING btree ("promo_code_id");--> statement-breakpoint
CREATE INDEX "promo_usage_user_id_idx" ON "promo_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_id_idx" ON "support_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shared_ride_passengers_shared_ride_idx" ON "shared_ride_passengers" USING btree ("shared_ride_id");--> statement-breakpoint
CREATE INDEX "shared_ride_passengers_passenger_idx" ON "shared_ride_passengers" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "shared_ride_passengers_status_idx" ON "shared_ride_passengers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shared_ride_stops_shared_ride_idx" ON "shared_ride_stops" USING btree ("shared_ride_id");--> statement-breakpoint
CREATE INDEX "shared_ride_stops_sequence_idx" ON "shared_ride_stops" USING btree ("shared_ride_id","sequence_order");--> statement-breakpoint
CREATE INDEX "shared_rides_driver_id_idx" ON "shared_rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "shared_rides_status_idx" ON "shared_rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_payouts_driver_id_idx" ON "driver_payouts" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_payouts_status_idx" ON "driver_payouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_wallets_driver_id_unique" ON "driver_wallets" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_ride_id_idx" ON "wallet_transactions" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "emergency_events_ride_id_idx" ON "emergency_events" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "emergency_events_user_id_idx" ON "emergency_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emergency_events_status_idx" ON "emergency_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lost_items_ride_id_idx" ON "lost_items" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "lost_items_reported_by_idx" ON "lost_items" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "lost_items_status_idx" ON "lost_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_share_tokens_token_unique" ON "trip_share_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "trip_share_tokens_ride_id_idx" ON "trip_share_tokens" USING btree ("ride_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_key_user_unique" ON "idempotency_keys" USING btree ("key","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_offers_ride_driver_unique" ON "driver_offers" USING btree ("ride_id","driver_id");--> statement-breakpoint
CREATE INDEX "driver_offers_driver_id_idx" ON "driver_offers" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_offers_status_expires_idx" ON "driver_offers" USING btree ("status","expires_at");
