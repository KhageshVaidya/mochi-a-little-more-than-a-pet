import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { EvidenceClass, NasaSource } from '@orbital/contracts';
import { openNasaSource } from '../lib/data';
import { Pill } from './ui';

/** Shared NASA HRP knowledge display pieces (Phase 3): evidence chips and allow-listed source links. */
export const EVIDENCE_META: Record<EvidenceClass, { label: string; tone: 'teal' | 'accent' | 'neutral'; help: string }> = {
  'nasa-stated': { label: 'NASA-stated', tone: 'teal', help: 'The cited NASA page names this explicitly.' },
  'nasa-related': { label: 'NASA-related', tone: 'accent', help: 'NASA names the broader area; this measurement is ORBITAL’s way of capturing it.' },
  'orbital-hypothesis': { label: 'ORBITAL hypothesis', tone: 'neutral', help: 'ORBITAL’s own proposed link, not stated by NASA.' },
};

export function EvidenceChip({ evidence }: { evidence: EvidenceClass }) {
  const m = EVIDENCE_META[evidence];
  return (
    <span title={m.help}>
      <Pill tone={m.tone} className="py-0.5">
        {m.label}
      </Pill>
    </span>
  );
}

export function SourceButton({ source, compact = false }: { source: Pick<NasaSource, 'id' | 'title' | 'lastUpdated'>; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'opened' | 'blocked'>('idle');
  return (
    <button
      onClick={async () => setState((await openNasaSource(source.id)) ? 'opened' : 'blocked')}
      className="t-caption inline-flex items-center gap-1 text-left font-medium text-accent hover:underline"
      title={`Open the original NASA page in your browser${source.lastUpdated ? ` (last updated ${source.lastUpdated})` : ''}`}
      data-source-id={source.id}
    >
      <ExternalLink size={12} className="shrink-0" />
      <span>{compact ? 'NASA source' : source.title}</span>
      {state === 'blocked' && <span className="text-attention"> · not an allowed source</span>}
    </button>
  );
}

