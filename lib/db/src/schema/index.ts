import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

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

export const jobsTable = pgTable(
	"jobs",
	{
		id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
		reference: varchar("reference", { length: 32 }).notNull(),
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
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("jobs_reference_uidx").on(table.reference),
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
	],
);

export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type PartnerStatus = (typeof partnerStatusEnum.enumValues)[number];
export type DispatchState = (typeof dispatchStateEnum.enumValues)[number];

export type JobRecord = typeof jobsTable.$inferSelect;
export type PartnerRecord = typeof partnersTable.$inferSelect;
export type DispatchOfferRecord = typeof dispatchOffersTable.$inferSelect;