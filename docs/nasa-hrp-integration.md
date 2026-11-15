# ORBITAL — NASA Human Research Program integration (Phase 3)

Status: implemented · registry v1.0.0 · snapshot retrieved 2026-11-15 · no ML in this phase.

ORBITAL now ships an **offline, versioned, cited knowledge registry** of the 17 human-system risks listed in NASA's Human Research Program (HRP) catalogue ([Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)). It connects them to ORBITAL's signals and alerts, and the dashboard can explain which spaceflight risk an alert relates to, with the source.

> **Ground rule.** A link between a signal and a NASA risk explains *why ORBITAL monitors that signal*. It does **not** establish that an astronaut is experiencing the risk. It is not a diagnosis, it never changes an alert or an SCND decision, and it implies no NASA endorsement of ORBITAL. The same caveat (`RISK_LINK_CAVEAT`) is shown wherever a link appears.

## 1. Stage 1: source verification

**Method.**
- I fetched the catalogue, all 17 public risk pages (`www.nasa.gov/reference/…`) and the 17 matching Human System Risk Board (HSRB) pages (`www.nasa.gov/directorates/esdmd/hhp/…`), then read their text.
- For each page I recorded the title (from `<title>`), the organisation (from `article:section`), the "Last Updated" date and the retrieval date.
- `tools/verify-hrp-sources.mjs` re-fetches every source and checks the titles and every quote verbatim. Its last run passed: *All 35 sources and quotes verified.*

**What counts as a source.** Only pages that were actually fetched and read. The evidence reports, DAG narratives and risk-record PDFs linked from the HSRB pages were **not** reviewed, so they are not cited.

**Dates.** NASA reference pages show a **"Last Updated" date and no separate publication date**. The registry stores `lastUpdated` and `retrievedAt`, and never invents a publication date. The catalogue page shows neither, so its `lastUpdated` is `null`.

**Anomaly found.** The "HSRB resources" link on the public *Decompression Sickness* page points to the *behavioural-health* HSRB page. ORBITAL cites the DCS HSRB page directly, and a test asserts it never uses the mis-linked page.

| Risk id | Public risk page (organisation · last updated) | Human System Risk Board page (last updated) | ORBITAL coverage |
|---|---|---|---|
| `sleep-schedules` | [Risk from Inadequate Sleep and Irregular Schedules](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/) (Humans in Space · 2025-05-16) | [Risk of Performance Decrements and Adverse Health Outcomes Resulting from Sleep Loss, Circadian Desynchronization, and Work Overload](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-performance-decrements-and-adverse-health-outcomes-resulting-from-sleep-loss-circadian-desynchronization-and-work-overload/) (2025-09-16) | proxies-measured |
| `behavioral-psychiatric` | [Risk of behavioral changes and psychiatric disorders](https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/) (Human Research Program · 2026-02-24) | [Risk of Adverse Cognitive or Behavioral Changes and Psychiatric Disorders Leading to In-mission Health and Performance and Long-term Health Effects (Behavioral Health Risk)](https://www.nasa.gov/directorates/esdmd/hhp/behavioral-health-risk/) (2025-09-17) | proxies-measured |
| `teamwork` | [Risk of inadequate teamwork](https://www.nasa.gov/reference/risk-of-inadequate-teamwork/) (Human Research Program · 2025-12-02) | [Risk of In-Mission Performance and Behavioral Health Decrements Due to Inadequate Cooperation, Coordination, Communication, and Psychosocial Adaptation within a Team (Team Risk)](https://www.nasa.gov/directorates/esdmd/hhp/team-risk/) (2025-03-18) | partial |
| `cardiovascular` | [Risk of Cardiovascular Adaptations](https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/) (Human Research Program · 2025-05-16) | [Risk of Cardiovascular Adaptations Contributing to Adverse Mission Performance and Health Outcomes (CV Risk)](https://www.nasa.gov/directorates/esdmd/hhp/cv-risk/) (2025-06-13) | partial |
| `cardiorespiratory-musculoskeletal-fitness` | [Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness](https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/) (Human Research Program · 2025-05-16) | [Risk of Reduced Physical Performance Capabilities Due to Reduced Muscle Size, Strength, and Endurance (Muscle Risk)](https://www.nasa.gov/directorates/esdmd/hhp/muscle-risk/) (2025-08-20) | proxies-measured |
| `bone` | [Risk of Spaceflight-Induced Bone Changes](https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/) (Human Research Program · 2025-05-16) | [Risk of Bone Fracture due to Spaceflight-induced Changes to Bone](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-bone-fracture-due-to-spaceflight-induced-changes-to-bone/) (2025-11-13) | countermeasure-only |
| `hypoxia` | [Risk of Hypoxia](https://www.nasa.gov/reference/risk-of-hypoxia/) (Human Research Program · 2025-05-16) | [Risk of Reduced Crew Health and Performance Due to Hypoxia](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-reduced-crew-health-and-performance-due-to-hypoxia/) (2025-06-24) | partial |
| `food-nutrition` | [Risk of Inadequate Food and Nutrition](https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/) (Human Research Program · 2025-05-16) | [Risk of Inadequate Food and Nutrition Causing Decrements in In-Mission Health and Performance and Long-term Health (Food and Nutrition Risk)](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-performance-decrement-and-crew-illness-due-to-inadequate-food-and-nutrition/) (2025-08-27) | partial |
| `immune` | [Risk of Altered Immune System Responses](https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/) (Human Research Program · 2025-05-16) | [Risk of In Mission Impacts, Adverse Health Events or Long-Term Health Impacts due to Altered Immune Response (Immune Risk)](https://www.nasa.gov/directorates/esdmd/hhp/immune-risk/) (2025-09-10) | not-measured |
| `sensorimotor-vestibular` | [Risk of Altered Sensorimotor and Vestibular Function](https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/) (Humans in Space · 2025-12-02) | [Risk of Altered Sensorimotor/Vestibular Function Impacting Critical Mission Tasks, Human Health, and Long-Term Health (Sensorimotor Risk)](https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/) (2025-07-08) | not-measured |
| `sans` | [Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)](https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/) (Human Research Program · 2025-05-16) | [Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS Risk)](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-spaceflight-associated-neuro-ocular-syndrome/) (2025-09-16) | not-measured |
| `decompression-sickness` | [Risk of Decompression Sickness](https://www.nasa.gov/reference/risk-of-decompression-sickness/) (Human Research Program · 2025-05-16) | [Risk of Mission Impacts and Long-Term Health Issues due to Decompression Sickness](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-decompression-sickness/) (2025-09-12) | not-measured |
| `host-microorganism` | [Risk of Host-Microorganism Interactions](https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/) (Human Research Program · 2025-12-02) | [Risk of Adverse Health Effects Due to Host-Microorganism Interactions](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-adverse-health-effects-due-to-host-microorganism-interactions/) (2025-09-16) | not-measured |
| `eva-injury-performance` | [Risk of Injury and Compromised Performance from Spacewalks](https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/) (Human Research Program · 2025-05-16) | [Risk of Mission Impacting Injury and Compromised Performance and Long-Term Health Effects due to EVA Operations (EVA Risk)](https://www.nasa.gov/directorates/esdmd/hhp/eva-operations-risk/) (2025-09-15) | not-measured |
| `dynamic-loads` | [Risk of injury from dynamic loads](https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/) (Human Research Program · 2025-05-16) | [Risk of In-Mission Injury and Performance Decrements and Long-term Health Effects due to Dynamic Loads (Dynamic Loads Risk)](https://www.nasa.gov/directorates/esdmd/hhp/dynamic-loads-risk/) (2025-03-11) | not-measured |
| `radiation-cancer` | [Risk of radiation-induced cancers](https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/) (Human Research Program · 2025-05-16) | [Risk of Radiation Carcinogenesis](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-radiation-carcinogenesis/) (2025-09-12) | not-measured |
| `systems-operations-support` | [Risk of inadequate systems operations support](https://www.nasa.gov/reference/risk-of-inadequate-systems-operations-support/) (Human Research Program · 2025-05-16) | [Risk of Adverse Mission Outcomes Due to Earth Independent Human-Systems Operations (EIHSO Risk)](https://www.nasa.gov/directorates/esdmd/hhp/eihso-risk/) (2025-09-12) | not-measured |

The exact quotes, indicators, mitigations and limitations for every risk are in `packages/data-sources/knowledge/nasa-hrp/registry.json`, and readable in the app under **NASA Research & Risk Knowledge**.

### Key findings in NASA's words (abridged; full quotes are in the registry)
- **Sleep:** "astronauts commonly experience sleep deprivation". Environmental factors "inhibit sleep". Mitigations NASA describes: LED lighting that simulates the light–dark cycle, and "designated times for relaxation and self-care".
- **Behavioural health:** isolation and confinement can cause "decrements in cognitive and behavioral functioning". ISS countermeasures "have mainly been successful in mitigating this risk", but countermeasures for exploration missions "have not yet been developed and validated". NASA "encourages astronauts to explore self-care options including keeping a regular journal".
- **Teamwork:** "evidence of occasional conflict", and "Team training and performance are not systematically monitored nor evaluated".
- **Cardiovascular:** deconditioning and remodelling, with orthostatic intolerance as a primary concern. Exercise, diet, compression garments and fluid loading before landing "can help to prevent low blood pressure".
- **Fitness/muscle:** with adherence to exercise and adequate equipment, crews return "with minimal losses" on average. ISS average losses are 10–12%, and effects "can vary substantially between individual astronauts".
- **Bone:** "1% and 1.5%" density loss per month on 4–6-month missions. "Countermeasures such as exercise, adequate nutrition, and medications are needed".
- **Hypoxia, food and nutrition, immune, sensorimotor, SANS, DCS, host–microorganism, EVA, dynamic loads, radiation, Earth-independent operations:** see the registry.

### Limitations of the sources
- These are public summaries, not the underlying evidence. Several linked evidence reports date from 2015–2017 (not reviewed).
- They are snapshots: NASA updates these pages, so re-run the verifier and bump `registryVersion` when they change.
- NASA's numbers (for example 10–12% fitness loss, 1–1.5% bone loss per month, ~70% eye swelling) are **population statements about ISS crews**. ORBITAL never uses them as per-person thresholds.

## 2. Stage 2: risk-to-signal mapping

Every claim carries one of three evidence classes:

| Class | Meaning |
|---|---|
| **NASA-stated** | The cited NASA page names this indicator or countermeasure explicitly. |
| **NASA-related** | NASA names the broader area (for example "cognitive functioning", "morale"); ORBITAL's specific measure is our operationalisation. |
| **ORBITAL hypothesis** | Our own proposed link, not stated by NASA. Allowed without a NASA citation, but always labelled as a hypothesis. |

| Risk | NASA-stated links | NASA-related links | ORBITAL hypotheses | Not measured (examples) |
|---|---|---|---|---|
| `sleep-schedules` | `sleep.duration`, `fatigue.vas` | `sleep.efficiency`, `sleep.quality`, `fatigue.index`, `cog.rt.median`, `cog.rt.lapses` | `cog.game.reaction`, `hrv.rmssd` | Circadian phase markers (e.g. light exposure, sleep timing relative to schedule); Workload / schedule data |
| `behavioral-psychiatric` | — | `cog.rt.median`, `cog.memory.accuracy`, `cog.concentration`, `mood.vas`, `motivation.vas`, `isolation.vas` | `cog.game.reaction`, `cog.game.memory-span`, `stress.vas`, `fatigue.vas` | Clinical behavioural-health assessment (only qualified humans can make one); Validated psychological instruments administered by professionals |
| `teamwork` | — | — | `isolation.vas` | Team performance and cohesion measures; Communication logs (deliberately not collected, for privacy) |
| `cardiovascular` | `bp.systolic`, `bp.diastolic`, `exercise.aerobic` | `hr.sample`, `hr.resting` | `hrv.rmssd` | Orthostatic (stand) test; Cardiac and vascular ultrasound |
| `cardiorespiratory-musculoskeletal-fitness` | `exercise.resistance`, `exercise.aerobic`, `exercise.performance` | `activity.active-minutes`, `hr.resting`, `body.lean-mass`, `body.muscle-mass`, `body.skeletal-muscle` | `body.segment.arm-left`, `body.segment.arm-right`, `body.segment.trunk`, `body.segment.leg-left`, `body.segment.leg-right` | Strength testing (dynamometry); VO2 / aerobic capacity testing |
| `bone` | `exercise.resistance` | — | `body.lean-mass`, `body.skeletal-muscle` | Bone density scans (NASA performs these before and after flight); Bone turnover biomarkers |
| `hypoxia` | — | `spo2.spot`, `spo2.nightly` | `resp.rate` | Cabin atmosphere telemetry (pressure, ppO2); Arterial blood gases |
| `food-nutrition` | — | — | `body.mass`, `body.fat-mass`, `body.water`, `hydration.intake`, `hydration.index`, `glucose.capillary` | Dietary intake logging; Nutritional biochemistry (blood/urine) |
| `immune` | — | — | — | Immune biomarkers; Viral reactivation assays |
| `sensorimotor-vestibular` | — | — | — | Balance / posturography; Fine motor task performance |
| `sans` | — | — | — | Ocular imaging; Visual acuity |
| `decompression-sickness` | — | — | — | Suit/habitat pressure profiles; Prebreathe protocol records |
| `host-microorganism` | — | — | — | Microbiome sampling; Infection reporting |
| `eva-injury-performance` | — | — | — | EVA schedules and suit telemetry |
| `dynamic-loads` | — | — | — | Vehicle load data |
| `radiation-cancer` | — | — | — | Personal dosimetry |
| `systems-operations-support` | — | — | — | Operational task performance |


**Established vs hypothesis, in brief.**
- *Established by NASA's text:* sleep loss, fatigue, cognitive/behavioural decrements, isolation as a stressor, blood pressure (orthostatic), exercise as a countermeasure (cardiovascular, muscle, bone), muscle size, fitness self-evaluation, low oxygen (hypoxia).
- *ORBITAL hypotheses:* HRV with sleep and cardiovascular; stress and fatigue with behavioural health; isolation with teamwork; every nutrition link (mass, hydration, glucose); respiratory rate with hypoxia; lean mass with bone; segmental body composition; game scores.

**Deliberately not linked.**
- Skin temperature is not linked to immune function or infection.
- Reaction time is not linked to sensorimotor function or radiation.
- Mood is not a depression measure, and nothing maps to a psychiatric diagnosis.

**Statistical detection** (ORBITAL's own methods, not NASA's, and not clinical thresholds):
- personal-baseline z-score of the 7-day mean (days 10–37 baseline; σ only with n ≥ 10)
- the SCND persistence + EWMA (λ 0.2, L 2.7) + CUSUM (k 0.5, h 5) agreement rule
- descriptive wellbeing patterns
- ML anomaly scoring remains interface-only and **not implemented**

Each risk records which methods apply and whether each one is implemented.

**Mitigations** are recorded only when a NASA page states them, each with its verbatim quote and source. The UI labels them "Quoted from NASA … ORBITAL does not prescribe interventions". When a page describes no mitigation (for example hypoxia, immune, SANS), none is listed, and the UI says so.

## 3. Stage 3: the registry

- **Schema:** `packages/contracts/src/knowledge.ts` (zod). Defines `NasaSource`, `RiskEntry`, `SignalLink`, `RiskIndicator`, `Mitigation`, `EvidenceClass`, `OrbitalCoverage`, `HrpRegistry`, `AlertRiskLink` and `HrpKnowledgeState`. `CONTRACTS_VERSION` is now 1.2.0.
- **Data:** `packages/data-sources/knowledge/nasa-hrp/registry.json`. Fields: `schemaVersion` 1, `registryVersion` 1.0.0, `snapshotDate`, and the 35 sources and 17 risks. Each risk has id, name, formal name, description (paraphrase), sources, verbatim statements, indicators by layer, signal links, missing measurements, detection methods, mitigations, coverage and limitations.
- **Coverage values:**
  - `proxies-measured`
  - `partial`
  - `countermeasure-only`: bone. ORBITAL sees exercise adherence but nothing about bone.
  - `not-measured`
- **Validation** (`validateHrpRegistry`, in `@orbital/data-sources`). It never throws; failures return `{status:'unavailable', errors}`. It checks:
  - the zod schema, with only official `https://www.nasa.gov/` URLs allowed
  - unique source ids and URLs
  - every referenced source exists, and each risk cites only its own sources
  - every risk has a public NASA page
  - all 17 `HrpRiskId`s are present
  - NASA-class claims carry a source
  - indicators reference only linked signals
  - `not-measured` ⇔ no signal links
  - date ordering
  - optionally, **bidirectional consistency with the signal registry's `hrpRisks`**, plus unknown-signal detection
- **Adapter:** `createNasaHrpSource()` implements the planned `ReferenceSource` `nasa.hrp` (architecture-plan §8). It has `online: false` and returns `ReferenceItem[]`.
- **Alert linkage:**
  - The engine's `deriveAlerts` now records `signalIds` on each alert (decision logic unchanged).
  - The main process applies `attachRiskContext`, which adds `riskContext` as up to four risks. They are ranked by how many contributing signals link to each risk, then by evidence. Each entry carries its evidence class, rationale and source, or `source: null` when a source is missing ("Source unavailable"; never invented).
  - **Urgent safety alerts never carry risk context.** The alert's tier, title, detail and reasons are never modified.
  - Related risk ids are written to the append-only audit trail.
- **IPC:**
  - `knowledge:hrp` returns the validated registry, or the reasons it is unavailable.
  - `knowledge:open-source {sourceId}` opens a page in the OS browser **only if that id is in the validated registry** (allow-list). Arbitrary URLs are refused.

## 4. Stage 4: user interface
- **Mission Settings:** the "Phase 1" placeholder is replaced with live status: offline, registry version, number of risks and sources, retrieval date, and an *Open* button. The OSDR row now says "Not built yet" instead of "Phase 3".
- **New section: NASA Research & Risk Knowledge** (sidebar). It shows:
  - the disclaimer, the evidence key and a coverage count ("ORBITAL observes indirect proxies for 7 of 17 risks")
  - filters (All / ORBITAL relates / Not measured) and a risk list
  - for each risk: NASA formal name, paraphrased summary, **What NASA says** (quotes with source links), **Indicators and what ORBITAL actually measures** (per layer, ✓ measured with signal names or "Not measured"), signal-link rationale table, missing measurements, statistical detection, mitigations described by NASA, limitations, and sources (organisation, page type, last updated, retrieved, open original)
- **Alerts** (Brain & Mental Health, Overview): a "Related NASA research area(s)" block with evidence chips, NASA source links and the fixed caveat. Clicking a risk deep-links to `#/knowledge/<riskId>`.

## 5. Stage 5: testing

`npm test` runs 154 tests: the 123 original tests plus 31 new ones.
- `packages/data-sources/test/nasa-hrp.test.ts` (30 tests):
  - **validation:** schema errors, non-NASA URLs, a missing risk, unsourced NASA claims vs allowed hypotheses, signal-registry mismatch, unknown signals, coverage consistency
  - **provenance:** nasa.gov, organisation, dates; public + HSRB page per risk; quotes come from the risk's own sources; DCS mis-link not used
  - **honesty:** no diagnostic phrasing, no numeric clinical thresholds in ORBITAL-authored text, mitigations always NASA-sourced, unmeasurable risks say so, nutrition links are all hypotheses
  - **mappings:** every signal's `hrpRisks` matches the registry; evidence ordering; unlinked signals return nothing
  - **dashboard integration:** urgent alerts get no context; physical alert gets a cited link; deduplication, ranking and a cap; the alert itself is unchanged; pass-through when unavailable
  - **missing source:** `null`, never invented
  - **offline:** loading performs no `fetch`
  - **allow-list**
- `apps/desktop/src/main/conversation-service.test.ts` (+1): the real alert pipeline for CM-04 at day 150. The human-review alert carries cited nasa.gov risk context, the alert copy is unchanged, the SCND decision is identical, urgent alerts carry none, and the audit records the related risks.
- **Smoke** (built app, light and dark): 4 new checks.
  - the registry loads offline with 17 risks
  - only registry sources open
  - alerts carry nasa.gov context and urgent alerts never do
  - the Knowledge section lists 17 risks and deep-links
  - new screenshots: `knowledge-sleep`, `knowledge-bone`, `knowledge-indicators`, `dashboard-knowledge`
- **Test-infrastructure changes:**
  - Vitest `testTimeout` raised to 30 s. A simulation test that validates every record needs about 5 s, so it was timing out under parallel load; this also happened on the unmodified baseline.
  - The smoke time limit was raised from 30 s to 60 s to cover the new screenshots.

## 6. Maintenance
1. Run `node tools/verify-hrp-sources.mjs`. It is online and run manually; the app never runs it.
2. If titles, dates or quotes changed, edit `registry.json`, update `retrievedAt` and `snapshotDate`, and bump `registryVersion`.
3. Adding a signal–risk link requires editing **both** the signal registry's `hrpRisks` and the knowledge registry. The consistency test fails otherwise.

## 7. Known limitations
- ORBITAL measures nothing for bone, SANS, immune, sensorimotor, radiation, DCS, host–microorganism, EVA, dynamic loads or Earth-independent operations. The registry states this rather than hiding it.
- All ORBITAL values are synthetic. The risk context explains relevance and is not evidence that a risk is present.
- The quotes are short excerpts of public NASA web content with attribution and links. Linked evidence reports were not reviewed.
- Evidence classes are the ORBITAL team's own judgement of the NASA text. They should be reviewed by a domain expert.
