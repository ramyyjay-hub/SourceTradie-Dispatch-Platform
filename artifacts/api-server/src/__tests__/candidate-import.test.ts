import { describe, expect, it } from "vitest";
import {
  CandidateImportRecordSchema,
  SUPPORTED_LAUNCH_TRADES,
  MELBOURNE_LAUNCH_ZONES,
  TARGET_CANDIDATES_PER_CELL,
  summarizeCoverage,
  toCandidateProviderInsert,
  validateCandidateImportBatch,
} from "../lib/candidate-import";

function validRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    businessName: "Test Plumbing Co",
    trade: "Plumbing",
    subServices: ["hot water"],
    zone: "North",
    serviceSuburbs: ["Preston"],
    servicePostcodes: ["3072"],
    phone: "0400 000 111",
    afterHoursAvailable: false,
    sourceUrl: "https://example.com/test-plumbing-co",
    lastCheckedAt: "2026-09-01",
    ...overrides,
  };
}

describe("candidate import: safety guarantees", () => {
  it("always sets contactEligibility to manual_only, even if the input tries to override it", () => {
    const parsed = CandidateImportRecordSchema.parse(validRecord());
    const insert = toCandidateProviderInsert(parsed);
    expect(insert.contactEligibility).toBe("manual_only");

    // The schema has no field for this at all -- an attempted override is
    // simply stripped by zod, not honoured.
    const withAttemptedOverride = CandidateImportRecordSchema.parse({
      ...validRecord(),
      contactEligibility: "automated_ok",
    });
    expect((withAttemptedOverride as Record<string, unknown>).contactEligibility).toBeUndefined();
    expect(toCandidateProviderInsert(withAttemptedOverride).contactEligibility).toBe(
      "manual_only",
    );
  });

  it("always sets verificationStatus to unverified regardless of input", () => {
    const parsed = CandidateImportRecordSchema.parse(validRecord());
    expect(toCandidateProviderInsert(parsed).verificationStatus).toBe("unverified");
  });

  it("always tags the source as public_discovery, never 'approved partner'", () => {
    const parsed = CandidateImportRecordSchema.parse(validRecord());
    expect(toCandidateProviderInsert(parsed).source).toBe("public_discovery");
  });
});

describe("candidate import: validation", () => {
  it("rejects a record missing required fields", () => {
    const [result] = validateCandidateImportBatch([{ businessName: "Incomplete Co" }]);
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported trade", () => {
    const [result] = validateCandidateImportBatch([validRecord({ trade: "Roof Painting" })]);
    expect(result.ok).toBe(false);
  });

  it("rejects a postcode that isn't 4 digits", () => {
    const [result] = validateCandidateImportBatch([
      validRecord({ servicePostcodes: ["VIC"] }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("requires a sourceUrl for every record (audit trail)", () => {
    const [result] = validateCandidateImportBatch([validRecord({ sourceUrl: undefined })]);
    expect(result.ok).toBe(false);
  });

  it("accepts a fully valid record", () => {
    const [result] = validateCandidateImportBatch([validRecord()]);
    expect(result.ok).toBe(true);
  });

  it("normalizes an Australian mobile to +61 form", () => {
    const [result] = validateCandidateImportBatch([validRecord({ phone: "0400 000 111" })]);
    if (!result.ok) throw new Error("expected valid record");
    expect(toCandidateProviderInsert(result.record).normalizedPhone).toBe("+61400000111");
  });
});

describe("candidate import: coverage summary", () => {
  it("reports every trade x zone cell, including empty ones", () => {
    const cells = summarizeCoverage([]);
    expect(cells.length).toBe(SUPPORTED_LAUNCH_TRADES.length * MELBOURNE_LAUNCH_ZONES.length);
    expect(cells.every((cell) => cell.count === 0 && !cell.meetsTarget)).toBe(true);
  });

  it("marks a cell as meeting target once it reaches the coverage threshold", () => {
    const records = Array.from({ length: TARGET_CANDIDATES_PER_CELL }, (_, i) =>
      CandidateImportRecordSchema.parse(
        validRecord({ businessName: `Plumber ${i}`, zone: "North", trade: "Plumbing" }),
      ),
    );
    const cells = summarizeCoverage(records);
    const northPlumbing = cells.find((c) => c.trade === "Plumbing" && c.zone === "North");
    expect(northPlumbing?.count).toBe(TARGET_CANDIDATES_PER_CELL);
    expect(northPlumbing?.meetsTarget).toBe(true);

    const westPlumbing = cells.find((c) => c.trade === "Plumbing" && c.zone === "West");
    expect(westPlumbing?.count).toBe(0);
    expect(westPlumbing?.meetsTarget).toBe(false);
  });
});
