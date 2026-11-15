import type { HrpKnowledgeState } from '@orbital/contracts';
import { loadHrpKnowledge, sourceUrlFor } from '@orbital/data-sources';
import { allSignals } from '@orbital/signals';

/**
 * NASA HRP knowledge (Phase 3), main process. The registry is bundled with the app, so it is available
 * offline. It is validated once against the schema and the signal registry; if validation fails the
 * dashboard shows "unavailable" with the reasons and alerts simply carry no risk context.
 */
let cached: HrpKnowledgeState | null = null;

export function hrpKnowledge(): HrpKnowledgeState {
  cached ??= loadHrpKnowledge(allSignals());
  if (cached.status === 'unavailable') console.warn('[orbital] NASA HRP registry unavailable:', cached.errors.slice(0, 5));
  return cached;
}

/** Only URLs that appear in the validated registry may be opened externally. */
export function allowedSourceUrl(sourceId: string): string | null {
  return sourceUrlFor(hrpKnowledge(), sourceId);
}
