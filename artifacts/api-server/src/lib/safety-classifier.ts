export const severeSafetyCodes = [
  "GAS_SMELL",
  "SMOKE_OR_FIRE",
  "SPARKS",
  "ELECTRICAL_FIRE",
  "EXPOSED_LIVE_WIRING",
  "MAJOR_FLOODING",
  "IMMEDIATE_DANGER",
] as const;

export type SafetyCode = (typeof severeSafetyCodes)[number];

export type SafetyClassification = {
  level: "emergency" | "standard";
  interruptFlow: boolean;
  codes: SafetyCode[];
  customerMessage: string | null;
};

const severeTriggers: Array<[SafetyCode, RegExp]> = [
  [
    "GAS_SMELL",
    /\b(?:smell(?:ing)?\s+(?:of\s+)?gas|gas\s+smell|gas\s+leak(?:ing)?)\b/i,
  ],
  ["SMOKE_OR_FIRE", /\b(?:smoke|fire|flames?)\b/i],
  ["SPARKS", /\b(?:sparks?|sparking)\b/i],
  ["ELECTRICAL_FIRE", /\belectrical\s+(?:fire|danger)\b/i],
  ["EXPOSED_LIVE_WIRING", /\b(?:exposed\s+)?live\s+(?:wire|wiring)\b/i],
  [
    "MAJOR_FLOODING",
    /\b(?:major|severe|uncontrolled)\s+(?:water\s+)?flood(?:ing)?\b/i,
  ],
  ["IMMEDIATE_DANGER", /\bimmediate\s+danger\b/i],
];

export function classifySafety(description: string): SafetyClassification {
  const codes = severeTriggers
    .filter(([, trigger]) => trigger.test(description))
    .map(([code]) => code);

  if (codes.length > 0) {
    return {
      level: "emergency",
      interruptFlow: true,
      codes,
      customerMessage:
        "Move away from the area and call 000 from a safe place if anyone is in immediate danger. SourceTradie cannot replace emergency services.",
    };
  }

  return {
    level: "standard",
    interruptFlow: false,
    codes: [],
    customerMessage: null,
  };
}
