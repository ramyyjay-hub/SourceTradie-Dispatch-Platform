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
  "awaiting_customer_confirmation",
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

// Paid AI-dispatch lifecycle. Additive and separate from `job_status`
// (which drives the existing partner-dispatch/SMS-offer flow) so this
// can be introduced without touching that flow's semantics.
export const paidFlowStateEnum = pgEnum("paid_flow_state", [
  "not_started",
  "serviceable",
  "manual_review",
  "unsupported",
  "checkout_started",
  "payment_confirmed",
  "sourcing",
  "match_ready",
  "approved",
  "completed",
  "sourcing_failed",
  "refund_pending",
  "refunded",
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
    pricingRuleCode: text("pricing_rule_code"),
    pricingVersion: text("pricing_version"),
    expectedPriceKind: text("expected_price_kind"),
    expectedPriceMinCents: integer("expected_price_min_cents"),
    expectedPriceMaxCents: integer("expected_price_max_cents"),
    expectedPriceLabel: text("expected_price_label"),
    expectedPriceScope: text("expected_price_scope"),
    sourcingPaused: boolean("sourcing_paused").notNull().default(false),
    classificationOverride: text("classification_override"),
    sourcingOperatorNote: text("sourcing_operator_note"),
    paidFlowState: paidFlowStateEnum("paid_flow_state")
      .notNull()
      .default("not_started"),
    serviceabilityCheckedAt: timestamp("serviceability_checked_at", {
      withTimezone: true,
    }),
    serviceabilityReason: text("serviceability_reason"),
    matchedProviderName: text("matched_provider_name"),
    matchedProviderPhone: text("matched_provider_phone"),
    matchedProviderPriceMinCents: integer("matched_provider_price_min_cents"),
    matchedProviderPriceMaxCents: integer("matched_provider_price_max_cents"),
    matchedProviderEta: text("matched_provider_eta"),
    matchedProviderNotes: text("matched_provider_notes"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
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
    index("jobs_paid_flow_state_idx").on(table.paidFlowState),
  ],
);

export const jobPaymentsTable = pgTable(
  "job_payments",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeRefundId: text("stripe_refund_id"),
    amountCents: integer("amount_cents").notNull().default(2999),
    currency: text("currency").notNull().default("aud"),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    testMode: boolean("test_mode").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("job_payments_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("job_payments_checkout_session_uidx")
      .on(table.stripeCheckoutSessionId)
      .where(sql`stripe_checkout_session_id IS NOT NULL`),
    index("job_payments_job_id_idx").on(table.jobId),
    index("job_payments_status_idx").on(table.status),
  ],
);

export const jobPaymentEventsTable = pgTable(
  "job_payment_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    jobId: integer("job_id").references(() => jobsTable.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("job_payment_events_stripe_event_uidx").on(
      table.stripeEventId,
    ),
    index("job_payment_events_job_id_idx").on(table.jobId),
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
    storageObjectKey: text("storage_object_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("job_images_job_id_idx").on(table.jobId),
    uniqueIndex("job_images_job_id_name_uidx").on(table.jobId, table.imageName),
    uniqueIndex("job_images_storage_object_key_uidx").on(
      table.storageObjectKey,
    ),
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
    applicationSubmissionId: uuid("application_submission_id"),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    abn: text("abn"),
    trade: text("trade").notNull(),
    licence: text("licence"),
    mobile: text("mobile").notNull(),
    mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
    jobOfferSmsConsentAt: timestamp("job_offer_sms_consent_at", {
      withTimezone: true,
    }),
    acquisitionUtmSource: text("acquisition_utm_source"),
    acquisitionUtmMedium: text("acquisition_utm_medium"),
    acquisitionUtmCampaign: text("acquisition_utm_campaign"),
    email: text("email").notNull(),
    radiusKm: integer("radius_km").notNull().default(15),
    emergencyJobs: boolean("emergency_jobs").notNull().default(false),
    availability: boolean("availability").notNull().default(false),
    status: partnerStatusEnum("status").notNull().default("pending"),
    applicationNotificationStatus: notificationStatusEnum(
      "application_notification_status",
    )
      .notNull()
      .default("pending"),
    applicationNotificationProviderMessageId: text(
      "application_notification_provider_message_id",
    ),
    applicationNotificationErrorCode: text(
      "application_notification_error_code",
    ),
    applicationNotificationSentAt: timestamp(
      "application_notification_sent_at",
      { withTimezone: true },
    ),
    applicationAcknowledgementStatus: notificationStatusEnum(
      "application_acknowledgement_status",
    )
      .notNull()
      .default("pending"),
    applicationAcknowledgementProviderMessageId: text(
      "application_acknowledgement_provider_message_id",
    ),
    applicationAcknowledgementErrorCode: text(
      "application_acknowledgement_error_code",
    ),
    applicationAcknowledgementSentAt: timestamp(
      "application_acknowledgement_sent_at",
      { withTimezone: true },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("partners_auth_user_id_uidx").on(table.authUserId),
    uniqueIndex("partners_application_submission_id_uidx")
      .on(table.applicationSubmissionId)
      .where(sql`application_submission_id IS NOT NULL`),
    index("partners_status_idx").on(table.status),
    index("partners_availability_idx").on(table.availability),
  ],
);

export const partnerFunnelEventsTable = pgTable(
  "partner_funnel_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    sessionId: uuid("session_id").notNull(),
    eventType: text("event_type").notNull(),
    applicationSubmissionId: uuid("application_submission_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("partner_funnel_events_session_event_uidx").on(
      table.sessionId,
      table.eventType,
    ),
    index("partner_funnel_events_created_at_idx").on(table.createdAt),
    index("partner_funnel_events_campaign_idx").on(table.utmCampaign),
  ],
);

export const homeownerFunnelEventsTable = pgTable(
  "homeowner_funnel_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    sessionId: uuid("session_id").notNull(),
    eventType: text("event_type").notNull(),
    jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("homeowner_funnel_events_session_event_uidx").on(table.sessionId, table.eventType),
    index("homeowner_funnel_events_job_id_idx").on(table.jobId),
    index("homeowner_funnel_events_created_at_idx").on(table.createdAt),
  ],
);

export const candidateProvidersTable = pgTable(
  "candidate_providers",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    businessName: text("business_name").notNull(),
    /** Other registered/trading names this same identity operates under (e.g. ABN-verified trading names). */
    tradingNames: jsonb("trading_names").$type<string[]>().notNull().default([]),
    contactName: text("contact_name"),
    trade: text("trade").notNull(),
    subServices: jsonb("sub_services").$type<string[]>().notNull().default([]),
    phone: text("phone").notNull(),
    normalizedPhone: text("normalized_phone").notNull(),
    website: text("website"),
    serviceSuburbs: jsonb("service_suburbs").$type<string[]>().notNull().default([]),
    servicePostcodes: jsonb("service_postcodes").$type<string[]>().notNull().default([]),
    normalHours: text("normal_hours"),
    afterHoursAvailable: boolean("after_hours_available").notNull().default(false),
    licenceDetails: text("licence_details"),
    licenceStatus: text("licence_status").notNull().default("not_checked"),
    insuranceStatus: text("insurance_status").notNull().default("not_checked"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    verificationStatus: text("verification_status").notNull().default("candidate"),
    // Hard safety gate: automated outreach (when built) must only ever
    // contact candidates where this is explicitly not "manual_only".
    // Defaults closed -- every imported candidate starts manual-only.
    contactEligibility: text("contact_eligibility").notNull().default("manual_only"),
    outreachStatus: text("outreach_status").notNull().default("not_contacted"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    optedOutReason: text("opted_out_reason"),
    consentResetAt: timestamp("consent_reset_at", { withTimezone: true }),
    consentResetByAuthUserId: uuid("consent_reset_by_auth_user_id"),
    consentResetReason: text("consent_reset_reason"),
    responseCount: integer("response_count").notNull().default(0),
    acceptanceCount: integer("acceptance_count").notNull().default(0),
    tier: text("tier").notNull().default("candidate"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("candidate_providers_normalized_phone_uidx").on(table.normalizedPhone),
    index("candidate_providers_trade_idx").on(table.trade),
    index("candidate_providers_outreach_idx").on(table.outreachStatus),
    index("candidate_providers_contact_eligibility_idx").on(table.contactEligibility),
  ],
);

/**
 * One row per top-level trade a candidate provider genuinely services.
 * Lets ranking discover the same provider identity under every trade it
 * covers (e.g. an electrician who also does heating & cooling), without
 * duplicating the provider or creating a second outreach-able entity --
 * outreach and DNC/opt-out state always key off candidateProviderId, never
 * off a row in this table. The legacy single `trade` column on
 * candidate_providers is kept for backward compatibility; this table is
 * additive alongside it, not a replacement.
 */
export const candidateProviderTradesTable = pgTable(
  "candidate_provider_trades",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    candidateProviderId: integer("candidate_provider_id")
      .notNull()
      .references(() => candidateProvidersTable.id, { onDelete: "cascade" }),
    trade: text("trade").notNull(),
    /** Trading name to show customers for this specific capability, if it differs from businessName. */
    tradingName: text("trading_name"),
    /** The public source that supports THIS trade capability specifically (may differ from the provider's general source_url for multi-trade identities). */
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("candidate_provider_trades_provider_trade_uidx").on(
      table.candidateProviderId,
      table.trade,
    ),
    index("candidate_provider_trades_trade_idx").on(table.trade),
    index("candidate_provider_trades_provider_id_idx").on(table.candidateProviderId),
  ],
);

export const providerOutreachAttemptsTable = pgTable(
  "provider_outreach_attempts",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
    candidateProviderId: integer("candidate_provider_id").references(() => candidateProvidersTable.id, { onDelete: "restrict" }),
    partnerId: integer("partner_id").references(() => partnersTable.id, { onDelete: "restrict" }),
    channel: text("channel").notNull().default("sms"),
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    inboundProviderMessageId: text("inbound_provider_message_id"),
    responseCode: text("response_code"),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull(),
    timeoutAt: timestamp("timeout_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("provider_outreach_attempts_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("provider_outreach_attempts_inbound_message_uidx")
      .on(table.inboundProviderMessageId)
      .where(sql`inbound_provider_message_id IS NOT NULL`),
    uniqueIndex("provider_outreach_one_active_per_job_uidx").on(table.jobId).where(sql`status IN ('queued', 'sent', 'awaiting_response', 'accepted')`),
    index("provider_outreach_attempts_job_idx").on(table.jobId),
  ],
);

export const operationalSettingsTable = pgTable("operational_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    confirmedPriceKind: text("confirmed_price_kind"),
    confirmedPriceCents: integer("confirmed_price_cents"),
    customerConfirmedAt: timestamp("customer_confirmed_at", {
      withTimezone: true,
    }),
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
