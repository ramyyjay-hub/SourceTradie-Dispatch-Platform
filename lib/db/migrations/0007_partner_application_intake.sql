ALTER TABLE "partners" ADD COLUMN "application_submission_id" uuid;
ALTER TABLE "partners" ADD COLUMN "application_notification_status" "notification_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "partners" ADD COLUMN "application_notification_provider_message_id" text;
ALTER TABLE "partners" ADD COLUMN "application_notification_error_code" text;
ALTER TABLE "partners" ADD COLUMN "application_notification_sent_at" timestamp with time zone;

CREATE UNIQUE INDEX "partners_application_submission_id_uidx"
  ON "partners" ("application_submission_id")
  WHERE "application_submission_id" IS NOT NULL;
