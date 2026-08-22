export type RequestFlowStep = 'problem' | 'safety' | 'details' | 'review';

const urgentSignalPattern =
  /\b(?:smell(?:ing)?\s+(?:of\s+)?gas|gas\s+smell|gas\s+leak(?:ing)?|smoke|fire|flames?|sparks?|sparking|electrical\s+(?:fire|danger)|(?:exposed\s+)?live\s+(?:wire|wiring)|(?:major|severe|uncontrolled)\s+(?:water\s+)?flood(?:ing)?|immediate\s+danger)\b/i;

export function hasUrgentSafetySignal(description: string) {
  return urgentSignalPattern.test(description);
}

export function getRequestFlowSteps(
  hasUrgentSignal: boolean,
): RequestFlowStep[] {
  return hasUrgentSignal
    ? ['problem', 'safety', 'details', 'review']
    : ['problem', 'details', 'review'];
}

export function getRequestFlowLabels(hasUrgentSignal: boolean) {
  return hasUrgentSignal
    ? ['Problem', 'Safety check', 'Your details', 'Submitted']
    : ['Problem', 'Your details', 'Submitted'];
}

export function getNextRequestFlowStep(
  step: RequestFlowStep,
  hasUrgentSignal: boolean,
) {
  const steps = getRequestFlowSteps(hasUrgentSignal);
  return steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)];
}

export function getPreviousRequestFlowStep(
  step: RequestFlowStep,
  hasUrgentSignal: boolean,
) {
  const steps = getRequestFlowSteps(hasUrgentSignal);
  return steps[Math.max(steps.indexOf(step) - 1, 0)];
}
