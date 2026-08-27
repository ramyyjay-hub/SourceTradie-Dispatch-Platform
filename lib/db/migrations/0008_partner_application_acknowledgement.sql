ALTER TABLE "partners" ADD COLUMN "application_acknowledgement_status" "notification_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "partners" ADD COLUMN "application_acknowledgement_provider_message_id" text;
ALTER TABLE "partners" ADD COLUMN "application_acknowledgement_error_code" text;
ALTER TABLE "partners" ADD COLUMN "application_acknowledgement_sent_at" timestamp with time zone;
