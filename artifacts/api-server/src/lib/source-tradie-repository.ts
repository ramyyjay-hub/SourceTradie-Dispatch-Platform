import crypto from "node:crypto";
import {
  appUsersTable,
  dispatchOffersTable,
  dispatchStateEnum,
  jobImagesTable,
  jobsTable,
  jobStatusEnum,
  jobStatusHistoryTable,
  partnerServiceAreasTable,
  partnersTable,
  partnerServicesTable,
} from "@workspace/db/schema";
import type { db as WorkspaceDb } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

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
  createdAt: string;
  images: string[];
};

export type CreatedJobApi = JobApi & {
  statusAccessToken: string;
};

export type PublicJobStatusApi = {
  reference: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
  dispatching: ["accepted", "awaiting_dispatch", "cancelled"],
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
  constructor(private readonly database: DbLike) {}

  private async getJobImages(jobIds: number[]) {
    if (!jobIds.length) return new Map<number, string[]>();

    const rows = await this.database
      .select({ jobId: jobImagesTable.jobId, imageName: jobImagesTable.imageName })
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
      createdAt: toIso(row.createdAt),
      images,
    };
  }

  async findPrincipalByAuthUserId(authUserId: string): Promise<PrincipalRecord | null> {
    const rows = await this.database
      .select({
        authUserId: appUsersTable.authUserId,
        role: appUsersTable.role,
        isActive: appUsersTable.isActive,
        partnerId: partnersTable.id,
      })
      .from(appUsersTable)
      .leftJoin(partnersTable, eq(partnersTable.authUserId, appUsersTable.authUserId))
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

    return rows.map((row) => this.toJobApi(row, imagesByJobId.get(row.id) ?? []));
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
    images?: string[];
  }): Promise<CreatedJobApi> {
    return this.database.transaction(async (tx) => {
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

      return {
        ...this.toJobApi(updated, imageNames),
        statusAccessToken,
      };
    });
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
    return this.toJobApi(row, imagesByJobId.get(id) ?? []);
  }

  async getPublicJobStatusByToken(jobId: number, token: string): Promise<PublicJobStatusApi | null> {
    const rows = await this.database
      .select({
        reference: jobsTable.reference,
        status: jobsTable.status,
        createdAt: jobsTable.createdAt,
        updatedAt: jobsTable.updatedAt,
      })
      .from(jobsTable)
      .where(and(eq(jobsTable.id, jobId), eq(jobsTable.publicStatusToken, token)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      reference: row.reference,
      status: row.status,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
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

    return {
      kind: "ok",
      job: this.toJobApi(updated, imagesByJobId.get(id) ?? []),
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

  async findDispatchById(id: number): Promise<{ id: number; partnerId: number } | null> {
    const rows = await this.database
      .select({ id: dispatchOffersTable.id, partnerId: dispatchOffersTable.partnerId })
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async decideDispatch(
    id: number,
    decision: string,
  ): Promise<
    | { kind: "ok"; dispatch: DispatchApi }
    | { kind: "not_found" }
    | { kind: "invalid_status" }
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

    const now = new Date();

    const updatedRows = await this.database
      .update(dispatchOffersTable)
      .set({
        state: decision,
        respondedAt: dispatchTerminalStates.has(decision) ? now : null,
        updatedAt: now,
      })
      .where(eq(dispatchOffersTable.id, id))
      .returning();

    const updated = updatedRows[0];

    if (decision === "accepted") {
      const currentJobRows = await this.database
        .select({ id: jobsTable.id, status: jobsTable.status })
        .from(jobsTable)
        .where(eq(jobsTable.id, updated.jobId))
        .limit(1);

      const currentJob = currentJobRows[0];
      if (
        currentJob &&
        canTransitionJobStatus(currentJob.status, "accepted")
      ) {
        await this.database
          .update(jobsTable)
          .set({ status: "accepted", updatedAt: now })
          .where(eq(jobsTable.id, currentJob.id));

        await this.database.insert(jobStatusHistoryTable).values({
          jobId: currentJob.id,
          fromStatus: currentJob.status,
          toStatus: "accepted",
          note: "dispatch_offer_accepted",
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
      createdAt: now,
      updatedAt: now,
    });

    const currentJobRows = await this.database
      .select({ id: jobsTable.id, status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1);

    const currentJob = currentJobRows[0];
    if (currentJob && canTransitionJobStatus(currentJob.status, "dispatching")) {
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
