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
    minCents: 15_000,
    maxCents: 30_000,
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
    minCents: 20_000,
    maxCents: 45_000,
    customerLabel: "Expected total for a basic blocked-drain clearance",
    scope:
      "A straightforward accessible residential blockage cleared with standard drain equipment during standard hours. CCTV, hydro-jetting, excavation, root damage, pipe repair and after-hours work are outside this range.",
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
      "Attendance and initial diagnosis during standard hours. Repair labour, replacement parts, system replacement, gas or electrical rectification and after-hours work require a separate customer-approved price.",
  },
  electricalPowerPoint: {
    code: "electrical.power_point",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "power_point",
    kind: "total",
    minCents: 16_000,
    maxCents: 28_000,
    customerLabel: "Expected total for one standard power point",
    scope:
      "One standard indoor power point connected to an accessible, compliant existing circuit during standard hours, including a standard fitting, testing and required certification. Dedicated circuits, switchboard work, hazardous wiring, difficult access and specialty fittings are outside this range.",
  },
  electricalFaultDiagnostic: {
    code: "electrical.fault_diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "electrical",
    category: "fault_diagnostic",
    kind: "diagnostic",
    minCents: 16_000,
    maxCents: 42_000,
    customerLabel: "Expected electrical fault diagnostic price",
    scope:
      "Attendance and fault-finding during standard hours. Rectification, replacement components, switchboard upgrades, rewiring and after-hours work require a separate customer-approved price.",
  },
  generalDiagnostic: {
    code: "general.diagnostic",
    version: MELBOURNE_PRICING_VERSION,
    trade: "general",
    category: "diagnostic",
    kind: "diagnostic",
    minCents: 10_000,
    maxCents: 15_000,
    customerLabel: "Expected general diagnostic/call-out price",
    scope:
      "Attendance and an initial assessment for general maintenance during standard hours. Repair labour, materials, licensed trade work, difficult access and additional work require a separate customer-approved price.",
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
  const plumbing = trade.includes("plumb") || /\b(tap|faucet|mixer|drain|sink|toilet|hot water)\b/.test(description);
  const electrical = trade.includes("electric") || /\b(power ?point|outlet|socket|switchboard|circuit|electrical|sparks?|wires?)\b/.test(description);

  if (plumbing && /\b(blocked|clogged|won't drain|not draining|backs? up)\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.plumbingBlockedDrain);
  }
  if (plumbing && /\bhot water\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.plumbingHotWaterDiagnostic);
  }
  if (plumbing && /\b(tap|faucet|mixer)\b/.test(description) && /\b(leak(?:ing)?|drip(?:ping)?|washer)\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.plumbingTapLeak);
  }
  if (electrical && /\b(power ?point|outlet|socket)\b/.test(description)) {
    return preview(MELBOURNE_PRICING_RULES.electricalPowerPoint);
  }
  if (electrical) {
    return preview(MELBOURNE_PRICING_RULES.electricalFaultDiagnostic);
  }
  return preview(MELBOURNE_PRICING_RULES.generalDiagnostic);
}
