import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep each warm serverless instance conservative. Supavisor transaction
  // mode handles concurrency across instances; application queries are unnamed
  // and therefore do not use prepared statements.
  max: positiveInteger("DB_POOL_MAX", 3),
  idleTimeoutMillis: positiveInteger("DB_IDLE_TIMEOUT_MS", 10_000),
  connectionTimeoutMillis: positiveInteger("DB_CONNECTION_TIMEOUT_MS", 10_000),
  allowExitOnIdle: true,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
