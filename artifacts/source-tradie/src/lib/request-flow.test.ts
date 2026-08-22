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

  it.each([
    'There is no flooding, electrical issue, gas smell, or immediate danger.',
    "I can't smell gas.",
    'There are no sparks.',
    'The pipe is leaking slowly but it is not flooding.',
    'Hot water stopped working. No other issues.',
    'Gas smell is not present.',
    'Sparks are not visible.',
  ])('does not route clearly negated hazards to safety: %s', (description) => {
    expect(hasUrgentSafetySignal(description)).toBe(false);
  });

  it.each([
    'I can smell gas.',
    'There are sparks coming from the switchboard.',
    'The house is flooding.',
    'I can see exposed live wires.',
    'There was no gas smell earlier, but now I can smell gas.',
    "I'm not sure if I can smell gas.",
    "I can't smell gas, but there are sparks.",
    'No flooding, gas smell reported near the meter.',
  ])('routes current or ambiguous hazards to safety: %s', (description) => {
    expect(hasUrgentSafetySignal(description)).toBe(true);
  });
});
