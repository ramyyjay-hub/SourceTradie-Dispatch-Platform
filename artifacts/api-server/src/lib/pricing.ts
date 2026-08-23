export type PriceKind = "total" | "diagnostic";

export type PricingRule = {
  code: string;
  version: typeof MELBOURNE_PRICING_VERSION;
  trade: string;
  category: string;
  kind: PriceKind;
  minCents: number;
  maxCents: number;
  customerLabel: string;
  scope: string;
};

export type PricingPreview = Omit<PricingRule, "reviewStatus" | "trade" | "category">;

export const MELBOURNE_PRICING_VERSION = "melbourne-v1" as const;

// Approved initial Melbourne pilot pricing configuration.
export const MELBOURNE_PRICING_RULES = {
  plumbingTapLeak: {
    code: "plumbing.tap_leak",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "tap_leak",
    kind: "total",
    minCents: 16_000,
    maxCents: 26_000,
    customerLabel: "Expected total for a standard leaking tap repair",
    scope:
      "One accessible leaking or dripping household tap during standard hours. Fixture replacement, concealed damage, difficult access, after-hours work and additional parts are outside this range.",
  },
  plumbingBlockedDrain: {
    code: "plumbing.blocked_drain",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "blocked_drain",
    kind: "total",
    minCents: 25_000,
    maxCents: 40_000,
    customerLabel: "Expected total for a localised blocked-drain clearance",
    scope:
      "One straightforward, accessible household sink, basin or shower blockage cleared with hand tools or ordinary mechanical equipment during standard hours, including a basic flow test. Toilet, main sewer or stormwater blockages, hydro-jetting, CCTV, excavation, root damage, pipe repair and after-hours work are outside this range.",
  },
  plumbingRunningToilet: {
    code: "plumbing.running_toilet",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "running_toilet",
    kind: "total",
    minCents: 18_000,
    maxCents: 30_000,
    customerLabel: "Expected total for a running or leaking toilet repair",
    scope:
      "One accessible exposed cistern during standard hours, including diagnosis, adjustment or replacement of a standard fill valve, outlet seal or similar ordinary cistern component, and testing. Concealed or in-wall cisterns, leaking pan connectors or base seals, toilet removal or replacement, discontinued or specialty parts, damaged pipework and after-hours work are outside this range.",
  },
  plumbingBlockedToilet: {
    code: "plumbing.blocked_toilet",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "blocked_toilet",
    kind: "total",
    minCents: 22_000,
    maxCents: 35_000,
    customerLabel: "Expected total for one blocked toilet",
    scope:
      "One accessible toilet blockage cleared with a plunger, pan-safe auger or ordinary mechanical equipment during standard hours, including a flush and flow test. Toilet removal, main-line or recurring blockages, hydro-jetting, CCTV, foreign objects requiring dismantling, damaged pipework and after-hours work are outside this range.",
  },
  plumbingExposedPipeLeak: {
    code: "plumbing.exposed_pipe_leak",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "exposed_pipe_leak",
    kind: "total",
    minCents: 28_000,
    maxCents: 48_000,
    customerLabel: "Expected total for an accessible exposed-pipe leak repair",
    scope:
      "Isolation and one localised repair to accessible exposed household pipework during standard hours, including a short standard replacement section or fittings, restoration of supply and leak testing. Concealed, underground or under-slab leaks, leak detection, extensive corrosion, mains or boundary-side work, wall or floor access and reinstatement, multiple failures, premium parts and after-hours work are outside this range.",
  },
  plumbingHotWaterDiagnostic: {
    code: "plumbing.hot_water_diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "plumbing",
    category: "hot_water_diagnostic",
    kind: "diagnostic",
    minCents: 10_000,
    maxCents: 18_000,
    customerLabel: "Expected hot-water diagnostic/call-out price",
    scope:
      "Attendance and up to 45 minutes of initial hot-water diagnosis during standard hours. Further investigation, repair labour, replacement parts, system replacement, gas or electrical rectification and after-hours work require a separate customer-approved price.",
  },
  electricalPowerPoint: {
    code: "electrical.power_point",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "power_point",
    kind: "total",
    minCents: 17_000,
    maxCents: 25_000,
    customerLabel: "Expected total for one standard power point",
    scope:
      "One standard indoor power point connected to an accessible, compliant existing circuit during standard hours, including a standard fitting, testing and required certification. Dedicated circuits, switchboard work, hazardous wiring, difficult access and specialty fittings are outside this range.",
  },
  electricalLightFittingReplacement: {
    code: "electrical.light_fitting_replacement",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "light_fitting_replacement",
    kind: "total",
    minCents: 14_000,
    maxCents: 22_000,
    customerLabel: "Expected total for one standard light fitting replacement",
    scope:
      "Like-for-like replacement of one accessible indoor light fitting on compliant existing wiring during standard hours, using a compatible customer-supplied fitting, including testing and required certification. New wiring or switch locations, downlight conversion, chandeliers or heavy fittings, structural support, high ceilings, hazardous wiring, switchboard work, fitting supply and after-hours work are outside this range.",
  },
  electricalSmokeAlarmReplacement: {
    code: "electrical.smoke_alarm_replacement",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "smoke_alarm_replacement",
    kind: "total",
    minCents: 16_000,
    maxCents: 22_000,
    customerLabel: "Expected total for one hardwired smoke-alarm replacement",
    scope:
      "Supply and like-for-like replacement of one accessible standard 240V photoelectric smoke alarm compatible with the existing base and interconnection during standard hours, including testing and required certification. New wiring, relocation, additional alarms, incompatible or proprietary interconnection systems, switchboard remediation, difficult access and broader compliance inspections are outside this range.",
  },
  electricalFaultDiagnostic: {
    code: "electrical.fault_diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "fault_diagnostic",
    kind: "diagnostic",
    minCents: 18_000,
    maxCents: 26_000,
    customerLabel: "Expected electrical fault diagnostic price",
    scope:
      "Attendance, an initial safety assessment and up to 60 minutes of fault-finding during standard hours. Further investigation, rectification, replacement components, switchboard upgrades, rewiring and after-hours work require a separate customer-approved price.",
  },
  heatingCoolingSplitSystemDiagnostic: {
    code: "heating_cooling.split_system_diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "heating_cooling",
    category: "split_system_diagnostic",
    kind: "diagnostic",
    minCents: 18_000,
    maxCents: 28_000,
    customerLabel: "Expected split-system heating/cooling diagnostic price",
    scope:
      "Standard-hours attendance and up to 60 minutes inspecting one accessible wall-mounted split system, including operational and error-code checks, basic electrical and temperature testing, and a documented diagnosis or next step. Cleaning or servicing, repairs, replacement parts, refrigerant handling or recharge, leak testing, additional indoor heads, difficult roof access and after-hours work require a separate customer-approved price.",
  },
  generalDiagnostic: {
    code: "general.diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "general",
    category: "diagnostic",
    kind: "diagnostic",
    minCents: 12_000,
    maxCents: 16_000,
    customerLabel: "Expected general diagnostic/call-out price",
    scope:
      "Attendance and up to 30 minutes of visual assessment for one general-maintenance issue during standard hours, including basic measurements and a recommended next step. Repair labour, materials, licensed trade work, destructive investigation, difficult access, multiple unrelated issues and additional work require a separate customer-approved price.",
  },
} as const satisfies Record<string, PricingRule>;

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[&/_-]+/g, " ");
}

function preview(rule: PricingRule): PricingPreview {
  return {
    code: rule.code,
    version: rule.version,
    kind: rule.kind,
    minCents: rule.minCents,
    maxCents: rule.maxCents,
    customerLabel: rule.customerLabel,
    scope: rule.scope,
  };
}

export function matchMelbournePricing(input: {
  description: string;
  trade: string;
}): PricingPreview {
  const description = normalized(input.description);
  const trade = normalized(input.trade);
  const plumbing = trade.includes("plumb") || /\b(tap|faucet|mixer|drain|sink|toilet|cistern|pipe|pipework|hot water)\b/.test(description);
  const electrical = trade.includes("electric") || /\b(power ?point|outlet|socket|switchboard|circuit|electrical|sparks?|wires?|light fitting|ceiling light|pendant|oyster light|smoke alarm)\b/.test(description);
  const heatingCooling = trade.includes("heating") || trade.includes("cooling") || /\b(split system|air ?con(?:ditioner|ditioning)?|reverse cycle)\b/.test(description);
  const blocked = /\b(blocked|clogged|won't drain|not draining|backs? up)\b/.test(description);
  const leaking = /\b(leak(?:ing)?|drip(?:ping)?|burst|split)\b/.test(description);

  if (plumbing && /\btoilet\b/.test(description) && blocked) {
    return preview(MELBOURNE_PRICING_RULES.plumbingBlockedToilet);
  }
  if (
    plumbing &&
    /\b(?:toilet|cistern)\b/.test(description) &&
    /\b(running|keeps? running|hissing|fill valve|flush valve|outlet seal|leak(?:ing)?)\b/.test(description)
  ) {
    return preview(MELBOURNE_PRICING_RULES.plumbingRunningToilet);
  }
  if (
    plumbing &&
    /\b(pipe|pipework)\b/.test(description) &&
    /\b(exposed|accessible|visible)\b/.test(description) &&
    leaking
  ) {
    return preview(MELBOURNE_PRICING_RULES.plumbingExposedPipeLeak);
  }
  if (plumbing && blocked) {
    return preview(MELBOURNE_PRICING_RULES.plumbingBlockedDrain);
  }
  if (plumbing && /\bhot water\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.plumbingHotWaterDiagnostic);
  }
  if (plumbing && /\b(tap|faucet|mixer)\b/.test(description) && /\b(leak(?:ing)?|drip(?:ping)?|washer)\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.plumbingTapLeak);
  }
  if (
    electrical &&
    /\bsmoke alarm\b/.test(description) &&
    /\b(replace|replacement|swap|change|expired|end of life)\b/.test(description)
  ) {
    return preview(MELBOURNE_PRICING_RULES.electricalSmokeAlarmReplacement);
  }
  if (
    electrical &&
    /\b(light fitting|ceiling light|pendant|oyster light)\b/.test(description) &&
    /\b(replace|replacement|swap|change|install|installation)\b/.test(description)
  ) {
    return preview(MELBOURNE_PRICING_RULES.electricalLightFittingReplacement);
  }
  if (electrical && /\b(power ?point|outlet|socket)\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.electricalPowerPoint);
  }
  if (
    heatingCooling &&
    /\b(not working|stopped|broken|fault|error|no heat|not heating|no cool|not cooling|blowing warm|noise|noisy|leak(?:ing)?|diagnos(?:e|is|ing|tic)?)\b/.test(description)
  ) {
    return preview(MELBOURNE_PRICING_RULES.heatingCoolingSplitSystemDiagnostic);
  }
  if (electrical) {
    return preview(MELBOURNE_PRICING_RULES.electricalFaultDiagnostic);
  }
  return preview(MELBOURNE_PRICING_RULES.generalDiagnostic);
}
