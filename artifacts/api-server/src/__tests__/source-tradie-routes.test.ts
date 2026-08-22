import fs from "node:fs";
import path from "node:path";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

async function createTestApi() {
  process.env.DATABASE_URL ??= "postgres://localhost/source_tradie_test";
  process.env.SUPABASE_URL ??= "https://supabase.test";
  const { createSourceTradieRouter } = await import("../routes/source-tradie");
  const client = new PGlite();
  const migrationPaths = [
    "0000_phase1_productionisation.sql",
    "0001_phase2_auth_rbac.sql",
    "0002_phase3_dispatch_lifecycle.sql",
    "0003_phase4_safe_intake_ai.sql",
  ].map((file) =>
    path.resolve(import.meta.dirname, "../../../../lib/db/migrations", file),
  );
  await Promise.all(
    migrationPaths.map((migrationPath) =>
      client.exec(fs.readFileSync(migrationPath, "utf8")),
    ),
  );

  const app = express();
  app.use(express.json());
  app.use("/api", createSourceTradieRouter(drizzle(client) as any));
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
      expect(statusUrl.searchParams.get("token")).toBe(created.statusAccessToken);

      const statusResponse = await fetch(
        `${api.baseUrl}/api/jobs/${created.id}${statusUrl.search}`,
      );
      expect(statusResponse.status).toBe(200);

      const invalidTokenResponse = await fetch(
        `${api.baseUrl}/api/jobs/${created.id}?token=${"0".repeat(64)}`,
      );
      expect(invalidTokenResponse.status).toBe(404);
    } finally {
      await api.close();
    }
  });
});
