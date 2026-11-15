# SCND Brain Health Engine — Technical Explanation & Audit

> Audit of the code as of 2026-11-15 (engine `0.5.0`, config `brain-wellbeing/1.0`). Every statement below refers to code that exists today. Anything that doesn't exist yet is marked **PROPOSED**.
>
> **Scope of claims:** the engine detects *current, sustained deviations from a person's own baseline* in data that already exist. It does **not** predict future deterioration, and it does **not** diagnose any condition. Its thresholds are engineering defaults, calibrated only against ORBITAL's own synthetic scenarios. They are not clinically validated.

## 0. Where the code lives

| Concern | File | Key symbol |
|---|---|---|
| Contracts (inputs/outputs, plugin interfaces) | `packages/contracts/src/engine.ts`, `assessment.ts` | `EngineInput`, `Detector`, `DecisionRule`, `MlAdvisor`, `Assessment` |
| Signal definitions | `packages/signals/src/registry.ts` | `SIGNALS` (brain profile = `brainProfile: true`) |
| Configuration | `packages/engine/src/config.ts` | `DEFAULT_CONFIG` |
| Statistics & data-quality checks | `packages/engine/src/stats.ts` | `rejectReason`, `toDailySeries`, `computeBaseline`, `adverseZ`, `hashJson` |
| Detectors | `packages/engine/src/detectors.ts` | `zScoreDetector`, `persistenceDetector`, `ewmaDetector`, `cusumDetector` |
| Pipeline & rules | `packages/engine/src/evaluate.ts` | `evaluate()` |
| Explanation text | `packages/engine/src/explain.ts` | `templateExplainer` |
| Runtime integration | `apps/desktop/src/main/data-service.ts` | `DataService.assess()`, `timeline()` |
| Alert & recommendation derivation (UI) | `apps/desktop/src/renderer/dashboard/src/lib/insights.ts` | `deriveAlerts`, `deriveRecommendations` |
| Tests | `packages/engine/test/engine.test.ts`, `tests/integration/crew-scenarios.test.ts` | determinism, precedence, detectors, scenario ground truth |

## 1. Input parameters

`evaluate(input: EngineInput, config = DEFAULT_CONFIG, opts)` (`evaluate.ts`):

| Input | Meaning |
|---|---|
| `input.records: HealthRecord[]` | All records for one crew member. Each has `signalId`, `missionDay`, `value`, `unit`, `source` (kind, adapter, device, scenario), `classification` (measured / derived / inferred / self-reported / reference) and `quality` (score 0–1, flags). |
| `input.signals: SignalDefinition[]` | The registry. Only signals with `brainProfile: true` are evaluated. |
| `input.asOfDay` | The mission day being assessed. The engine has no clock, so records after `asOfDay` are ignored. |
| `input.safety[]` | Safety-pathway triggers (`talk-request` / `safety-item`). **Currently always `[]`** in `DataService.assess()`, because no UI feeds it yet (see §12). |
| `config` | `DEFAULT_CONFIG` (§4–§9). Any change alters `trace.configHash`. |
| `opts.detectors` / `opts.advisors` | Plugin injection. Defaults: the four detectors; **no ML advisors**. |

## 2. Signal definitions (brain profile)

Thirteen signals, from `registry.ts`, grouped into seven domains:

| Domain | Signals | Classification | Adverse direction |
|---|---|---|---|
| sleep | `sleep.duration` (h), `sleep.efficiency` (%), `sleep.quality` (0–10) | derived, derived, self-reported | down |
| fatigue | `fatigue.vas` (0–10) | self-reported | up |
| mood | `mood.vas`, `motivation.vas` (0–10) | self-reported | down |
| stress | `stress.vas` (0–10) | self-reported | up |
| social | `isolation.vas` (0–10) | self-reported | up |
| cognition | `cog.rt.median` (ms), `cog.rt.lapses` (count), `cog.memory.accuracy` (%), `cog.concentration` (0–10) | measured (task), measured, measured, self-reported | up, up, down, down |
| activity *(supporting)* | `activity.active-minutes` (min) | derived | down |

Each definition also carries `plausibleRange`, which is used **only** to reject physically impossible values and is never a clinical range. It also carries `baseline.minObservations` (10 for daily signals) and `hrpRisks` links to the NASA HRP risk catalogue.

## 3. Feature extraction

There's deliberately little of it, to keep the method transparent:
- **Daily aggregation:** `toDailySeries()` keeps one value per mission day, using the mean if a day has several reliable records. Missing days stay missing.
- **7-day mean:** used by the z-score detector (§5.1).
- **Adverse-direction z per day:** used by persistence, EWMA and CUSUM (§5).
- Not implemented: no frequency-domain features, no cross-signal features, no text features. Text features would require consent and new code (see `docs/privacy-and-crew-wellbeing.md`).

## 4. Personal baseline

`computeBaseline(series, start=10, end=37)` in `stats.ts`:

- Window: mission days **10–37**. The first ~10 days are excluded because they reflect early adaptation to microgravity.
- μ = mean of reliable daily values in the window.
- σ = max( sample SD, 1.4826 · MAD, floor ), where floor = max(10⁻⁶, 0.02·|μ|, 0.5 if unit is `{score}`).
  - The MAD term protects against a low-variance window.
  - The floor stops integer 0–10 self-report scales producing near-zero SDs that would make every one-point change look huge.
- A baseline is valid only if n ≥ `signal.baseline.minObservations`.
- **Limitation:** the baseline is fixed for the whole mission. There's no adaptive re-baselining, so slow mission-long drifts accumulate (§12).

## 5. Statistical detectors (`detectors.ts`)

All four detectors work on the **adverse-direction** standardised value:

  z_adv(x) = (x − μ)/σ  if adverse = up;  −(x − μ)/σ  if adverse = down;  |x − μ|/σ  if both

They see only post-baseline days in (37, asOfDay].

| Detector | Equation | Output |
|---|---|---|
| **5.1 z-score** | z = z_adv( mean of values on days asOf−6 … asOf ) | statistic z, threshold 1.5 |
| **5.2 Persistence** | count of days in the last 7 with z_adv ≥ 1.5. It needs ≥ 5 observed days, otherwise it returns nothing. | statistic = count, threshold 5 |
| **5.3 EWMA** (Roberts 1959) | e₀ = 0; eₜ = λ·zₜ + (1−λ)·eₜ₋₁, λ = 0.2. Limit = L·√(λ/(2−λ)) = 2.7·0.333 = **0.90** (asymptotic) | alarm if e_asOf > 0.90 |
| **5.4 CUSUM** (Page 1954) | S₀ = 0; Sₜ = max(0, Sₜ₋₁ + zₜ − k), k = 0.5 | alarm if S_asOf ≥ h = **5** |
| **5.5 Change point** | when CUSUM alarms: onset ≈ the day after the last day S was 0 | "since about day N" |

**Sustained signal** (`evaluate.ts`, P3): persistence ≥ 5 **and** EWMA alarm **and** CUSUM alarm. Requiring all three was added after calibration showed coincidental one-day alarms (decision D-011). A domain is *sustained* if any of its signals is.

## 6. Machine-learning components

**Implemented:** only the interface (`MlAdvisor` in `contracts/src/engine.ts`) and the structural guarantee around it. Advisors receive a deep-frozen copy of the assessment and can only return `Advisory[]`, so their type can't express a state change. A test injects an adversarial advisor that tries to overwrite the state and confirms the state is unchanged (`engine.test.ts`).

**Not implemented:** no ML model ships. `DataService` passes no advisors. Isolation Forest is **PROPOSED** (Phase 3) as an advisory-only anomaly score on baseline-normalised daily vectors. No supervised classifier will be trained on synthetic labels.

## 7. Missing-data handling

- **Never imputed for decisions.** Missing days are absent from every series.
- **Coverage** per signal = reliable days in [max(asOf−13, 38), asOf] ÷ the number of days in that span.
- A **domain is reliable** if at least one of its signals has a valid baseline **and** coverage ≥ 0.70.
- Persistence needs ≥ 5 observations in the last 7 days. EWMA and CUSUM simply skip missing days (no update), which slows them during gaps.

## 8. Signal-quality checks (P1, `rejectReason`)

A record is excluded, and counted in `dataQuality.issues`, if any of these apply:
1. Its unit differs from the registry unit (`unit-mismatch`).
2. Its value isn't finite or is outside `plausibleRange` (`implausible`). This catches gross sensor errors the device didn't flag.
3. It carries a flag in `rejectFlags`: motion-artifact, low-contact, implausible, unit-mismatch, duplicate (`flagged`).
4. Its quality score is below 0.5 (`low-quality`).
5. Its record id was already seen (`duplicate`).

## 9. Decision rules (P2 & P4)

Precedence is fixed and enforced by code order, which returns early:

| Tier | Rule | Condition | Effect |
|---|---|---|---|
| P0 | `P0-SAFETY-ESCALATION` | a safety trigger in the window | opens the human-support pathway (independent of the state); action = `human-support-now` |
| P1 | `P1-DQ-EXCLUSIONS` | any record excluded | reason + data-quality issue |
| P2 | `P2-SUFFICIENCY` | asOf < 37 + 7 = **44**, **or** fewer than **5 of 7** domains reliable | **INSUFFICIENT_DATA** (terminal) |
| P4 | `R-BRAIN-01` | ≥ 2 **core** domains sustained (core = mood, stress, social, fatigue, sleep, cognition) | **YES** |
| P4 | `R-BRAIN-02` | one core domain sustained **and** one of its signals has a CUSUM alarm with z_adv ≥ 2 on ≥ 10 of the last 14 days | **YES** |
| P4 | `R-BRAIN-03` | otherwise | **NO** |
| ctx | `CTX-SUPPORTING` | activity sustained | adds a reason only; never raises the state by itself |

## 10. YES / NO / INSUFFICIENT DATA

- **YES:** a predefined, explainable criterion (R-BRAIN-01 or R-BRAIN-02) was met. The reasons name the domains; contributors list each signal's z, persistence, EWMA, CUSUM and estimated onset.
- **NO:** no criterion was met in data judged sufficient. The UI says explicitly that this is not proof of wellbeing.
- **INSUFFICIENT DATA:** the baseline plus one week isn't complete, or fewer than 5 domains have reliable coverage. The reasons name the missing domains.
- **Uncertainty** is rule-based: one point each for coverage 70–85%, any baseline with n < 20, YES resting only on self-reports, or EWMA and CUSUM disagreeing. 0 points = low, 1 = moderate, 2 or more = high. INSUFFICIENT is always high.
- **Determinism:** a pure function, deep-frozen output. `trace` = engine version, FNV-1a hash of the config, FNV-1a hash of the inputs, and the rules fired. Tested by calling twice and comparing deep equality.

## 11. Alert generation (today)

Alerts are **not produced by the engine.** They're derived in the renderer (`lib/insights.ts → deriveAlerts`):
- A Brain Health **YES** produces an "attention" alert.
- Data completeness below 70% over 14 days produces a "watch" alert.
- A physical signal whose 7-day mean is ≥ 2 SD from baseline in the adverse direction (and n ≥ 10) produces a "watch" alert.

Recommendations (`deriveRecommendations`) are fixed rules on the same snapshot. **Gap:** there are no alert severity tiers, no audit log and no human-review workflow. These are added in Phase 2 C4 (`packages/engine/src/alerts.ts`, PROPOSED → implemented in this phase).

## 12. Known limitations

1. **Thresholds are not validated.** They were calibrated only on synthetic data whose generator we also wrote. Real-world sensitivity and specificity are unknown.
2. **Fixed baseline:** no re-baselining for legitimate long-term change (for example, the simulated mission-long rise in perceived isolation).
3. **Multiple testing:** 13 signals × 4 detectors. Requiring two domains and three-way agreement limits false alarms, but no formal correction is applied.
4. **Correlated signals:** signals within a domain share causes, so "≥ 2 domains" isn't the same as two independent pieces of evidence.
5. **Detection latency:** ~14–25 days after onset in the synthetic scenarios (Maya ≈ 14, Sofia ≈ 21). This is by design (sustained change), but it means the engine reports, it doesn't forewarn.
6. **Self-report dependence:** 8 of 13 signals are self-reported. Reporting behaviour (fatigue, social desirability) affects them, and missing check-ins lower coverage.
7. ~~Safety pathway not wired~~ Fixed in Phase 2: UI requests now feed `input.safety` (decision D-018).
8. **No ML** is implemented (§6).
9. **No hysteresis beyond the "sustained" rule:** states can flip between consecutive days near the thresholds (seen during Maya's recovery).
10. **Population-agnostic config:** the same thresholds apply to every crew member.

## 13. Implemented vs proposed

| Capability | Status |
|---|---|
| Deterministic pipeline P0–P4, P6; frozen output; trace hashes | **Implemented & tested** |
| Data-quality rules, sufficiency rules, personal baselines | **Implemented & tested** |
| z / persistence / EWMA / CUSUM / change point | **Implemented & tested** |
| Template explainer | **Implemented** |
| Scenario ground-truth tests (5 profiles) | **Implemented** |
| ML advisory interface + "cannot change state" guarantee | **Implemented & tested** (interface only) |
| Isolation Forest advisor | PROPOSED (Phase 3) |
| Safety input from the UI → P0 | **Implemented & tested** (companion chat and dashboard → `safety_events` → `input.safety`) |
| Alert severity tiers, audit log, human review | **Implemented & tested** (`packages/engine/src/alerts.ts`, append-only `alert_audit`) |
| Observable-pattern summaries ("several changes appeared together…") | **Implemented & tested** (`packages/engine/src/patterns.ts`) |
| Cognitive-game and journal-derived (consented) signals | **Implemented:** game scores as user-entered `cog.game.*` records (outside the baseline); 0–10 chat check-ins shared only with consent. **Free journal text is never used.** |
| Adaptive re-baselining, hysteresis | PROPOSED |
| Prediction of future deterioration | **Not claimed. Not planned without validated data.** |
