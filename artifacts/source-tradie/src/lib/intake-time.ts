const explicitPreferredTimes: Array<[RegExp, string]> = [
  [/\bthis morning\b/i, "This morning"],
  [/\bthis afternoon\b/i, "This afternoon"],
  [/\bthis evening\b/i, "This evening"],
  [/\btonight\b/i, "Tonight"],
  [/\btomorrow morning\b/i, "Tomorrow morning"],
  [/\btomorrow afternoon\b/i, "Tomorrow afternoon"],
];

export function extractExplicitPreferredTime(description: string): string | null {
  let latestMatch: { index: number; preferredTime: string } | null = null;

  for (const [expression, preferredTime] of explicitPreferredTimes) {
    const match = expression.exec(description);
    if (match?.index !== undefined && (!latestMatch || match.index > latestMatch.index)) {
      latestMatch = { index: match.index, preferredTime };
    }
  }

  return latestMatch?.preferredTime ?? null;
}
