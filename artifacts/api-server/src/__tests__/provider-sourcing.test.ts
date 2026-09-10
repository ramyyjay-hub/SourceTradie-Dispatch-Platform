import { describe, expect, it } from "vitest";
import { interpretProviderReply, rankCandidates, sourcingTimeoutAt } from "../lib/provider-sourcing";

const base = {
  trade: "Plumbing", subServices: [] as string[], serviceSuburbs: ["Epping"],
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
