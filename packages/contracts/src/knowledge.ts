import { z } from 'zod';
import { HrpRiskId } from './signals';

/**
 * NASA Human Research Program knowledge registry (Phase 3, docs/nasa-hrp-integration.md).
 *
 * Offline, versioned, curated. Every NASA statement is a verbatim quote with a source id.
 * A link between an ORBITAL signal and a NASA risk explains *why ORBITAL watches that signal*;
 * it never establishes that an astronaut is experiencing the risk, and it is never a diagnosis.
 */

/** Only official NASA pages that were actually fetched and read are admitted as sources. */
export const NasaSourceKind = z.enum(['catalogue', 'public-risk-page', 'hsrb-risk-page']);
export type NasaSourceKind = z.infer<typeof NasaSourceKind>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const NasaSource = z.object({
  id: z.string().regex(/^src:[a-z0-9-]+$/),
  kind: NasaSourceKind,
  /** Exact page title, as shown in the page's <title> (without the " - NASA" suffix). */
  title: z.string().min(5),
  /** NASA organisation shown on the page (article section). */
  organisation: z.string().min(3),
  url: z.url().refine((u) => /^https:\/\/www\.nasa\.gov\//.test(u), 'Sources must be official https://www.nasa.gov/ pages'),
  /** The page's "Last Updated" date. NASA reference pages do not display a separate publication date. */
  lastUpdated: IsoDate.nullable(),
  /** The date ORBITAL's maintainers fetched and read the page. */
  retrievedAt: IsoDate,
});
export type NasaSource = z.infer<typeof NasaSource>;

/**
 * Evidence classes for every claim ORBITAL makes about a risk:
 *  - nasa-stated:        the cited NASA page explicitly names this indicator/mitigation.
 *  - nasa-related:       the cited page names the broader area (e.g. "cognitive functioning"); ORBITAL's
 *                        specific measurement is our operationalisation of it.
 *  - orbital-hypothesis: ORBITAL's own proposed link. Not stated by NASA. Shown as a hypothesis.
 */
export const EvidenceClass = z.enum(['nasa-stated', 'nasa-related', 'orbital-hypothesis']);
export type EvidenceClass = z.infer<typeof EvidenceClass>;

export const NasaStatement = z.object({ quote: z.string().min(10), sourceId: z.string() });
export type NasaStatement = z.infer<typeof NasaStatement>;

export const IndicatorLayer = z.enum(['physiological', 'cognitive', 'psychological', 'operational']);
export type IndicatorLayer = z.infer<typeof IndicatorLayer>;

const Cite = { evidence: EvidenceClass, sourceId: z.string().optional() };
const needsSource = (x: { evidence: EvidenceClass; sourceId?: string | undefined }) => x.evidence === 'orbital-hypothesis' || !!x.sourceId;
const NEEDS_SOURCE = 'NASA-sourced claims need a sourceId';

export const RiskIndicator = z
  .object({
    label: z.string().min(3),
    layer: IndicatorLayer,
    /** ORBITAL signals that measure (a proxy of) this indicator. Empty ⇒ ORBITAL does not measure it. */
    signalIds: z.array(z.string()),
    ...Cite,
  })
  .refine(needsSource, NEEDS_SOURCE);
export type RiskIndicator = z.infer<typeof RiskIndicator>;

export const SignalLink = z.object({ signalId: z.string(), rationale: z.string().min(10), ...Cite }).refine(needsSource, NEEDS_SOURCE);
export type SignalLink = z.infer<typeof SignalLink>;

/** Mitigations are only ever recorded when NASA states them; each carries the verbatim quote. */
export const Mitigation = z.object({ summary: z.string().min(5), quote: z.string().min(10), sourceId: z.string() });
export type Mitigation = z.infer<typeof Mitigation>;

export const DetectionMethod = z.object({
  method: z.string(),
  description: z.string(),
  /** Whether ORBITAL currently runs this method on the related signals. */
  implemented: z.boolean(),
});
export type DetectionMethod = z.infer<typeof DetectionMethod>;

/**
 * How much of a risk ORBITAL can observe:
 *  proxies-measured: indirect measures of NASA-named indicators; partial: some indicators only;
 *  countermeasure-only: tracks adherence to a NASA-described countermeasure but measures nothing of the outcome;
 *  not-measured: nothing.
 */
export const OrbitalCoverage = z.enum(['proxies-measured', 'partial', 'countermeasure-only', 'not-measured']);
export type OrbitalCoverage = z.infer<typeof OrbitalCoverage>;

export const RiskEntry = z.object({
  id: HrpRiskId,
  /** Public risk page title. */
  name: z.string(),
  /** Formal title from the Human System Risk Board page. */
  formalName: z.string(),
  /** ORBITAL's paraphrase of the NASA pages (not a quote). */
  description: z.string().min(20),
  sourceIds: z.array(z.string()).min(1),
  statements: z.array(NasaStatement).min(1),
  indicators: z.array(RiskIndicator),
  signalLinks: z.array(SignalLink),
  missingMeasurements: z.array(z.string()),
  detectionMethods: z.array(DetectionMethod),
  mitigations: z.array(Mitigation),
  coverage: OrbitalCoverage,
  limitations: z.array(z.string()).min(1),
});
export type RiskEntry = z.infer<typeof RiskEntry>;

export const HrpRegistry = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  snapshotDate: IsoDate,
  catalogueSourceId: z.string(),
  disclaimer: z.string(),
  sources: z.array(NasaSource).min(1),
  risks: z.array(RiskEntry).min(1),
});
export type HrpRegistry = z.infer<typeof HrpRegistry>;

/** Fixed, non-diagnostic caveat shown wherever a risk is linked to an alert or a signal. */
export const RISK_LINK_CAVEAT =
  'This links the measurement to a NASA research area to explain why ORBITAL monitors it. It does not mean you are experiencing this risk, and it is not a diagnosis.';

/** Risk context attached to an alert by the main process (never by a language model). */
export const AlertRiskLink = z.object({
  riskId: HrpRiskId,
  riskName: z.string(),
  signalId: z.string(),
  evidence: EvidenceClass,
  rationale: z.string(),
  /** null when the cited source is missing from the registry: shown as "source unavailable", never invented. */
  source: z.object({ id: z.string(), title: z.string(), url: z.string(), lastUpdated: z.string().nullable() }).nullable(),
});
export type AlertRiskLink = z.infer<typeof AlertRiskLink>;

/** What the dashboard receives: the validated registry, or the reason it is unavailable. */
export const HrpKnowledgeState = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), registry: HrpRegistry }),
  z.object({ status: z.literal('unavailable'), errors: z.array(z.string()) }),
]);
export type HrpKnowledgeState = z.infer<typeof HrpKnowledgeState>;
