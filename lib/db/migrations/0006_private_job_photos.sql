ALTER TABLE "job_images"
ADD COLUMN "storage_object_key" text;

CREATE UNIQUE INDEX "job_images_storage_object_key_uidx"
ON "job_images" ("storage_object_key")
WHERE "storage_object_key" IS NOT NULL;
