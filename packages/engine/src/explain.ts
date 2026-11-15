import { ASSESSMENT_COPY, type Assessment, type Explainer } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';

/**
 * Default explainer: deterministic sentences built only from an already-computed Assessment.
 * Never in the decision path. An optional local language model could implement the same interface.
 */
export const templateExplainer: Explainer = {
  id: 'template/1',
  explain(a: Assessment): string {
    const copy = ASSESSMENT_COPY[a.state];
    const parts = [copy.headline];
    const sustained = a.contributors.filter((c) => c.method === 'change-point');
    if (a.state === 'YES' && sustained.length) {
      const items = sustained
        .slice(0, 4)
        .map((c) => `${getSignal(c.signalId)?.label.toLowerCase() ?? c.signalId} (since about day ${c.sinceDay})`);
      parts.push(`The pattern involves ${items.join(', ')}.`);
    }
    if (a.state === 'INSUFFICIENT_DATA') parts.push(a.reasons.find((r) => r.tier === 'SUFFICIENCY')?.text ?? '');
    parts.push(copy.subline);
    return parts.filter(Boolean).join(' ');
  },
};
