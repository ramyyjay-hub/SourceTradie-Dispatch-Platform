import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  candidateProvidersTable,
  jobPaymentEventsTable,
  jobPaymentsTable,
  jobsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { PaidDispatchRepository } from "../lib/paid-dispatch-repository";
import type {
  CreateCheckoutResult,
  PaymentProvider,
  RefundResult,
} from "../lib/stripe-provider";
import { StripePaymentProvider } from "../lib/stripe-provider";
import type { EmailMessage, NotificationProvider } from "../lib/notification-provider";

const MIGRATION_FILES = [
  "0000_phase1_productionisation.sql",
  "0001_phase2_auth_rbac.sql",
  "0002_phase3_dispatch_lifecycle.sql",
  "0003_phase4_safe_intake_ai.sql",
  "0004_phase5_pilot_notifications.sql",
  "0005_pricing_customer_confirmation.sql",
  "0006_private_job_photos.sql",
  "0007_partner_application_intake.sql",
  "0008_partner_application_acknowledgement.sql",
  "0009_partner_offer_sms.sql",
  "0010_partner_acquisition_funnel.sql",
  "0011_managed_sourcing.sql",
  "0012_paid_dispatch_foundation.sql",
];

/**
 * A deterministic, entirely in-memory stand-in for Stripe. Never makes a
 * network call, never touches real money. Used so the paid-dispatch state
 * machine can be proven end to end (success path + refund path) without
 * Stripe credentials.
 */
class MockPaymentProvider implements PaymentProvider {
  readonly configured = true;
  readonly testMode = true;
  public sessionCounter = 0;
  public refundCounter = 0;
  public createdSessions: Array<{ jobId: number; sessionId: string }> = [];
  public refunds: string[] = [];

  async createCheckoutSession(input: {
    jobId: number;
  }): Promise<CreateCheckoutResult> {
    this.sessionCounter += 1;
    const sessionId = `cs_test_mock_${this.sessionCounter}`;
    this.createdSessions.push({ jobId: input.jobId, sessionId });
    return {
      ok: true,
      checkoutUrl: `https://checkout.stripe.com/test/${sessionId}`,
      sessionId,
      testMode: true,
    };
  }

  constructWebhookEvent() {
    return { ok: true as const, event: {} as never };
  }

  async refundPaymentIntent(): Promise<RefundResult> {
    this.refundCounter += 1;
    const refundId = `re_test_mock_${this.refundCounter}`;
    this.refunds.push(refundId);
    return { ok: true, refundId };
  }
}

function fakeCheckoutCompletedEvent(input: {
  eventId: string;
  sessionId: string;
  paymentIntentId: string;
  jobId: number;
}) {
  return {
    id: input.eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        payment_intent: input.paymentIntentId,
        customer: null,
        payment_status: "paid",
        metadata: { jobId: String(input.jobId) },
      },
    },
  } as unknown as Parameters<PaidDispatchRepository["handleWebhookEvent"]>[0];
}

async function buildHarness() {
  const client = new PGlite();
  await Promise.all(
    MIGRATION_FILES.map((file) =>
      client.exec(
        fs.readFileSync(
          path.resolve(import.meta.dirname, "../../../../lib/db/migrations", file),
          "utf8",
        ),
      ),
    ),
  );
  const testDb = drizzle(client);

  await testDb.insert(candidateProvidersTable).values({
    businessName: "Test Plumbing Co",
    trade: "Plumbing",
    subServices: [],
    phone: "0400000111",
    normalizedPhone: "+61400000111",
    serviceSuburbs: ["Richmond"],
    servicePostcodes: ["3121"],
    source: "test-seed",
  });

  const emails: EmailMessage[] = [];
  const notificationProvider: NotificationProvider = {
    sendEmail: async (message) => {
      emails.push(message);
      return { ok: true, providerMessageId: `test-msg-${emails.length}` };
    },
  };

  const paymentProvider = new MockPaymentProvider();
  const repository = new PaidDispatchRepository(
    testDb as any,
    paymentProvider,
    notificationProvider,
  );

  async function insertJob(overrides: Partial<typeof jobsTable.$inferInsert> = {}) {
    const rows = await testDb
      .insert(jobsTable)
      .values({
        reference: `ST-TEST-${Math.random().toString(36).slice(2, 8)}`,
        publicStatusToken: `token-${Math.random().toString(36).slice(2, 10)}`,
        description: "The kitchen tap is leaking constantly and won't shut off.",
        trade: "Plumbing",
        suburb: "Richmond",
        postcode: "3121",
        urgency: "Today",
        preferredTime: "Flexible",
        customerName: "TEST CUSTOMER",
        ...overrides,
      })
      .returning();
    return rows[0]!;
  }

  return { client, testDb, repository, paymentProvider, notificationProvider, emails, insertJob };
}

describe("paid dispatch: synthetic success path", () => {
  it("takes a paid job from request through payment, manual match, approval and completion", async () => {
    const { repository, paymentProvider, emails, insertJob, testDb } = await buildHarness();
    const job = await insertJob();

    const serviceability = await repository.runServiceabilityCheck(job.id);
    expect(serviceability?.outcome).toBe("serviceable");
    expect(serviceability?.candidateCount).toBeGreaterThan(0);

    const checkout = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;
    expect(checkout.testMode).toBe(true);
    expect(checkout.checkoutUrl).toContain("checkout.stripe.com/test/");

    const [payment] = await testDb
      .select()
      .from(jobPaymentsTable)
      .where(eq(jobPaymentsTable.jobId, job.id));
    expect(payment?.status).toBe("pending");

    // Webhook is authoritative -- job is NOT paid until this fires.
    const jobAfterCheckoutStart = await testDb
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(jobAfterCheckoutStart[0]?.paidFlowState).toBe("checkout_started");

    const webhookResult = await repository.handleWebhookEvent(
      fakeCheckoutCompletedEvent({
        eventId: "evt_test_success_1",
        sessionId: paymentProvider.createdSessions[0]!.sessionId,
        paymentIntentId: "pi_test_success_1",
        jobId: job.id,
      }),
    );
    expect(webhookResult).toEqual({ ok: true, alreadyProcessed: false });

    const jobAfterPayment = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobAfterPayment[0]?.paidFlowState).toBe("sourcing");
    expect(emails.some((e) => e.subject.includes("[PAID]"))).toBe(true);

    // Duplicate delivery of the same webhook event must be a harmless no-op.
    const duplicate = await repository.handleWebhookEvent(
      fakeCheckoutCompletedEvent({
        eventId: "evt_test_success_1",
        sessionId: paymentProvider.createdSessions[0]!.sessionId,
        paymentIntentId: "pi_test_success_1",
        jobId: job.id,
      }),
    );
    expect(duplicate).toEqual({ ok: true, alreadyProcessed: true });
    const emailCountAfterDuplicate = emails.length;

    const secondDuplicate = await repository.handleWebhookEvent(
      fakeCheckoutCompletedEvent({
        eventId: "evt_test_success_1",
        sessionId: paymentProvider.createdSessions[0]!.sessionId,
        paymentIntentId: "pi_test_success_1",
        jobId: job.id,
      }),
    );
    expect(secondDuplicate.ok && secondDuplicate.alreadyProcessed).toBe(true);
    expect(emails.length).toBe(emailCountAfterDuplicate);

    const manualMatch = await repository.recordManualMatch({
      jobId: job.id,
      providerName: "Test Plumbing Co",
      providerPhone: "0400000111",
      priceMinCents: 28000,
      priceMaxCents: 34000,
      eta: "Today 3-5pm",
      notes: "Confirmed availability by phone (simulated in test).",
    });
    expect(manualMatch.ok).toBe(true);

    const jobAfterMatch = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobAfterMatch[0]?.paidFlowState).toBe("match_ready");
    expect(jobAfterMatch[0]?.matchedProviderName).toBe("Test Plumbing Co");

    const approval = await repository.approveMatch(job.id, job.publicStatusToken);
    expect(approval.ok).toBe(true);

    const jobAfterApproval = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobAfterApproval[0]?.paidFlowState).toBe("approved");
    expect(jobAfterApproval[0]?.approvedAt).not.toBeNull();

    const completion = await repository.markCompleted(job.id);
    expect(completion.ok).toBe(true);

    const jobFinal = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobFinal[0]?.paidFlowState).toBe("completed");

    // Never a live charge, never a real notification/SMS side effect.
    expect(paymentProvider.refundCounter).toBe(0);
  });
});

describe("paid dispatch: synthetic failure / refund path", () => {
  it("refunds the sourcing fee when sourcing fails after payment", async () => {
    const { repository, paymentProvider, insertJob, testDb } = await buildHarness();
    const job = await insertJob();

    await repository.runServiceabilityCheck(job.id);
    const checkout = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    await repository.handleWebhookEvent(
      fakeCheckoutCompletedEvent({
        eventId: "evt_test_failure_1",
        sessionId: paymentProvider.createdSessions[0]!.sessionId,
        paymentIntentId: "pi_test_failure_1",
        jobId: job.id,
      }),
    );

    const jobAfterPayment = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobAfterPayment[0]?.paidFlowState).toBe("sourcing");

    const failure = await repository.markSourcingFailed(job.id);
    expect(failure.ok).toBe(true);
    if (failure.ok) expect(failure.refund).toBe("initiated");
    expect(paymentProvider.refundCounter).toBe(1);

    const jobAfterFailure = await testDb.select().from(jobsTable).where(eq(jobsTable.id, job.id));
    expect(jobAfterFailure[0]?.paidFlowState).toBe("refund_pending");

    const [payment] = await testDb
      .select()
      .from(jobPaymentsTable)
      .where(eq(jobPaymentsTable.jobId, job.id));
    expect(payment?.status).toBe("refund_pending");
    expect(payment?.stripeRefundId).toBeTruthy();

    // No real tradie was ever contacted -- there is no SMS provider wired
    // into this flow at all, mocked or otherwise.
  });
});

describe("paid dispatch: serviceability gate refuses to charge", () => {
  it("does not offer checkout for an unsupported trade/postcode", async () => {
    const { repository, insertJob } = await buildHarness();
    const job = await insertJob({
      trade: "Not sure",
      description: "The chimney sweep needs re-lining, very specialised work.",
      postcode: "9999",
      suburb: "Nowhere",
    });

    const serviceability = await repository.runServiceabilityCheck(job.id);
    expect(serviceability?.outcome).not.toBe("serviceable");

    const checkout = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(checkout.ok).toBe(false);
    if (!checkout.ok) expect(checkout.errorCode).toContain("not_serviceable");
  });
});

describe("paid dispatch: webhook events are never used without a job id we control", () => {
  it("never throws on an event referencing a job id that doesn't exist (foreign key rejects it safely)", async () => {
    const { repository } = await buildHarness();
    // In real operation this can't happen -- metadata.jobId is only ever set
    // by our own startCheckout() to a job we just created. This proves the
    // handler degrades safely (structured error, no unhandled exception,
    // Stripe would just retry) rather than crashing, even for an impossible
    // payload.
    const result = await repository.handleWebhookEvent(
      fakeCheckoutCompletedEvent({
        eventId: "evt_test_orphan_1",
        sessionId: "cs_test_does_not_exist",
        paymentIntentId: "pi_test_orphan_1",
        jobId: 999999,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("webhook_log_failed");
  });
});

describe("StripePaymentProvider safety rails", () => {
  it("is not configured when STRIPE_SECRET_KEY is unset (never crashes, never charges)", () => {
    const provider = new StripePaymentProvider(undefined, undefined);
    expect(provider.configured).toBe(false);
    expect(provider.testMode).toBe(false);
  });

  it("refuses to operate with a live (sk_live_) key -- code-level guard against accidental live charges", () => {
    const provider = new StripePaymentProvider("sk_live_fake_for_test_only", undefined);
    expect(provider.configured).toBe(false);
  });

  it("is configured and marked test-mode for a sk_test_ key", () => {
    const provider = new StripePaymentProvider("sk_test_fake_for_test_only", "whsec_fake");
    expect(provider.configured).toBe(true);
    expect(provider.testMode).toBe(true);
  });
});
