import { rankCandidates, type CandidateForRanking } from "./provider-sourcing";

export type ServiceabilityOutcome = "serviceable" | "manual_review" | "unsupported";

export type ServiceabilityResult = {
  outcome: ServiceabilityOutcome;
  inferredTrade: string;
  candidateCount: number;
  reason: string;
};

const TRADE_SIGNALS: Array<{ trade: string; pattern: RegExp }> = [
  { trade: "Plumbing", pattern: /\b(tap|faucet|mixer|drain|sink|toilet|cistern|pipe|pipework|hot water|plumb)\b/i },
  { trade: "Electrical", pattern: /\b(power ?point|outlet|socket|switchboard|circuit|electric|sparks?|wires?|light fitting|ceiling light|pendant|oyster light|smoke alarm)\b/i },
  { trade: "Heating & Cooling", pattern: /\b(split system|air ?con(?:ditioner|ditioning)?|reverse cycle|heating|cooling)\b/i },
  { trade: "Locksmith", pattern: /\b(lock(?:ed|smith)?|deadbolt|rekey)\b/i },
  { trade: "Roofing", pattern: /\b(roof|gutter|downpipe|tile)\b/i },
  { trade: "Appliance Repair", pattern: /\b(washing machine|dishwasher|oven|fridge|freezer|dryer|appliance)\b/i },
  { trade: "Pest Control", pattern: /\b(pest|rodent|rat|mice|cockroach|termite|wasp|ants?)\b/i },
  { trade: "Garage Door", pattern: /\bgarage door\b/i },
  { trade: "Handyman", pattern: /\b(handyman|general repair|maintenance)\b/i },
  { trade: "Rubbish Removal", pattern: /\b(rubbish|junk|waste removal|clean ?out)\b/i },
];

/**
 * Infers the most likely trade from the free-text description when the
 * homeowner didn't pick one (or picked "Not sure"). Deliberately simple and
 * conservative -- ambiguous descriptions fall through to the explicit trade
 * field, and the serviceability gate treats an unresolved trade as
 * manual_review rather than guessing.
 */
export function inferTrade(explicitTrade: string, description: string): string | null {
  const trade = explicitTrade.trim();
  if (trade && trade.toLowerCase() !== "not sure") return trade;
  for (const signal of TRADE_SIGNALS) {
    if (signal.pattern.test(description)) return signal.trade;
  }
  return null;
}

/**
 * Serviceability gate: run BEFORE any payment is offered. We only allow the
 * $29.99 checkout to proceed for jobs we have a realistic path to fulfil.
 * A single plausible candidate is enough -- ranking quality (handled at
 * dispatch time) matters more than hitting a fixed candidate count.
 */
export function assessServiceability(input: {
  trade: string;
  description: string;
  suburb: string;
  postcode: string;
  urgency: string;
  candidates: CandidateForRanking[];
}): ServiceabilityResult {
  const inferredTrade = inferTrade(input.trade, input.description);

  if (!inferredTrade) {
    return {
      outcome: "manual_review",
      inferredTrade: input.trade,
      candidateCount: 0,
      reason: "Could not confidently infer the required trade from the description.",
    };
  }

  const ranked = rankCandidates(
    {
      trade: inferredTrade,
      suburb: input.suburb,
      postcode: input.postcode,
      urgency: input.urgency,
    },
    input.candidates,
  );

  if (ranked.length === 0) {
    return {
      outcome: "unsupported",
      inferredTrade,
      candidateCount: 0,
      reason: `No plausible ${inferredTrade} candidates found for postcode ${input.postcode}.`,
    };
  }

  return {
    outcome: "serviceable",
    inferredTrade,
    candidateCount: ranked.length,
    reason: `Found ${ranked.length} plausible ${inferredTrade} candidate(s) covering postcode ${input.postcode} or suburb ${input.suburb}.`,
  };
}
