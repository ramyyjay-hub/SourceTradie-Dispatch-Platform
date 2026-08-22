import { detectSevereSafetyCodes } from '@workspace/api-zod';

export type RequestFlowStep = 'problem' | 'safety' | 'details' | 'review';

export function hasUrgentSafetySignal(description: string) {
  return detectSevereSafetyCodes(description).length > 0;
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
