import { useEffect, useMemo, useState } from 'react';
import { BookMarked, CheckCircle2, CircleDashed, FlaskConical, Library, Quote } from 'lucide-react';
import {
  RISK_LINK_CAVEAT,
  type EvidenceClass,
  type HrpRegistry,
  type IndicatorLayer,
  type OrbitalCoverage,
  type RiskEntry,
} from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { useApp } from '../stores/app';
import { useHrpKnowledge } from '../lib/data';
import { EVIDENCE_META, EvidenceChip, SourceButton } from '../components/knowledge';
import { cn } from '../lib/cn';
import { Card, EmptyState, Pill, SectionHeader, SegmentedControl } from '../components/ui';

/**
 * NASA Research & Risk Knowledge (Phase 3). Browses the offline, cited NASA HRP registry.
 * Every NASA claim is shown as a quote with its source; Dr G Zero's own hypotheses are labelled as such.
 * Nothing here is about the selected astronaut's data: it is reference material.
 */

const COVERAGE_META: Record<OrbitalCoverage, { label: string; tone: 'teal' | 'accent' | 'watch' | 'neutral' }> = {
  'proxies-measured': { label: 'Proxies measured', tone: 'teal' },
  partial: { label: 'Partly measured', tone: 'accent' },
  'countermeasure-only': { label: 'Countermeasure tracked only', tone: 'watch' },
  'not-measured': { label: 'Not measured by Dr G Zero', tone: 'neutral' },
};

const LAYER_LABEL: Record<IndicatorLayer, string> = {
  physiological: 'Physiological',
  cognitive: 'Cognitive',
  psychological: 'Psychological',
  operational: 'Operational / environmental',
};

type Filter = 'all' | 'measured' | 'not-measured';

export function Knowledge() {
  const k = useHrpKnowledge();
  const focus = useApp((s) => s.knowledgeFocus);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(focus);
  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);

  if (!k) return <SectionHeader eyebrow="Reference · offline" title="NASA Research & Risk Knowledge" />;
  if (k.status === 'unavailable') {
    return (
      <div>
        <SectionHeader eyebrow="Reference · offline" title="NASA Research & Risk Knowledge" />
        <Card>
          <EmptyState icon={<Library size={22} />} title="Knowledge registry unavailable" body="The bundled NASA HRP registry failed validation, so Dr G Zero shows nothing rather than unverified content." meta={k.errors.slice(0, 3).join(' · ')} />
        </Card>
      </div>
    );
  }
  return <KnowledgeBody reg={k.registry} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} />;
}

function KnowledgeBody({ reg, filter, setFilter, selected, setSelected }: { reg: HrpRegistry; filter: Filter; setFilter(f: Filter): void; selected: string | null; setSelected(id: string): void }) {
  const counts = useMemo(() => {
    const measured = reg.risks.filter((r) => r.coverage === 'proxies-measured' || r.coverage === 'partial').length;
    return { measured, total: reg.risks.length };
  }, [reg]);
  const order: OrbitalCoverage[] = ['proxies-measured', 'partial', 'countermeasure-only', 'not-measured'];
  const risks = reg.risks
    .filter((r) => (filter === 'all' ? true : filter === 'measured' ? r.coverage !== 'not-measured' : r.coverage === 'not-measured'))
    .sort((a, b) => order.indexOf(a.coverage) - order.indexOf(b.coverage) || a.name.localeCompare(b.name));
  const current = reg.risks.find((r) => r.id === selected) ?? risks[0] ?? reg.risks[0]!;
  const catalogue = reg.sources.find((s) => s.id === reg.catalogueSourceId)!;

  return (
    <div>
      <SectionHeader
        eyebrow={`Reference · offline snapshot · registry v${reg.registryVersion} · retrieved ${reg.snapshotDate}`}
        title="NASA Research & Risk Knowledge"
        subtitle={`The ${counts.total} human-system risks NASA’s Human Research Program studies, how each relates to what Dr G Zero measures, and what NASA itself says — with links to the original pages.`}
      />

      <Card className="mb-6 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="t-footnote text-ink-2">{reg.disclaimer}</p>
            <p className="t-caption mt-2 text-ink-3">
              Dr G Zero observes indirect proxies for <span className="font-semibold text-ink-2 tabular">{counts.measured}</span> of {counts.total} risks. Catalogue:{' '}
              <SourceButton source={catalogue} />
            </p>
          </div>
          <div className="flex flex-col gap-1.5" aria-label="Evidence key">
            {(Object.keys(EVIDENCE_META) as EvidenceClass[]).map((e) => (
              <div key={e} className="flex items-center gap-2">
                <EvidenceChip evidence={e} />
                <span className="t-caption max-w-[260px] text-ink-3">{EVIDENCE_META[e].help}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(240px,300px)_1fr] gap-6">
        <div>
          <SegmentedControl
            label="Filter risks"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'measured', label: 'Dr G Zero relates' },
              { value: 'not-measured', label: 'Not measured' },
            ]}
          />
          <ul className="mt-3 space-y-1" aria-label="NASA HRP risks">
            {risks.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  data-risk-id={r.id}
                  aria-current={r.id === current.id}
                  className={cn('w-full rounded-[10px] px-3 py-2 text-left transition-colors', r.id === current.id ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  <span className={cn('t-footnote block font-medium', r.id === current.id ? 'text-accent' : 'text-ink')}>{r.name}</span>
                  <span className="t-caption text-ink-3">{COVERAGE_META[r.coverage].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <RiskDetail key={current.id} reg={reg} risk={current} />
      </div>
    </div>
  );
}

function Block({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="border-t border-line px-6 py-4">
      <h3 className="t-eyebrow mb-2 text-ink-3">{title}</h3>
      {note && <p className="t-caption -mt-1 mb-2 text-ink-3">{note}</p>}
      {children}
    </section>
  );
}

function RiskDetail({ reg, risk }: { reg: HrpRegistry; risk: RiskEntry }) {
  const src = (id: string | undefined) => (id ? reg.sources.find((s) => s.id === id) ?? null : null);
  const cite = (id: string | undefined) => {
    const s = src(id);
    return s ? <SourceButton source={s} compact /> : <span className="t-caption text-attention">Source unavailable</span>;
  };
  const layers = (Object.keys(LAYER_LABEL) as IndicatorLayer[]).filter((l) => risk.indicators.some((i) => i.layer === l));
  const label = (id: string) => getSignal(id)?.label ?? id;

  return (
    <div className="min-w-0" data-risk-detail={risk.id}>
    <Card>
      <header className="px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={COVERAGE_META[risk.coverage].tone}>{COVERAGE_META[risk.coverage].label}</Pill>
          <span className="t-caption text-ink-3 font-mono">{risk.id}</span>
        </div>
        <h2 className="t-title mt-2 text-ink">{risk.name}</h2>
        <p className="t-caption mt-1 text-ink-3">NASA formal risk: {risk.formalName}</p>
        <p className="t-body mt-3 text-ink-2">{risk.description}</p>
        <p className="t-caption mt-1 text-ink-3">Summary paraphrased by Dr G Zero from the sources below.</p>
      </header>

      <Block title="What NASA says">
        <ul className="space-y-2">
          {risk.statements.map((s, i) => (
            <li key={i} className="flex gap-2">
              <Quote size={14} className="mt-0.5 shrink-0 text-ink-3" />
              <p className="t-footnote text-ink">
                “{s.quote}” <span className="ml-1 inline-block">{cite(s.sourceId)}</span>
              </p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Indicators — and what Dr G Zero actually measures" note={RISK_LINK_CAVEAT}>
        <div className="grid gap-4 md:grid-cols-2">
          {layers.map((l) => (
            <div key={l}>
              <p className="t-caption mb-1.5 font-semibold text-ink-2">{LAYER_LABEL[l]}</p>
              <ul className="space-y-2">
                {risk.indicators
                  .filter((i) => i.layer === l)
                  .map((ind) => (
                    <li key={ind.label} className="rounded-[10px] border border-line px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="t-footnote font-medium text-ink">{ind.label}</span>
                        <EvidenceChip evidence={ind.evidence} />
                        {ind.sourceId && cite(ind.sourceId)}
                      </div>
                      <p className="t-caption mt-1 flex items-start gap-1.5 text-ink-3">
                        {ind.signalIds.length ? (
                          <>
                            <CheckCircle2 size={13} className="mt-px shrink-0 text-teal" />
                            <span>Dr G Zero measures: {ind.signalIds.map(label).join(', ')}</span>
                          </>
                        ) : (
                          <>
                            <CircleDashed size={13} className="mt-px shrink-0" />
                            <span>Not measured by Dr G Zero</span>
                          </>
                        )}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Block>

      {risk.signalLinks.length > 0 && (
        <Block title="Why Dr G Zero links its signals to this risk">
          <table className="w-full text-left">
            <thead>
              <tr className="t-caption text-ink-3">
                <th className="pb-1.5 font-medium">Signal</th>
                <th className="pb-1.5 font-medium">Evidence</th>
                <th className="pb-1.5 font-medium">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {risk.signalLinks.map((l) => (
                <tr key={l.signalId} className="border-t border-line align-top">
                  <td className="t-caption py-1.5 pr-3 font-medium text-ink">{label(l.signalId)}</td>
                  <td className="py-1.5 pr-3">
                    <EvidenceChip evidence={l.evidence} />
                  </td>
                  <td className="t-caption py-1.5 text-ink-2">{l.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      <Block title="Missing measurements">
        {risk.missingMeasurements.length ? (
          <ul className="t-footnote list-disc space-y-0.5 pl-5 text-ink-2">
            {risk.missingMeasurements.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="t-footnote text-ink-3">None listed.</p>
        )}
      </Block>

      {risk.detectionMethods.length > 0 && (
        <Block title="Statistical detection in Dr G Zero" note="Dr G Zero’s own methods, against each astronaut’s personal baseline. Not NASA methods and not clinical thresholds.">
          <ul className="space-y-1.5">
            {risk.detectionMethods.map((d) => (
              <li key={d.method} className="flex items-start gap-2">
                <FlaskConical size={14} className={cn('mt-0.5 shrink-0', d.implemented ? 'text-teal' : 'text-ink-3')} />
                <p className="t-footnote text-ink-2">
                  <span className="font-medium text-ink">{d.method}</span> {d.implemented ? '' : <Pill className="ml-1 py-0">Not implemented</Pill>} — {d.description}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Mitigations described by NASA" note="Quoted from NASA. Shown for context — Dr G Zero does not prescribe interventions.">
        {risk.mitigations.length ? (
          <ul className="space-y-2">
            {risk.mitigations.map((m) => (
              <li key={m.summary}>
                <p className="t-footnote font-medium text-ink">{m.summary}</p>
                <p className="t-caption text-ink-2">
                  “{m.quote}” <span className="ml-1 inline-block">{cite(m.sourceId)}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-footnote text-ink-3">The retrieved NASA pages do not describe an established mitigation, so none is listed.</p>
        )}
      </Block>

      <Block title="Known limitations">
        <ul className="t-footnote list-disc space-y-0.5 pl-5 text-ink-2">
          {risk.limitations.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Block>

      <Block title="Sources">
        <ul className="space-y-2">
          {risk.sourceIds.map((id) => {
            const s = src(id);
            return (
              <li key={id} className="flex items-start gap-2">
                <BookMarked size={14} className="mt-0.5 shrink-0 text-ink-3" />
                {s ? (
                  <div>
                    <SourceButton source={s} />
                    <p className="t-caption text-ink-3">
                      {s.organisation} · {s.kind === 'hsrb-risk-page' ? 'Human System Risk Board page' : 'Public risk page'} · last updated {s.lastUpdated ?? 'not shown'} · retrieved {s.retrievedAt}
                    </p>
                  </div>
                ) : (
                  <p className="t-caption text-attention">Source {id} unavailable</p>
                )}
              </li>
            );
          })}
        </ul>
      </Block>
    </Card>
    </div>
  );
}
