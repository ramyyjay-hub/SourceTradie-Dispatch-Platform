import { describe, expect, it } from "vitest";
import { interpretProviderReply, rankCandidates, sourcingTimeoutAt } from "../lib/provider-sourcing";

const base = {
  trade: "Plumbing", trades: ["Plumbing"], subServices: [] as string[], serviceSuburbs: ["Epping"],
  servicePostcodes: [] as string[], afterHoursAvailable: false,
  verificationStatus: "candidate", optedOutAt: null, responseCount: 0,
  acceptanceCount: 0, tier: "candidate",
};

describe("managed provider sourcing", () => {
  it("ranks coverage, verification and history without including opted-out candidates", () => {
    const ranked = rankCandidates(
      { trade: "Plumbing", subtype: "blocked toilet", suburb: "Epping", postcode: "3076", urgency: "ASAP" },
      [
        { ...base, id: 1 },
        { ...base, id: 2, subServices: ["blocked toilet"], servicePostcodes: ["3076"], afterHoursAvailable: true, verificationStatus: "checked", tier: "preferred" },
        { ...base, id: 3, optedOutAt: new Date() },
      ],
    );
    expect(ranked.map((row) => row.id)).toEqual([2, 1]);
  });

  it("discovers a multi-trade provider under every trade it genuinely services, via capability rows not the legacy single trade column", () => {
    // Lexity-style business: legacy `trade` column still says "Electrical",
    // but it has capability rows for both Electrical and Heating & Cooling.
    const lexity = {
      ...base,
      id: 42,
      trade: "Electrical",
      trades: ["Electrical", "Heating & Cooling"],
      serviceSuburbs: ["Melbourne"],
    };

    const rankedForElectrical = rankCandidates(
      { trade: "Electrical", suburb: "Melbourne", postcode: "3000", urgency: "Flexible" },
      [lexity],
    );
    expect(rankedForElectrical.map((row) => row.id)).toEqual([42]);

    const rankedForHeating = rankCandidates(
      { trade: "Heating & Cooling", suburb: "Melbourne", postcode: "3000", urgency: "Flexible" },
      [lexity],
    );
    expect(rankedForHeating.map((row) => row.id)).toEqual([42]);

    // A trade it doesn't service still correctly excludes it.
    const rankedForPlumbing = rankCandidates(
      { trade: "Plumbing", suburb: "Melbourne", postcode: "3000", urgency: "Flexible" },
      [lexity],
    );
    expect(rankedForPlumbing).toEqual([]);
  });

  it("treats only explicit replies as decisions and escalates ambiguity", () => {
    expect(interpretProviderReply("YES")).toBe("accepted");
    expect(interpretProviderReply("no.")).toBe("declined");
    expect(interpretProviderReply("STOP")).toBe("opted_out");
    expect(interpretProviderReply("Maybe after lunch")).toBe("ambiguous");
  });

  it("uses urgency-specific configured timeouts", () => {
    expect(sourcingTimeoutAt("ASAP", { ASAP: 10, Flexible: 720 }, new Date(0)).getTime()).toBe(600_000);
  });
});
