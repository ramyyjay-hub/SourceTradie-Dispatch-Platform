import fs from "node:fs";
import path from "node:path";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  appUsersTable,
  partnerFunnelEventsTable,
  partnerServiceAreasTable,
  partnersTable,
} from "@workspace/db/schema";
import { SourceTradieRepository } from "../lib/source-tradie-repository";
import type { NotificationProvider } from "../lib/notification-provider";
import type { EmailMessage } from "../lib/notification-provider";

async function createTestApi(
  options: {
    failOnPhotoPut?: number;
    notificationProvider?: NotificationProvider;
  } = {},
) {
  process.env.DATABASE_URL ??= "postgres://localhost/source_tradie_test";
  process.env.SUPABASE_URL ??= "https://supabase.test";
  const { createSourceTradieRouter } = await import("../routes/source-tradie");
  const client = new PGlite();
  const migrationPaths = [
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
  ].map((file) =>
    path.resolve(import.meta.dirname, "../../../../lib/db/migrations", file),
  );
  await Promise.all(
    migrationPaths.map((migrationPath) =>
      client.exec(fs.readFileSync(migrationPath, "utf8")),
    ),
  );

  const app = express();
  const storedPhotos = new Map<string, { data: Buffer; contentType: string }>();
  let photoPutCount = 0;
  const jobPhotoStorage = {
    async put(key: string, data: Buffer, contentType: string) {
      photoPutCount += 1;
      if (photoPutCount === options.failOnPhotoPut)
        throw new Error("simulated_storage_failure");
      if (storedPhotos.has(key)) throw new Error("duplicate");
      storedPhotos.set(key, { data, contentType });
    },
    async get(key: string) {
      return storedPhotos.get(key) ?? null;
    },
    async delete(key: string) {
      storedPhotos.delete(key);
    },
  };
  const database = drizzle(client) as any;
  app.use(express.json());
  app.use(
    "/api",
    createSourceTradieRouter(database, {
      jobPhotoStorage,
      notificationProvider: options.notificationProvider,
      tokenVerifier: async (token) => ({
        subject: token,
        payload: { sub: token },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    storedPhotos,
    database,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await client.close();
    },
  };
}

describe("public job status route", () => {
  it("returns a usable status URL and only serves it with its issued token", async () => {
    const api = await createTestApi();
    try {
      const previewResponse = await fetch(
        `${api.baseUrl}/api/pricing/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: "Kitchen tap is leaking slowly.",
            trade: "Plumbing",
          }),
        },
      );
      expect(previewResponse.status).toBe(200);
      expect(await previewResponse.json()).toMatchObject({
        code: "plumbing.tap_leak",
        kind: "total",
      });

      const privatePreviewResponse = await fetch(
        `${api.baseUrl}/api/pricing/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: "Kitchen tap is leaking slowly.",
            trade: "Plumbing",
            serviceAddressLine1: "12 Example Street",
          }),
        },
      );
      expect(privatePreviewResponse.status).toBe(400);

      const createResponse = await fetch(`${api.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Kitchen tap is leaking slowly.",
          trade: "Plumbing",
          suburb: "Wollert",
          postcode: "3750",
          urgency: "Soon",
          preferredTime: "This afternoon",
          customerName: "Alex Morgan",
          serviceAddressLine1: "12 Example Street",
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as {
        id: number;
        statusAccessToken: string;
        statusAccessUrl: string;
      };

      const statusUrl = new URL(created.statusAccessUrl, api.baseUrl);
      expect(statusUrl.pathname).toBe(`/request/${created.id}`);
      expect(statusUrl.searchParams.get("token")).toBe(
        created.statusAccessToken,
      );

      const statusResponse = await fetch(
        `${api.baseUrl}/api/jobs/${created.id}${statusUrl.search}`,
      );
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as {
        expectedPrice: { code: string; minCents: number; maxCents: number };
      };
      expect(status.expectedPrice).toMatchObject({
        code: "plumbing.tap_leak",
        minCents: 16_000,
        maxCents: 26_000,
      });

      const invalidTokenResponse = await fetch(
        `${api.baseUrl}/api/jobs/${created.id}?token=${"0".repeat(64)}`,
      );
      expect(invalidTokenResponse.status).toBe(404);
    } finally {
      await api.close();
    }
  });
});

describe("partner application intake", () => {
  const application = {
    submissionId: "10000000-0000-4000-8000-000000000001",
    businessName: "Synthetic Northern Landscaping",
    contactName: "Test Applicant",
    abn: "11111111111",
    trade: "Landscaping & gardening",
    licence: "SYNTHETIC-ONLY",
    mobile: "0400000000",
    email: "partner-application@example.test",
    suburbs: ["Wollert", "Epping"],
    radiusKm: 15,
    services: ["Repairs"],
    emergencyJobs: false,
  };

  it("records privacy-safe UTM funnel events and attributes the application", async () => {
    const messages: EmailMessage[] = [];
    const api = await createTestApi({
      notificationProvider: {
        sendEmail: async (message) => {
          messages.push(message);
          return { ok: true, providerMessageId: `message-${messages.length}` };
        },
      },
    });
    const sessionId = "60000000-0000-4000-8000-000000000006";
    const submissionId = "70000000-0000-4000-8000-000000000007";
    const attribution = {
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "partner_launch_melbourne_north",
    };
    try {
      for (const eventType of [
        "partner_page_viewed",
        "partner_application_started",
      ]) {
        const response = await fetch(
          `${api.baseUrl}/api/partner-funnel/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, eventType, attribution }),
          },
        );
        expect(response.status).toBe(204);
      }

      const submitted = await fetch(`${api.baseUrl}/api/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          submissionId,
          funnelSessionId: sessionId,
          attribution,
        }),
      });
      expect(submitted.status).toBe(201);
      expect(messages).toHaveLength(2);

      const events = await api.database.select().from(partnerFunnelEventsTable);
      expect(events).toHaveLength(3);
      expect(
        events.map((event: { eventType: string }) => event.eventType).sort(),
      ).toEqual([
        "partner_application_started",
        "partner_application_submitted",
        "partner_page_viewed",
      ]);
      expect(
        events.every(
          (event: { utmSource: string | null }) =>
            event.utmSource === "facebook",
        ),
      ).toBe(true);
      expect(JSON.stringify(events)).not.toMatch(
        /Test Person|Test Trade|0400111222|test@example\.com/,
      );

      const stored = await api.database.select().from(partnersTable);
      expect(stored[0]).toMatchObject({
        trade: "Landscaping & gardening",
        acquisitionUtmSource: "facebook",
        acquisitionUtmMedium: "paid_social",
        acquisitionUtmCampaign: "partner_launch_melbourne_north",
      });

      const adminAuthId = "60000000-0000-4000-8000-000000000009";
      await api.database.insert(appUsersTable).values({
        authUserId: adminAuthId,
        role: "admin",
        isActive: true,
      });
      const adminView = await fetch(
        `${api.baseUrl}/api/admin/partner-applications`,
        { headers: { Authorization: `Bearer ${adminAuthId}` } },
      );
      expect(adminView.status).toBe(200);
      expect(await adminView.json()).toEqual([
        expect.objectContaining({
          businessName: application.businessName,
          acquisitionUtmSource: "facebook",
          acquisitionUtmMedium: "paid_social",
          acquisitionUtmCampaign: "partner_launch_melbourne_north",
        }),
      ]);

      const retry = await fetch(`${api.baseUrl}/api/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          submissionId,
          funnelSessionId: sessionId,
          attribution,
        }),
      });
      expect(retry.status).toBe(200);
      expect(
        await api.database.select().from(partnerFunnelEventsTable),
      ).toHaveLength(3);
      expect(await api.database.select().from(partnersTable)).toHaveLength(1);
      expect(messages).toHaveLength(2);
    } finally {
      await api.close();
    }
  });

  it("serves an admin-only partner acquisition funnel summary from recorded funnel events", async () => {
    const api = await createTestApi();
    try {
      const sessionA = "60000000-0000-4000-8000-000000000010";
      const sessionB = "60000000-0000-4000-8000-000000000011";
      const attribution = {
        utmSource: "facebook",
        utmMedium: "paid_social",
        utmCampaign: "partner_launch_melbourne_north",
      };

      for (const eventType of [
        "partner_page_viewed",
        "partner_application_started",
      ]) {
        for (const sessionId of [sessionA, sessionB]) {
          const response = await fetch(
            `${api.baseUrl}/api/partner-funnel/events`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, eventType, attribution }),
            },
          );
          expect(response.status).toBe(204);
        }
      }
      const viewOnly = await fetch(`${api.baseUrl}/api/partner-funnel/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "60000000-0000-4000-8000-000000000012",
          eventType: "partner_page_viewed",
        }),
      });
      expect(viewOnly.status).toBe(204);

      const unauthenticated = await fetch(
        `${api.baseUrl}/api/admin/partner-acquisition-summary`,
      );
      expect(unauthenticated.status).toBe(401);

      const partnerAuthId = "60000000-0000-4000-8000-000000000013";
      await api.database.insert(appUsersTable).values({
        authUserId: partnerAuthId,
        role: "partner",
        isActive: true,
      });
      const partnerView = await fetch(
        `${api.baseUrl}/api/admin/partner-acquisition-summary`,
        { headers: { Authorization: `Bearer ${partnerAuthId}` } },
      );
      expect(partnerView.status).toBe(403);

      const adminAuthId = "60000000-0000-4000-8000-000000000014";
      await api.database.insert(appUsersTable).values({
        authUserId: adminAuthId,
        role: "admin",
        isActive: true,
      });
      const adminView = await fetch(
        `${api.baseUrl}/api/admin/partner-acquisition-summary`,
        { headers: { Authorization: `Bearer ${adminAuthId}` } },
      );
      expect(adminView.status).toBe(200);
      const summary = (await adminView.json()) as {
        totals: Record<string, unknown>;
        breakdown: Record<string, unknown>[];
      };
      expect(summary.totals).toEqual({
        views: 3,
        starts: 2,
        submits: 0,
        viewToStartRate: 2 / 3,
        startToSubmitRate: 0,
        viewToSubmitRate: 0,
      });
      expect(summary.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            utmSource: "facebook",
            utmMedium: "paid_social",
            utmCampaign: "partner_launch_melbourne_north",
            views: 2,
            starts: 2,
          }),
          expect.objectContaining({
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            views: 1,
            starts: 0,
          }),
        ]),
      );
    } finally {
      await api.close();
    }
  });

  it("stores first, sends each email once, deduplicates retries, and restricts review to admins", async () => {
    const messages: EmailMessage[] = [];
    let databaseForProvider: any;
    let persistedBeforeEmail = false;
    const api = await createTestApi({
      notificationProvider: {
        sendEmail: async (message) => {
          persistedBeforeEmail =
            (await databaseForProvider.select().from(partnersTable)).length ===
            1;
          messages.push(message);
          return { ok: true, providerMessageId: "synthetic-message-id" };
        },
      },
    });
    databaseForProvider = api.database;
    try {
      const submit = () =>
        fetch(`${api.baseUrl}/api/partners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(application),
        });
      const first = await submit();
      expect(first.status).toBe(201);
      const receipt = (await first.json()) as Record<string, unknown>;
      expect(receipt).toMatchObject({
        status: "pending",
        duplicate: false,
      });
      expect(Object.keys(receipt).sort()).toEqual([
        "duplicate",
        "id",
        "status",
        "submittedAt",
      ]);

      const retry = await submit();
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ duplicate: true });
      expect(messages).toHaveLength(2);
      expect(persistedBeforeEmail).toBe(true);
      expect(messages[0]).toMatchObject({
        to: "partners@sourcetradie.com.au",
        subject: "New SourceTradie Partner Application",
      });
      expect(messages[0].text).toContain("Contact name: Test Applicant");
      expect(messages[0].text).toContain(
        "Business name: Synthetic Northern Landscaping",
      );
      expect(messages[0].text).toContain(
        "Trade: Landscaping & gardening",
      );
      expect(messages[0].text).toContain("Service areas: Wollert, Epping");
      expect(messages[0].text).toMatch(/Submitted: .*Z/);
      expect(messages[1]).toEqual({
        to: application.email,
        replyTo: "partners@sourcetradie.com.au",
        subject: "We received your SourceTradie application",
        text: [
          "Hi Test,",
          "",
          "Thanks for applying to join the SourceTradie Melbourne North partner network.",
          "",
          "We've received your application and our Partner Operations team will review your details.",
          "",
          "If your business is suitable for the pilot, we'll contact you regarding the next steps and verification process.",
          "",
          "If you have any questions in the meantime, you can reply directly to this email.",
          "",
          "Kind regards,",
          "Ramy Jay",
          "Partner Operations",
          "SourceTradie",
          "sourcetradie.com.au",
        ].join("\n"),
      });

      const stored = await api.database.select().from(partnersTable);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        trade: "Landscaping & gardening",
        status: "pending",
        availability: false,
        applicationNotificationStatus: "sent",
        applicationAcknowledgementStatus: "sent",
        applicationAcknowledgementProviderMessageId: "synthetic-message-id",
      });
      expect(
        await api.database.select().from(partnerServiceAreasTable),
      ).toHaveLength(2);

      const unauthenticated = await fetch(
        `${api.baseUrl}/api/admin/partner-applications`,
      );
      expect(unauthenticated.status).toBe(401);

      const partnerAuthId = "20000000-0000-4000-8000-000000000002";
      await api.database
        .update(partnersTable)
        .set({ authUserId: partnerAuthId })
        .where(eq(partnersTable.id, stored[0].id));
      await api.database.insert(appUsersTable).values({
        authUserId: partnerAuthId,
        role: "partner",
        isActive: true,
      });
      const partnerView = await fetch(
        `${api.baseUrl}/api/admin/partner-applications`,
        { headers: { Authorization: `Bearer ${partnerAuthId}` } },
      );
      expect(partnerView.status).toBe(403);

      const adminAuthId = "30000000-0000-4000-8000-000000000003";
      await api.database.insert(appUsersTable).values({
        authUserId: adminAuthId,
        role: "admin",
        isActive: true,
      });
      const adminView = await fetch(
        `${api.baseUrl}/api/admin/partner-applications`,
        { headers: { Authorization: `Bearer ${adminAuthId}` } },
      );
      expect(adminView.status).toBe(200);
      expect(await adminView.json()).toEqual([
        expect.objectContaining({
          businessName: application.businessName,
          contactName: application.contactName,
          mobile: application.mobile,
          email: application.email,
          notificationStatus: "sent",
          acknowledgementStatus: "sent",
          acquisitionUtmSource: null,
          acquisitionUtmMedium: null,
          acquisitionUtmCampaign: null,
        }),
      ]);
    } finally {
      await api.close();
    }
  });

  it("keeps a safely reviewable application when both email attempts fail", async () => {
    const api = await createTestApi({
      notificationProvider: {
        sendEmail: async () => ({ ok: false, errorCode: "synthetic_failure" }),
      },
    });
    try {
      const response = await fetch(`${api.baseUrl}/api/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          submissionId: "40000000-0000-4000-8000-000000000004",
        }),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ status: "pending" });
      const stored = await api.database.select().from(partnersTable);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        applicationNotificationStatus: "failed",
        applicationNotificationErrorCode: "synthetic_failure",
        applicationAcknowledgementStatus: "failed",
        applicationAcknowledgementErrorCode: "synthetic_failure",
      });
    } finally {
      await api.close();
    }
  });

  it("keeps the application and attempts both emails when the provider throws", async () => {
    let attempts = 0;
    const api = await createTestApi({
      notificationProvider: {
        sendEmail: async () => {
          attempts += 1;
          throw new Error("synthetic provider exception");
        },
      },
    });
    try {
      const response = await fetch(`${api.baseUrl}/api/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...application,
          submissionId: "50000000-0000-4000-8000-000000000005",
        }),
      });
      expect(response.status).toBe(201);
      expect(attempts).toBe(2);
      const stored = await api.database.select().from(partnersTable);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        applicationNotificationStatus: "failed",
        applicationNotificationErrorCode: "provider_unexpected_failure",
        applicationAcknowledgementStatus: "failed",
        applicationAcknowledgementErrorCode: "provider_unexpected_failure",
      });
    } finally {
      await api.close();
    }
  });
});

describe("token-protected job photo upload", () => {
  it("sanitizes valid photos, supports retry, enforces the cap, and never stores the original filename", async () => {
    const api = await createTestApi();
    try {
      const createResponse = await fetch(`${api.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Leaking pipe under the sink",
          trade: "Plumbing",
          suburb: "Wollert",
          postcode: "3750",
          urgency: "Soon",
          preferredTime: "Tomorrow",
          customerName: "Private Person",
          serviceAddressLine1: "99 Private Street",
        }),
      });
      const job = (await createResponse.json()) as {
        id: number;
        statusAccessToken: string;
      };
      const png = await sharp({
        create: { width: 20, height: 10, channels: 3, background: "green" },
      })
        .png()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const upload = async (files: number, token = job.statusAccessToken) => {
        const form = new FormData();
        for (let index = 0; index < files; index += 1) {
          form.append(
            "photos",
            new Blob([png], { type: "image/png" }),
            `Private Person 99 Street ${index}.png`,
          );
        }
        return fetch(
          `${api.baseUrl}/api/jobs/${job.id}/photos?token=${token}`,
          { method: "POST", body: form },
        );
      };

      const denied = await upload(1, "0".repeat(64));
      expect(denied.status).toBe(404);
      expect(api.storedPhotos.size).toBe(0);

      expect((await upload(2)).status).toBe(201);
      expect((await upload(1)).status).toBe(201);
      expect((await upload(1)).status).toBe(400);
      expect(api.storedPhotos.size).toBe(3);
      for (const [key, stored] of api.storedPhotos) {
        expect(key).toMatch(new RegExp(`^jobs/${job.id}/[0-9a-f-]+\\.webp$`));
        expect(key).not.toContain("Private");
        expect(stored.contentType).toBe("image/webp");
        const metadata = await sharp(stored.data).metadata();
        expect(metadata.exif).toBeUndefined();
      }
    } finally {
      await api.close();
    }
  });

  it("rejects a MIME-spoofed upload without leaving an object behind", async () => {
    const api = await createTestApi();
    try {
      const created = await fetch(`${api.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Power point is sparking",
          trade: "Electrical",
          suburb: "Epping",
          postcode: "3076",
          urgency: "Today",
          preferredTime: "Today",
          customerName: "Customer",
          serviceAddressLine1: "1 Hidden Road",
        }),
      });
      const job = (await created.json()) as {
        id: number;
        statusAccessToken: string;
      };
      const form = new FormData();
      form.append(
        "photos",
        new Blob(["not a jpeg"], { type: "image/jpeg" }),
        "document.jpg",
      );
      const response = await fetch(
        `${api.baseUrl}/api/jobs/${job.id}/photos?token=${job.statusAccessToken}`,
        { method: "POST", body: form },
      );
      expect(response.status).toBe(400);
      expect(api.storedPhotos.size).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("cleans up already-written objects when a later storage write fails", async () => {
    const api = await createTestApi({ failOnPhotoPut: 2 });
    try {
      const created = await fetch(`${api.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Tap is leaking",
          trade: "Plumbing",
          suburb: "Mernda",
          postcode: "3754",
          urgency: "Soon",
          preferredTime: "Tomorrow",
          customerName: "Customer",
          serviceAddressLine1: "1 Hidden Road",
        }),
      });
      const job = (await created.json()) as {
        id: number;
        statusAccessToken: string;
      };
      const png = await sharp({
        create: { width: 2, height: 2, channels: 3, background: "red" },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.append("photos", new Blob([png], { type: "image/png" }), "one.png");
      form.append("photos", new Blob([png], { type: "image/png" }), "two.png");
      const response = await fetch(
        `${api.baseUrl}/api/jobs/${job.id}/photos?token=${job.statusAccessToken}`,
        { method: "POST", body: form },
      );
      expect(response.status).toBe(400);
      expect(api.storedPhotos.size).toBe(0);
    } finally {
      await api.close();
    }
  });
});

describe("authenticated partner photo access", () => {
  it("allows the owning active partner and admin, but denies unauthenticated, cross-partner, cross-job and declined access", async () => {
    const api = await createTestApi();
    try {
      const repository = new SourceTradieRepository(api.database);
      const ownerAuthId = "11111111-1111-4111-8111-111111111111";
      const otherAuthId = "22222222-2222-4222-8222-222222222222";
      const adminAuthId = "33333333-3333-4333-8333-333333333333";
      const createPartner = (businessName: string, email: string) =>
        repository.createPartner({
          businessName,
          contactName: businessName,
          trade: "Plumbing",
          mobile: "0400000000",
          email,
          suburbs: ["Wollert"],
          radiusKm: 15,
          emergencyJobs: false,
          services: ["Leaks"],
        });
      const owner = await createPartner("Owner Plumbing", "owner@example.test");
      const other = await createPartner("Other Plumbing", "other@example.test");
      await api.database
        .update(partnersTable)
        .set({
          authUserId: ownerAuthId,
          status: "approved",
          availability: true,
        })
        .where(eq(partnersTable.id, owner.id));
      await api.database
        .update(partnersTable)
        .set({
          authUserId: otherAuthId,
          status: "approved",
          availability: true,
        })
        .where(eq(partnersTable.id, other.id));
      await api.database.insert(appUsersTable).values([
        { authUserId: ownerAuthId, role: "partner", isActive: true },
        { authUserId: otherAuthId, role: "partner", isActive: true },
        { authUserId: adminAuthId, role: "admin", isActive: true },
      ]);
      const makeJob = (description: string) =>
        repository.createJob({
          description,
          trade: "Plumbing",
          suburb: "Wollert",
          postcode: "3750",
          urgency: "Soon",
          preferredTime: "Tomorrow",
          customerName: "Hidden Customer",
          customerPhone: "0400999999",
          serviceAddressLine1: "44 Hidden Street",
        });
      const job = await makeJob("Leaking kitchen pipe");
      const [photo] = await repository.addStoredJobPhotos(job.id, [
        { objectKey: `jobs/${job.id}/opaque.webp` },
      ]);
      api.storedPhotos.set(`jobs/${job.id}/opaque.webp`, {
        data: Buffer.from("safe-image"),
        contentType: "image/webp",
      });
      const offer = await repository.createDispatchOffer({
        jobId: job.id,
        partnerId: owner.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(offer.kind).toBe("ok");
      if (offer.kind !== "ok") return;
      const url = `${api.baseUrl}/api/partner/offers/${offer.id}/photos/${photo!.id}`;
      expect((await fetch(url)).status).toBe(401);
      expect(
        (
          await fetch(url, {
            headers: { Authorization: `Bearer ${otherAuthId}` },
          })
        ).status,
      ).toBe(404);
      const ownerResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${ownerAuthId}` },
      });
      expect(ownerResponse.status).toBe(200);
      expect(ownerResponse.headers.get("cache-control")).toBe(
        "private, no-store",
      );
      expect(ownerResponse.headers.get("x-content-type-options")).toBe(
        "nosniff",
      );

      const otherJob = await makeJob("Leaking laundry pipe");
      const [otherPhoto] = await repository.addStoredJobPhotos(otherJob.id, [
        { objectKey: `jobs/${otherJob.id}/other.webp` },
      ]);
      expect(
        (
          await fetch(
            `${api.baseUrl}/api/partner/offers/${offer.id}/photos/${otherPhoto!.id}`,
            { headers: { Authorization: `Bearer ${ownerAuthId}` } },
          )
        ).status,
      ).toBe(404);

      await repository.decideDispatch(offer.id, "declined");
      expect(
        (
          await fetch(url, {
            headers: { Authorization: `Bearer ${ownerAuthId}` },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(url, {
            headers: { Authorization: `Bearer ${adminAuthId}` },
          })
        ).status,
      ).toBe(200);
    } finally {
      await api.close();
    }
  });
});
