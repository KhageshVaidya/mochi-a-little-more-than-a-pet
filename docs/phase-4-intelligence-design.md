# ORBITAL — Phase 4 hybrid intelligence design

Status: implemented · engine 0.6.0 · config `brain-wellbeing/1.1` · contracts 1.3.0 · all data SYNTHETIC · not clinically validated.

This document covers the statistical engine audit, the Isolation Forest, the temporal-prediction investigation, the deterministic decision engine, and the six-component pipeline with its APIs and data contracts. Evaluation numbers are in `phase-4-ml-evaluation.md`. The gamification side is in `phase-4-adaptive-gamification.md`.

## 1. Pipeline and separation of concerns

```
records ─┬─▶ (1) Intelligence engine ── statistical detectors ─┐
         │                          └─ Isolation Forest ──────┼─▶ IntelligenceReport
         └─▶ (2) Decision engine (SCND, deterministic) ───────┘        │
                                                                         ▼ approved: ApprovedOutputs  (no ML fields)
             (3) Recommendation engine  @orbital/recommendations  ──▶ RecommendationSet
             (4) Mission engine         @orbital/gamification     ──▶ adaptive Mission (replaces rotating slot)
             (5) Reward engine          @orbital/gamification     ──▶ XP / unlocks from completion facts only
             (6) Companion layer        @orbital/companion        ──▶ relays approved titles verbatim
```

| # | Component | Package / module | Input | Output |
|---|---|---|---|---|
| 1 | Intelligence engine | `@orbital/engine` · `stats.ts`, `detectors.ts`, `intelligence/trend.ts`, `intelligence/report.ts`, `ml/*` | `HealthRecord[]`, `SignalDefinition[]`, day | `StatisticalFinding[]`, `SignalQuality[]`, `MlAdvisoryBlock` |
| 2 | Decision engine | `@orbital/engine` · `evaluate.ts` (P0–P6) | `EngineInput`, `EngineConfig` | `Assessment` (YES / NO / INSUFFICIENT_DATA) |
| 3 | Recommendation engine | `@orbital/recommendations` · `recommend()` | `ApprovedOutputs`, `{ restDay, restrictions }` | `RecommendationSet` (≤ 3, all `optional: true`, plus suppressed with reasons) |
| 4 | Mission engine | `@orbital/gamification` · `dailyMissions()` | day, `MissionContext` (incl. `recommendations`), day's events | `Mission[]` (always 3 daily) |
| 5 | Reward engine | `@orbital/gamification` · `evaluateProgress()` | `EngagementEvent[]` (completion facts) | `ProgressState` |
| 6 | Companion layer | `@orbital/companion` · `respond()` (`ctx.suggestions`), companion window events | approved titles | template lines (`llmEligible: false`) |

Main-process integration: `apps/desktop/src/main/intelligence-service.ts`. It trains the model once, caches reports, persists offered recommendations per day, and stores restrictions. `game-service.ts` passes today's live offer and past persisted offers to the mission engine.

### IPC (all validated with zod, dashboard window only)

| Channel | Request | Response |
|---|---|---|
| `intelligence:report` | `{ astronautId, day }` | `IntelligenceReport` |
| `recommendations:list` | `{ astronautId, day }` | `RecommendationSet` |
| `restrictions:get` / `restrictions:set` | `{ astronautId [, restrictions] }` | `ActivityRestrictions` |
| `game:history` | `{ astronautId, game }` | `GameHistoryEntry[]` |
| `companion:equip` / `companion:play` | `{ astronautId, day, slot, itemId }` / `{ …, toyId }` | `ProgressState` |

New companion events (positive only): `mission.suggested {title}`. It appears only when reminders are on, at most once every 20 minutes, and never with urgency. `toy.played {title}` is the other new event.

### Data contracts (`packages/contracts/src/intelligence.ts`)

- **`StatisticalFinding`:**
  - `kind` (`sustained-change` | `longitudinal-trend` | `notable-deviation`), `domain`, `signalId`
  - `method` (e.g. "persistence + EWMA + CUSUM (all three agree)")
  - `window`, `baseline {mean, sd, n, startDay, endDay}`, `recent {mean, z}`
  - `statistic`, `threshold`, `direction`, `adverse`
  - optional `sinceDay` (CUSUM onset), `slopePerWeek`, `pValue`
- **`SignalQuality`:** 14-day `coverage` (cadence-aware), `longestGapDays`, `rejectedFraction`, `reliable`.
- **`MlAdvisoryBlock`:** `status` (`alarm` | `no-alarm` | `withheld` | `unavailable`), `score`, `threshold`, `daysAboveThreshold/windowDays`, `topFeatures`, `featuresPresent`, `modelHash`, `note`. It has no field that can express a decision.
- **`ApprovedOutputs`** (`.strict()`, so extra keys are rejected):
  - `decisionState`, `escalation`
  - `sustainedDomains`, `domainOnsetDays`, `notableDomains`
  - `physicalTrendSignals`, `dataGaps {overdueMeasurements, lowCoverageDomains}`
  - **No ML data.** `recommend()` re-parses its input, so an object carrying `ml` throws.
- **`IntelligenceReport`:** `decision` (copied from the Assessment), `statistical`, `ml`, `dataQuality`, `uncertainty`, `nasaRiskIds`, `approved`, `trace {engineVersion, configHash, modelHash}`.
- **`Recommendation`:** `kind` (13 kinds), `title`, `description`, `category`, `basis {source: safety|decision|statistical|trend|data-quality, domains, signals}`, `optional: true`, `priority`, `nasaRiskIds`.

Every result therefore carries what the brief requires: relevant signals, detection method, time window, personal-baseline comparison, data quality, uncertainty, and NASA knowledge references. The references come from each signal's `hrpRisks` and are browsable in the Phase 3 registry.

## 2. Statistical engine audit

| Signal characteristic | Method | Kept / added | Why |
|---|---|---|---|
| Person-specific levels | Personal baseline, days 10–37; SD = max(sample SD, 1.4826·MAD, floor) | kept | Robust to outliers; excludes early microgravity adaptation; the floor stops integer 0–10 scales producing tiny SDs |
| Short-term level shifts in daily wellbeing signals | 7-day mean z; persistence (≥ 5 of 7 days ≥ 1.5 SD); EWMA (λ 0.2, L 2.7); one-sided CUSUM (k 0.5, h 5) | kept | Standard SPC tools for step-like changes; requiring all three to agree cuts coincidental alarms (D-011) |
| Onset estimation | CUSUM last-reset day (`sinceDay`) | kept, now **used**: `domainOnsetDays` orders recommendations | A change point at no extra cost. PELT or binary segmentation would add complexity without improving the decision |
| Slow monotonic decline, weekly signals (deconditioning) | **Mann–Kendall + Theil–Sen on weekly means**, 9-week window, p < 0.01 **and** change ≥ 1 baseline SD | **added** | EWMA and CUSUM on daily z are tuned for steps. A rank-based trend test fits a 110-day ramp, and weekly aggregation reduces the serial correlation that inflates Mann–Kendall significance |
| Missing / poor data | P1 rejection (unit, plausibility, flags, quality score); per-signal coverage, longest gap, rejected fraction; INSUFFICIENT DATA is terminal | coverage reporting **added** | Missing days are never imputed into a decision; data quality is shown beside every result |
| Multivariate structure | Isolation Forest (§3) | **added** | Mahalanobis/Hotelling would need a stable ~15×15 covariance from 28 baseline days per person, which is ill-conditioned. A forest trained on a cohort avoids this |
| — | Moving-average smoothing | used inside features (3-day) and trend (weekly means) | Not a separate detector |

**Audit fix: confirmation rule (P4).** On held-out healthy virtual astronauts, the original rules produced false YES days on 1.33% of days, and 7 of 16 people had at least one. Most runs lasted 1–2 days, which is flicker.
- **The rule:** a YES rule must now hold on **3 consecutive evaluation days** (`rules.confirmDays: 3`).
- **When held back:** if the pattern is present today but not yet confirmed, the result is NO with rule `R-BRAIN-CONFIRM`, and the trace says so.
- **Effect:** false YES days fell to **0.28%**, and people affected fell to **2 of 16**. The cost is about 2–3 days of delay: CM-02's first YES moved from day 59 to 61, CM-04's from day 106 to 108.
- **What remains:** the remaining false runs (3–9 days) are genuine sustained drifts in the generator's AR(1) mood and isolation drivers. They are reported, not tuned away.

## 3. Isolation Forest (advisory)

- **Algorithm:** Liu, Ting & Zhou (2008), implemented from scratch in `ml/isolation-forest.ts` with a seeded PRNG. Settings: 100 trees, sub-sample ψ = 256, height limit ⌈log₂ψ⌉, score s = 2^(−E[h]/c(ψ)).
- **Features (15):**
  - sleep duration, efficiency and quality
  - fatigue, mood, stress, isolation, motivation
  - reaction time and lapses, memory accuracy, concentration
  - resting HR, HRV, active minutes

  Each feature is the 3-day trailing mean expressed as a z-score against the personal baseline, clipped to ±6.
- **Missing values:** a missing feature is imputed as 0 (at baseline). This is conservative: it can only lower the score. A day with under 60% of features present is **withheld**, never scored.
- **Training:** 40 healthy virtual astronauts (seeds 900 001–900 040, baselines jittered about 6% from the four templates), days 38–179, giving 5,680 rows.
- **Threshold:** the 99th percentile of training scores (0.525), so the target daily false-positive rate is about 1%.
- **Alarm:** the score is above the threshold on ≥ 3 of the last 5 scored days.
- **Leakage controls:**
  - training, evaluation and named-crew seeds are disjoint (tested)
  - the baseline uses days 10–37 only
  - the vector for day d uses data from days ≤ d only (tested by truncation)
  - the threshold is set on training data only
- **Reproducibility:** training is deterministic, and the model hash `69db990e` is identical on every retrain (tested).
- **What it is:** an anomaly score relative to a healthy synthetic cohort.
- **What it is not:** a predictor of depression, any disorder, or future disease. The UI note says so.
- **Explanation:** the three features with the largest absolute personal-baseline deviation on the scored day. These are honest input deviations, not attribution values.
- **Placement:** P5 of the engine. `isolationForestAdvisor` implements `MlAdvisor`: it receives a deep-frozen snapshot and returns `Advisory[]` only. Tests show that an always-alarming advisor and a mutating advisor cannot change state, reasons or contributors. Mutation throws.

**Other temporal models.** Evaluated and not adopted: LSTM/sequence models (180 days × a handful of people is far too little data, and they are opaque), and seasonal decomposition (there is no seasonality in a 180-day orbital mission beyond the weekly rest day, which baselines absorb). See the forecasting result below.

## 4. Current anomaly vs trend vs forecasting

| Question | Method | In the app? |
|---|---|---|
| Is today unusual? (current anomaly) | Isolation Forest score with persistence (advisory) | Yes, as an advisory block |
| Has something changed and stayed changed? | persistence + EWMA + CUSUM, confirmed over 3 days → SCND decision | Yes, decides YES/NO |
| Is a physical signal drifting over weeks? (longitudinal trend) | Mann–Kendall + Theil–Sen | Yes, as statistical findings feeding recommendations |
| What will next week look like? (forecast) | Theil–Sen projection of 4 weekly means, 7 days ahead | **No** |

On the held-out cohort, the projection was **worse than the naive "no change" forecast** for all signals tested:
- exercise performance: MAE 5.43 vs 4.61
- resting HR: MAE 0.85 vs 0.75
- sleep duration: MAE 0.34 vs 0.29 h

Its nominal 80% intervals covered only 58–61% of outcomes. The data do not support forecasting, so ORBITAL makes no forecasts.

## 5. Deterministic decision engine

The YES / NO / INSUFFICIENT DATA architecture is unchanged in structure:
- P0 safety
- P1 data quality
- P2 sufficiency (terminal)
- P3 detectors
- P4 rules: R-BRAIN-01/02/03, plus the new R-BRAIN-CONFIRM hold
- P5 ML advisory (frozen snapshot)
- P6 assembly

The only change is the confirmation requirement (§2). The intelligence report copies `decision` from the Assessment. A smoke check confirms that `intelligence:report` and `brain:assess` agree for all five crew.

## 6. Recommendation rules (summary)

- **Safety:** escalation leads to **only** "Talk with someone you trust". Games are suppressed.
- **Areas:**
  - sustained/notable sleep or fatigue → recovery expedition, wind-down, sleep routine (if sleep is sustained)
  - wellbeing (decision YES, or a sustained mood/stress/social change) → journal, recreation, companion chat
  - cognition → rest first; a light game only when neither cognition nor fatigue is in sustained change
  - activity change or physical trend → movement break, movement quest, optional prescribed session
  - data gaps → measurement catch-up
- **Restrictions:** `no-exercise` gives no movement suggestions; `light-only` drops the optional session. Rest days get no movement suggestions. Restricted games are not suggested.
- **Ordering:** at most 3 items. Areas are ordered by earliest CUSUM onset, then one item per area in turn, then priority. Example: for CM-02, sleep changed first (day 46) and mood later (day 76), so recovery leads. For CM-04, stress and isolation changed first, so the journal leads.
- **Wording:** invitational. A test bans: should, must, failed, missed, behind, lazy, bad, warning, diagnos*, treat*, depress*, disorder, streak.

## 7. LLM boundaries (unchanged, re-verified)

The optional language model rephrases eligible small talk only. Lines that relay recommendations are `llmEligible: false`. The model never sees reports, recommendations, journals or other astronauts' data. It cannot create, change or suppress decisions, risks, recommendations or restrictions.
