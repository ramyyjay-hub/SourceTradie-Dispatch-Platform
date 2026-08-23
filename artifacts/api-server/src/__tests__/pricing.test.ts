import { describe, expect, it } from "vitest";
import {
  MELBOURNE_PRICING_RULES,
  matchMelbournePricing,
} from "../lib/pricing";

describe("controlled Melbourne pricing", () => {
  it.each([
    ["Plumbing", "The kitchen mixer tap is dripping", "plumbing.tap_leak"],
    ["Plumbing", "The sink drain is blocked", "plumbing.blocked_drain"],
    ["Plumbing", "The toilet is blocked", "plumbing.blocked_toilet"],
    ["Not sure", "The toilet is clogged and not draining", "plumbing.blocked_toilet"],
    ["Plumbing", "The toilet cistern keeps running", "plumbing.running_toilet"],
    ["Plumbing", "An accessible exposed pipe is leaking", "plumbing.exposed_pipe_leak"],
    ["Plumbing", "The hot water stopped working", "plumbing.hot_water_diagnostic"],
    ["Electrical", "Install one power point", "electrical.power_point"],
    ["Electrical", "Replace one customer-supplied ceiling light fitting", "electrical.light_fitting_replacement"],
    ["Electrical", "Replace one expired hardwired smoke alarm", "electrical.smoke_alarm_replacement"],
    ["Electrical", "A circuit keeps tripping", "electrical.fault_diagnostic"],
    ["Heating & cooling", "The wall split system is not heating", "heating_cooling.split_system_diagnostic"],
    ["Not sure", "A cupboard door needs inspection", "general.diagnostic"],
  ])("maps %s work deterministically to %s", (trade, description, code) => {
    expect(matchMelbournePricing({ trade, description }).code).toBe(code);
  });

  it("keeps every approved range valid", () => {
    for (const rule of Object.values(MELBOURNE_PRICING_RULES)) {
      expect(rule.minCents).toBeGreaterThan(0);
      expect(rule.maxCents).toBeGreaterThanOrEqual(rule.minCents);
    }
    expect(
      Object.fromEntries(
        Object.entries(MELBOURNE_PRICING_RULES).map(([key, rule]) => [
          key,
          [rule.minCents, rule.maxCents],
        ]),
      ),
    ).toEqual({
      plumbingTapLeak: [16_000, 26_000],
      plumbingBlockedDrain: [25_000, 40_000],
      plumbingRunningToilet: [18_000, 30_000],
      plumbingBlockedToilet: [22_000, 35_000],
      plumbingExposedPipeLeak: [28_000, 48_000],
      plumbingHotWaterDiagnostic: [10_000, 18_000],
      electricalPowerPoint: [17_000, 25_000],
      electricalLightFittingReplacement: [14_000, 22_000],
      electricalSmokeAlarmReplacement: [16_000, 22_000],
      electricalFaultDiagnostic: [18_000, 26_000],
      heatingCoolingSplitSystemDiagnostic: [18_000, 28_000],
      generalDiagnostic: [12_000, 16_000],
    });
  });
});
