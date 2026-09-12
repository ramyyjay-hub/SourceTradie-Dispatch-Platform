import { rankCandidates, type CandidateForRanking } from "./provider-sourcing";

export type ServiceabilityOutcome = "serviceable" | "manual_review" | "unsupported";

export type ServiceabilityResult = {
  outcome: ServiceabilityOutcome;
  inferredTrade: string;
  /** @deprecated alias of rawCandidateCount, kept for existing callers. */
  candidateCount: number;
  rawCandidateCount: number;
  verifiedCandidateCount: number;
  dispatchReadyCount: number;
  reason: string;
};

// The full accepted candidate_providers.verification_status value set. Every
// publicly-sourced candidate starts at "unverified" (see candidate-import.ts)
// and can only move up this ladder through an explicit, evidenced admin
// action (controlCandidateProvider's set_verification) -- never automatically,
// and never as a side effect of import volume.
//
//   unverified        -- default for a public_discovery import. No human has
//                         looked at this listing yet.
//   listing_verified   -- a human confirmed the website/phone/service-area
//                         claim (and licence where relevant), but this is
//                         still just "the listing looks real", not a
//                         SourceTradie decision to dispatch paid jobs to it.
//   dispatch_eligible   -- explicitly cleared as a credible sourcing path for
//                         a paid job. This is the only tier that can make a
//                         job "serviceable" (see assessServiceability below).
//   checked             -- legacy synonym for dispatch_eligible, predates the
//                         named ladder; treated identically everywhere.
//   candidate           -- legacy default (pre-dates public_discovery
//                         imports); treated like "unverified".
//   rejected            -- explicitly disqualified; never counted at all.
//
// contact_eligibility (separately) still gates automated outreach/SMS and
// stays "manual_only" for every candidate regardless of this ladder -- being
// dispatch_eligible for a paid-job match is not the same thing as being
// approved for automated contact.
export const VERIFICATION_STATUS_VALUES = [
  "unverified",
  "listing_verified",
  "dispatch_eligible",
  "checked",
  "candidate",
  "rejected",
] as const;

const DISPATCH_READY_STATUSES = new Set(["dispatch_eligible", "checked"]);
const LISTING_VERIFIED_STATUSES = new Set(["listing_verified", "dispatch_eligible", "checked"]);
const DISQUALIFIED_STATUSES = new Set(["rejected"]);

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

function emptyResult(outcome: ServiceabilityOutcome, inferredTrade: string, reason: string): ServiceabilityResult {
  return {
    outcome,
    inferredTrade,
    candidateCount: 0,
    rawCandidateCount: 0,
    verifiedCandidateCount: 0,
    dispatchReadyCount: 0,
    reason,
  };
}

/**
 * Serviceability gate: run BEFORE any payment is offered.
 *
 * "We found some public listings" and "we're confident enough to take a
 * customer's money" are deliberately different bars:
 *   - rawCandidateCount: every trade+coverage-qualified candidate, including
 *     freshly-imported public_discovery/unverified/manual_only rows. This is
 *     sourcing-graph size, not payment confidence.
 *   - verifiedCandidateCount: the subset a human has actually checked
 *     (listing_verified or better).
 *   - dispatchReadyCount: the subset explicitly cleared as a credible
 *     sourcing path (dispatch_eligible/checked). ONLY this can make a job
 *     "serviceable" -- a pile of unverified public listings is manual_review,
 *     never an auto-charge trigger, no matter how large the pile is.
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
    return emptyResult(
      "manual_review",
      input.trade,
      "Could not confidently infer the required trade from the description.",
    );
  }

  const eligibleCandidates = input.candidates.filter(
    (candidate) => !DISQUALIFIED_STATUSES.has(candidate.verificationStatus),
  );

  const ranked = rankCandidates(
    {
      trade: inferredTrade,
      suburb: input.suburb,
      postcode: input.postcode,
      urgency: input.urgency,
    },
    eligibleCandidates,
  );

  const rawCandidateCount = ranked.length;

  if (rawCandidateCount === 0) {
    return emptyResult(
      "unsupported",
      inferredTrade,
      `No plausible ${inferredTrade} candidates found for postcode ${input.postcode}.`,
    );
  }

  const verifiedCandidateCount = ranked.filter((candidate) =>
    LISTING_VERIFIED_STATUSES.has(candidate.verificationStatus),
  ).length;
  const dispatchReadyCount = ranked.filter((candidate) =>
    DISPATCH_READY_STATUSES.has(candidate.verificationStatus),
  ).length;

  if (dispatchReadyCount === 0) {
    return {
      outcome: "manual_review",
      inferredTrade,
      candidateCount: rawCandidateCount,
      rawCandidateCount,
      verifiedCandidateCount,
      dispatchReadyCount,
      reason:
        `Found ${rawCandidateCount} plausible ${inferredTrade} candidate(s) for postcode ${input.postcode}, ` +
        `but none are dispatch_eligible yet (${verifiedCandidateCount} listing_verified) -- routing to manual review rather than auto-charging.`,
    };
  }

  return {
    outcome: "serviceable",
    inferredTrade,
    candidateCount: rawCandidateCount,
    rawCandidateCount,
    verifiedCandidateCount,
    dispatchReadyCount,
    reason: `Found ${dispatchReadyCount} dispatch-ready ${inferredTrade} candidate(s) (of ${rawCandidateCount} plausible) covering postcode ${input.postcode} or suburb ${input.suburb}.`,
  };
}
