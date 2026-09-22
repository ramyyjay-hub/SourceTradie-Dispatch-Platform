import crypto from "node:crypto";
import type Stripe from "stripe";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  candidateProviderTradesTable,
  candidateProvidersTable,
  jobPaymentEventsTable,
  jobPaymentsTable,
  jobsTable,
  notificationsTable,
} from "@workspace/db/schema";
import type { db as WorkspaceDb } from "@workspace/db";
import { assessServiceability, inferTrade, type ServiceabilityResult } from "./serviceability";
import { rankCandidates, type CandidateForRanking } from "./provider-sourcing";
import {
  createPaymentProvider,
  SOURCING_FEE_AMOUNT_CENTS,
  type PaymentProvider,
} from "./stripe-provider";
import {
  createNotificationProvider,
  type NotificationProvider,
} from "./notification-provider";

type DbLike = typeof WorkspaceDb;

export type ServiceabilityCheckResult = ServiceabilityResult;

export type CheckoutStartResult =
  | { ok: true; checkoutUrl: string; testMode: boolean }
  | { ok: false; errorCode: string };

export class PaidDispatchRepository {
  constructor(
    private readonly database: DbLike,
    private readonly paymentProvider: PaymentProvider = createPaymentProvider(),
    private readonly notificationProvider: NotificationProvider = createNotificationProvider(),
  ) {}

  private async loadJob(jobId: number) {
    const rows = await this.database
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async notifyOperator(input: {
    jobId: number;
    idempotencySuffix: string;
    subject: string;
    text: string;
  }) {
    const idempotencyKey = `job:${input.jobId}:paid-dispatch:${input.idempotencySuffix}`;
    const to =
      process.env["PARTNER_OPERATIONS_EMAIL"] ?? "partners@sourcetradie.com.au";
    const result = await this.notificationProvider
      .sendEmail({ to, subject: input.subject, text: input.text })
      .catch(() => ({ ok: false as const, errorCode: "send_failed" }));
    await this.database
      .insert(notificationsTable)
      .values({
        jobId: input.jobId,
        recipientType: "admin",
        type: `paid_dispatch:${input.idempotencySuffix}`,
        channel: "email",
        status: result.ok ? "sent" : "failed",
        idempotencyKey,
        providerMessageId: result.ok ? result.providerMessageId : null,
        errorCode: result.ok ? null : result.errorCode,
        sentAt: result.ok ? new Date() : null,
      })
      .onConflictDoNothing({ target: notificationsTable.idempotencyKey });
  }

  /** Shared candidate load: every non-opted-out candidate, with its full trade list attached. */
  private async loadCandidatesForRanking(): Promise<
    Array<CandidateForRanking & { businessName: string; phone: string; website: string | null }>
  > {
    const candidateRows = await this.database
      .select()
      .from(candidateProvidersTable)
      .where(isNull(candidateProvidersTable.optedOutAt));

    const capabilityRows = candidateRows.length
      ? await this.database
          .select({
            candidateProviderId: candidateProviderTradesTable.candidateProviderId,
            trade: candidateProviderTradesTable.trade,
          })
          .from(candidateProviderTradesTable)
          .where(
            inArray(
              candidateProviderTradesTable.candidateProviderId,
              candidateRows.map((row) => row.id),
            ),
          )
      : [];
    const capabilitiesByProviderId = new Map<number, string[]>();
    for (const row of capabilityRows) {
      const existing = capabilitiesByProviderId.get(row.candidateProviderId) ?? [];
      existing.push(row.trade);
      capabilitiesByProviderId.set(row.candidateProviderId, existing);
    }

    return candidateRows.map((row) => ({
      id: row.id,
      businessName: row.businessName,
      phone: row.phone,
      website: row.website,
      trade: row.trade,
      trades: capabilitiesByProviderId.get(row.id) ?? [row.trade],
      subServices: row.subServices,
      serviceSuburbs: row.serviceSuburbs,
      servicePostcodes: row.servicePostcodes,
      afterHoursAvailable: row.afterHoursAvailable,
      verificationStatus: row.verificationStatus,
      optedOutAt: row.optedOutAt,
      responseCount: row.responseCount,
      acceptanceCount: row.acceptanceCount,
      tier: row.tier,
    }));
  }

  /**
   * Serviceability gate. Must run (and return "serviceable") before a
   * checkout session can be created. Never charges for manual_review or
   * unsupported jobs.
   */
  async runServiceabilityCheck(jobId: number): Promise<ServiceabilityCheckResult | null> {
    const job = await this.loadJob(jobId);
    if (!job) return null;

    const candidates = await this.loadCandidatesForRanking();

    const result = assessServiceability({
      trade: job.trade,
      description: job.description,
      suburb: job.suburb,
      postcode: job.postcode,
      urgency: job.urgency,
      candidates,
    });

    await this.database
      .update(jobsTable)
      .set({
        paidFlowState: result.outcome,
        serviceabilityCheckedAt: new Date(),
        serviceabilityReason: result.reason,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, jobId));

    return result;
  }

  /**
   * Top nearby candidates for manual calling -- the shortlist an operator
   * works down by phone when a job is in manual_review (no dispatch_eligible
   * candidate yet). Same ranking as the automated path (rankCandidates), so
   * "closest/best match first" is consistent whether AI or a human is
   * dispatching. Returns candidates regardless of verification_status --
   * verification is exactly what the phone call is for.
   */
  async getCandidateShortlist(
    jobId: number,
    limit = 10,
  ): Promise<{
    inferredTrade: string | null;
    candidates: Array<{
      id: number;
      businessName: string;
      phone: string;
      website: string | null;
      verificationStatus: string;
      trades: string[];
      score: number;
      reasons: string[];
    }>;
  } | null> {
    const job = await this.loadJob(jobId);
    if (!job) return null;

    const inferredTrade = inferTrade(job.trade, job.description);
    if (!inferredTrade) return { inferredTrade: null, candidates: [] };

    const candidates = await this.loadCandidatesForRanking();
    const ranked = rankCandidates(
      { trade: inferredTrade, suburb: job.suburb, postcode: job.postcode, urgency: job.urgency },
      candidates,
    ).slice(0, limit);

    return {
      inferredTrade,
      candidates: ranked.map((candidate) => ({
        id: candidate.id,
        businessName: candidate.businessName,
        phone: candidate.phone,
        website: candidate.website,
        verificationStatus: candidate.verificationStatus,
        trades: candidate.trades,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
    };
  }

  /**
   * Creates a Stripe TEST-mode checkout session for the sourcing fee.
   * Refuses unless the job has already been marked "serviceable" OR
   * "manual_review" by runServiceabilityCheck.
   *
   * "manual_review" means no dispatch_eligible (licence-checked) candidate
   * exists yet -- only unverified/listing_verified public leads. Letting
   * those through to checkout is a deliberate product decision: the
   * homeowner is paying for SourceTradie to personally source and match a
   * provider by phone (see recordManualMatch), not for instant AI dispatch
   * to a licence-verified tradie. No candidate's verification_status is
   * misrepresented by this -- it only changes when payment is collected
   * relative to when a human locks in the match. The browser success
   * redirect is never treated as payment confirmation -- only the webhook
   * (payment_confirmed) is.
   */
  async startCheckout(input: {
    jobId: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutStartResult> {
    const job = await this.loadJob(input.jobId);
    if (!job) return { ok: false, errorCode: "job_not_found" };
    const payableStates = new Set(["serviceable", "manual_review", "checkout_started"]);
    if (!payableStates.has(job.paidFlowState)) {
      return { ok: false, errorCode: `not_serviceable:${job.paidFlowState}` };
    }
    if (!this.paymentProvider.configured) {
      return { ok: false, errorCode: "stripe_not_configured" };
    }

    const idempotencyKey = `job:${input.jobId}:checkout:${new Date()
      .toISOString()
      .slice(0, 10)}`;

    const result = await this.paymentProvider.createCheckoutSession({
      jobId: input.jobId,
      reference: job.reference,
      idempotencyKey,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: job.customerEmail ?? undefined,
    });
    if (!result.ok) return result;

    // Retrying checkout (e.g. the frontend's "Retry checkout" button, or a
    // double-click) reuses the same idempotencyKey for the same job on the
    // same day -- Stripe returns the same session either way, and this
    // insert would otherwise crash on the idempotency_key unique index.
    await this.database
      .insert(jobPaymentsTable)
      .values({
        jobId: input.jobId,
        stripeCheckoutSessionId: result.sessionId,
        amountCents: SOURCING_FEE_AMOUNT_CENTS,
        currency: "aud",
        status: "pending",
        idempotencyKey,
        testMode: result.testMode,
      })
      .onConflictDoNothing({ target: jobPaymentsTable.idempotencyKey });

    await this.database
      .update(jobsTable)
      .set({ paidFlowState: "checkout_started", updatedAt: new Date() })
      .where(eq(jobsTable.id, input.jobId));

    return { ok: true, checkoutUrl: result.checkoutUrl, testMode: result.testMode };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    return this.paymentProvider.constructWebhookEvent(rawBody, signature);
  }

  /**
   * Idempotent webhook processing. Duplicate Stripe events (same event id)
   * are recorded but only applied once -- the unique index on
   * job_payment_events.stripe_event_id is the source of truth for that.
   */
  async handleWebhookEvent(
    event: Stripe.Event,
  ): Promise<{ ok: true; alreadyProcessed: boolean } | { ok: false; errorCode: string }> {
    const jobIdFromMetadata = (obj: unknown): number | null => {
      const metadata = (obj as { metadata?: Record<string, unknown> } | undefined)
        ?.metadata;
      const raw = metadata?.["jobId"];
      const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : null;
      return parsed && Number.isFinite(parsed) ? parsed : null;
    };

    const jobId = jobIdFromMetadata(event.data.object);

    let inserted: { id: number }[] = [];
    try {
      inserted = await this.database
        .insert(jobPaymentEventsTable)
        .values({
          stripeEventId: event.id,
          jobId,
          type: event.type,
          payload: event.data.object as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({ target: jobPaymentEventsTable.stripeEventId })
        .returning({ id: jobPaymentEventsTable.id });
    } catch {
      return { ok: false, errorCode: "webhook_log_failed" };
    }

    if (inserted.length === 0) {
      // Already recorded -- duplicate delivery, harmless no-op.
      return { ok: true, alreadyProcessed: true };
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const obj = event.data.object as {
        id?: string;
        payment_intent?: string;
        customer?: string;
        payment_status?: string;
      };
      if (obj.payment_status && obj.payment_status !== "paid") {
        return { ok: true, alreadyProcessed: false };
      }
      const sessionId = obj.id;
      if (!sessionId) return { ok: true, alreadyProcessed: false };

      const paymentRows = await this.database
        .update(jobPaymentsTable)
        .set({
          status: "paid",
          stripePaymentIntentId: obj.payment_intent ?? null,
          stripeCustomerId: obj.customer ?? null,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobPaymentsTable.stripeCheckoutSessionId, sessionId))
        .returning({ jobId: jobPaymentsTable.jobId });

      const resolvedJobId = paymentRows[0]?.jobId ?? jobId;
      if (resolvedJobId) {
        await this.database
          .update(jobsTable)
          .set({ paidFlowState: "sourcing", updatedAt: new Date() })
          .where(
            and(
              eq(jobsTable.id, resolvedJobId),
              inArray(jobsTable.paidFlowState, ["checkout_started", "payment_confirmed"]),
            ),
          );

        const job = await this.loadJob(resolvedJobId);
        if (job) {
          await this.notifyOperator({
            jobId: resolvedJobId,
            idempotencySuffix: "paid-job-alert",
            subject: `[PAID] SourceTradie sourcing fee received · ${job.reference} · ${job.urgency}`,
            text: [
              "A homeowner has paid the $29.99 SourceTradie sourcing fee (TEST mode payment).",
              "",
              `Reference: ${job.reference}`,
              `Urgency: ${job.urgency}`,
              `Suburb/postcode: ${job.suburb} ${job.postcode}`,
              `Inferred/requested trade: ${job.trade}`,
              "",
              "This job now needs manual sourcing: find a suitable tradie, get a price and ETA, and enter the match in the admin dispatch desk.",
              "If no suitable tradie can be found, mark sourcing failed to trigger the refund.",
            ].join("\n"),
          });
        }
      }
      return { ok: true, alreadyProcessed: false };
    }

    if (event.type === "charge.refunded" || event.type === "refund.updated") {
      const obj = event.data.object as { payment_intent?: string; id?: string };
      const paymentIntentId = obj.payment_intent;
      if (paymentIntentId) {
        const paymentRows = await this.database
          .update(jobPaymentsTable)
          .set({ status: "refunded", refundedAt: new Date(), updatedAt: new Date() })
          .where(eq(jobPaymentsTable.stripePaymentIntentId, paymentIntentId))
          .returning({ jobId: jobPaymentsTable.jobId });
        const resolvedJobId = paymentRows[0]?.jobId;
        if (resolvedJobId) {
          await this.database
            .update(jobsTable)
            .set({ paidFlowState: "refunded", updatedAt: new Date() })
            .where(eq(jobsTable.id, resolvedJobId));
        }
      }
      return { ok: true, alreadyProcessed: false };
    }

    return { ok: true, alreadyProcessed: false };
  }

  /** Operator manually enters a match -- no automated outreach involved. */
  async recordManualMatch(input: {
    jobId: number;
    providerName: string;
    providerPhone?: string;
    priceMinCents: number;
    priceMaxCents: number;
    eta: string;
    notes?: string;
  }) {
    const job = await this.loadJob(input.jobId);
    if (!job) return { ok: false as const, errorCode: "job_not_found" };
    if (!["sourcing", "match_ready"].includes(job.paidFlowState)) {
      return { ok: false as const, errorCode: `wrong_state:${job.paidFlowState}` };
    }
    await this.database
      .update(jobsTable)
      .set({
        paidFlowState: "match_ready",
        matchedProviderName: input.providerName,
        matchedProviderPhone: input.providerPhone ?? null,
        matchedProviderPriceMinCents: input.priceMinCents,
        matchedProviderPriceMaxCents: input.priceMaxCents,
        matchedProviderEta: input.eta,
        matchedProviderNotes: input.notes ?? null,
        matchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, input.jobId));
    return { ok: true as const };
  }

  /** Customer approves the manually-entered match. */
  async approveMatch(jobId: number, publicStatusToken: string) {
    const job = await this.loadJob(jobId);
    if (!job || job.publicStatusToken !== publicStatusToken) {
      return { ok: false as const, errorCode: "not_found" };
    }
    if (job.paidFlowState !== "match_ready") {
      return { ok: false as const, errorCode: `wrong_state:${job.paidFlowState}` };
    }
    await this.database
      .update(jobsTable)
      .set({ paidFlowState: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobsTable.id, jobId));
    return { ok: true as const };
  }

  async markCompleted(jobId: number) {
    const job = await this.loadJob(jobId);
    if (!job) return { ok: false as const, errorCode: "job_not_found" };
    if (job.paidFlowState !== "approved") {
      return { ok: false as const, errorCode: `wrong_state:${job.paidFlowState}` };
    }
    await this.database
      .update(jobsTable)
      .set({ paidFlowState: "completed", updatedAt: new Date() })
      .where(eq(jobsTable.id, jobId));
    return { ok: true as const };
  }

  /**
   * Sourcing failed: no suitable tradie found within the window. Triggers a
   * TEST-mode refund. If Stripe isn't configured, the state still advances
   * to refund_pending so the operator flow can be proven with a mock.
   */
  async markSourcingFailed(jobId: number) {
    const job = await this.loadJob(jobId);
    if (!job) return { ok: false as const, errorCode: "job_not_found" };
    if (!["sourcing", "match_ready"].includes(job.paidFlowState)) {
      return { ok: false as const, errorCode: `wrong_state:${job.paidFlowState}` };
    }

    await this.database
      .update(jobsTable)
      .set({ paidFlowState: "sourcing_failed", updatedAt: new Date() })
      .where(eq(jobsTable.id, jobId));

    const paymentRows = await this.database
      .select()
      .from(jobPaymentsTable)
      .where(and(eq(jobPaymentsTable.jobId, jobId), eq(jobPaymentsTable.status, "paid")))
      .orderBy(desc(jobPaymentsTable.id))
      .limit(1);
    const payment = paymentRows[0];

    if (!payment?.stripePaymentIntentId) {
      await this.database
        .update(jobsTable)
        .set({ paidFlowState: "refund_pending", updatedAt: new Date() })
        .where(eq(jobsTable.id, jobId));
      return { ok: true as const, refund: "no_payment_on_file" as const };
    }

    const idempotencyKey = `job:${jobId}:refund:${payment.id}`;
    const refund = await this.paymentProvider.refundPaymentIntent(
      payment.stripePaymentIntentId,
      idempotencyKey,
    );

    await this.database
      .update(jobsTable)
      .set({
        paidFlowState: refund.ok ? "refund_pending" : "refund_pending",
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, jobId));

    if (refund.ok) {
      await this.database
        .update(jobPaymentsTable)
        .set({ stripeRefundId: refund.refundId, status: "refund_pending", updatedAt: new Date() })
        .where(eq(jobPaymentsTable.id, payment.id));
    }

    return { ok: true as const, refund: refund.ok ? ("initiated" as const) : ("failed" as const) };
  }

  async listPaidJobsForOperator() {
    return this.database
      .select()
      .from(jobsTable)
      .where(ne(jobsTable.paidFlowState, "not_started"))
      .orderBy(desc(jobsTable.updatedAt));
  }
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}
