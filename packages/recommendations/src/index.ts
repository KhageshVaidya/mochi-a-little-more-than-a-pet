import {
  ActivityRestrictions,
  ApprovedOutputs,
  type HrpRiskId,
  type MissionCategory,
  type Recommendation,
  type RecommendationKind,
  type RecommendationSet,
  type SignalDomain,
} from '@orbital/contracts';

/**
 * @orbital/recommendations — Phase 4 recommendation engine (pure, deterministic).
 *
 * Input:  ApprovedOutputs (decision + statistical findings + data quality; never ML) and context.
 * Output: at most MAX optional, explained recommendations, plus what was suppressed and why.
 *
 * Rules:
 *  - Safety first: an open human-support pathway yields ONLY the human-support recommendation.
 *  - Activity restrictions are respected (no movement under 'no-exercise'; only light movement under
 *    'light-only'); rest days never get movement suggestions; no cognitive games when they are restricted.
 *  - Wording is invitational. No guilt, no urgency, no "you should". Everything is optional.
 *  - These are wellbeing activities, not medical advice; nothing here diagnoses or treats.
 */

export const MAX_RECOMMENDATIONS = 3;
export const RECOMMENDER_VERSION = 'rec/1.0';

export interface RecommendationContext {
  restDay: boolean;
  restrictions?: Partial<ActivityRestrictions>;
}

interface Template {
  title: string;
  description: string;
  category: MissionCategory;
  risks: HrpRiskId[];
}

export const TEMPLATES: Record<RecommendationKind, Template> = {
  'human-support': { title: 'Talk with someone you trust', description: 'Your crew-support contact is ready whenever you are. Reaching out always counts.', category: 'social', risks: ['behavioral-psychiatric'] },
  'sleep-recovery-expedition': { title: 'Recovery expedition', description: 'An unhurried recovery or mindfulness session. Slow is the whole point.', category: 'recovery', risks: ['sleep-schedules'] },
  'wind-down': { title: 'Wind-down hour', description: 'Dim the lights, put the tasks away and enjoy a few quiet minutes before sleep.', category: 'mindfulness', risks: ['sleep-schedules'] },
  'sleep-routine': { title: 'Cosy sleep routine', description: 'Try the same calm routine tonight — whatever helps you settle.', category: 'recovery', risks: ['sleep-schedules'] },
  'movement-short': { title: 'Short movement break', description: 'A few easy minutes of stretching or moving around the module.', category: 'exercise', risks: ['cardiorespiratory-musculoskeletal-fitness'] },
  'movement-exploration': { title: 'Movement exploration quest', description: 'Explore a new stretch or easy movement and log it for your expedition.', category: 'exercise', risks: ['cardiorespiratory-musculoskeletal-fitness'] },
  'exercise-optional': { title: 'Optional prescribed session', description: 'If you feel like it, your planned session is waiting. Extra minutes earn nothing extra.', category: 'exercise', risks: ['cardiorespiratory-musculoskeletal-fitness', 'bone'] },
  'cognitive-rest': { title: 'A restful break', description: 'Give your mind a pause — rest, recovery or a look out of the window all count.', category: 'rest', risks: ['sleep-schedules'] },
  'cognitive-light': { title: 'A short, fun brain game', description: 'One relaxed round of a game, just for fun. Scores are only for you.', category: 'cognitive', risks: [] },
  journal: { title: 'Journal moment', description: 'Jot down a thought or two in your private journal — only if it feels good.', category: 'mindfulness', risks: ['behavioral-psychiatric'] },
  recreation: { title: 'Something you enjoy', description: 'Music, a film, a game with the crew or a hobby — your choice.', category: 'social', risks: ['behavioral-psychiatric', 'teamwork'] },
  'companion-chat': { title: 'Chat with your companion', description: 'Say hello to your companion and see how the day went.', category: 'social', risks: [] },
  'measurement-reminder': { title: 'Measurement catch-up', description: 'Some scheduled measurements are due. Whenever it suits you — no pressure.', category: 'measurement', risks: [] },
};

const SLEEP: SignalDomain[] = ['sleep', 'fatigue'];
const WELLBEING: SignalDomain[] = ['mood', 'stress', 'social'];

export function recommend(approvedInput: ApprovedOutputs, ctx: RecommendationContext): RecommendationSet {
  const approved = ApprovedOutputs.parse(approvedInput); // strict: rejects anything extra (e.g. ML fields)
  const restrictions = ActivityRestrictions.parse(ctx.restrictions ?? {});
  const day = approved.day;
  const out: Recommendation[] = [];
  const suppressed: RecommendationSet['suppressed'] = [];
  const push = (kind: RecommendationKind, priority: number, source: Recommendation['basis']['source'], domains: string[], signals: string[] = []) => {
    if (out.some((r) => r.kind === kind)) return;
    const t = TEMPLATES[kind];
    out.push({ id: `rec:${day}:${kind}`, kind, title: t.title, description: t.description, category: t.category, basis: { source, domains, signals }, optional: true, priority, nasaRiskIds: t.risks });
  };

  // 1. Safety pathway overrides everything (and suppresses games and challenges).
  if (approved.escalation) {
    push('human-support', 0, 'safety', []);
    suppressed.push({ kind: 'cognitive-light', reason: 'Human-support pathway is open: no games or challenges are suggested.' });
    return { day, recommendations: out, suppressed };
  }
  if (approved.decisionState === 'INSUFFICIENT_DATA' && !approved.dataGaps.overdueMeasurements.length && !approved.dataGaps.lowCoverageDomains.length) {
    return { day, recommendations: [], suppressed };
  }

  const sustained = new Set(approved.sustainedDomains);
  const flagged = new Set([...approved.sustainedDomains, ...approved.notableDomains]);
  const hit = (doms: SignalDomain[]) => doms.filter((d) => flagged.has(d));

  // 2. Wellbeing pattern (decision YES or sustained mood/stress/social change).
  const wb = hit(WELLBEING);
  if (approved.decisionState === 'YES' || wb.some((d) => sustained.has(d))) {
    const wbFirst = wb.some((d) => sustained.has(d)) ? -6 : 0; // sustained mood/stress/social → connection first
    push('journal', 10 + wbFirst, approved.decisionState === 'YES' ? 'decision' : 'statistical', wb.length ? wb : [...sustained]);
    push('recreation', 12 + wbFirst, approved.decisionState === 'YES' ? 'decision' : 'statistical', wb.length ? wb : [...sustained]);
    push('companion-chat', 14 + wbFirst, approved.decisionState === 'YES' ? 'decision' : 'statistical', wb.length ? wb : [...sustained]);
  } else if (wb.length) {
    push('recreation', 22, 'statistical', wb);
  }

  // 3. Sleep / fatigue.
  const sl = hit(SLEEP);
  if (sl.length) {
    push('sleep-recovery-expedition', sl.some((d) => sustained.has(d)) ? 5 : 15, 'statistical', sl);
    push('wind-down', sl.some((d) => sustained.has(d)) ? 6 : 16, 'statistical', sl);
    if (sustained.has('sleep')) push('sleep-routine', 7, 'statistical', ['sleep']);
  }

  // 4. Cognition: rest first; a light game only when cognition and fatigue are NOT in sustained change.
  if (flagged.has('cognition')) {
    push('cognitive-rest', sustained.has('cognition') ? 8 : 18, 'statistical', ['cognition']);
    if (!sustained.has('cognition') && !sustained.has('fatigue')) {
      if (restrictions.cognitiveGames) push('cognitive-light', 24, 'statistical', ['cognition']);
      else suppressed.push({ kind: 'cognitive-light', reason: 'Cognitive games are currently restricted.' });
    } else suppressed.push({ kind: 'cognitive-light', reason: 'Rest is preferred while cognition or fatigue shows a sustained change.' });
  }

  // 5. Reduced activity / physical trend.
  const movementBasis = [...hit(['activity']), ...(approved.physicalTrendSignals.length ? ['physical-trend'] : [])];
  if (movementBasis.length) {
    const source = approved.physicalTrendSignals.length ? 'trend' : 'statistical';
    if (ctx.restDay) suppressed.push({ kind: 'movement-short', reason: 'Today is a rest day: rest is the plan.' });
    else if (restrictions.exercise === 'no-exercise') suppressed.push({ kind: 'movement-short', reason: 'Exercise is restricted: no movement activities are suggested.' });
    else {
      push('movement-short', 9, source, movementBasis, approved.physicalTrendSignals);
      push('movement-exploration', 19, source, movementBasis, approved.physicalTrendSignals);
      if (restrictions.exercise === 'none') push('exercise-optional', 20, source, movementBasis, approved.physicalTrendSignals);
      else suppressed.push({ kind: 'exercise-optional', reason: 'Only light movement is allowed at the moment.' });
    }
  }

  // 6. Data gaps.
  if (approved.dataGaps.overdueMeasurements.length || approved.dataGaps.lowCoverageDomains.length) {
    push('measurement-reminder', 30, 'data-quality', approved.dataGaps.lowCoverageDomains, approved.dataGaps.overdueMeasurements);
  }

  out.sort((a, b) => a.priority - b.priority || a.kind.localeCompare(b.kind));
  // Variety: take the best item of each area in turn (wellbeing, sleep, cognition, movement, data), so a
  // short list covers different needs rather than three variations of one.
  const groupOf = (r: Recommendation) => r.category === 'exercise' ? 'movement' : r.kind.startsWith('sleep') || r.kind === 'wind-down' ? 'sleep' : r.kind.startsWith('cognitive') ? 'cognition' : r.kind === 'measurement-reminder' ? 'data' : 'wellbeing';
  const queues = new Map<string, Recommendation[]>();
  for (const r of out) queues.set(groupOf(r), [...(queues.get(groupOf(r)) ?? []), r]);
  // Areas whose change started earliest come first (CUSUM onset), then by priority.
  const GROUP_DOMAINS: Record<string, string[]> = { sleep: ['sleep', 'fatigue'], wellbeing: ['mood', 'stress', 'social'], cognition: ['cognition'], movement: ['activity'], data: [] };
  const onset = (g: string) => Math.min(Infinity, ...GROUP_DOMAINS[g]!.map((d) => approved.domainOnsetDays[d] ?? Infinity));
  const ordered = [...queues.entries()].sort((a, b) => onset(a[0]) - onset(b[0]) || a[1][0]!.priority - b[1][0]!.priority).map(([, q]) => q);
  const picked: Recommendation[] = [];
  while (picked.length < MAX_RECOMMENDATIONS && ordered.some((q) => q.length)) {
    for (const q of ordered) if (q.length && picked.length < MAX_RECOMMENDATIONS) picked.push(q.shift()!);
  }
  for (const r of out.filter((x) => !picked.includes(x))) suppressed.push({ kind: r.kind, reason: `Kept the list short (max ${MAX_RECOMMENDATIONS}).` });
  return { day, recommendations: picked, suppressed };
}

/** Words that must never appear in recommendation copy (guilt, pressure, clinical claims). Tested. */
export const FORBIDDEN_WORDING = /\b(should|must|failed|missed|behind|lazy|bad|warning|diagnos\w*|treat\w*|depress\w*|disorder|streak)\b/i;
