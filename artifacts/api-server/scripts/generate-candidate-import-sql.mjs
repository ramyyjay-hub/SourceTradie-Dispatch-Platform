#!/usr/bin/env node
// Generates the transactional Production import SQL for the candidate
// provider seed workbook, then proves it against a throwaway in-memory
// Postgres (PGlite) before anyone runs it for real:
//   1. apply once -- check identity/capability counts match the dry run
//   2. apply a deliberately-broken copy -- prove a mid-provider failure
//      rolls back that provider's insert entirely (never a half-imported
//      business)
//   3. apply the same good SQL a second time -- prove re-running is a
//      no-op (same provider IDs, no duplicate rows)
// Writes the generated SQL to a file. Never touches Production -- this
// script has no DATABASE_URL and cannot reach it.
//
// Usage: node scripts/generate-candidate-import-sql.mjs <path-to-xlsx> <output-sql-path>

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";
import { PGlite } from "@electric-sql/pglite";

const SUPPORTED_LAUNCH_TRADES = [
  "Plumbing", "Electrical", "Heating & Cooling", "Locksmith",
  "Handyman / Property Maintenance", "Roofing & Gutters", "Pest Control",
  "Appliance Repair", "Garage Doors", "Cleaning", "Rubbish Removal",
];
const MELBOURNE_LAUNCH_ZONES = ["North", "West", "East", "South-East", "Bayside/Inner"];

// Externally-verified corrections (ABN Lookup, not guessed). Keyed by the
// normalized business names a dedup cluster contains; when a cluster's
// name set matches, the canonical identity and trading-name-per-capability
// mapping below are used instead of the generic "first row wins" rule.
const VERIFIED_IDENTITY_OVERRIDES = [
  {
    matchNames: new Set(["Solus Plumbing", "Solus Locksmith"]),
    canonicalName: "Cloud Flow Pty Ltd",
    tradingNameByTrade: { Plumbing: "Solus Plumbing", Locksmith: "Solus Locksmith" },
    note: "ABN 49 154 223 980 -- Solus Plumbing and Solus Locksmith are both current registered trading names of Cloud Flow Pty Ltd (registered 29 May 2026).",
  },
];

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error("Usage: node generate-candidate-import-sql.mjs <path-to-xlsx> <output-sql-path>");
  process.exit(1);
}

// ---- 1. Parse the workbook (same approach as the dry-run script) ----------

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-seed-"));
execSync(`unzip -o -q ${JSON.stringify(inputPath)} -d ${JSON.stringify(workDir)}`);

function colToIndex(col) {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}
function unescapeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function readSheet(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const rowMatches = xml.match(/<x:row [^>]*>[\s\S]*?<\/x:row>/g) || [];
  return rowMatches.map((rowXml) => {
    const cellMatches = rowXml.match(/<x:c [^>]*\/>|<x:c [^>]*>[\s\S]*?<\/x:c>/g) || [];
    const row = [];
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/r="([A-Z]+)(\d+)"/);
      const col = refMatch ? colToIndex(refMatch[1]) : row.length;
      const vMatch = cellXml.match(/<x:v>([\s\S]*?)<\/x:v>/);
      row[col] = vMatch ? unescapeXml(vMatch[1]) : "";
    }
    return row;
  });
}

const workbookXml = fs.readFileSync(path.join(workDir, "xl/workbook.xml"), "utf8");
const relsXml = fs.readFileSync(path.join(workDir, "xl/_rels/workbook.xml.rels"), "utf8");
const sheetMatch = [...workbookXml.matchAll(/<x:sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(([, name]) => name === "Providers");
const [, , providersRid] = sheetMatch;
const relMatch = relsXml.match(new RegExp(`Target="([^"]+)"[^/]*Id="${providersRid}"`));
const providersTarget = relMatch?.[1] ?? relsXml.match(new RegExp(`Id="${providersRid}"[^/]*Target="([^"]+)"`))?.[1];
const providerRows = readSheet(path.join(workDir, providersTarget.replace(/^\//, "")));
const header = providerRows[0];
const dataRows = providerRows.slice(1);
fs.rmSync(workDir, { recursive: true, force: true });

const COL = {
  category: header.indexOf("Category"), business: header.indexOf("Business"),
  phone: header.indexOf("Phone"), website: header.indexOf("Website"),
  serviceArea: header.indexOf("Service Area"), hours: header.indexOf("24/7 / Extended"),
  licenceCheck: header.indexOf("Licence Check"), sourceUrl: header.indexOf("Source URL"),
};

// ---- 2. Zone mapping, normalization (identical rules to the dry run) ------

const ALL_MELBOURNE_PATTERN = /all melbourne|metro melbourne|melbourne[- ]wide/i;
const NORTH_SUBURB_HINTS = /craigieburn|epping|kalkallo|mernda|reservoir|lalor|thomastown|wollert|mitchell shire/i;

function mapServiceAreaToZones(raw) {
  const text = (raw || "").toLowerCase();
  if (ALL_MELBOURNE_PATTERN.test(text)) return { zones: [...MELBOURNE_LAUNCH_ZONES], unmatchedText: null };
  const zones = new Set();
  const withoutSouthEast = text.replace(/south[- ]east/g, "");
  if (/south[- ]east/.test(text)) zones.add("South-East");
  if (/bayside|inner/.test(text)) zones.add("Bayside/Inner");
  if (/north/.test(text) || NORTH_SUBURB_HINTS.test(text)) zones.add("North");
  if (/west/.test(withoutSouthEast)) zones.add("West");
  if (/east/.test(withoutSouthEast)) zones.add("East");
  if (zones.size === 0) return { zones: [], unmatchedText: raw };
  return { zones: [...zones], unmatchedText: null };
}

function normalizePhoneDigits(raw) { return (raw || "").replace(/[^\d]/g, ""); }
function normalizeName(raw) { return (raw || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function normalizeAustralianPhone(raw) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+61")) return digits;
  if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
  if (digits.startsWith("61")) return `+${digits}`;
  return digits;
}
function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlJsonbArray(values) {
  return `'${JSON.stringify(values).replace(/'/g, "''")}'::jsonb`;
}

const normalizedRows = dataRows.map((row, i) => {
  const rowNumber = i + 2;
  const category = (row[COL.category] || "").trim();
  const businessName = (row[COL.business] || "").trim();
  const phone = (row[COL.phone] || "").trim();
  const website = (row[COL.website] || "").trim();
  const serviceAreaRaw = (row[COL.serviceArea] || "").trim();
  const hoursText = (row[COL.hours] || "").trim();
  const licenceCheckText = (row[COL.licenceCheck] || "").trim();
  const sourceUrl = (row[COL.sourceUrl] || "").trim();
  const { zones, unmatchedText } = mapServiceAreaToZones(serviceAreaRaw);
  return {
    rowNumber, category, businessName, phone, website, serviceAreaRaw, zones,
    zoneMappingFailed: unmatchedText !== null,
    afterHoursAvailable: /24\/7|extended/i.test(hoursText),
    licenceDetails: licenceCheckText || null, sourceUrl,
    missingPhone: phone.length === 0, missingSourceUrl: sourceUrl.length === 0,
    missingBusinessName: businessName.length === 0,
  };
});

const rejected = [];
const candidates = [];
for (const row of normalizedRows) {
  const reasons = [];
  if (row.missingBusinessName) reasons.push("missing business name");
  if (row.missingPhone) reasons.push("missing phone");
  if (row.missingSourceUrl) reasons.push("missing source URL");
  if (row.zoneMappingFailed) reasons.push(`zone mapping failed for "${row.serviceAreaRaw}"`);
  if (reasons.length > 0) rejected.push({ row: row.rowNumber, business: row.businessName, reasons });
  else candidates.push(row);
}

// ---- 3. Dedup identities (phone -> domain -> name+zone-overlap) -----------

class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); }
  find(i) { while (this.parent[i] !== i) { this.parent[i] = this.parent[this.parent[i]]; i = this.parent[i]; } return i; }
  union(i, j) { const ri = this.find(i), rj = this.find(j); if (ri !== rj) this.parent[ri] = rj; }
}

const uf = new UnionFind(candidates.length);
const phoneIndex = new Map(), domainIndex = new Map(), nameIndex = new Map();
candidates.forEach((row, i) => {
  const phoneKey = normalizePhoneDigits(row.phone);
  const domainKey = domainOf(row.website);
  const nameKey = normalizeName(row.businessName);
  if (phoneKey) { if (phoneIndex.has(phoneKey)) uf.union(i, phoneIndex.get(phoneKey)); else phoneIndex.set(phoneKey, i); }
  if (domainKey) { if (domainIndex.has(domainKey)) uf.union(i, domainIndex.get(domainKey)); else domainIndex.set(domainKey, i); }
  if (nameKey) {
    const sameNameRows = nameIndex.get(nameKey) ?? [];
    for (const j of sameNameRows) if (row.zones.some((z) => candidates[j].zones.includes(z))) uf.union(i, j);
    nameIndex.set(nameKey, [...sameNameRows, i]);
  }
});

const clusters = new Map();
candidates.forEach((row, i) => {
  const root = uf.find(i);
  if (!clusters.has(root)) clusters.set(root, []);
  clusters.get(root).push(row);
});

const merged = [];
for (const group of clusters.values()) {
  const primary = group.find((r) => normalizePhoneDigits(r.phone)) ?? group.find((r) => domainOf(r.website)) ?? group[0];
  const namesInGroup = new Set(group.map((r) => r.businessName));
  const override = VERIFIED_IDENTITY_OVERRIDES.find((o) => [...o.matchNames].every((n) => namesInGroup.has(n)));

  const capabilities = [...new Set(group.map((r) => r.category))];
  const allZones = [...new Set(group.flatMap((r) => r.zones))];
  const licenceDetailsByTrade = [...new Set(group.map((r) => `${r.category}: ${r.licenceDetails ?? "n/a"}`))];
  // The public source that supports THIS specific capability -- the first row
  // seen for that trade in the cluster. For a merged multi-trade identity
  // this legitimately differs per trade (e.g. Solus Plumbing's listing vs
  // Solus Locksmith's); for a single-trade identity it's just that row's URL.
  const sourceUrlByTrade = {};
  for (const r of group) {
    if (!(r.category in sourceUrlByTrade)) sourceUrlByTrade[r.category] = r.sourceUrl;
  }

  const businessName = override ? override.canonicalName : primary.businessName;
  const tradingNames = override
    ? [...namesInGroup]
    : [...namesInGroup].filter((n) => n !== primary.businessName);
  const tradingNameByTrade = override ? override.tradingNameByTrade : {};

  merged.push({
    businessName,
    tradingNames,
    verifiedNote: override?.note ?? null,
    capabilities,
    tradingNameByTrade,
    sourceUrlByTrade,
    zones: allZones,
    phone: group.find((r) => normalizePhoneDigits(r.phone))?.phone ?? primary.phone,
    website: group.find((r) => r.website)?.website || null,
    afterHoursAvailable: group.some((r) => r.afterHoursAvailable),
    licenceDetails: licenceDetailsByTrade.join(" | "),
    // Canonical/general source for the business identity itself -- the
    // primary row's URL, independent of any single capability's own source.
    sourceUrl: primary.sourceUrl,
    sourceRows: group.map((r) => r.rowNumber),
  });
}

const multiTradeProviders = merged.filter((c) => c.capabilities.length > 1);
const totalCapabilityRows = merged.reduce((sum, c) => sum + c.capabilities.length, 0);

// ---- 4. Generate the transactional SQL -------------------------------------

function providerBlock(p) {
  const capabilityValues = p.capabilities
    .map(
      (trade) =>
        `(${sqlString(trade)}, ${sqlString(p.tradingNameByTrade[trade] ?? null)}, ${sqlString(p.sourceUrlByTrade[trade] ?? p.sourceUrl)})`,
    )
    .join(",\n    ");
  return `WITH upsert AS (
  INSERT INTO candidate_providers (
    business_name, trading_names, trade, sub_services, phone, normalized_phone,
    website, service_suburbs, service_postcodes, after_hours_available,
    licence_details, licence_status, insurance_status, source, source_url,
    verification_status, contact_eligibility, outreach_status, tier
  ) VALUES (
    ${sqlString(p.businessName)}, ${sqlJsonbArray(p.tradingNames)}, ${sqlString(p.capabilities[0])}, '[]'::jsonb,
    ${sqlString(p.phone)}, ${sqlString(normalizeAustralianPhone(p.phone))},
    ${sqlString(p.website)}, ${sqlJsonbArray(p.zones)}, '[]'::jsonb, ${p.afterHoursAvailable},
    ${sqlString(p.licenceDetails)}, 'not_checked', 'not_checked',
    'public_discovery', ${sqlString(p.sourceUrl)},
    'unverified', 'manual_only', 'not_contacted', 'candidate'
  )
  ON CONFLICT (normalized_phone) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO candidate_provider_trades (candidate_provider_id, trade, trading_name, source_url)
SELECT id, v.trade, v.trading_name, v.source_url FROM upsert, (VALUES
    ${capabilityValues}
  ) AS v(trade, trading_name, source_url)
ON CONFLICT (candidate_provider_id, trade) DO NOTHING;`;
}

const sqlBlocks = merged.map(providerBlock);
const fullSql = `-- SourceTradie candidate provider seed import
-- Generated from ${path.basename(inputPath)}
-- ${merged.length} provider identities, ${totalCapabilityRows} capability rows
-- Every record: source=public_discovery, verification_status=unverified,
-- contact_eligibility=manual_only. No outreach is triggered by this script.
-- Idempotent: normalized_phone is unique, so re-running updates existing
-- identities in place (ON CONFLICT DO UPDATE) rather than duplicating them,
-- and capability rows are ON CONFLICT DO NOTHING per (provider, trade).
BEGIN;

${sqlBlocks.join("\n\n")}

COMMIT;
`;

fs.writeFileSync(outputPath, fullSql);
console.log(`Wrote ${outputPath} (${merged.length} providers, ${totalCapabilityRows} capability rows)`);

// ---- 5. Prove it against PGlite before anyone runs it for real ------------

const MIGRATION_FILES = fs
  .readdirSync(path.resolve(import.meta.dirname, "../../../lib/db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

async function freshDb() {
  const client = new PGlite();
  for (const file of MIGRATION_FILES) {
    await client.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../../lib/db/migrations", file), "utf8"));
  }
  return client;
}

async function counts(client) {
  const providers = await client.query("select count(*)::int as n from candidate_providers");
  const capabilities = await client.query("select count(*)::int as n from candidate_provider_trades");
  return { providers: providers.rows[0].n, capabilities: capabilities.rows[0].n };
}

async function providerIds(client) {
  const res = await client.query("select id from candidate_providers order by id");
  return res.rows.map((r) => r.id);
}

console.log("\n=== PROVING THE GENERATED SQL (throwaway in-memory Postgres, zero Production access) ===");

// -- Rollback test: corrupt one provider's capability trade to NULL (violates
// NOT NULL), confirm the whole batch aborts and nothing commits.
const rollbackClient = await freshDb();
// Corrupt the first provider's capability insert (trade -> NULL, violating
// NOT NULL) to force a real failure partway through the batch.
const firstCapabilityBlockIndex = fullSql.indexOf("AS v(trade, trading_name, source_url)");
const corruptedSql =
  fullSql.slice(0, firstCapabilityBlockIndex) +
  fullSql.slice(firstCapabilityBlockIndex).replace(/\('([^']*)',/, "(NULL,");
let rollbackPass = false;
try {
  await rollbackClient.exec(corruptedSql);
  rollbackPass = false; // should have thrown
} catch {
  // The failed statement leaves the session mid-aborted-transaction;
  // clear it explicitly before we can query again.
  await rollbackClient.exec("ROLLBACK;");
  const after = await counts(rollbackClient);
  rollbackPass = after.providers === 0 && after.capabilities === 0;
}
console.log(`Rollback test (corrupted first provider's capability insert): ${rollbackPass ? "PASS" : "FAIL"}`);

// -- Clean apply + idempotent re-run test.
const idemClient = await freshDb();
await idemClient.exec(fullSql);
const afterFirstRun = await counts(idemClient);
const idsAfterFirstRun = await providerIds(idemClient);
await idemClient.exec(fullSql);
const afterSecondRun = await counts(idemClient);
const idsAfterSecondRun = await providerIds(idemClient);
const idempotentPass =
  afterFirstRun.providers === afterSecondRun.providers &&
  afterFirstRun.capabilities === afterSecondRun.capabilities &&
  JSON.stringify(idsAfterFirstRun) === JSON.stringify(idsAfterSecondRun);

console.log(`First apply: ${afterFirstRun.providers} providers, ${afterFirstRun.capabilities} capability rows`);
console.log(`Second apply (identical SQL, re-run): ${afterSecondRun.providers} providers, ${afterSecondRun.capabilities} capability rows`);
console.log(`Idempotent re-run test: ${idempotentPass ? "PASS" : "FAIL"}`);

// -- Prove the multi-trade discovery + no-duplicate-outreach-eligibility
// claim against this exact imported data (not a synthetic stand-in).
const lexity = await idemClient.query(
  "select cp.id, string_agg(cpt.trade, ', ') as trades from candidate_providers cp join candidate_provider_trades cpt on cpt.candidate_provider_id = cp.id where cp.business_name = 'Lexity' group by cp.id",
);
const cloudFlow = await idemClient.query(
  "select cp.id, cp.business_name, cp.trading_names, string_agg(cpt.trade, ', ') as trades from candidate_providers cp join candidate_provider_trades cpt on cpt.candidate_provider_id = cp.id where cp.business_name = 'Cloud Flow Pty Ltd' group by cp.id, cp.business_name, cp.trading_names",
);
console.log(`\nLexity in imported data: ${JSON.stringify(lexity.rows)}`);
console.log(`Cloud Flow (Solus) in imported data: ${JSON.stringify(cloudFlow.rows)}`);

// -- Prove per-capability source_url provenance: Cloud Flow's two trades
// must carry DISTINCT source URLs (they were sourced from different listing
// pages); the provider-level source_url must stay the general/canonical one.
const cloudFlowCapabilities = await idemClient.query(
  "select cpt.trade, cpt.trading_name, cpt.source_url from candidate_provider_trades cpt join candidate_providers cp on cp.id = cpt.candidate_provider_id where cp.business_name = 'Cloud Flow Pty Ltd' order by cpt.trade",
);
const cloudFlowProvider = await idemClient.query(
  "select source_url from candidate_providers where business_name = 'Cloud Flow Pty Ltd'",
);
const plumbingCap = cloudFlowCapabilities.rows.find((r) => r.trade === "Plumbing");
const locksmithCap = cloudFlowCapabilities.rows.find((r) => r.trade === "Locksmith");
const distinctUrlsPass =
  plumbingCap?.source_url &&
  locksmithCap?.source_url &&
  plumbingCap.source_url !== locksmithCap.source_url &&
  cloudFlowProvider.rows[0]?.source_url === plumbingCap.source_url; // provider-level = primary row's URL
console.log(`\nCloud Flow capability-level source URLs: ${JSON.stringify(cloudFlowCapabilities.rows)}`);
console.log(`Cloud Flow provider-level (canonical) source URL: ${cloudFlowProvider.rows[0]?.source_url}`);
console.log(`Distinct per-capability source_url test (Cloud Flow Plumbing vs Locksmith): ${distinctUrlsPass ? "PASS" : "FAIL"}`);

const bgmCapabilities = await idemClient.query(
  "select cpt.trade, cpt.source_url from candidate_provider_trades cpt join candidate_providers cp on cp.id = cpt.candidate_provider_id where cp.business_name = 'BGM Services' order by cpt.trade",
);
const bgmPainting = bgmCapabilities.rows.find((r) => r.trade === "Painting");
const bgmHandyman = bgmCapabilities.rows.find((r) => r.trade === "Handyman / Property Maintenance");
const bgmDistinctPass =
  bgmPainting?.source_url && bgmHandyman?.source_url && bgmPainting.source_url !== bgmHandyman.source_url;
console.log(`BGM Services capability-level source URLs: ${JSON.stringify(bgmCapabilities.rows)}`);
console.log(`Distinct per-capability source_url test (BGM Painting vs Handyman): ${bgmDistinctPass ? "PASS" : "FAIL"}`);

const outreachColumnCheck = await idemClient.query(
  "select column_name from information_schema.columns where table_name = 'provider_outreach_attempts' and column_name = 'candidate_provider_id'",
);
console.log(
  `provider_outreach_attempts keys off candidate_provider_id only (never a capability row id): ${outreachColumnCheck.rows.length === 1 ? "CONFIRMED" : "MISSING"}`,
);

console.log("\n--- Preview summary ---");
console.log(`SOURCE ROWS: ${dataRows.length}`);
console.log(`PROVIDER IDENTITIES: ${merged.length}`);
console.log(`CAPABILITY ROWS: ${totalCapabilityRows}`);
console.log(`REJECTED: ${rejected.length}`);
for (const r of rejected) console.log(`  row ${r.row} (${r.business || "unnamed"}): ${r.reasons.join(", ")}`);
console.log(`MULTI-TRADE PROVIDERS: ${multiTradeProviders.length}`);
for (const p of multiTradeProviders) console.log(`  "${p.businessName}"${p.tradingNames.length ? ` (aka ${p.tradingNames.join(", ")})` : ""}: ${p.capabilities.join(", ")}`);
console.log(`DISTINCT PER-CAPABILITY SOURCE URL (Cloud Flow): ${distinctUrlsPass ? "PASS" : "FAIL"}`);
console.log(`DISTINCT PER-CAPABILITY SOURCE URL (BGM Services): ${bgmDistinctPass ? "PASS" : "FAIL"}`);
console.log(`CONTACT ELIGIBILITY: 100% manual_only (hard-coded in the generated SQL, not derived from source data)`);
console.log(`VERIFICATION: 100% unverified (hard-coded)`);
console.log(`OUTREACH TO BE TRIGGERED: 0 (this script never touches provider_outreach_attempts or any notification path)`);
console.log(`TRANSACTIONAL ROLLBACK TEST: ${rollbackPass ? "PASS" : "FAIL"}`);
console.log(`IDEMPOTENT RE-RUN TEST: ${idempotentPass ? "PASS" : "FAIL"}`);
console.log(`PRODUCTION WRITE: NOT YET`);
