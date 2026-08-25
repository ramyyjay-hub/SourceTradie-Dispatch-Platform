import crypto from "node:crypto";
import {
  appUsersTable,
  dispatchOffersTable,
  dispatchStateEnum,
  jobAiAssessmentsTable,
  jobImagesTable,
  jobIntakeSubmissionsTable,
  jobsTable,
  jobStatusEnum,
  jobStatusHistoryTable,
  notificationsTable,
  partnerServiceAreasTable,
  partnersTable,
  partnerServicesTable,
} from "@workspace/db/schema";
import type { db as WorkspaceDb } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  createServerAiProvider,
  SafeJobAssessmentService,
  type JobAiProvider,
  type StoredAssessment,
} from "./job-ai-provider";
import { classifySafety } from "./safety-classifier";
import {
  matchMelbournePricing,
  type PriceKind,
  type PricingPreview,
} from "./pricing";
import {
  createNotificationProvider,
  type NotificationProvider,
} from "./notification-provider";

type DbLike = typeof WorkspaceDb;

export type JobApi = {
  id: number;
  reference: string;
  description: string;
  trade: string;
  suburb: string;
  postcode: string;
  urgency: string;
  preferredTime: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceAddressLine1: string | null;
  serviceAddressLine2: string | null;
  createdAt: string;
  images: string[];
  assessment: JobAssessmentApi | null;
  expectedPrice: PricingPreview | null;
};

export type CreatedJobApi = JobApi & {
  statusAccessToken: string;
};

export type PublicJobStatusApi = {
  reference: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  intake: {
    description: string;
    trade: string;
    suburb: string;
    postcode: string;
    urgency: string;
    preferredTime: string;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    serviceAddressLine1: string;
    serviceAddressLine2: string | null;
  };
  assessment: JobAssessmentApi | null;
  expectedPrice: PricingPreview | null;
  acceptedTradie: {
    businessName: string;
    contactName: string;
    eta: string | null;
    confirmedPriceKind: PriceKind | null;
    confirmedPriceCents: number | null;
    customerConfirmed: boolean;
  } | null;
};

export type JobAssessmentApi = {
  outcome: string;
  provider: string;
  model: string | null;
  safetyCodes: string[];
  assessment: StoredAssessment;
  createdAt: string;
};

export type PartnerRecommendationApi = {
  partnerId: number;
  score: number;
  eligible: boolean;
  codes: string[];
  disqualifications: string[];
};

export type PartnerApi = {
  id: number;
  businessName: string;
  contactName: string;
  abn: string | null;
  trade: string;
  suburbs: string[];
  radiusKm: number;
  availability: boolean;
  status: string;
  services: string[];
  emergencyJobs: boolean;
};

export type DispatchApi = {
  id: number;
  jobId: number;
  businessId: number;
  decision: string;
  offeredAt: string;
  respondedAt: string | null;
  eta: string | null;
  confirmedPriceKind: PriceKind | null;
  confirmedPriceCents: number | null;
  customerConfirmedAt: string | null;
};

export type AdminSummaryApi = {
  newRequests: number;
  awaitingDispatch: number;
  tradieApplications: number;
  approvedTradies: number;
  availableTradies: number;
  sentOpportunities: number;
  acceptedJobs: number;
  declinedJobs: number;
  completedJobs: number;
};

export type PrincipalRecord = {
  authUserId: string;
  role: "partner" | "admin";
  isActive: boolean;
  partnerId: number | null;
};

export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type DispatchState = (typeof dispatchStateEnum.enumValues)[number];

const jobStatusTransitions: Record<JobStatus, JobStatus[]> = {
  new: ["reviewing", "cancelled"],
  reviewing: ["awaiting_dispatch", "cancelled"],
  awaiting_dispatch: ["dispatching", "cancelled"],
  dispatching: [
    "awaiting_customer_confirmation",
    "awaiting_dispatch",
    "cancelled",
  ],
  awaiting_customer_confirmation: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const dispatchStateTransitions: Record<DispatchState, DispatchState[]> = {
  pending: ["accepted", "declined", "expired", "cancelled"],
  accepted: [],
  declined: [],
  expired: [],
  cancelled: [],
};

const dispatchTerminalStates = new Set<DispatchState>([
  "accepted",
  "declined",
  "expired",
  "cancelled",
]);

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function isJobStatus(value: string): value is JobStatus {
  return (jobStatusEnum.enumValues as string[]).includes(value);
}

function isDispatchState(value: string): value is DispatchState {
  return (dispatchStateEnum.enumValues as string[]).includes(value);
}

function createStatusToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function canTransitionJobStatus(
  from: JobStatus,
  to: JobStatus,
): boolean {
  if (from === to) return true;
  return jobStatusTransitions[from].includes(to);
}

export function canTransitionDispatchState(
  from: DispatchState,
  to: DispatchState,
): boolean {
  if (from === to) return true;
  return dispatchStateTransitions[from].includes(to);
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export class SourceTradieRepository {
  private readonly assessmentService: SafeJobAssessmentService;

  constructor(
    private readonly database: DbLike,
    provider?: JobAiProvider,
    private readonly notificationProvider: NotificationProvider = createNotificationProvider(),
  ) {
    this.assessmentService = new SafeJobAssessmentService(
      provider ?? createServerAiProvider(),
    );
  }

  private async sendNotification(input: {
    jobId: number;
    dispatchOfferId: number;
    recipientType: "partner" | "customer";
    type: "offer_created" | "price_ready" | "customer_confirmed";
    idempotencyKey: string;
    to: string | null;
    subject: string;
    text: string;
  }): Promise<"pending" | "sent" | "delivered" | "failed"> {
    const now = new Date();
    const inserted = await this.database
      .insert(notificationsTable)
      .values({
        jobId: input.jobId,
        dispatchOfferId: input.dispatchOfferId,
        recipientType: input.recipientType,
        type: input.type,
        channel: "email",
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: notificationsTable.idempotencyKey })
      .returning({ id: notificationsTable.id });
    if (!inserted[0]) {
      const existing = await this.database
        .select({ status: notificationsTable.status })
        .from(notificationsTable)
        .where(eq(notificationsTable.idempotencyKey, input.idempotencyKey))
        .limit(1);
      return existing[0]?.status ?? "failed";
    }
    const result = input.to
      ? await this.notificationProvider.sendEmail({
          to: input.to,
          subject: input.subject,
          text: input.text,
        })
      : { ok: false as const, errorCode: "recipient_email_missing" };
    const status = result.ok ? "sent" : "failed";
    await this.database
      .update(notificationsTable)
      .set({
        status,
        providerMessageId: result.ok ? result.providerMessageId : null,
        errorCode: result.ok ? null : result.errorCode,
        sentAt: result.ok ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(notificationsTable.id, inserted[0].id));
    return status;
  }

  private async getJobImages(jobIds: number[]) {
    if (!jobIds.length) return new Map<number, string[]>();

    const rows = await this.database
      .select({
        jobId: jobImagesTable.jobId,
        imageName: jobImagesTable.imageName,
      })
      .from(jobImagesTable)
      .where(inArray(jobImagesTable.jobId, jobIds));

    const byJobId = new Map<number, string[]>();
    for (const row of rows) {
      const current = byJobId.get(row.jobId) ?? [];
      current.push(row.imageName);
      byJobId.set(row.jobId, current);
    }

    return byJobId;
  }

  private toJobApi(
    row: typeof jobsTable.$inferSelect,
    images: string[],
    assessment: JobAssessmentApi | null = null,
  ): JobApi {
    return {
      id: row.id,
      reference: row.reference,
      description: row.description,
      trade: row.trade,
      suburb: row.suburb,
      postcode: row.postcode,
      urgency: row.urgency,
      preferredTime: row.preferredTime,
      status: row.status,
      customerName: row.customerName,
      customerPhone: row.customerPhone ?? null,
      customerEmail: row.customerEmail ?? null,
      serviceAddressLine1: row.serviceAddressLine1 ?? null,
      serviceAddressLine2: row.serviceAddressLine2 ?? null,
      createdAt: toIso(row.createdAt),
      images,
      assessment,
      expectedPrice: this.pricingFromJob(row),
    };
  }

  private pricingFromJob(
    row: typeof jobsTable.$inferSelect,
  ): PricingPreview | null {
    if (
      !row.pricingRuleCode ||
      !row.pricingVersion ||
      !row.expectedPriceKind ||
      !row.expectedPriceMinCents ||
      !row.expectedPriceMaxCents ||
      !row.expectedPriceLabel ||
      !row.expectedPriceScope
    ) {
      return null;
    }
    return {
      code: row.pricingRuleCode,
      version: row.pricingVersion as PricingPreview["version"],
      kind: row.expectedPriceKind as PriceKind,
      minCents: row.expectedPriceMinCents,
      maxCents: row.expectedPriceMaxCents,
      customerLabel: row.expectedPriceLabel,
      scope: row.expectedPriceScope,
    };
  }

  private async getLatestAssessments(
    jobIds: number[],
  ): Promise<Map<number, JobAssessmentApi>> {
    if (!jobIds.length) return new Map();
    const rows = await this.database
      .select()
      .from(jobAiAssessmentsTable)
      .where(inArray(jobAiAssessmentsTable.jobId, jobIds))
      .orderBy(
        desc(jobAiAssessmentsTable.createdAt),
        desc(jobAiAssessmentsTable.id),
      );
    const latest = new Map<number, JobAssessmentApi>();
    for (const row of rows) {
      if (latest.has(row.jobId)) continue;
      latest.set(row.jobId, {
        outcome: row.outcome,
        provider: row.provider,
        model: row.model ?? null,
        safetyCodes: row.safetyCodes,
        assessment: row.assessment as StoredAssessment,
        createdAt: toIso(row.createdAt),
      });
    }
    return latest;
  }

  private async assessSubmission(input: {
    jobId: number;
    submissionId: number;
    description: string;
    trade: string;
    suburb: string;
    postcode: string;
    urgency: string;
    preferredAttendanceTime: string;
    photoCount: number;
  }): Promise<JobAssessmentApi> {
    const safety = classifySafety(input.description);
    const result = await this.assessmentService.assess({
      description: input.description,
      trade: input.trade,
      suburb: input.suburb,
      postcode: input.postcode,
      urgency: input.urgency,
      preferredAttendanceTime: input.preferredAttendanceTime,
      photoContext: {
        provided: input.photoCount > 0,
        count: input.photoCount,
      },
      safety,
    });
    const rows = await this.database
      .insert(jobAiAssessmentsTable)
      .values({
        jobId: input.jobId,
        submissionId: input.submissionId,
        provider: result.provider,
        model: result.model,
        outcome: result.outcome,
        safetyCodes: safety.codes,
        assessment: result.assessment,
      })
      .returning();
    const row = rows[0]!;
    return {
      outcome: row.outcome,
      provider: row.provider,
      model: row.model ?? null,
      safetyCodes: row.safetyCodes,
      assessment: row.assessment as StoredAssessment,
      createdAt: toIso(row.createdAt),
    };
  }

  async findPrincipalByAuthUserId(
    authUserId: string,
  ): Promise<PrincipalRecord | null> {
    const rows = await this.database
      .select({
        authUserId: appUsersTable.authUserId,
        role: appUsersTable.role,
        isActive: appUsersTable.isActive,
        partnerId: partnersTable.id,
      })
      .from(appUsersTable)
      .leftJoin(
        partnersTable,
        eq(partnersTable.authUserId, appUsersTable.authUserId),
      )
      .where(eq(appUsersTable.authUserId, authUserId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      authUserId: row.authUserId,
      role: row.role,
      isActive: row.isActive,
      partnerId: row.partnerId,
    };
  }

  async listJobs(): Promise<JobApi[]> {
    const rows = await this.database
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt));

    const imagesByJobId = await this.getJobImages(rows.map((row) => row.id));
    const assessmentsByJobId = await this.getLatestAssessments(
      rows.map((row) => row.id),
    );

    return rows.map((row) =>
      this.toJobApi(
        row,
        imagesByJobId.get(row.id) ?? [],
        assessmentsByJobId.get(row.id) ?? null,
      ),
    );
  }

  async createJob(input: {
    description: string;
    trade: string;
    suburb: string;
    postcode: string;
    urgency: string;
    preferredTime: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    serviceAddressLine1?: string;
    serviceAddressLine2?: string;
    images?: string[];
  }): Promise<CreatedJobApi> {
    const pricing = matchMelbournePricing(input);
    const created = await this.database.transaction(async (tx) => {
      const now = new Date();
      const placeholderReference = `ST-PENDING-${now.getTime()}-${Math.floor(
        Math.random() * 10000,
      )}`;
      const statusAccessToken = createStatusToken();

      const insertedRows = await tx
        .insert(jobsTable)
        .values({
          reference: placeholderReference,
          publicStatusToken: statusAccessToken,
          description: input.description,
          trade: input.trade,
          suburb: input.suburb,
          postcode: input.postcode,
          urgency: input.urgency,
          preferredTime: input.preferredTime,
          customerName: input.customerName,
          customerPhone: input.customerPhone ?? null,
          customerEmail: input.customerEmail ?? null,
          serviceAddressLine1: input.serviceAddressLine1 ?? null,
          serviceAddressLine2: input.serviceAddressLine2 ?? null,
          pricingRuleCode: pricing.code,
          pricingVersion: pricing.version,
          expectedPriceKind: pricing.kind,
          expectedPriceMinCents: pricing.minCents,
          expectedPriceMaxCents: pricing.maxCents,
          expectedPriceLabel: pricing.customerLabel,
          expectedPriceScope: pricing.scope,
          status: "awaiting_dispatch",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const inserted = insertedRows[0];
      const reference = `ST-${inserted.id}`;

      const updatedRows = await tx
        .update(jobsTable)
        .set({ reference, updatedAt: now })
        .where(eq(jobsTable.id, inserted.id))
        .returning();

      const updated = updatedRows[0];
      const imageNames = uniqueNormalized(input.images ?? []);

      if (imageNames.length > 0) {
        await tx.insert(jobImagesTable).values(
          imageNames.map((imageName) => ({
            jobId: updated.id,
            imageName,
            createdAt: now,
          })),
        );
      }

      await tx.insert(jobStatusHistoryTable).values({
        jobId: updated.id,
        fromStatus: null,
        toStatus: updated.status,
        note: "job_submitted",
        createdAt: now,
      });
      const submissionRows = await tx
        .insert(jobIntakeSubmissionsTable)
        .values({
          jobId: updated.id,
          customerConfirmedValues: {
            description: input.description,
            trade: input.trade,
            suburb: input.suburb,
            postcode: input.postcode,
            urgency: input.urgency,
            preferredTime: input.preferredTime,
            customerName: input.customerName,
            customerPhone: input.customerPhone ?? null,
            customerEmail: input.customerEmail ?? null,
            serviceAddressLine1: input.serviceAddressLine1 ?? null,
            serviceAddressLine2: input.serviceAddressLine2 ?? null,
            images: imageNames,
          },
          createdAt: now,
        })
        .returning({ id: jobIntakeSubmissionsTable.id });

      return {
        job: updated,
        images: imageNames,
        statusAccessToken,
        submissionId: submissionRows[0]!.id,
      };
    });
    const assessment = await this.assessSubmission({
      jobId: created.job.id,
      submissionId: created.submissionId,
      description: input.description,
      trade: input.trade,
      suburb: input.suburb,
      postcode: input.postcode,
      urgency: input.urgency,
      preferredAttendanceTime: input.preferredTime,
      photoCount: created.images.length,
    });
    return {
      ...this.toJobApi(created.job, created.images, assessment),
      statusAccessToken: created.statusAccessToken,
    };
  }

  async getJob(id: number): Promise<JobApi | null> {
    const rows = await this.database
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const imagesByJobId = await this.getJobImages([id]);
    const assessmentsByJobId = await this.getLatestAssessments([id]);
    return this.toJobApi(
      row,
      imagesByJobId.get(id) ?? [],
      assessmentsByJobId.get(id) ?? null,
    );
  }

  async jobExistsForStatusToken(
    jobId: number,
    token: string,
  ): Promise<boolean> {
    const rows = await this.database
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(
        and(eq(jobsTable.id, jobId), eq(jobsTable.publicStatusToken, token)),
      )
      .limit(1);
    return Boolean(rows[0]);
  }

  async countStoredJobPhotos(jobId: number): Promise<number> {
    const rows = await this.database
      .select({ id: jobImagesTable.id })
      .from(jobImagesTable)
      .where(
        and(
          eq(jobImagesTable.jobId, jobId),
          sql`${jobImagesTable.storageObjectKey} is not null`,
        ),
      );
    return rows.length;
  }

  async addStoredJobPhotos(
    jobId: number,
    photos: Array<{ objectKey: string }>,
  ) {
    if (!photos.length) return [];
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select ${jobsTable.id} from ${jobsTable} where ${jobsTable.id} = ${jobId} for update`,
      );
      const existing = await tx
        .select({ id: jobImagesTable.id })
        .from(jobImagesTable)
        .where(
          and(
            eq(jobImagesTable.jobId, jobId),
            sql`${jobImagesTable.storageObjectKey} is not null`,
          ),
        );
      if (existing.length + photos.length > 3)
        throw new Error("job_photo_limit");
      return tx
        .insert(jobImagesTable)
        .values(
          photos.map(({ objectKey }) => ({
            jobId,
            imageName: `photo-${crypto.randomUUID()}.webp`,
            storageObjectKey: objectKey,
            createdAt: new Date(),
          })),
        )
        .returning({ id: jobImagesTable.id });
    });
  }

  async removeStoredJobPhotos(photoIds: number[]): Promise<void> {
    if (!photoIds.length) return;
    await this.database
      .delete(jobImagesTable)
      .where(inArray(jobImagesTable.id, photoIds));
  }

  async getPublicJobStatusByToken(
    jobId: number,
    token: string,
  ): Promise<PublicJobStatusApi | null> {
    const rows = await this.database
      .select()
      .from(jobsTable)
      .where(
        and(eq(jobsTable.id, jobId), eq(jobsTable.publicStatusToken, token)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const assessmentsByJobId = await this.getLatestAssessments([row.id]);
    const acceptedRows =
      row.status === "awaiting_customer_confirmation" ||
      row.status === "accepted" ||
      row.status === "in_progress" ||
      row.status === "completed"
        ? await this.database
            .select({
              businessName: partnersTable.businessName,
              contactName: partnersTable.contactName,
              eta: dispatchOffersTable.eta,
              confirmedPriceKind: dispatchOffersTable.confirmedPriceKind,
              confirmedPriceCents: dispatchOffersTable.confirmedPriceCents,
              customerConfirmedAt: dispatchOffersTable.customerConfirmedAt,
            })
            .from(dispatchOffersTable)
            .innerJoin(
              partnersTable,
              eq(partnersTable.id, dispatchOffersTable.partnerId),
            )
            .where(
              and(
                eq(dispatchOffersTable.jobId, row.id),
                eq(dispatchOffersTable.state, "accepted"),
              ),
            )
            .limit(1)
        : [];
    const accepted = acceptedRows[0];
    return {
      reference: row.reference,
      status: row.status,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      intake: {
        description: row.description,
        trade: row.trade,
        suburb: row.suburb,
        postcode: row.postcode,
        urgency: row.urgency,
        preferredTime: row.preferredTime,
        customerName: row.customerName,
        customerPhone: row.customerPhone ?? null,
        customerEmail: row.customerEmail ?? null,
        serviceAddressLine1: row.serviceAddressLine1 ?? "",
        serviceAddressLine2: row.serviceAddressLine2 ?? null,
      },
      assessment: assessmentsByJobId.get(row.id) ?? null,
      expectedPrice: this.pricingFromJob(row),
      acceptedTradie: accepted
        ? {
            businessName: accepted.businessName,
            contactName: accepted.contactName,
            eta: accepted.eta ?? null,
            confirmedPriceKind: accepted.confirmedPriceKind as PriceKind | null,
            confirmedPriceCents: accepted.confirmedPriceCents ?? null,
            customerConfirmed: Boolean(accepted.customerConfirmedAt),
          }
        : null,
    };
  }

  async correctJobIntake(
    jobId: number,
    token: string,
    input: {
      description: string;
      trade: string;
      suburb: string;
      postcode: string;
      urgency: string;
      preferredTime: string;
      customerName: string;
      customerPhone?: string;
      customerEmail?: string;
      serviceAddressLine1?: string;
      serviceAddressLine2?: string;
    },
  ): Promise<PublicJobStatusApi | null> {
    const pricing = matchMelbournePricing(input);
    const currentRows = await this.database
      .select()
      .from(jobsTable)
      .where(
        and(eq(jobsTable.id, jobId), eq(jobsTable.publicStatusToken, token)),
      )
      .limit(1);
    const current = currentRows[0];
    if (!current) return null;

    const created = await this.database.transaction(async (tx) => {
      const now = new Date();
      const updatedRows = await tx
        .update(jobsTable)
        .set({
          description: input.description,
          trade: input.trade,
          suburb: input.suburb,
          postcode: input.postcode,
          urgency: input.urgency,
          preferredTime: input.preferredTime,
          customerName: input.customerName,
          customerPhone: input.customerPhone ?? null,
          customerEmail: input.customerEmail ?? null,
          serviceAddressLine1: input.serviceAddressLine1 ?? null,
          serviceAddressLine2: input.serviceAddressLine2 ?? null,
          pricingRuleCode: pricing.code,
          pricingVersion: pricing.version,
          expectedPriceKind: pricing.kind,
          expectedPriceMinCents: pricing.minCents,
          expectedPriceMaxCents: pricing.maxCents,
          expectedPriceLabel: pricing.customerLabel,
          expectedPriceScope: pricing.scope,
          updatedAt: now,
        })
        .where(eq(jobsTable.id, jobId))
        .returning();
      const submissionRows = await tx
        .insert(jobIntakeSubmissionsTable)
        .values({
          jobId,
          customerConfirmedValues: {
            description: input.description,
            trade: input.trade,
            suburb: input.suburb,
            postcode: input.postcode,
            urgency: input.urgency,
            preferredTime: input.preferredTime,
            customerName: input.customerName,
            customerPhone: input.customerPhone ?? null,
            customerEmail: input.customerEmail ?? null,
            serviceAddressLine1: input.serviceAddressLine1 ?? null,
            serviceAddressLine2: input.serviceAddressLine2 ?? null,
          },
          createdAt: now,
        })
        .returning({ id: jobIntakeSubmissionsTable.id });
      return { job: updatedRows[0]!, submissionId: submissionRows[0]!.id };
    });
    await this.assessSubmission({
      jobId,
      submissionId: created.submissionId,
      description: input.description,
      trade: input.trade,
      suburb: input.suburb,
      postcode: input.postcode,
      urgency: input.urgency,
      preferredAttendanceTime: input.preferredTime,
      photoCount: (await this.getJobImages([jobId])).get(jobId)?.length ?? 0,
    });
    return this.getPublicJobStatusByToken(jobId, token);
  }

  async updateJobStatus(
    id: number,
    nextStatus: string,
  ): Promise<
    | { kind: "ok"; job: JobApi }
    | { kind: "not_found" }
    | { kind: "invalid_status" }
    | { kind: "invalid_transition"; from: string; to: string }
  > {
    if (!isJobStatus(nextStatus)) {
      return { kind: "invalid_status" };
    }

    const rows = await this.database
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return { kind: "not_found" };

    if (!canTransitionJobStatus(row.status, nextStatus)) {
      return {
        kind: "invalid_transition",
        from: row.status,
        to: nextStatus,
      };
    }

    const now = new Date();

    const updatedRows = await this.database
      .update(jobsTable)
      .set({ status: nextStatus, updatedAt: now })
      .where(eq(jobsTable.id, id))
      .returning();

    const updated = updatedRows[0];

    await this.database.insert(jobStatusHistoryTable).values({
      jobId: id,
      fromStatus: row.status,
      toStatus: nextStatus,
      note: "manual_status_update",
      createdAt: now,
    });

    const imagesByJobId = await this.getJobImages([id]);
    const assessmentsByJobId = await this.getLatestAssessments([id]);

    return {
      kind: "ok",
      job: this.toJobApi(
        updated,
        imagesByJobId.get(id) ?? [],
        assessmentsByJobId.get(id) ?? null,
      ),
    };
  }

  async listPartners(): Promise<PartnerApi[]> {
    const partners = await this.database
      .select()
      .from(partnersTable)
      .orderBy(desc(partnersTable.createdAt));

    const partnerIds = partners.map((partner) => partner.id);

    const areas = partnerIds.length
      ? await this.database
          .select()
          .from(partnerServiceAreasTable)
          .where(inArray(partnerServiceAreasTable.partnerId, partnerIds))
      : [];

    const services = partnerIds.length
      ? await this.database
          .select()
          .from(partnerServicesTable)
          .where(inArray(partnerServicesTable.partnerId, partnerIds))
      : [];

    const suburbsByPartner = new Map<number, string[]>();
    for (const area of areas) {
      const current = suburbsByPartner.get(area.partnerId) ?? [];
      current.push(area.suburb);
      suburbsByPartner.set(area.partnerId, current);
    }

    const servicesByPartner = new Map<number, string[]>();
    for (const service of services) {
      const current = servicesByPartner.get(service.partnerId) ?? [];
      current.push(service.service);
      servicesByPartner.set(service.partnerId, current);
    }

    return partners.map((partner) => ({
      id: partner.id,
      businessName: partner.businessName,
      contactName: partner.contactName,
      abn: partner.abn ?? null,
      trade: partner.trade,
      suburbs: suburbsByPartner.get(partner.id) ?? [],
      radiusKm: partner.radiusKm,
      availability: partner.availability,
      status: partner.status,
      services: servicesByPartner.get(partner.id) ?? [],
      emergencyJobs: partner.emergencyJobs,
    }));
  }

  async listPartnersForPartner(partnerId: number): Promise<PartnerApi[]> {
    const all = await this.listPartners();
    return all.filter((partner) => partner.id === partnerId);
  }

  async listJobsAwaitingDispatch(): Promise<JobApi[]> {
    const rows = await this.database
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.status, "awaiting_dispatch"))
      .orderBy(desc(jobsTable.createdAt));

    const imagesByJobId = await this.getJobImages(rows.map((row) => row.id));
    const assessmentsByJobId = await this.getLatestAssessments(
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      this.toJobApi(
        row,
        imagesByJobId.get(row.id) ?? [],
        assessmentsByJobId.get(row.id) ?? null,
      ),
    );
  }

  async getPartnerRecommendations(
    jobId: number,
  ): Promise<PartnerRecommendationApi[] | null> {
    const jobs = await this.database
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1);
    const job = jobs[0];
    if (!job) return null;
    const partners = await this.listPartners();
    const attemptedRows = await this.database
      .select({ partnerId: dispatchOffersTable.partnerId })
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.jobId, jobId));
    const attemptedPartnerIds = new Set(
      attemptedRows.map((row) => row.partnerId),
    );
    const normalized = (value: string) => value.trim().toLocaleLowerCase();
    const jobTrade = normalized(job.trade);
    const jobSuburb = normalized(job.suburb);
    const isEmergency = classifySafety(job.description).interruptFlow;

    return partners
      .map((partner) => {
        const codes: string[] = [];
        const disqualifications: string[] = [];
        if (attemptedPartnerIds.has(partner.id))
          disqualifications.push("ALREADY_ATTEMPTED");
        if (partner.status === "approved") codes.push("APPROVED");
        else disqualifications.push("NOT_APPROVED");
        if (partner.availability) codes.push("AVAILABLE");
        else disqualifications.push("UNAVAILABLE");
        if (normalized(partner.trade) === jobTrade) codes.push("TRADE_MATCH");
        else disqualifications.push("TRADE_MISMATCH");
        if (
          partner.suburbs.some((suburb) => normalized(suburb) === jobSuburb)
        ) {
          codes.push("SERVICE_AREA_MATCH");
        } else {
          disqualifications.push("OUT_OF_SERVICE_AREA");
        }
        if (isEmergency) {
          if (partner.emergencyJobs) codes.push("EMERGENCY_ENABLED");
          else disqualifications.push("EMERGENCY_NOT_ENABLED");
        }
        const eligible = disqualifications.length === 0;
        const score =
          (partner.status === "approved" ? 30 : 0) +
          (partner.availability ? 25 : 0) +
          (normalized(partner.trade) === jobTrade ? 25 : 0) +
          (partner.suburbs.some((suburb) => normalized(suburb) === jobSuburb)
            ? 20
            : 0) +
          (isEmergency && partner.emergencyJobs ? 10 : 0);
        return {
          partnerId: partner.id,
          score,
          eligible,
          codes,
          disqualifications,
          name: partner.businessName,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.name.localeCompare(right.name) ||
          left.partnerId - right.partnerId,
      )
      .map(({ name: _name, ...recommendation }) => recommendation);
  }

  async listApprovedPartners(trade?: string): Promise<PartnerApi[]> {
    const partnerRows = await this.database
      .select()
      .from(partnersTable)
      .where(
        trade
          ? and(
              eq(partnersTable.status, "approved"),
              eq(partnersTable.trade, trade),
            )
          : eq(partnersTable.status, "approved"),
      )
      .orderBy(desc(partnersTable.createdAt));

    const partnerIds = partnerRows.map((partner) => partner.id);

    const areas = partnerIds.length
      ? await this.database
          .select()
          .from(partnerServiceAreasTable)
          .where(inArray(partnerServiceAreasTable.partnerId, partnerIds))
      : [];

    const services = partnerIds.length
      ? await this.database
          .select()
          .from(partnerServicesTable)
          .where(inArray(partnerServicesTable.partnerId, partnerIds))
      : [];

    const suburbsByPartner = new Map<number, string[]>();
    for (const area of areas) {
      const current = suburbsByPartner.get(area.partnerId) ?? [];
      current.push(area.suburb);
      suburbsByPartner.set(area.partnerId, current);
    }

    const servicesByPartner = new Map<number, string[]>();
    for (const service of services) {
      const current = servicesByPartner.get(service.partnerId) ?? [];
      current.push(service.service);
      servicesByPartner.set(service.partnerId, current);
    }

    return partnerRows.map((partner) => ({
      id: partner.id,
      businessName: partner.businessName,
      contactName: partner.contactName,
      abn: partner.abn ?? null,
      trade: partner.trade,
      suburbs: suburbsByPartner.get(partner.id) ?? [],
      radiusKm: partner.radiusKm,
      availability: partner.availability,
      status: partner.status,
      services: servicesByPartner.get(partner.id) ?? [],
      emergencyJobs: partner.emergencyJobs,
    }));
  }

  async listDispatchOffers(filters?: {
    jobId?: number;
    partnerId?: number;
    state?: DispatchState;
  }): Promise<any[]> {
    const whereClauses = [] as any[];
    if (filters?.jobId !== undefined)
      whereClauses.push(eq(dispatchOffersTable.jobId, filters.jobId));
    if (filters?.partnerId !== undefined)
      whereClauses.push(eq(dispatchOffersTable.partnerId, filters.partnerId));
    if (filters?.state)
      whereClauses.push(eq(dispatchOffersTable.state, filters.state));

    const rows = await this.database
      .select()
      .from(dispatchOffersTable)
      .where(whereClauses.length ? and(...whereClauses) : undefined)
      .orderBy(desc(dispatchOffersTable.offeredAt));

    const jobIds = rows.map((row) => row.jobId);
    const partnerIds = rows.map((row) => row.partnerId);

    const jobs = jobIds.length
      ? await this.database
          .select()
          .from(jobsTable)
          .where(inArray(jobsTable.id, jobIds))
      : [];

    const partners = partnerIds.length
      ? await this.database
          .select()
          .from(partnersTable)
          .where(inArray(partnersTable.id, partnerIds))
      : [];

    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const partnersById = new Map(
      partners.map((partner) => [partner.id, partner]),
    );
    const notificationRows = rows.length
      ? await this.database
          .select({
            offerId: notificationsTable.dispatchOfferId,
            status: notificationsTable.status,
            type: notificationsTable.type,
          })
          .from(notificationsTable)
          .where(
            inArray(
              notificationsTable.dispatchOfferId,
              rows.map((row) => row.id),
            ),
          )
      : [];
    const notificationByOffer = new Map(
      notificationRows
        .filter((row) => row.type === "offer_created")
        .map((row) => [row.offerId, row.status]),
    );

    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      partnerId: row.partnerId,
      state: row.state,
      offeredAt: toIso(row.offeredAt),
      respondedAt: row.respondedAt ? toIso(row.respondedAt) : null,
      expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
      eta: row.eta ?? null,
      confirmedPriceKind: (row.confirmedPriceKind as PriceKind | null) ?? null,
      confirmedPriceCents: row.confirmedPriceCents ?? null,
      customerConfirmedAt: row.customerConfirmedAt
        ? toIso(row.customerConfirmedAt)
        : null,
      notificationStatus: notificationByOffer.get(row.id) ?? null,
      job: jobsById.get(row.jobId)
        ? {
            reference: jobsById.get(row.jobId)!.reference,
            trade: jobsById.get(row.jobId)!.trade,
            suburb: jobsById.get(row.jobId)!.suburb,
            status: jobsById.get(row.jobId)!.status,
          }
        : null,
      partner: partnersById.get(row.partnerId)
        ? {
            id: partnersById.get(row.partnerId)!.id,
            businessName: partnersById.get(row.partnerId)!.businessName,
            trade: partnersById.get(row.partnerId)!.trade,
          }
        : null,
    }));
  }

  async listPartnerOffers(partnerId: number): Promise<any[]> {
    const rows = await this.database
      .select()
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.partnerId, partnerId))
      .orderBy(desc(dispatchOffersTable.offeredAt));

    const jobIds = rows.map((row) => row.jobId);
    const jobs = jobIds.length
      ? await this.database
          .select()
          .from(jobsTable)
          .where(inArray(jobsTable.id, jobIds))
      : [];

    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const photoRows = jobIds.length
      ? await this.database
          .select({ id: jobImagesTable.id, jobId: jobImagesTable.jobId })
          .from(jobImagesTable)
          .where(
            and(
              inArray(jobImagesTable.jobId, jobIds),
              sql`${jobImagesTable.storageObjectKey} is not null`,
            ),
          )
      : [];
    const photosByJobId = new Map<number, Array<{ id: number }>>();
    for (const photo of photoRows) {
      const current = photosByJobId.get(photo.jobId) ?? [];
      current.push({ id: photo.id });
      photosByJobId.set(photo.jobId, current);
    }

    return rows
      .map((row) => {
        const job = jobsById.get(row.jobId);
        if (!job) return null;

        const customerVisible =
          row.state === "accepted" && Boolean(row.customerConfirmedAt);

        return {
          id: row.id,
          jobId: row.jobId,
          partnerId: row.partnerId,
          state: row.state,
          offeredAt: toIso(row.offeredAt),
          respondedAt: row.respondedAt ? toIso(row.respondedAt) : null,
          expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
          eta: row.eta ?? null,
          confirmedPriceKind:
            (row.confirmedPriceKind as PriceKind | null) ?? null,
          confirmedPriceCents: row.confirmedPriceCents ?? null,
          customerConfirmedAt: row.customerConfirmedAt
            ? toIso(row.customerConfirmedAt)
            : null,
          job: {
            reference: job.reference,
            trade: job.trade,
            suburb: job.suburb,
            postcode: job.postcode,
            urgency: job.urgency,
            preferredTime: job.preferredTime,
            description: job.description,
            photos:
              (row.state === "pending" &&
                (!row.expiresAt || row.expiresAt > new Date())) ||
              row.state === "accepted"
                ? (photosByJobId.get(job.id) ?? [])
                : [],
            expectedPrice: this.pricingFromJob(job),
            customerName: customerVisible ? job.customerName : null,
            customerPhone: customerVisible ? job.customerPhone : null,
            customerEmail: customerVisible ? job.customerEmail : null,
            serviceAddressLine1: customerVisible
              ? job.serviceAddressLine1
              : null,
            serviceAddressLine2: customerVisible
              ? job.serviceAddressLine2
              : null,
            createdAt: toIso(job.createdAt),
            updatedAt: toIso(job.updatedAt),
          },
        };
      })
      .filter(Boolean);
  }

  async createPartner(input: {
    businessName: string;
    contactName: string;
    abn?: string;
    trade: string;
    licence?: string;
    mobile: string;
    email: string;
    suburbs: string[];
    radiusKm: number;
    services?: string[];
    emergencyJobs?: boolean;
  }): Promise<PartnerApi> {
    return this.database.transaction(async (tx) => {
      const now = new Date();

      const insertedRows = await tx
        .insert(partnersTable)
        .values({
          businessName: input.businessName,
          contactName: input.contactName,
          abn: input.abn ?? null,
          trade: input.trade,
          licence: input.licence ?? null,
          mobile: input.mobile,
          email: input.email,
          radiusKm: input.radiusKm,
          emergencyJobs: input.emergencyJobs ?? false,
          availability: false,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const partner = insertedRows[0];
      const suburbs = uniqueNormalized(input.suburbs);
      const services = uniqueNormalized(input.services ?? []);

      if (suburbs.length > 0) {
        await tx.insert(partnerServiceAreasTable).values(
          suburbs.map((suburb) => ({
            partnerId: partner.id,
            suburb,
            createdAt: now,
          })),
        );
      }

      if (services.length > 0) {
        await tx.insert(partnerServicesTable).values(
          services.map((service) => ({
            partnerId: partner.id,
            service,
            createdAt: now,
          })),
        );
      }

      return {
        id: partner.id,
        businessName: partner.businessName,
        contactName: partner.contactName,
        abn: partner.abn,
        trade: partner.trade,
        suburbs,
        radiusKm: partner.radiusKm,
        availability: partner.availability,
        status: partner.status,
        services,
        emergencyJobs: partner.emergencyJobs,
      };
    });
  }

  async updatePartnerAvailability(
    id: number,
    availability: boolean,
  ): Promise<PartnerApi | null> {
    const now = new Date();

    const rows = await this.database
      .update(partnersTable)
      .set({ availability, updatedAt: now })
      .where(eq(partnersTable.id, id))
      .returning();

    const partner = rows[0];
    if (!partner) return null;

    const areas = await this.database
      .select()
      .from(partnerServiceAreasTable)
      .where(eq(partnerServiceAreasTable.partnerId, id));

    const services = await this.database
      .select()
      .from(partnerServicesTable)
      .where(eq(partnerServicesTable.partnerId, id));

    return {
      id: partner.id,
      businessName: partner.businessName,
      contactName: partner.contactName,
      abn: partner.abn,
      trade: partner.trade,
      suburbs: areas.map((area) => area.suburb),
      radiusKm: partner.radiusKm,
      availability: partner.availability,
      status: partner.status,
      services: services.map((service) => service.service),
      emergencyJobs: partner.emergencyJobs,
    };
  }

  async findDispatchById(
    id: number,
  ): Promise<{ id: number; partnerId: number } | null> {
    const rows = await this.database
      .select({
        id: dispatchOffersTable.id,
        partnerId: dispatchOffersTable.partnerId,
      })
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async getOfferPhotoAccess(offerId: number, photoId: number) {
    const rows = await this.database
      .select({
        partnerId: dispatchOffersTable.partnerId,
        state: dispatchOffersTable.state,
        expiresAt: dispatchOffersTable.expiresAt,
        jobStatus: jobsTable.status,
        storageObjectKey: jobImagesTable.storageObjectKey,
      })
      .from(dispatchOffersTable)
      .innerJoin(jobsTable, eq(jobsTable.id, dispatchOffersTable.jobId))
      .innerJoin(
        jobImagesTable,
        and(
          eq(jobImagesTable.id, photoId),
          eq(jobImagesTable.jobId, dispatchOffersTable.jobId),
        ),
      )
      .where(eq(dispatchOffersTable.id, offerId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createDispatchOffer(input: {
    jobId: number;
    partnerId: number;
    expiresAt: Date;
  }): Promise<
    | {
        kind: "ok";
        id: number;
        jobId: number;
        partnerId: number;
        state: DispatchState;
        offeredAt: string;
        expiresAt: string | null;
        notificationStatus: string;
        offer: {
          id: number;
          jobId: number;
          partnerId: number;
          state: DispatchState;
          offeredAt: string;
          expiresAt: string | null;
          notificationStatus: string;
        };
      }
    | {
        kind: "not_found";
        state?: undefined;
        jobId?: undefined;
        offer?: undefined;
      }
    | {
        kind: "invalid_job_state";
        state?: undefined;
        jobId?: undefined;
        offer?: undefined;
      }
    | {
        kind: "active_offer_exists";
        state?: undefined;
        jobId?: undefined;
        offer?: undefined;
      }
  > {
    const jobRows = await this.database
      .select({
        id: jobsTable.id,
        status: jobsTable.status,
        reference: jobsTable.reference,
        trade: jobsTable.trade,
        suburb: jobsTable.suburb,
        postcode: jobsTable.postcode,
        urgency: jobsTable.urgency,
        preferredTime: jobsTable.preferredTime,
        description: jobsTable.description,
        expectedPriceKind: jobsTable.expectedPriceKind,
        expectedPriceMinCents: jobsTable.expectedPriceMinCents,
        expectedPriceMaxCents: jobsTable.expectedPriceMaxCents,
      })
      .from(jobsTable)
      .where(eq(jobsTable.id, input.jobId))
      .limit(1);

    const job = jobRows[0];
    if (!job) return { kind: "not_found" };

    const partnerRows = await this.database
      .select({
        id: partnersTable.id,
        status: partnersTable.status,
        email: partnersTable.email,
        businessName: partnersTable.businessName,
      })
      .from(partnersTable)
      .where(eq(partnersTable.id, input.partnerId))
      .limit(1);

    const partner = partnerRows[0];
    if (!partner) return { kind: "not_found" };

    const activeOfferRows = await this.database
      .select({ id: dispatchOffersTable.id })
      .from(dispatchOffersTable)
      .where(
        and(
          eq(dispatchOffersTable.jobId, input.jobId),
          inArray(dispatchOffersTable.state, ["pending", "accepted"]),
        ),
      )
      .limit(1);

    if (activeOfferRows[0]) {
      return { kind: "active_offer_exists" };
    }

    if (job.status !== "awaiting_dispatch") {
      return { kind: "invalid_job_state" };
    }

    const now = new Date();

    const insertedRows = await this.database
      .insert(dispatchOffersTable)
      .values({
        jobId: input.jobId,
        partnerId: input.partnerId,
        state: "pending",
        offeredAt: now,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const inserted = insertedRows[0];

    await this.database
      .update(jobsTable)
      .set({ status: "dispatching", updatedAt: now })
      .where(eq(jobsTable.id, input.jobId));

    await this.database.insert(jobStatusHistoryTable).values({
      jobId: input.jobId,
      fromStatus: job.status,
      toStatus: "dispatching",
      note: "dispatch_offer_created",
      createdAt: now,
    });

    const notificationStatus = await this.sendNotification({
      jobId: inserted.jobId,
      dispatchOfferId: inserted.id,
      recipientType: "partner",
      type: "offer_created",
      idempotencyKey: `offer:${inserted.id}:partner`,
      to: partner.email,
      subject: `SourceTradie opportunity ${job.reference}`,
      text: [
        `A ${job.trade} opportunity is available in ${job.suburb} ${job.postcode}.`,
        `Urgency: ${job.urgency}. Preferred time: ${job.preferredTime}.`,
        `Details: ${job.description}`,
        job.expectedPriceKind &&
        job.expectedPriceMinCents &&
        job.expectedPriceMaxCents
          ? `Expected ${job.expectedPriceKind} range: $${(job.expectedPriceMinCents / 100).toFixed(0)}–$${(job.expectedPriceMaxCents / 100).toFixed(0)}.`
          : "Expected range unavailable; confirm a diagnostic price before accepting.",
        `This offer expires at ${input.expiresAt.toISOString()}. Sign in to accept or decline.`,
      ].join("\n"),
    });
    const offer = {
      id: inserted.id,
      jobId: inserted.jobId,
      partnerId: inserted.partnerId,
      state: inserted.state,
      offeredAt: toIso(inserted.offeredAt),
      expiresAt: inserted.expiresAt ? toIso(inserted.expiresAt) : null,
      notificationStatus,
    };

    return {
      kind: "ok",
      ...offer,
      notificationStatus,
      offer,
    };
  }

  async decideDispatch(
    id: number,
    decision: string,
    eta?: string,
    confirmedPriceKind?: PriceKind,
    confirmedPriceCents?: number,
  ): Promise<
    | { kind: "ok"; dispatch: DispatchApi }
    | { kind: "not_found" }
    | { kind: "invalid_status" }
    | { kind: "invalid_acceptance_terms" }
    | { kind: "invalid_transition"; from: string; to: string }
  > {
    if (!isDispatchState(decision)) {
      return { kind: "invalid_status" };
    }

    const existingRows = await this.database
      .select()
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.id, id))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) return { kind: "not_found" };

    if (!canTransitionDispatchState(existing.state, decision)) {
      return {
        kind: "invalid_transition",
        from: existing.state,
        to: decision,
      };
    }

    if (existing.state !== "pending") {
      return {
        kind: "invalid_transition",
        from: existing.state,
        to: decision,
      };
    }

    if (
      decision === "accepted" &&
      (!eta?.trim() ||
        !confirmedPriceKind ||
        !Number.isInteger(confirmedPriceCents) ||
        confirmedPriceCents! <= 0)
    ) {
      return { kind: "invalid_acceptance_terms" };
    }

    if (
      existing.expiresAt &&
      new Date(existing.expiresAt).getTime() < Date.now()
    ) {
      return {
        kind: "invalid_transition",
        from: existing.state,
        to: decision,
      };
    }

    const now = new Date();

    const updatedRows = await this.database
      .update(dispatchOffersTable)
      .set({
        state: decision,
        eta: decision === "accepted" ? eta?.trim() || null : null,
        confirmedPriceKind: decision === "accepted" ? confirmedPriceKind : null,
        confirmedPriceCents:
          decision === "accepted" ? confirmedPriceCents : null,
        respondedAt: dispatchTerminalStates.has(decision) ? now : null,
        updatedAt: now,
      })
      .where(eq(dispatchOffersTable.id, id))
      .returning();

    const updated = updatedRows[0];

    const currentJobRows = await this.database
      .select({ id: jobsTable.id, status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.id, updated.jobId))
      .limit(1);

    const currentJob = currentJobRows[0];

    if (decision === "accepted") {
      if (
        currentJob &&
        canTransitionJobStatus(
          currentJob.status,
          "awaiting_customer_confirmation",
        )
      ) {
        await this.database
          .update(jobsTable)
          .set({ status: "awaiting_customer_confirmation", updatedAt: now })
          .where(eq(jobsTable.id, currentJob.id));

        await this.database.insert(jobStatusHistoryTable).values({
          jobId: currentJob.id,
          fromStatus: currentJob.status,
          toStatus: "awaiting_customer_confirmation",
          note: "partner_price_and_eta_confirmed",
          createdAt: now,
        });
      }
      const notificationRows = await this.database
        .select({
          customerEmail: jobsTable.customerEmail,
          reference: jobsTable.reference,
          businessName: partnersTable.businessName,
          contactName: partnersTable.contactName,
        })
        .from(jobsTable)
        .innerJoin(partnersTable, eq(partnersTable.id, updated.partnerId))
        .where(eq(jobsTable.id, updated.jobId))
        .limit(1);
      const details = notificationRows[0];
      if (details) {
        await this.sendNotification({
          jobId: updated.jobId,
          dispatchOfferId: updated.id,
          recipientType: "customer",
          type: "price_ready",
          idempotencyKey: `offer:${updated.id}:customer-price-ready`,
          to: details.customerEmail,
          subject: `Confirm your tradie for ${details.reference}`,
          text: `${details.businessName} (${details.contactName}) is ready. Confirmed ${updated.confirmedPriceKind} price: $${((updated.confirmedPriceCents ?? 0) / 100).toFixed(2)}. ETA/status: ${updated.eta}. Open your secure status link to confirm and send the tradie. Your exact address remains hidden until you confirm.`,
        });
      }
    }

    if (
      decision === "declined" ||
      decision === "expired" ||
      decision === "cancelled"
    ) {
      if (currentJob && currentJob.status === "dispatching") {
        const remainingActiveRows = await this.database
          .select({ id: dispatchOffersTable.id })
          .from(dispatchOffersTable)
          .where(
            and(
              eq(dispatchOffersTable.jobId, currentJob.id),
              inArray(dispatchOffersTable.state, ["pending", "accepted"]),
            ),
          )
          .limit(1);

        if (!remainingActiveRows[0]) {
          await this.database
            .update(jobsTable)
            .set({ status: "awaiting_dispatch", updatedAt: now })
            .where(eq(jobsTable.id, currentJob.id));

          await this.database.insert(jobStatusHistoryTable).values({
            jobId: currentJob.id,
            fromStatus: currentJob.status,
            toStatus: "awaiting_dispatch",
            note: `dispatch_offer_${decision}`,
            createdAt: now,
          });
        }
      }
    }

    return {
      kind: "ok",
      dispatch: {
        id: updated.id,
        jobId: updated.jobId,
        businessId: updated.partnerId,
        decision: updated.state,
        offeredAt: toIso(updated.offeredAt),
        respondedAt: updated.respondedAt ? toIso(updated.respondedAt) : null,
        eta: updated.eta ?? null,
        confirmedPriceKind:
          (updated.confirmedPriceKind as PriceKind | null) ?? null,
        confirmedPriceCents: updated.confirmedPriceCents ?? null,
        customerConfirmedAt: updated.customerConfirmedAt
          ? toIso(updated.customerConfirmedAt)
          : null,
      },
    };
  }

  async confirmDispatch(
    jobId: number,
    token: string,
  ): Promise<
    | { kind: "ok"; status: PublicJobStatusApi }
    | { kind: "not_found" }
    | { kind: "not_ready" }
  > {
    const currentRows = await this.database
      .select()
      .from(jobsTable)
      .where(
        and(eq(jobsTable.id, jobId), eq(jobsTable.publicStatusToken, token)),
      )
      .limit(1);
    const current = currentRows[0];
    if (!current) return { kind: "not_found" };

    const offerRows = await this.database
      .select()
      .from(dispatchOffersTable)
      .where(
        and(
          eq(dispatchOffersTable.jobId, jobId),
          eq(dispatchOffersTable.state, "accepted"),
        ),
      )
      .limit(1);
    const offer = offerRows[0];
    if (
      !offer?.eta ||
      !offer.confirmedPriceKind ||
      !offer.confirmedPriceCents
    ) {
      return { kind: "not_ready" };
    }

    if (!offer.customerConfirmedAt) {
      if (current.status !== "awaiting_customer_confirmation") {
        return { kind: "not_ready" };
      }
      const now = new Date();
      await this.database.transaction(async (tx) => {
        await tx
          .update(dispatchOffersTable)
          .set({ customerConfirmedAt: now, updatedAt: now })
          .where(eq(dispatchOffersTable.id, offer.id));
        await tx
          .update(jobsTable)
          .set({ status: "accepted", updatedAt: now })
          .where(eq(jobsTable.id, current.id));
        await tx.insert(jobStatusHistoryTable).values({
          jobId: current.id,
          fromStatus: current.status,
          toStatus: "accepted",
          note: "customer_confirmed_dispatch",
          createdAt: now,
        });
      });

      const recipientRows = await this.database
        .select({
          partnerEmail: partnersTable.email,
          customerEmail: jobsTable.customerEmail,
          reference: jobsTable.reference,
          businessName: partnersTable.businessName,
        })
        .from(dispatchOffersTable)
        .innerJoin(jobsTable, eq(jobsTable.id, dispatchOffersTable.jobId))
        .innerJoin(
          partnersTable,
          eq(partnersTable.id, dispatchOffersTable.partnerId),
        )
        .where(eq(dispatchOffersTable.id, offer.id))
        .limit(1);
      const recipients = recipientRows[0];
      if (recipients) {
        await this.sendNotification({
          jobId,
          dispatchOfferId: offer.id,
          recipientType: "partner",
          type: "customer_confirmed",
          idempotencyKey: `offer:${offer.id}:partner-customer-confirmed`,
          to: recipients.partnerEmail,
          subject: `Customer confirmed ${recipients.reference}`,
          text: `The customer confirmed your price and ETA. Sign in to SourceTradie to view the service details and attend.`,
        });
        await this.sendNotification({
          jobId,
          dispatchOfferId: offer.id,
          recipientType: "customer",
          type: "customer_confirmed",
          idempotencyKey: `offer:${offer.id}:customer-confirmed`,
          to: recipients.customerEmail,
          subject: `Your tradie is confirmed for ${recipients.reference}`,
          text: `${recipients.businessName} is confirmed at $${(offer.confirmedPriceCents / 100).toFixed(2)} with ETA/status: ${offer.eta}.`,
        });
      }
    } else if (current.status !== "accepted") {
      return { kind: "not_ready" };
    }

    const status = await this.getPublicJobStatusByToken(jobId, token);
    return status ? { kind: "ok", status } : { kind: "not_found" };
  }

  async expireDispatchOffer(
    id: number,
  ): Promise<
    | { kind: "ok"; dispatch: DispatchApi }
    | { kind: "not_found" }
    | { kind: "invalid_transition"; from: string; to: string }
  > {
    const existingRows = await this.database
      .select()
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.id, id))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) return { kind: "not_found" };

    if (existing.state !== "pending") {
      return {
        kind: "invalid_transition",
        from: existing.state,
        to: "expired",
      };
    }

    const now = new Date();
    const updatedRows = await this.database
      .update(dispatchOffersTable)
      .set({
        state: "expired",
        respondedAt: now,
        updatedAt: now,
      })
      .where(eq(dispatchOffersTable.id, id))
      .returning();

    const updated = updatedRows[0];

    const currentJobRows = await this.database
      .select({ id: jobsTable.id, status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.id, updated.jobId))
      .limit(1);

    const currentJob = currentJobRows[0];
    if (currentJob && currentJob.status === "dispatching") {
      const remainingActiveRows = await this.database
        .select({ id: dispatchOffersTable.id })
        .from(dispatchOffersTable)
        .where(
          and(
            eq(dispatchOffersTable.jobId, currentJob.id),
            inArray(dispatchOffersTable.state, ["pending", "accepted"]),
          ),
        )
        .limit(1);

      if (!remainingActiveRows[0]) {
        await this.database
          .update(jobsTable)
          .set({ status: "awaiting_dispatch", updatedAt: now })
          .where(eq(jobsTable.id, currentJob.id));

        await this.database.insert(jobStatusHistoryTable).values({
          jobId: currentJob.id,
          fromStatus: currentJob.status,
          toStatus: "awaiting_dispatch",
          note: "dispatch_offer_expired",
          createdAt: now,
        });
      }
    }

    return {
      kind: "ok",
      dispatch: {
        id: updated.id,
        jobId: updated.jobId,
        businessId: updated.partnerId,
        decision: updated.state,
        offeredAt: toIso(updated.offeredAt),
        respondedAt: updated.respondedAt ? toIso(updated.respondedAt) : null,
        eta: updated.eta ?? null,
        confirmedPriceKind:
          (updated.confirmedPriceKind as PriceKind | null) ?? null,
        confirmedPriceCents: updated.confirmedPriceCents ?? null,
        customerConfirmedAt: updated.customerConfirmedAt
          ? toIso(updated.customerConfirmedAt)
          : null,
      },
    };
  }

  private async countJobsByStatus(status: JobStatus): Promise<number> {
    const rows = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(eq(jobsTable.status, status));
    return Number(rows[0]?.count ?? 0);
  }

  private async countDispatchByState(state: DispatchState): Promise<number> {
    const rows = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.state, state));
    return Number(rows[0]?.count ?? 0);
  }

  async getAdminSummary(): Promise<AdminSummaryApi> {
    const [
      newRequests,
      awaitingDispatch,
      tradieApplications,
      approvedTradies,
      availableTradies,
      sentOpportunities,
      acceptedJobs,
      declinedJobs,
      completedJobs,
    ] = await Promise.all([
      this.countJobsByStatus("new"),
      this.countJobsByStatus("awaiting_dispatch"),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(partnersTable)
        .where(eq(partnersTable.status, "pending"))
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(partnersTable)
        .where(eq(partnersTable.status, "approved"))
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(partnersTable)
        .where(eq(partnersTable.availability, true))
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(dispatchOffersTable)
        .then((rows) => Number(rows[0]?.count ?? 0)),
      this.countDispatchByState("accepted"),
      this.countDispatchByState("declined"),
      this.countJobsByStatus("completed"),
    ]);

    return {
      newRequests,
      awaitingDispatch,
      tradieApplications,
      approvedTradies,
      availableTradies,
      sentOpportunities,
      acceptedJobs,
      declinedJobs,
      completedJobs,
    };
  }

  async seedInitialDispatchForJob(jobId: number, partnerId: number) {
    const existingRows = await this.database
      .select({ id: dispatchOffersTable.id })
      .from(dispatchOffersTable)
      .where(
        and(
          eq(dispatchOffersTable.jobId, jobId),
          eq(dispatchOffersTable.partnerId, partnerId),
        ),
      )
      .limit(1);

    if (existingRows[0]) return;

    const now = new Date();
    await this.database.insert(dispatchOffersTable).values({
      jobId,
      partnerId,
      state: "pending",
      offeredAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });

    const currentJobRows = await this.database
      .select({ id: jobsTable.id, status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1);

    const currentJob = currentJobRows[0];
    if (
      currentJob &&
      canTransitionJobStatus(currentJob.status, "dispatching")
    ) {
      await this.database
        .update(jobsTable)
        .set({ status: "dispatching", updatedAt: now })
        .where(eq(jobsTable.id, currentJob.id));

      await this.database.insert(jobStatusHistoryTable).values({
        jobId: currentJob.id,
        fromStatus: currentJob.status,
        toStatus: "dispatching",
        note: "dispatch_offer_created",
        createdAt: now,
      });
    }
  }
}
