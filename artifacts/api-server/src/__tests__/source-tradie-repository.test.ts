import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  dispatchOffersTable,
  jobsTable,
  jobStatusHistoryTable,
  partnersTable,
} from "@workspace/db/schema";
import {
  SourceTradieRepository,
  canTransitionDispatchState,
  canTransitionJobStatus,
} from "../lib/source-tradie-repository";

function buildRepository() {
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
  ];

  return Promise.all(
    migrationPaths.map((migrationPath) =>
      client.exec(fs.readFileSync(migrationPath, "utf8")),
    ),
  ).then(() => {
    const testDb = drizzle(client);
    return {
      repository: new SourceTradieRepository(testDb as any),
      db: testDb,
      client,
    };
  });
}

describe("source tradie repository", () => {
  it("creates jobs with stable references and history records", async () => {
    const { repository, db, client } = await buildRepository();

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

    const history = await db
      .select()
      .from(jobStatusHistoryTable)
      .where(eq(jobStatusHistoryTable.jobId, job.id));

    expect(history).toHaveLength(1);
    expect(history[0]?.toStatus).toBe("awaiting_dispatch");

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
    );
    expect(accepted.kind).toBe("ok");
    if (accepted.kind === "ok") {
      expect(accepted.dispatch.decision).toBe("accepted");
      expect(accepted.dispatch.respondedAt).not.toBeNull();
    }

    const invalid = await repository.decideDispatch(offerRows[0]!.id, "declined");
    expect(invalid.kind).toBe("invalid_transition");

    const jobRow = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, job.id));
    expect(jobRow[0]?.status).toBe("accepted");

    expect(canTransitionDispatchState("pending", "accepted")).toBe(true);
    expect(canTransitionDispatchState("accepted", "declined")).toBe(false);

    const partnerRows = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.id, partner.id));
    expect(partnerRows[0]?.status).toBe("pending");

    await client.close();
  });
});
