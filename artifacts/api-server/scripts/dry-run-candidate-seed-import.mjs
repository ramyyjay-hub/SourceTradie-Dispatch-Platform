#!/usr/bin/env node
// Dry-run importer for SourceTradie_Melbourne_Wide_Supply_Master_v1.xlsx
// (or any workbook with the same "Providers" table layout) into
// candidate_providers. Reads and validates only -- never writes to any
// database. Run with: node scripts/dry-run-candidate-seed-import.mjs <path-to-xlsx>
//
// Keep SUPPORTED_LAUNCH_TRADES / MELBOURNE_LAUNCH_ZONES here in sync with
// src/lib/candidate-import.ts -- this script is plain JS (no build step) so
// it can't import that module directly.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

const SUPPORTED_LAUNCH_TRADES = [
  "Plumbing",
  "Electrical",
  "Heating & Cooling",
  "Locksmith",
  "Handyman / Property Maintenance",
  "Roofing & Gutters",
  "Pest Control",
  "Appliance Repair",
  "Garage Doors",
  "Cleaning",
  "Rubbish Removal",
];

const MELBOURNE_LAUNCH_ZONES = ["North", "West", "East", "South-East", "Bayside/Inner"];
const TARGET_CANDIDATES_PER_CELL = 10;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node dry-run-candidate-seed-import.mjs <path-to-xlsx>");
  process.exit(1);
}

// ---- 1. Unzip and parse the workbook's Providers sheet -------------------

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-seed-"));
execSync(`unzip -o -q ${JSON.stringify(inputPath)} -d ${JSON.stringify(workDir)}`);

function colToIndex(col) {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function unescapeXml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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

// Find which sheetN.xml is "Providers" via workbook.xml + rels, rather than
// assuming sheet order.
const workbookXml = fs.readFileSync(path.join(workDir, "xl/workbook.xml"), "utf8");
const relsXml = fs.readFileSync(path.join(workDir, "xl/_rels/workbook.xml.rels"), "utf8");
const sheetMatch = [...workbookXml.matchAll(/<x:sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(
  ([, name]) => name === "Providers",
);
if (!sheetMatch) {
  console.error('No sheet named "Providers" found in this workbook.');
  process.exit(1);
}
const [, , providersRid] = sheetMatch;
const relMatch = relsXml.match(new RegExp(`Target="([^"]+)"[^/]*Id="${providersRid}"`));
const providersTarget =
  relMatch?.[1] ??
  relsXml.match(new RegExp(`Id="${providersRid}"[^/]*Target="([^"]+)"`))?.[1];
if (!providersTarget) {
  console.error("Could not resolve the Providers sheet's XML file.");
  process.exit(1);
}
const providersSheetPath = path.join(workDir, providersTarget.replace(/^\//, ""));
const providerRows = readSheet(providersSheetPath);
const header = providerRows[0];
const dataRows = providerRows.slice(1);

fs.rmSync(workDir, { recursive: true, force: true });

const COL = {
  category: header.indexOf("Category"),
  business: header.indexOf("Business"),
  phone: header.indexOf("Phone"),
  website: header.indexOf("Website"),
  serviceArea: header.indexOf("Service Area"),
  hours: header.indexOf("24/7 / Extended"),
  licenceCheck: header.indexOf("Licence Check"),
  sourceUrl: header.indexOf("Source URL"),
};
for (const [key, idx] of Object.entries(COL)) {
  if (idx === -1) {
    console.error(`Expected column not found in Providers sheet: ${key}`);
    process.exit(1);
  }
}

// ---- 2. Zone mapping from free-text "Service Area" ------------------------

const ALL_MELBOURNE_PATTERN = /all melbourne|metro melbourne|melbourne[- ]wide/i;
const NORTH_SUBURB_HINTS =
  /craigieburn|epping|kalkallo|mernda|reservoir|lalor|thomastown|wollert|mitchell shire/i;

function mapServiceAreaToZones(raw) {
  const text = (raw || "").toLowerCase();
  if (ALL_MELBOURNE_PATTERN.test(text)) {
    return { zones: [...MELBOURNE_LAUNCH_ZONES], unmatchedText: null };
  }
  const zones = new Set();
  // Strip "south-east"/"south east" before scanning for standalone "east" so
  // South-East doesn't also register as East.
  const withoutSouthEast = text.replace(/south[- ]east/g, "");
  if (/south[- ]east/.test(text)) zones.add("South-East");
  if (/bayside|inner/.test(text)) zones.add("Bayside/Inner");
  if (/north/.test(text) || NORTH_SUBURB_HINTS.test(text)) zones.add("North");
  if (/west/.test(withoutSouthEast)) zones.add("West");
  if (/east/.test(withoutSouthEast)) zones.add("East");
  if (zones.size === 0) return { zones: [], unmatchedText: raw };
  return { zones: [...zones], unmatchedText: null };
}

// ---- 3. Normalize each raw row ---------------------------------------------

function normalizePhoneDigits(raw) {
  return (raw || "").replace(/[^\d]/g, "");
}
function normalizeName(raw) {
  return (raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const normalizedRows = dataRows.map((row, i) => {
  const rowNumber = i + 2; // 1-indexed + header row
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
    rowNumber,
    category,
    businessName,
    phone,
    website,
    serviceAreaRaw,
    zones,
    zoneMappingFailed: unmatchedText !== null,
    afterHoursAvailable: /24\/7|extended/i.test(hoursText),
    licenceDetails: licenceCheckText || null,
    sourceUrl,
    missingPhone: phone.length === 0,
    missingSourceUrl: sourceUrl.length === 0,
    missingBusinessName: businessName.length === 0,
  };
});

// ---- 4. Reject rows with hard data problems --------------------------------

const rejected = [];
const candidates = [];
for (const row of normalizedRows) {
  const reasons = [];
  if (row.missingBusinessName) reasons.push("missing business name");
  if (row.missingPhone) reasons.push("missing phone");
  if (row.missingSourceUrl) reasons.push("missing source URL");
  if (row.zoneMappingFailed) reasons.push(`zone mapping failed for "${row.serviceAreaRaw}"`);
  if (reasons.length > 0) {
    rejected.push({ row: row.rowNumber, business: row.businessName, reasons });
  } else {
    candidates.push(row);
  }
}

// ---- 5. Deduplicate provider IDENTITIES (not rows) -------------------------
//
// Strongest evidence first: normalized phone, then website/domain, then
// normalized business name + at least one overlapping zone (never name
// alone -- two different businesses can share a name, and two branches of
// one business can legitimately serve different, non-overlapping areas).
// Union-find over rows, so evidence chains transitively (A~B by phone,
// B~C by domain => A, B, C are one identity).

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(i, j) {
    const ri = this.find(i);
    const rj = this.find(j);
    if (ri !== rj) this.parent[ri] = rj;
  }
}

const uf = new UnionFind(candidates.length);
const phoneIndex = new Map();
const domainIndex = new Map();
const nameIndex = new Map();

candidates.forEach((row, i) => {
  const phoneKey = normalizePhoneDigits(row.phone);
  const domainKey = domainOf(row.website);
  const nameKey = normalizeName(row.businessName);

  if (phoneKey) {
    if (phoneIndex.has(phoneKey)) uf.union(i, phoneIndex.get(phoneKey));
    else phoneIndex.set(phoneKey, i);
  }
  if (domainKey) {
    if (domainIndex.has(domainKey)) uf.union(i, domainIndex.get(domainKey));
    else domainIndex.set(domainKey, i);
  }
  if (nameKey) {
    const sameNameRows = nameIndex.get(nameKey) ?? [];
    for (const j of sameNameRows) {
      const sharesZone = row.zones.some((z) => candidates[j].zones.includes(z));
      if (sharesZone) uf.union(i, j);
    }
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
let duplicateRowCount = 0;
for (const group of clusters.values()) {
  if (group.length > 1) duplicateRowCount += group.length - 1;
  // Primary row: prefer one with a phone, then one with a website, else first-seen.
  const primary =
    group.find((r) => normalizePhoneDigits(r.phone)) ??
    group.find((r) => domainOf(r.website)) ??
    group[0];
  const alsoKnownAs = [...new Set(group.map((r) => r.businessName))].filter(
    (n) => n !== primary.businessName,
  );
  // Every genuine top-level trade becomes its own capability -- never
  // folded into subServices, which this seed data doesn't actually supply.
  const capabilities = [...new Set(group.map((r) => r.category))];
  const allZones = [...new Set(group.flatMap((r) => r.zones))];
  const licenceDetailsByTrade = [...new Set(group.map((r) => `${r.category}: ${r.licenceDetails ?? "n/a"}`))];
  merged.push({
    businessName: primary.businessName,
    alsoKnownAs,
    capabilities,
    subServices: [], // this seed data has no genuine sub-service granularity
    zones: allZones,
    phone: group.find((r) => normalizePhoneDigits(r.phone))?.phone ?? primary.phone,
    website: group.find((r) => r.website)?.website || null,
    afterHoursAvailable: group.some((r) => r.afterHoursAvailable),
    licenceDetails: licenceDetailsByTrade.join(" | "),
    sourceUrl: primary.sourceUrl,
    sourceRows: group.map((r) => r.rowNumber),
  });
}

const multiTradeProviders = merged.filter((c) => c.capabilities.length > 1);
const totalCapabilityRows = merged.reduce((sum, c) => sum + c.capabilities.length, 0);

// ---- 6. Coverage summary (launch trades only, via capability rows) --------

function isLaunchTrade(trade) {
  return SUPPORTED_LAUNCH_TRADES.includes(trade);
}

const coverage = new Map();
for (const c of merged) {
  for (const trade of c.capabilities) {
    if (!isLaunchTrade(trade)) continue;
    for (const zone of c.zones) {
      const key = `${trade}|${zone}`;
      coverage.set(key, (coverage.get(key) ?? 0) + 1);
    }
  }
}

const coverageGrid = [];
for (const trade of SUPPORTED_LAUNCH_TRADES) {
  const row = { trade };
  let total = 0;
  for (const zone of MELBOURNE_LAUNCH_ZONES) {
    const count = coverage.get(`${trade}|${zone}`) ?? 0;
    row[zone] = count;
    total += count;
  }
  row.total = total;
  coverageGrid.push(row);
}

// ---- 7. Report --------------------------------------------------------------

const missingPhoneCount = normalizedRows.filter((r) => r.missingPhone).length;
const missingSourceUrlCount = normalizedRows.filter((r) => r.missingSourceUrl).length;

console.log("=== SEED IMPORT DRY RUN ===");
console.log(`Source file: ${inputPath}`);
console.log(`Source rows: ${dataRows.length}`);
console.log(`Accepted rows (validated, pre-dedup): ${candidates.length}`);
console.log(`Rejected rows: ${rejected.length}`);
console.log(`  of which missing phone: ${missingPhoneCount}`);
console.log(`  of which missing source URL: ${missingSourceUrlCount}`);
console.log(`Duplicate rows merged away: ${duplicateRowCount}`);
console.log(`Accepted provider identities (post-dedup): ${merged.length}`);
console.log(`Capability rows to create: ${totalCapabilityRows}`);
console.log(`Providers with >1 top-level trade: ${multiTradeProviders.length}`);
console.log();

if (rejected.length) {
  console.log("--- Rejected rows (exact reasons) ---");
  for (const r of rejected) {
    console.log(`  row ${r.row} (${r.business || "unnamed"}): ${r.reasons.join(", ")}`);
  }
  console.log();
}

const dupGroups = [...clusters.values()].filter((g) => g.length > 1);
if (dupGroups.length) {
  console.log("--- Duplicate identities merged ---");
  for (const g of dupGroups) {
    const names = [...new Set(g.map((r) => r.businessName))];
    console.log(
      `  ${names.length > 1 ? names.join(" / ") : `"${names[0]}"`}: rows ${g.map((r) => r.rowNumber).join(", ")} -> capabilities [${[...new Set(g.map((r) => r.category))].join(", ")}]`,
    );
  }
  console.log();
}

if (multiTradeProviders.length) {
  console.log("--- Providers with multiple top-level trade capabilities ---");
  for (const p of multiTradeProviders) {
    console.log(`  "${p.businessName}": ${p.capabilities.join(", ")}`);
  }
  console.log();
}

console.log("--- Trade x zone coverage via capability rows (launch trades only, target 10/cell) ---");
console.log(
  ["Trade".padEnd(34), ...MELBOURNE_LAUNCH_ZONES.map((z) => z.padEnd(14)), "Total"].join(""),
);
for (const row of coverageGrid) {
  console.log(
    [
      row.trade.padEnd(34),
      ...MELBOURNE_LAUNCH_ZONES.map((z) => String(row[z]).padEnd(14)),
      String(row.total),
    ].join(""),
  );
}
console.log();

console.log("--- Top supply gaps (launch trades, ranked by total coverage, ascending) ---");
[...coverageGrid]
  .sort((a, b) => a.total - b.total)
  .forEach((row, i) => console.log(`  ${i + 1}. ${row.trade}: ${row.total} total candidates`));
console.log();

const nonLaunchTrades = [
  ...new Set(merged.flatMap((c) => c.capabilities).filter((t) => !isLaunchTrade(t))),
];
if (nonLaunchTrades.length) {
  console.log(
    `--- Non-launch-scope trades imported as data, excluded from the coverage grid (later expansion): ${nonLaunchTrades.join(", ")} ---`,
  );
}

console.log();
console.log("PRODUCTION WRITES: NONE (dry run only)");
