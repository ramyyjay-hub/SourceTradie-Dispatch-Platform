import { describe, expect, it } from "vitest";
import {
  MELBOURNE_PRICING_RULES,
  matchMelbournePricing,
} from "../lib/pricing";

describe("controlled Melbourne pricing", () => {
  it.each([
    ["Plumbing", "The kitchen mixer tap is dripping", "plumbing.tap_leak"],
    ["Plumbing", "The sink drain is blocked", "plumbing.blocked_drain"],
    ["Plumbing", "The hot water stopped working", "plumbing.hot_water_diagnostic"],
    ["Electrical", "Install one power point", "electrical.power_point"],
    ["Electrical", "A circuit keeps tripping", "electrical.fault_diagnostic"],
    ["Not sure", "A cupboard door needs inspection", "general.diagnostic"],
  ])("maps %s work deterministically to %s", (trade, description, code) => {
    expect(matchMelbournePricing({ trade, description }).code).toBe(code);
  });

  it("keeps every approved range valid", () => {
    for (const rule of Object.values(MELBOURNE_PRICING_RULES)) {
      expect(rule.minCents).toBeGreaterThan(0);
      expect(rule.maxCents).toBeGreaterThanOrEqual(rule.minCents);
    }
    expect(MELBOURNE_PRICING_RULES.plumbingHotWaterDiagnostic).toMatchObject({
      minCents: 10_000,
      maxCents: 18_000,
    });
  });
});
