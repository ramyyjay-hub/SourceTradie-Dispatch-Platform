export type SourcingReply = "accepted" | "declined" | "opted_out" | "ambiguous";

export type CandidateForRanking = {
  id: number;
  trade: string;
  subServices: string[];
  serviceSuburbs: string[];
  servicePostcodes: string[];
  afterHoursAvailable: boolean;
  verificationStatus: string;
  optedOutAt: Date | null;
  responseCount: number;
  acceptanceCount: number;
  tier: string;
};

export type SourcingJob = {
  trade: string;
  subtype?: string;
  suburb: string;
  postcode: string;
  urgency: string;
};

export function interpretProviderReply(value: string): SourcingReply {
  const normalized = value.trim().toUpperCase().replace(/[.!]+$/g, "");
  if (/^(STOP|UNSUBSCRIBE|OPT OUT)$/.test(normalized)) return "opted_out";
  if (/^(YES|Y|AVAILABLE)$/.test(normalized)) return "accepted";
  if (/^(NO|N|NOT AVAILABLE)$/.test(normalized)) return "declined";
  return "ambiguous";
}

function same(value: string, expected: string): boolean {
  return value.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function rankCandidates(job: SourcingJob, candidates: CandidateForRanking[]) {
  return candidates
    .filter((candidate) => !candidate.optedOutAt)
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];
      if (same(candidate.trade, job.trade)) { score += 40; reasons.push("trade match"); }
      if (job.subtype && candidate.subServices.some((service) => same(service, job.subtype!))) { score += 15; reasons.push("sub-service match"); }
      if (candidate.servicePostcodes.includes(job.postcode)) { score += 25; reasons.push("postcode coverage"); }
      else if (candidate.serviceSuburbs.some((suburb) => same(suburb, job.suburb))) { score += 20; reasons.push("suburb coverage"); }
      if (job.urgency === "ASAP" && candidate.afterHoursAvailable) { score += 8; reasons.push("urgent availability"); }
      if (candidate.verificationStatus === "checked") { score += 8; reasons.push("credentials checked"); }
      if (candidate.tier === "preferred") score += 6;
      if (candidate.responseCount > 0) score += Math.min(3, (candidate.acceptanceCount / candidate.responseCount) * 3);
      return { ...candidate, score, reasons };
    })
    .filter((candidate) => candidate.score >= 40)
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

export function sourcingTimeoutAt(
  urgency: string,
  timeoutsMinutes: Record<string, number>,
  now = new Date(),
): Date {
  const minutes = timeoutsMinutes[urgency] ?? timeoutsMinutes.Flexible ?? 720;
  return new Date(now.getTime() + minutes * 60_000);
}

export function buildCandidateOutreach(input: {
  suburb: string;
  jobSummary: string;
  urgency: string;
}): string {
  const summary = input.jobSummary.replace(/\s+/g, " ").trim().slice(0, 120);
  return `Hi, this is SourceTradie. We have a customer in ${input.suburb} needing ${summary}. They're looking for ${input.urgency}. Are you available to review the job? Reply YES or NO. Reply STOP to opt out.`;
}
