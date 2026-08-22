import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const jobStatusEnum = pgEnum("job_status", [
  "new",
  "reviewing",
  "awaiting_dispatch",
  "dispatching",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
]);

export const partnerStatusEnum = pgEnum("partner_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export const dispatchStateEnum = pgEnum("dispatch_state", [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
]);

export const appRoleEnum = pgEnum("app_role", ["partner", "admin"]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "delivered",
  "failed",
]);

export const appUsersTable = pgTable(
  "app_users",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    authUserId: uuid("auth_user_id").notNull(),
    role: appRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("app_users_auth_user_id_uidx").on(table.authUserId),
    index("app_users_role_idx").on(table.role),
    index("app_users_active_idx").on(table.isActive),
  ],
);

export const jobsTable = pgTable(
  "jobs",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    reference: varchar("reference", { length: 32 }).notNull(),
    publicStatusToken: varchar("public_status_token", { length: 64 }).notNull(),
    description: text("description").notNull(),
    trade: text("trade").notNull(),
    suburb: text("suburb").notNull(),
    postcode: varchar("postcode", { length: 16 }).notNull(),
    urgency: text("urgency").notNull(),
    preferredTime: text("preferred_time").notNull(),
    status: jobStatusEnum("status").notNull().default("awaiting_dispatch"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    serviceAddressLine1: text("service_address_line_1"),
    serviceAddressLine2: text("service_address_line_2"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("jobs_reference_uidx").on(table.reference),
    uniqueIndex("jobs_public_status_token_uidx").on(table.publicStatusToken),
    index("jobs_status_idx").on(table.status),
    index("jobs_created_at_idx").on(table.createdAt),
  ],
);

export const jobImagesTable = pgTable(
  "job_images",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    imageName: text("image_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_images_job_id_idx").on(table.jobId),
    uniqueIndex("job_images_job_id_name_uidx").on(table.jobId, table.imageName),
  ],
);

export const jobIntakeSubmissionsTable = pgTable(
  "job_intake_submissions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    customerConfirmedValues: jsonb("customer_confirmed_values")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_intake_submissions_job_id_idx").on(table.jobId),
    index("job_intake_submissions_created_at_idx").on(table.createdAt),
  ],
);

export const jobAiAssessmentsTable = pgTable(
  "job_ai_assessments",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => jobIntakeSubmissionsTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model"),
    outcome: text("outcome").notNull(),
    safetyCodes: jsonb("safety_codes").$type<string[]>().notNull(),
    assessment: jsonb("assessment").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_ai_assessments_job_id_idx").on(table.jobId),
    index("job_ai_assessments_submission_id_idx").on(table.submissionId),
    index("job_ai_assessments_created_at_idx").on(table.createdAt),
  ],
);

export const jobStatusHistoryTable = pgTable(
  "job_status_history",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_status_history_job_id_idx").on(table.jobId),
    index("job_status_history_created_at_idx").on(table.createdAt),
  ],
);

export const partnersTable = pgTable(
  "partners",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    authUserId: uuid("auth_user_id"),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    abn: text("abn"),
    trade: text("trade").notNull(),
    licence: text("licence"),
    mobile: text("mobile").notNull(),
    email: text("email").notNull(),
    radiusKm: integer("radius_km").notNull().default(15),
    emergencyJobs: boolean("emergency_jobs").notNull().default(false),
    availability: boolean("availability").notNull().default(false),
    status: partnerStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("partners_auth_user_id_uidx").on(table.authUserId),
    index("partners_status_idx").on(table.status),
    index("partners_availability_idx").on(table.availability),
  ],
);

export const partnerServiceAreasTable = pgTable(
  "partner_service_areas",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    suburb: text("suburb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("partner_service_areas_partner_suburb_uidx").on(
      table.partnerId,
      table.suburb,
    ),
    index("partner_service_areas_partner_id_idx").on(table.partnerId),
  ],
);

export const partnerServicesTable = pgTable(
  "partner_services",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("partner_services_partner_service_uidx").on(
      table.partnerId,
      table.service,
    ),
    index("partner_services_partner_id_idx").on(table.partnerId),
  ],
);

export const dispatchOffersTable = pgTable(
  "dispatch_offers",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    state: dispatchStateEnum("state").notNull().default("pending"),
    offeredAt: timestamp("offered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    eta: text("eta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dispatch_offers_job_id_idx").on(table.jobId),
    index("dispatch_offers_partner_id_idx").on(table.partnerId),
    index("dispatch_offers_state_idx").on(table.state),
    uniqueIndex("dispatch_offers_one_active_per_job_uidx")
      .on(table.jobId)
      .where(sql`state IN ('pending', 'accepted')`),
  ],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    dispatchOfferId: integer("dispatch_offer_id").references(
      () => dispatchOffersTable.id,
      { onDelete: "cascade" },
    ),
    recipientType: text("recipient_type").notNull(),
    type: text("type").notNull(),
    channel: text("channel").notNull().default("email"),
    status: notificationStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("notifications_idempotency_key_uidx").on(table.idempotencyKey),
    index("notifications_job_id_idx").on(table.jobId),
    index("notifications_dispatch_offer_id_idx").on(table.dispatchOfferId),
    index("notifications_status_idx").on(table.status),
  ],
);
