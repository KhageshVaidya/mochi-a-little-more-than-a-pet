import {
  HrpRegistry,
  HrpRiskId,
  type AlertItem,
  type AlertRiskLink,
  type EvidenceClass,
  type HrpKnowledgeState,
  type NasaSource,
  type ProvenanceDoc,
  type ReferenceItem,
  type ReferenceSource,
  type RiskEntry,
  type SignalDefinition,
} from '@orbital/contracts';
import rawRegistry from '../knowledge/nasa-hrp/registry.json';

/**
 * `nasa.hrp` — the offline NASA Human Research Program knowledge registry (Phase 3).
 *
 * Pure and deterministic: the registry is bundled JSON, validated here. Nothing is fetched at run time,
 * so it works fully offline. Links only *explain* why ORBITAL watches a signal; they never alter an
 * alert or an SCND decision and never imply an astronaut is experiencing a risk.
 */

export const HRP_REGISTRY_RAW: unknown = rawRegistry;

const isoOk = (a: string, b: string) => a <= b; // ISO YYYY-MM-DD compares lexicographically

/**
 * Validate a registry: schema (zod) plus cross-reference checks. Never throws: an invalid
 * registry yields `{ status: 'unavailable', errors }` so the app can say so instead of guessing.
 * Pass `signals` to also check consistency with the signal registry's `hrpRisks`.
 */
export function validateHrpRegistry(raw: unknown, signals?: readonly SignalDefinition[]): HrpKnowledgeState {
  const parsed = HrpRegistry.safeParse(raw);
  if (!parsed.success) {
    return { status: 'unavailable', errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const reg = parsed.data;
  const errors: string[] = [];
  const sources = new Map<string, NasaSource>();
  for (const s of reg.sources) {
    if (sources.has(s.id)) errors.push(`duplicate source id ${s.id}`);
    sources.set(s.id, s);
    if (s.retrievedAt > reg.snapshotDate) errors.push(`${s.id}: retrievedAt after snapshotDate`);
    if (s.lastUpdated && !isoOk(s.lastUpdated, s.retrievedAt)) errors.push(`${s.id}: lastUpdated after retrievedAt`);
  }
  const urls = new Set<string>();
  for (const s of reg.sources) {
    if (urls.has(s.url)) errors.push(`duplicate source url ${s.url}`);
    urls.add(s.url);
  }
  if (sources.get(reg.catalogueSourceId)?.kind !== 'catalogue') errors.push(`catalogueSourceId ${reg.catalogueSourceId} is not a catalogue source`);

  const need = (id: string | undefined, where: string) => {
    if (id && !sources.has(id)) errors.push(`${where}: missing source ${id}`);
  };
  const seen = new Set<string>();
  const known = signals ? new Set(signals.map((s) => s.id)) : null;
  for (const r of reg.risks) {
    if (seen.has(r.id)) errors.push(`duplicate risk ${r.id}`);
    seen.add(r.id);
    r.sourceIds.forEach((id) => need(id, `${r.id}.sourceIds`));
    if (!r.sourceIds.some((id) => sources.get(id)?.kind === 'public-risk-page')) errors.push(`${r.id}: needs a public NASA risk page source`);
    r.statements.forEach((s, i) => need(s.sourceId, `${r.id}.statements[${i}]`));
    r.mitigations.forEach((m, i) => need(m.sourceId, `${r.id}.mitigations[${i}]`));
    r.indicators.forEach((x, i) => need(x.sourceId, `${r.id}.indicators[${i}]`));
    r.signalLinks.forEach((x, i) => need(x.sourceId, `${r.id}.signalLinks[${i}]`));
    // Every cited source must be one of the risk's own sources (no cross-risk borrowing).
    for (const id of [...r.statements, ...r.mitigations, ...r.indicators, ...r.signalLinks].map((x) => x.sourceId).filter(Boolean)) {
      if (!r.sourceIds.includes(id!)) errors.push(`${r.id}: cites ${id} which is not among its sourceIds`);
    }
    const linked = new Set(r.signalLinks.map((l) => l.signalId));
    if (linked.size !== r.signalLinks.length) errors.push(`${r.id}: duplicate signal link`);
    for (const ind of r.indicators) for (const sid of ind.signalIds) if (!linked.has(sid)) errors.push(`${r.id}: indicator "${ind.label}" uses ${sid} without a signalLink`);
    if ((r.coverage === 'not-measured') !== (r.signalLinks.length === 0)) errors.push(`${r.id}: coverage "${r.coverage}" inconsistent with ${r.signalLinks.length} signal links`);
    if (known) for (const sid of linked) if (!known.has(sid)) errors.push(`${r.id}: unknown signal ${sid}`);
  }
  for (const id of HrpRiskId.options) if (!seen.has(id)) errors.push(`risk ${id} missing from registry`);

  if (signals) {
    for (const def of signals) {
      const fromRegistry = reg.risks.filter((r) => r.signalLinks.some((l) => l.signalId === def.id)).map((r) => r.id).sort();
      const fromSignal = [...def.hrpRisks].sort();
      if (fromRegistry.join() !== fromSignal.join()) errors.push(`${def.id}: signal registry hrpRisks [${fromSignal}] ≠ knowledge registry [${fromRegistry}]`);
    }
  }
  return errors.length ? { status: 'unavailable', errors } : { status: 'ok', registry: reg };
}

/** Load the bundled registry (validated). */
export function loadHrpKnowledge(signals?: readonly SignalDefinition[]): HrpKnowledgeState {
  return validateHrpRegistry(HRP_REGISTRY_RAW, signals);
}

export function findRisk(reg: HrpRegistry, id: string): RiskEntry | null {
  return reg.risks.find((r) => r.id === id) ?? null;
}

/** Source lookup that reports absence instead of inventing a citation. */
export function findSource(reg: HrpRegistry, id: string | undefined): NasaSource | null {
  return id ? (reg.sources.find((s) => s.id === id) ?? null) : null;
}

const EVIDENCE_ORDER: Record<EvidenceClass, number> = { 'nasa-stated': 0, 'nasa-related': 1, 'orbital-hypothesis': 2 };

/** Risks linked to one signal, strongest evidence first. */
export function risksForSignal(reg: HrpRegistry, signalId: string): AlertRiskLink[] {
  const out: AlertRiskLink[] = [];
  for (const r of reg.risks) {
    const link = r.signalLinks.find((l) => l.signalId === signalId);
    if (!link) continue;
    // Hypotheses have no NASA claim to cite; point to the risk's public page so the user can read about the risk itself.
    const sourceId = link.sourceId ?? r.sourceIds.find((id) => findSource(reg, id)?.kind === 'public-risk-page');
    const src = findSource(reg, sourceId);
    out.push({
      riskId: r.id,
      riskName: r.name,
      signalId,
      evidence: link.evidence,
      rationale: link.rationale,
      source: src ? { id: src.id, title: src.title, url: src.url, lastUpdated: src.lastUpdated } : null,
    });
  }
  return out.sort((a, b) => EVIDENCE_ORDER[a.evidence] - EVIDENCE_ORDER[b.evidence] || a.riskId.localeCompare(b.riskId));
}

const MAX_LINKS_PER_ALERT = 4;

/**
 * Attach explanatory NASA risk context to alerts. The alert itself (tier, title, detail, reasons)
 * is never modified. Urgent safety alerts never carry risk context: they must stay plain and serious.
 */
export function attachRiskContext(alerts: AlertItem[], state: HrpKnowledgeState): AlertItem[] {
  if (state.status !== 'ok') return alerts;
  return alerts.map((a) => {
    if (a.tier === 'urgent' || !a.signalIds?.length) return a;
    // Rank risks by how many of the alert's contributing signals link to them, then by evidence strength.
    const byRisk = new Map<string, { link: AlertRiskLink; hits: number; best: number }>();
    for (const sid of a.signalIds) {
      for (const l of risksForSignal(state.registry, sid)) {
        const cur = byRisk.get(l.riskId);
        if (!cur) byRisk.set(l.riskId, { link: l, hits: 1, best: EVIDENCE_ORDER[l.evidence] });
        else {
          cur.hits++;
          if (EVIDENCE_ORDER[l.evidence] < cur.best) Object.assign(cur, { link: l, best: EVIDENCE_ORDER[l.evidence] }); // show the strongest link
        }
      }
    }
    const links = [...byRisk.values()].sort((x, y) => y.hits - x.hits || x.best - y.best || x.link.riskId.localeCompare(y.link.riskId)).map((x) => x.link);
    return links.length ? { ...a, riskContext: links.slice(0, MAX_LINKS_PER_ALERT) } : a;
  });
}

/** Allow-list check used before opening any external URL: only registry sources may be opened. */
export function sourceUrlFor(state: HrpKnowledgeState, sourceId: string): string | null {
  if (state.status !== 'ok') return null;
  const src = findSource(state.registry, sourceId);
  return src && /^https:\/\/www\.nasa\.gov\//.test(src.url) ? src.url : null;
}

/** `ReferenceSource` adapter (architecture-plan §8): exposes risks as `ReferenceItem[]`. Offline. */
export function createNasaHrpSource(signals?: readonly SignalDefinition[]): ReferenceSource {
  const state = loadHrpKnowledge(signals);
  return {
    id: 'nasa.hrp',
    kind: 'nasa',
    online: false,
    describe(): ProvenanceDoc {
      const reg = state.status === 'ok' ? state.registry : null;
      return {
        title: 'NASA Human Research Program — risk knowledge (offline snapshot)',
        summary: 'Curated, cited snapshot of NASA HRP public risk pages and Human System Risk Board pages, mapped to ORBITAL signals.',
        licenceOrTerms: 'Public NASA web content; quoted briefly with attribution and links. No NASA endorsement implied.',
        limitations: reg ? [reg.disclaimer] : ['Registry failed validation and is unavailable.'],
        citation: 'https://www.nasa.gov/hrp/risks/',
        ...(reg ? { retrievedAt: reg.snapshotDate } : {}),
      };
    },
    async loadReferences(): Promise<ReferenceItem[]> {
      if (state.status !== 'ok') return [];
      const reg = state.registry;
      return reg.risks.map((r) => {
        const page = r.sourceIds.map((id) => findSource(reg, id)).find((s) => s?.kind === 'public-risk-page')!;
        return { id: `hrp:${r.id}`, kind: 'hrp-risk', title: r.name, summary: r.description, url: page.url, retrievedAt: page.retrievedAt, relatedRisks: [r.id] };
      });
    },
  };
}
