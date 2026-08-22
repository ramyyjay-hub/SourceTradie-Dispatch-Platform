import { describe, expect, it } from 'vitest';
import {
  getNextRequestFlowStep,
  getRequestFlowLabels,
  hasUrgentSafetySignal,
} from './request-flow';

describe('request flow safety routing', () => {
  it('skips the safety step for a normal hot-water request', () => {
    const description =
      'My hot water has stopped working in Wollert. Could someone come this afternoon?';

    expect(hasUrgentSafetySignal(description)).toBe(false);
    expect(getNextRequestFlowStep('problem', false)).toBe('details');
    expect(getRequestFlowLabels(false)).toEqual([
      'Problem',
      'Your details',
      'Submitted',
    ]);
  });

  it('requires the safety step for a gas smell', () => {
    expect(hasUrgentSafetySignal('There is a gas smell near the hot water unit.')).toBe(
      true,
    );
    expect(getNextRequestFlowStep('problem', true)).toBe('safety');
    expect(getRequestFlowLabels(true)).toContain('Safety check');
  });
});
