import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  dispatchOffersTable,
  jobAiAssessmentsTable,
  jobIntakeSubmissionsTable,
  jobsTable,
  jobStatusHistoryTable,
  notificationsTable,
  partnersTable,
} from "@workspace/db/schema";
import {
  SourceTradieRepository,
  canTransitionDispatchState,
  canTransitionJobStatus,
} from "../lib/source-tradie-repository";
import type { JobAiProvider } from "../lib/job-ai-provider";
import type {
  EmailMessage,
  NotificationProvider,
} from "../lib/notification-provider";

function buildRepository(
  provider?: JobAiProvider,
  notificationProvider?: NotificationProvider,
) {
  const client = new PGlite();

  const migrationPaths = [
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0000_phase1_productionisation.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0001_phase2_auth_rbac.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0002_phase3_dispatch_lifecycle.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0003_phase4_safe_intake_ai.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0004_phase5_pilot_notifications.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0005_pricing_customer_confirmation.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0006_private_job_photos.sql",
    ),
    path.resolve(
      import.meta.dirname,
      "../../../../lib/db/migrations/0007_partner_application_intake.sql",
    ),
  ];

  return Promise.all(
    migrationPaths.map((migrationPath) =>
      client.exec(fs.readFileSync(migrationPath, "utf8")),
    ),
  ).then(() => {
    const testDb = drizzle(client);
    return {
      repository: new SourceTradieRepository(
        testDb as any,
        provider,
        notificationProvider,
      ),
      db: testDb,
      client,
    };
  });
}

const successfulProvider: JobAiProvider = {
  assess: async () => ({
    provider: "openai",
    model: "test-model",
    outcome: "success",
    assessment: {
      tradeClassification: "electrical",
      urgencyClassification: "today",
      suburb: "Richmond",
      postcode: "3121",
      preferredAttendanceTime: "Today",
      neutralProblemSummary: "Electrical issue requires review.",
      equipment: null,
      brand: null,
      model: null,
      photoContext: { provided: false, count: 0 },
      confidence: "medium",
      codes: ["ROUTING_REVIEW"],
    },
  }),
};

describe("source tradie repository", () => {
  it("creates jobs with stable references and history records", async () => {
    const { repository, db, client } =
      await buildRepository(successfulProvider);

    const job = await repository.createJob({
      description: "Kitchen tap leaking near sink trap",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Today",
      preferredTime: "This afternoon",
      customerName: "Alex Morgan",
      customerPhone: "0400000000",
      customerEmail: "alex@example.com",
      images: ["tap-1.jpg", "tap-2.jpg"],
    });

    expect(job.reference).toBe(`ST-${job.id}`);
    expect(job.images).toEqual(["tap-1.jpg", "tap-2.jpg"]);
    expect(job.assessment?.assessment).toEqual({
      tradeClassification: "electrical",
      urgencyClassification: "today",
      suburb: "Richmond",
      postcode: "3121",
      preferredAttendanceTime: "Today",
      neutralProblemSummary: "Electrical issue requires review.",
      equipment: null,
      brand: null,
      model: null,
      photoContext: { provided: true, count: 2 },
      confidence: "medium",
      codes: ["ROUTING_REVIEW"],
    });

    const history = await db
      .select()
      .from(jobStatusHistoryTable)
      .where(eq(jobStatusHistoryTable.jobId, job.id));

    expect(history).toHaveLength(1);
    expect(history[0]?.toStatus).toBe("awaiting_dispatch");

    await client.close();
  });

  it("keeps an explicit preferred time customer-confirmed when the AI draft differs", async () => {
    let providerPreferredTime = "";
    const provider: JobAiProvider = {
      assess: async (input) => {
        providerPreferredTime = input.preferredAttendanceTime;
        return {
          provider: "openai",
          model: "test-model",
          outcome: "success",
          assessment: {
            tradeClassification: "plumbing",
            urgencyClassification: "today",
            suburb: "Wollert",
            postcode: "3750",
            preferredAttendanceTime: "Flexible",
            neutralProblemSummary: "Hot water system stopped working.",
            equipment: "Hot water system",
            brand: null,
            model: null,
            photoContext: { provided: false, count: 0 },
            confidence: "medium",
            codes: ["ROUTING_REVIEW"],
          },
        };
      },
    };
    const { repository, db, client } = await buildRepository(provider);
    const job = await repository.createJob({
      description:
        "My hot water system stopped working this morning. I'm in Wollert and would like someone this afternoon if possible.",
      trade: "Plumbing",
      suburb: "Wollert",
      postcode: "3750",
      urgency: "Today",
      preferredTime: "This afternoon",
      customerName: "Alex Morgan",
    });

    expect(providerPreferredTime).toBe("This afternoon");
    expect(job.preferredTime).toBe("This afternoon");
    expect(job.assessment?.assessment.preferredAttendanceTime).toBe("Flexible");

    const publicStatus = await repository.getPublicJobStatusByToken(
      job.id,
      job.statusAccessToken,
    );
    expect(publicStatus?.intake.preferredTime).toBe("This afternoon");
    const submissions = await db.select().from(jobIntakeSubmissionsTable);
    expect(submissions[0]?.customerConfirmedValues).toMatchObject({
      preferredTime: "This afternoon",
    });
    await client.close();
  });

  it("enforces invalid job status transitions", async () => {
    const { repository, client } = await buildRepository();

    const job = await repository.createJob({
      description: "Power point sparks intermittently",
      trade: "Electrical",
      suburb: "Richmond",
      postcode: "3121",
      urgency: "Soon",
      preferredTime: "Weekday morning",
      customerName: "Priya Shah",
      images: [],
    });

    const result = await repository.updateJobStatus(job.id, "completed");
    expect(result.kind).toBe("invalid_transition");

    expect(canTransitionJobStatus("awaiting_dispatch", "dispatching")).toBe(
      true,
    );
    expect(canTransitionJobStatus("awaiting_dispatch", "completed")).toBe(
      false,
    );

    await client.close();
  });

  it("records dispatch decisions and rejects illegal dispatch transitions", async () => {
    const { repository, db, client } = await buildRepository();

    const partner = await repository.createPartner({
      businessName: "Good Flow Plumbing",
      contactName: "Sam Wilson",
      trade: "Plumbing",
      mobile: "0400000001",
      email: "sam@goodflow.test",
      suburbs: ["Brunswick", "Coburg"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });

    const job = await repository.createJob({
      description: "Hot water service stopped producing hot water",
      trade: "Plumbing",
      suburb: "Coburg",
      postcode: "3058",
      urgency: "Today",
      preferredTime: "Flexible",
      customerName: "Jamie Cole",
      images: [],
    });

    await repository.seedInitialDispatchForJob(job.id, partner.id);

    const offerRows = await db.select().from(dispatchOffersTable);
    expect(offerRows).toHaveLength(1);

    const accepted = await repository.decideDispatch(
      offerRows[0]!.id,
      "accepted",
      "45 minutes",
      "diagnostic",
      12_000,
    );
    expect(accepted.kind).toBe("ok");
    if (accepted.kind === "ok") {
      expect(accepted.dispatch.decision).toBe("accepted");
      expect(accepted.dispatch.respondedAt).not.toBeNull();
    }

    const invalid = await repository.decideDispatch(
      offerRows[0]!.id,
      "declined",
    );
    expect(invalid.kind).toBe("invalid_transition");

    const jobRow = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(jobRow[0]?.status).toBe("awaiting_customer_confirmation");

    const confirmed = await repository.confirmDispatch(
      job.id,
      job.statusAccessToken,
    );
    expect(confirmed.kind).toBe("ok");

    expect(canTransitionDispatchState("pending", "accepted")).toBe(true);
    expect(canTransitionDispatchState("accepted", "declined")).toBe(false);

    const partnerRows = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, partner.id));
    expect(partnerRows[0]?.status).toBe("pending");

    await client.close();
  });

  it("creates a pending dispatch offer, enforces a single active offer, and restores dispatchability when declined", async () => {
    const { repository, db, client } = await buildRepository();

    const partnerA = await repository.createPartner({
      businessName: "Good Flow Plumbing",
      contactName: "Sam Wilson",
      trade: "Plumbing",
      mobile: "0400000001",
      email: "sam@goodflow.test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });

    const partnerB = await repository.createPartner({
      businessName: "Fast Fix Plumbing",
      contactName: "Lee Morris",
      trade: "Plumbing",
      mobile: "0400000002",
      email: "lee@fastfix.test",
      suburbs: ["Coburg"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });

    const job = await repository.createJob({
      description: "Burst pipe under kitchen sink",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Today",
      preferredTime: "This afternoon",
      customerName: "Casey Nguyen",
      images: [],
    });

    const created = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: partnerA.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    expect(created.kind).toBe("ok");
    if (created.kind !== "ok") return;
    expect(created.state).toBe("pending");
    expect(created.jobId).toBe(job.id);

    const jobRow = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(jobRow[0]?.status).toBe("dispatching");

    const duplicate = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: partnerB.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });
    expect(duplicate.kind).toBe("active_offer_exists");

    const offerRows = await db
      .select()
      .from(dispatchOffersTable)
      .where(eq(dispatchOffersTable.jobId, job.id));
    expect(offerRows).toHaveLength(1);

    const decline = await repository.decideDispatch(
      offerRows[0]!.id,
      "declined",
    );
    expect(decline.kind).toBe("ok");

    const jobAfterDecline = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(jobAfterDecline[0]?.status).toBe("awaiting_dispatch");

    const nextOffer = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: partnerB.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });
    expect(nextOffer.kind).toBe("ok");

    await client.close();
  });

  it("marks an expired dispatch offer and returns the job to awaiting_dispatch", async () => {
    const { repository, db, client } = await buildRepository();

    const partner = await repository.createPartner({
      businessName: "Good Flow Plumbing",
      contactName: "Sam Wilson",
      trade: "Plumbing",
      mobile: "0400000001",
      email: "sam@goodflow.test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });

    const job = await repository.createJob({
      description: "Toilet overflowing",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Today",
      preferredTime: "Urgent",
      customerName: "Taylor Green",
      images: [],
    });
    await repository.addStoredJobPhotos(job.id, [
      { objectKey: `jobs/${job.id}/opaque.webp` },
    ]);

    const created = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: partner.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(created.kind).toBe("ok");
    if (created.kind !== "ok") return;

    const expired = await repository.expireDispatchOffer(created.offer.id);
    expect(expired.kind).toBe("ok");

    const finalJob = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(finalJob[0]?.status).toBe("awaiting_dispatch");
    expect(
      await db
        .select()
        .from(dispatchOffersTable)
        .where(eq(dispatchOffersTable.jobId, job.id)),
    ).toHaveLength(1);
    expect(
      (await repository.listPartnerOffers(partner.id))[0]?.job
        .serviceAddressLine1,
    ).toBeNull();
    expect(
      (await repository.listPartnerOffers(partner.id))[0]?.job.photos,
    ).toEqual([]);

    await client.close();
  });

  it("runs the manual pilot notification and acceptance flow without leaking the address", async () => {
    const sent: EmailMessage[] = [];
    const notifications: NotificationProvider = {
      sendEmail: async (message) => {
        sent.push(message);
        return { ok: true, providerMessageId: `message-${sent.length}` };
      },
    };
    const { repository, db, client } = await buildRepository(
      undefined,
      notifications,
    );
    const first = await repository.createPartner({
      businessName: "A Plumbing",
      contactName: "Ava",
      trade: "Plumbing",
      mobile: "0400000001",
      email: "ava@example.test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });
    const second = await repository.createPartner({
      businessName: "B Plumbing",
      contactName: "Ben",
      trade: "Plumbing",
      mobile: "0400000002",
      email: "ben@example.test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: ["Leaks"],
    });
    await db
      .update(partnersTable)
      .set({ status: "approved", availability: true })
      .where(eq(partnersTable.id, first.id));
    await db
      .update(partnersTable)
      .set({ status: "approved", availability: true })
      .where(eq(partnersTable.id, second.id));
    const job = await repository.createJob({
      description: "Kitchen tap leaks",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Tomorrow",
      customerName: "Customer",
      customerPhone: "0400999999",
      customerEmail: "customer@example.test",
      serviceAddressLine1: "12 Secret Street",
      serviceAddressLine2: "Unit 3",
    });
    const storedPhotos = await repository.addStoredJobPhotos(job.id, [
      { objectKey: `jobs/${job.id}/opaque.webp` },
    ]);
    const ranked = await repository.getPartnerRecommendations(job.id);
    expect(ranked?.find((item) => item.eligible)?.partnerId).toBe(first.id);
    const created = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: first.id,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(created.kind).toBe("ok");
    if (created.kind !== "ok") return;
    expect(created.notificationStatus).toBe("sent");
    expect(sent[0]?.text).not.toContain("Secret Street");
    expect(sent[0]?.text).not.toContain("0400999999");
    const pending = await repository.listPartnerOffers(first.id);
    expect(pending[0].job.serviceAddressLine1).toBeNull();
    expect(pending[0].job.customerPhone).toBeNull();
    expect(pending[0].job.photos).toEqual([{ id: storedPhotos[0]!.id }]);
    expect(
      (await repository.decideDispatch(created.id, "accepted", "45 minutes"))
        .kind,
    ).toBe("invalid_acceptance_terms");
    const accepted = await repository.decideDispatch(
      created.id,
      "accepted",
      "45 minutes",
      "total",
      22_000,
    );
    expect(accepted.kind).toBe("ok");
    if (accepted.kind === "ok")
      expect(accepted.dispatch.eta).toBe("45 minutes");
    const acceptedButPrivate = await repository.listPartnerOffers(first.id);
    expect(acceptedButPrivate[0].job.serviceAddressLine1).toBeNull();
    expect(acceptedButPrivate[0].job.customerPhone).toBeNull();
    expect(acceptedButPrivate[0].job.photos).toEqual([
      { id: storedPhotos[0]!.id },
    ]);
    const status = await repository.getPublicJobStatusByToken(
      job.id,
      job.statusAccessToken,
    );
    expect(status?.acceptedTradie).toEqual({
      businessName: "A Plumbing",
      contactName: "Ava",
      eta: "45 minutes",
      confirmedPriceKind: "total",
      confirmedPriceCents: 22_000,
      customerConfirmed: false,
    });
    expect(sent).toHaveLength(2);
    expect(
      (await repository.confirmDispatch(job.id, "0".repeat(64))).kind,
    ).toBe("not_found");
    const confirmed = await repository.confirmDispatch(
      job.id,
      job.statusAccessToken,
    );
    expect(confirmed.kind).toBe("ok");
    const visible = await repository.listPartnerOffers(first.id);
    expect(visible[0].job.serviceAddressLine1).toBe("12 Secret Street");
    expect(visible[0].job.customerPhone).toBe("0400999999");
    expect(
      (await db.select().from(dispatchOffersTable)).filter(
        (offer) => offer.jobId === job.id,
      ),
    ).toHaveLength(1);
    const duplicateConfirmation = await repository.confirmDispatch(
      job.id,
      job.statusAccessToken,
    );
    expect(duplicateConfirmation.kind).toBe("ok");
    const duplicate = await repository.decideDispatch(
      created.id,
      "accepted",
      "later",
      "total",
      23_000,
    );
    expect(duplicate.kind).toBe("invalid_transition");
    expect(sent).toHaveLength(4);
    expect(await db.select().from(notificationsTable)).toHaveLength(4);
    await client.close();
  });

  it("records notification failure and leaves decline fallback under admin control", async () => {
    const notifications: NotificationProvider = {
      sendEmail: async () => ({ ok: false, errorCode: "test_failure" }),
    };
    const { repository, db, client } = await buildRepository(
      undefined,
      notifications,
    );
    const first = await repository.createPartner({
      businessName: "A Plumbing",
      contactName: "Ava",
      trade: "Plumbing",
      mobile: "1",
      email: "a@test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: [],
    });
    const second = await repository.createPartner({
      businessName: "B Plumbing",
      contactName: "Ben",
      trade: "Plumbing",
      mobile: "2",
      email: "b@test",
      suburbs: ["Brunswick"],
      radiusKm: 15,
      emergencyJobs: false,
      services: [],
    });
    await db
      .update(partnersTable)
      .set({ status: "approved", availability: true });
    const job = await repository.createJob({
      description: "Tap leak",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Flexible",
      customerName: "Customer",
      serviceAddressLine1: "Private address",
    });
    const created = await repository.createDispatchOffer({
      jobId: job.id,
      partnerId: first.id,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(created.kind).toBe("ok");
    if (created.kind !== "ok") return;
    expect(created.notificationStatus).toBe("failed");
    await repository.decideDispatch(created.id, "declined");
    expect((await db.select().from(dispatchOffersTable)).length).toBe(1);
    const next = await repository.getPartnerRecommendations(job.id);
    expect(
      next?.find((item) => item.partnerId === first.id)?.disqualifications,
    ).toContain("ALREADY_ATTEMPTED");
    expect(next?.find((item) => item.eligible)?.partnerId).toBe(second.id);
    expect(
      (await db.select().from(jobsTable).where(eq(jobsTable.id, job.id)))[0]
        ?.status,
    ).toBe("awaiting_dispatch");
    await client.close();
  });

  it("applies deterministic safety overrides before the AI provider", async () => {
    let providerCalled = false;
    const provider: JobAiProvider = {
      assess: async () => {
        providerCalled = true;
        return successfulProvider.assess({
          description: "",
          trade: "",
          suburb: "",
          postcode: "",
          urgency: "",
          preferredAttendanceTime: "",
          photoContext: { provided: false, count: 0 },
          safety: {
            level: "standard",
            interruptFlow: false,
            codes: [],
            customerMessage: null,
          },
        });
      },
    };
    const { repository, db, client } = await buildRepository(provider);
    const job = await repository.createJob({
      description: "There is a gas smell and sparks near the meter.",
      trade: "Not sure",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Flexible",
      customerName: "Alex Morgan",
    });
    expect(providerCalled).toBe(false);
    expect(job.assessment?.outcome).toBe("safety_override");
    expect(job.assessment?.safetyCodes).toEqual(["GAS_SMELL", "SPARKS"]);
    const assessments = await db.select().from(jobAiAssessmentsTable);
    expect(assessments).toHaveLength(1);
    await client.close();
  });

  it("persists success and failure provider outcomes without blocking job creation", async () => {
    const failingProvider: JobAiProvider = {
      assess: async () => ({
        provider: "openai",
        model: "configured-model",
        outcome: "failure",
        assessment: {
          tradeClassification: "unsure",
          urgencyClassification: "unsure",
          suburb: null,
          postcode: null,
          preferredAttendanceTime: null,
          neutralProblemSummary: null,
          equipment: null,
          brand: null,
          model: null,
          photoContext: { provided: false, count: 0 },
          confidence: "low",
          codes: ["MANUAL_REVIEW_REQUIRED"],
        },
      }),
    };
    const { repository, db, client } = await buildRepository(failingProvider);
    const job = await repository.createJob({
      description: "Kitchen tap leaks slowly.",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Flexible",
      customerName: "Alex Morgan",
    });
    expect(job.id).toBeGreaterThan(0);
    expect(job.assessment?.outcome).toBe("failure");
    expect(job.assessment?.provider).toBe("openai");
    expect(job.assessment?.model).toBe("configured-model");
    expect(await db.select().from(jobAiAssessmentsTable)).toHaveLength(1);
    await client.close();
  });

  it("keeps customer corrections authoritative while retaining immutable intake history", async () => {
    const { repository, db, client } =
      await buildRepository(successfulProvider);
    const job = await repository.createJob({
      description: "Lights flicker in the kitchen.",
      trade: "Not sure",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Flexible",
      customerName: "Alex Morgan",
    });
    const corrected = await repository.correctJobIntake(
      job.id,
      job.statusAccessToken,
      {
        description: "Kitchen tap leaks slowly.",
        trade: "Plumbing",
        suburb: "Coburg",
        postcode: "3058",
        urgency: "Not urgent",
        preferredTime: "Weekend",
        customerName: "Alex Morgan",
      },
    );
    expect(corrected?.intake.trade).toBe("Plumbing");
    expect(corrected?.intake.urgency).toBe("Not urgent");
    expect(corrected?.assessment?.assessment.tradeClassification).toBe(
      "electrical",
    );
    const submissions = await db.select().from(jobIntakeSubmissionsTable);
    expect(submissions).toHaveLength(2);
    await expect(
      db
        .update(jobIntakeSubmissionsTable)
        .set({ customerConfirmedValues: {} })
        .where(eq(jobIntakeSubmissionsTable.id, submissions[0]!.id)),
    ).rejects.toThrow();
    await client.close();
  });

  it("ranks matching partners deterministically without creating dispatch offers", async () => {
    const { repository, db, client } =
      await buildRepository(successfulProvider);
    const job = await repository.createJob({
      description: "Kitchen tap leaks slowly.",
      trade: "Plumbing",
      suburb: "Brunswick",
      postcode: "3056",
      urgency: "Soon",
      preferredTime: "Flexible",
      customerName: "Alex Morgan",
    });
    const alpha = await repository.createPartner({
      businessName: "Alpha Plumbing",
      contactName: "A",
      trade: "Plumbing",
      mobile: "0400000001",
      email: "a@example.com",
      suburbs: ["Brunswick"],
      radiusKm: 10,
    });
    const bravo = await repository.createPartner({
      businessName: "Bravo Electrical",
      contactName: "B",
      trade: "Electrical",
      mobile: "0400000002",
      email: "b@example.com",
      suburbs: ["Brunswick"],
      radiusKm: 10,
    });
    await db
      .update(partnersTable)
      .set({ status: "approved", availability: true });
    const recommendations = await repository.getPartnerRecommendations(job.id);
    expect(recommendations?.map((item) => item.partnerId)).toEqual([
      alpha.id,
      bravo.id,
    ]);
    expect(recommendations?.[0]).toMatchObject({
      eligible: true,
      codes: expect.arrayContaining(["TRADE_MATCH", "SERVICE_AREA_MATCH"]),
    });
    expect(recommendations?.[1]?.disqualifications).toContain("TRADE_MISMATCH");
    expect(await db.select().from(dispatchOffersTable)).toHaveLength(0);
    await client.close();
  });
});
