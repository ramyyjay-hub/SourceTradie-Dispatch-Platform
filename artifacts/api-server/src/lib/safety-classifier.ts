import {
  detectSevereSafetyCodes,
  severeSafetyCodes,
  type SafetyCode,
} from "@workspace/api-zod";

export { severeSafetyCodes, type SafetyCode };

export type SafetyClassification = {
  level: "emergency" | "standard";
  interruptFlow: boolean;
  codes: SafetyCode[];
  customerMessage: string | null;
};

export function classifySafety(description: string): SafetyClassification {
  const codes = detectSevereSafetyCodes(description);

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
