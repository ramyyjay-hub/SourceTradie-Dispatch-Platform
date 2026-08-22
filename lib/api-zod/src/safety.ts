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

const severeTriggers: Array<[SafetyCode, RegExp]> = [
  [
    "GAS_SMELL",
    /\b(?:smell(?:ing)?\s+(?:of\s+)?gas|gas\s+smell|gas\s+leak(?:ing)?)\b/gi,
  ],
  ["SMOKE_OR_FIRE", /\b(?:smoke|fire|flames?)\b/gi],
  ["SPARKS", /\b(?:sparks?|sparking)\b/gi],
  ["ELECTRICAL_FIRE", /\belectrical\s+(?:fire|danger)\b/gi],
  ["EXPOSED_LIVE_WIRING", /\b(?:exposed\s+)?live\s+(?:wires?|wiring)\b/gi],
  [
    "MAJOR_FLOODING",
    /\b(?:(?:major|severe|uncontrolled)\s+(?:water\s+)?flood(?:ing)?|(?:house|home|room|property)\s+is\s+flooding|flooding)\b/gi,
  ],
  ["IMMEDIATE_DANGER", /\bimmediate\s+danger\b/gi],
];

const uncertaintyPattern =
  /\b(?:not\s+sure|unsure|uncertain|do(?:n't|\s+not)\s+know|can(?:'t|not)\s+tell|maybe|might|possibly|could\s+be)\b/i;
const negationPattern =
  /\b(?:no|without|never|not|can(?:'t|not)|do(?:n't|\s+not)|did(?:n't|\s+not)|is(?:n't|\s+not)|are(?:n't|\s+not)|was(?:n't|\s+not)|were(?:n't|\s+not))\b/gi;
const newAffirmativeSubjectPattern =
  /\b(?:i|we|you|they|he|she|there|it|the\s+(?:house|home|room|property|switchboard))\s+(?:can|do|did|am|is|are|was|were|have|has)\b/i;
const postMentionNegationPattern =
  /^\s+(?:is(?:n't|\s+not)|are(?:n't|\s+not)|was(?:n't|\s+not)|were(?:n't|\s+not))\s+(?:present|detectable|visible|occurring|happening|there)\b/i;
const affirmativePostMentionPattern =
  /^\s+(?:is|are|was|were|has\s+been|have\s+been)?\s*(?:reported|detected|present|visible|occurring|happening)\b/i;

function clausePrefix(description: string, mentionStart: number): string {
  const beforeMention = description.slice(0, mentionStart);
  let boundary = 0;

  for (const match of beforeMention.matchAll(/[.!?;\n]|\b(?:but|however|yet)\b/gi)) {
    boundary = (match.index ?? 0) + match[0].length;
  }

  return beforeMention.slice(boundary);
}

function clauseSuffix(description: string, mentionEnd: number): string {
  const afterMention = description.slice(mentionEnd);
  const boundary = afterMention.search(/[.!?;\n]|\b(?:but|however|yet)\b/i);
  return boundary === -1 ? afterMention : afterMention.slice(0, boundary);
}

function isNegated(
  description: string,
  mentionStart: number,
  mentionEnd: number,
): boolean {
  const prefix = clausePrefix(description, mentionStart);
  const recentPrefix = prefix.slice(-160);
  const suffix = clauseSuffix(description, mentionEnd).slice(0, 80);

  if (uncertaintyPattern.test(recentPrefix)) return false;
  if (postMentionNegationPattern.test(suffix)) return true;

  const negations = [...recentPrefix.matchAll(negationPattern)];
  const lastNegation = negations.at(-1);
  if (!lastNegation) return false;

  const textAfterNegation = recentPrefix.slice(
    (lastNegation.index ?? 0) + lastNegation[0].length,
  );
  const interveningWords = textAfterNegation.match(/[a-z]+(?:'[a-z]+)?/gi) ?? [];

  if (interveningWords.length > 12) return false;
  if (textAfterNegation.includes(",") && affirmativePostMentionPattern.test(suffix)) {
    return false;
  }
  return !newAffirmativeSubjectPattern.test(textAfterNegation);
}

export function detectSevereSafetyCodes(description: string): SafetyCode[] {
  const codes: SafetyCode[] = [];

  for (const [code, trigger] of severeTriggers) {
    trigger.lastIndex = 0;
    let match: RegExpExecArray | null;
    let detected = false;

    while ((match = trigger.exec(description)) !== null) {
      if (!isNegated(description, match.index, match.index + match[0].length)) {
        detected = true;
        break;
      }
    }

    if (detected) codes.push(code);
  }

  return codes;
}
