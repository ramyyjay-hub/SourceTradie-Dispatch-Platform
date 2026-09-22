import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  candidateProviderTradesTable,
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

// Mirrors normalizeName() in scripts/generate-candidate-import-sql.mjs --
// the DB's identity-key uniqueness is case/punctuation-insensitive.
function normalizeBusinessName(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}
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
  "0013_candidate_contact_eligibility.sql",
  "0014_candidate_provider_trades.sql",
  "0015_candidate_trading_names.sql",
  "0016_candidate_trade_source_url.sql",
  "0017_candidate_identity_key_by_name_phone.sql",
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

  // dispatch_eligible: this harness backs the full paid-checkout/refund flow
  // tests, which need a candidate serviceability actually considers charge-
  // worthy -- a freshly-imported unverified public listing is not enough
  // (see the dedicated "does not treat a pile of unverified..." test below).
  await testDb.insert(candidateProvidersTable).values({
    businessName: "Test Plumbing Co",
    normalizedBusinessName: normalizeBusinessName("Test Plumbing Co"),
    trade: "Plumbing",
    subServices: [],
    phone: "0400000111",
    normalizedPhone: "+61400000111",
    serviceSuburbs: ["Richmond"],
    servicePostcodes: ["3121"],
    source: "test-seed",
    verificationStatus: "dispatch_eligible",
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

  it("retrying checkout for the same job on the same day does not crash (idempotency key reuse)", async () => {
    const { repository, insertJob, testDb } = await buildHarness();
    const job = await insertJob();
    await repository.runServiceabilityCheck(job.id);

    const first = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(first.ok).toBe(true);

    // Simulates the frontend's "Retry checkout" button (or a double-click)
    // -- same job, same day, so startCheckout reuses the same idempotencyKey.
    const second = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(second.ok).toBe(true);

    const payments = await testDb
      .select()
      .from(jobPaymentsTable)
      .where(eq(jobPaymentsTable.jobId, job.id));
    expect(payments.length).toBe(1);
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
  it("does not offer checkout when there are zero plausible candidates at all (unsupported)", async () => {
    const { repository, insertJob } = await buildHarness();
    // An explicit, resolvable trade with no matching candidates anywhere in
    // the pool -- genuinely "unsupported", not just unverified. This is the
    // one outcome that must never be payable, manual-match or not: there is
    // no one at all to call.
    const job = await insertJob({
      trade: "Chimney Sweep",
      description: "The chimney sweep needs re-lining, very specialised work.",
      postcode: "9999",
      suburb: "Nowhere",
    });

    const serviceability = await repository.runServiceabilityCheck(job.id);
    expect(serviceability?.outcome).toBe("unsupported");

    const checkout = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(checkout.ok).toBe(false);
    if (!checkout.ok) expect(checkout.errorCode).toContain("not_serviceable");
  });

  it("does not treat a pile of unverified public_discovery candidates as automatically serviceable -- routes to manual_review, which can still be paid for manual (human) matching", async () => {
    const { repository, testDb, insertJob } = await buildHarness();

    // Freshly public_discovery-imported candidates: exactly what the 146-row
    // Melbourne seed import produces. None of these should be enough to
    // auto-charge a customer, no matter how many of them exist.
    for (let i = 0; i < 5; i++) {
      await testDb.insert(candidateProvidersTable).values({
        businessName: `Unverified Electrician ${i}`,
        normalizedBusinessName: normalizeBusinessName(`Unverified Electrician ${i}`),
        trade: "Electrical",
        subServices: [],
        phone: `040000020${i}`,
        normalizedPhone: `+6140000020${i}`,
        serviceSuburbs: ["Richmond"],
        servicePostcodes: ["3121"],
        source: "public_discovery",
        verificationStatus: "unverified",
        contactEligibility: "manual_only",
      });
    }

    const job = await insertJob({ trade: "Electrical" });
    const serviceability = await repository.runServiceabilityCheck(job.id);

    expect(serviceability?.outcome).toBe("manual_review");
    expect(serviceability?.rawCandidateCount).toBe(5);
    expect(serviceability?.verifiedCandidateCount).toBe(0);
    expect(serviceability?.dispatchReadyCount).toBe(0);

    // manual_review is deliberately payable: the homeowner is paying for
    // SourceTradie to personally source and match a provider by phone (see
    // recordManualMatch), not for instant AI dispatch to a licence-verified
    // tradie. No candidate's verification_status changes as a result.
    const checkout = await repository.startCheckout({
      jobId: job.id,
      successUrl: "https://sourcetradie.com.au/request/1?paid=1",
      cancelUrl: "https://sourcetradie.com.au/request/1?paid=0",
    });
    expect(checkout.ok).toBe(true);
    if (checkout.ok) {
      const jobAfterCheckout = await testDb
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.id, job.id));
      expect(jobAfterCheckout[0]?.paidFlowState).toBe("checkout_started");
    }

    // The unverified candidates themselves are untouched -- still nobody's
    // verification_status was flipped just because a job became payable.
    const candidatesAfter = await testDb
      .select({ verificationStatus: candidateProvidersTable.verificationStatus })
      .from(candidateProvidersTable)
      .where(eq(candidateProvidersTable.trade, "Electrical"));
    expect(candidatesAfter.every((row) => row.verificationStatus === "unverified")).toBe(true);
  });

  it("becomes serviceable once at least one candidate is promoted to dispatch_eligible", async () => {
    const { repository, testDb, insertJob } = await buildHarness();

    await testDb.insert(candidateProvidersTable).values([
      {
        businessName: "Unverified Locksmith",
        normalizedBusinessName: normalizeBusinessName("Unverified Locksmith"),
        trade: "Locksmith",
        subServices: [],
        phone: "0400000300",
        normalizedPhone: "+61400000300",
        serviceSuburbs: ["Richmond"],
        servicePostcodes: ["3121"],
        source: "public_discovery",
        verificationStatus: "unverified",
      },
      {
        businessName: "Checked Locksmith",
        normalizedBusinessName: normalizeBusinessName("Checked Locksmith"),
        trade: "Locksmith",
        subServices: [],
        phone: "0400000301",
        normalizedPhone: "+61400000301",
        serviceSuburbs: ["Richmond"],
        servicePostcodes: ["3121"],
        source: "public_discovery",
        verificationStatus: "dispatch_eligible",
      },
    ]);

    const job = await insertJob({ trade: "Locksmith" });
    const serviceability = await repository.runServiceabilityCheck(job.id);

    expect(serviceability?.outcome).toBe("serviceable");
    expect(serviceability?.rawCandidateCount).toBe(2);
    expect(serviceability?.dispatchReadyCount).toBe(1);
  });

  it("finds a multi-trade candidate for a job under a trade that isn't its legacy single trade column", async () => {
    const { repository, testDb, insertJob } = await buildHarness();

    const [lexity] = await testDb
      .insert(candidateProvidersTable)
      .values({
        businessName: "Lexity",
        normalizedBusinessName: normalizeBusinessName("Lexity"),
        trade: "Electrical", // legacy column deliberately does NOT say Heating & Cooling
        subServices: [],
        phone: "1300993447",
        normalizedPhone: "+611300993447",
        serviceSuburbs: ["Richmond"],
        servicePostcodes: ["3121"],
        source: "test-seed",
        verificationStatus: "dispatch_eligible",
      })
      .returning();
    await testDb.insert(candidateProviderTradesTable).values([
      {
        candidateProviderId: lexity!.id,
        trade: "Electrical",
        sourceUrl: "https://example.com/electrical-listing",
      },
      {
        candidateProviderId: lexity!.id,
        trade: "Heating & Cooling",
        sourceUrl: "https://example.com/hvac-listing",
      },
    ]);

    const job = await insertJob({ trade: "Heating & Cooling" });
    const serviceability = await repository.runServiceabilityCheck(job.id);

    expect(serviceability?.outcome).toBe("serviceable");
    expect(serviceability?.candidateCount).toBeGreaterThan(0);
  });

  it("retains a distinct source_url per capability for a multi-trade identity", async () => {
    const { testDb } = await buildHarness();

    const [cloudFlow] = await testDb
      .insert(candidateProvidersTable)
      .values({
        businessName: "Cloud Flow Pty Ltd",
        normalizedBusinessName: normalizeBusinessName("Cloud Flow Pty Ltd"),
        tradingNames: ["Solus Plumbing", "Solus Locksmith"],
        trade: "Plumbing",
        subServices: [],
        phone: "1300730896",
        normalizedPhone: "1300730896",
        serviceSuburbs: [],
        servicePostcodes: [],
        source: "public_discovery",
        sourceUrl: "https://www.solusplumbing.com.au/vic/",
      })
      .returning();

    await testDb.insert(candidateProviderTradesTable).values([
      {
        candidateProviderId: cloudFlow!.id,
        trade: "Plumbing",
        tradingName: "Solus Plumbing",
        sourceUrl: "https://www.solusplumbing.com.au/vic/",
      },
      {
        candidateProviderId: cloudFlow!.id,
        trade: "Locksmith",
        tradingName: "Solus Locksmith",
        sourceUrl: "https://www.soluslocksmith.com.au/vic/",
      },
    ]);

    const capabilities = await testDb
      .select()
      .from(candidateProviderTradesTable)
      .where(eq(candidateProviderTradesTable.candidateProviderId, cloudFlow!.id));

    const plumbing = capabilities.find((c) => c.trade === "Plumbing");
    const locksmith = capabilities.find((c) => c.trade === "Locksmith");

    expect(plumbing?.sourceUrl).toBe("https://www.solusplumbing.com.au/vic/");
    expect(locksmith?.sourceUrl).toBe("https://www.soluslocksmith.com.au/vic/");
    expect(plumbing?.sourceUrl).not.toBe(locksmith?.sourceUrl);
    // The provider-level source_url stays the canonical/general one, independent
    // of either capability-specific source.
    expect(cloudFlow!.sourceUrl).toBe("https://www.solusplumbing.com.au/vic/");
  });

  it("candidate shortlist returns up to 10 ranked nearby candidates for manual calling, regardless of verification status", async () => {
    const { repository, testDb, insertJob } = await buildHarness();

    for (let i = 0; i < 12; i++) {
      await testDb.insert(candidateProvidersTable).values({
        businessName: `Richmond Sparky ${i}`,
        normalizedBusinessName: normalizeBusinessName(`Richmond Sparky ${i}`),
        trade: "Electrical",
        subServices: [],
        phone: `040000030${i}`,
        normalizedPhone: `+6140000030${i}`,
        serviceSuburbs: ["Richmond"],
        servicePostcodes: ["3121"],
        source: "public_discovery",
        verificationStatus: "unverified",
        contactEligibility: "manual_only",
      });
    }
    // One out-of-area candidate that shouldn't outrank the 12 in-area ones.
    await testDb.insert(candidateProvidersTable).values({
      businessName: "Faraway Sparky",
      normalizedBusinessName: normalizeBusinessName("Faraway Sparky"),
      trade: "Electrical",
      subServices: [],
      phone: "0400000399",
      normalizedPhone: "+61400000399",
      serviceSuburbs: ["Ballarat"],
      servicePostcodes: ["3350"],
      source: "public_discovery",
      verificationStatus: "unverified",
      contactEligibility: "manual_only",
    });

    const job = await insertJob({ trade: "Electrical" });
    const shortlist = await repository.getCandidateShortlist(job.id);

    expect(shortlist?.inferredTrade).toBe("Electrical");
    expect(shortlist?.candidates.length).toBe(10);
    expect(
      shortlist?.candidates.every((candidate) =>
        candidate.businessName.startsWith("Richmond Sparky"),
      ),
    ).toBe(true);
    expect(
      shortlist?.candidates.some((candidate) => candidate.businessName === "Faraway Sparky"),
    ).toBe(false);
    // No verification-status filtering -- these are all "unverified", and
    // that's exactly the point: the phone call is what verifies them.
    expect(
      shortlist?.candidates.every((candidate) => candidate.verificationStatus === "unverified"),
    ).toBe(true);
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

  it("is configured and marked test-mode for a restricted rk_test_ key", () => {
    const provider = new StripePaymentProvider("rk_test_fake_for_test_only", "whsec_fake");
    expect(provider.configured).toBe(true);
    expect(provider.testMode).toBe(true);
  });

  it("refuses to operate with a live restricted (rk_live_) key just like sk_live_", () => {
    const provider = new StripePaymentProvider("rk_live_fake_for_test_only", undefined);
    expect(provider.configured).toBe(false);
  });

  it("allows a live key only once STRIPE_LIVE_PAYMENTS_APPROVED=true is set -- not NODE_ENV", () => {
    const original = process.env.STRIPE_LIVE_PAYMENTS_APPROVED;
    try {
      delete process.env.STRIPE_LIVE_PAYMENTS_APPROVED;
      expect(new StripePaymentProvider("sk_live_fake_for_test_only", undefined).configured).toBe(false);

      // Setting NODE_ENV alone (the old, collision-prone mechanism) must NOT
      // open the gate -- NODE_ENV is relied on elsewhere for its standard
      // meaning (logger transport choice, CORS origin checks) and must never
      // be repurposed as this flag again.
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production_live_payments_approved";
      expect(new StripePaymentProvider("sk_live_fake_for_test_only", undefined).configured).toBe(false);
      process.env.NODE_ENV = originalNodeEnv;

      process.env.STRIPE_LIVE_PAYMENTS_APPROVED = "true";
      expect(new StripePaymentProvider("sk_live_fake_for_test_only", "whsec_fake").configured).toBe(true);
    } finally {
      if (original === undefined) delete process.env.STRIPE_LIVE_PAYMENTS_APPROVED;
      else process.env.STRIPE_LIVE_PAYMENTS_APPROVED = original;
    }
  });
});
