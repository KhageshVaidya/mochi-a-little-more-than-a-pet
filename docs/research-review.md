# ORBITAL — Research Review

> Status: planning input · Last reviewed 2026-11-14
> Sources: `reference/health-monitoring-review.pdf`, `reference/body-composition-example.jpg`, `reference/scnd-engine-concept.png.jpeg`, the official Space Apps 2026 challenge page and its Resources tab (retrieved 2026-11-14).

---

## 1. Primary source

**Gupta, R. & Ghosh, P.S. (2025).** *Advancements in health monitoring technologies for astronauts in deep space missions: A Review.* Life Sciences in Space Research 47, 190–196. doi:10.1016/j.lssr.2025.06.011

It's a short (7-page) narrative review. It compares five astronaut health monitoring systems using a weighted score the authors designed, and it proposes a next-generation framework that hasn't been built yet.

### 1.1 What the paper establishes (reported, with citations)

| Topic | Finding |
|---|---|
| Monitoring modes | Health monitoring is either **continuous** (real-time vital signs) or **intermittent** (checks at set intervals or as needed). Both are valid, depending on feasibility. |
| Hazards | Five hazards drive the risk: radiation, altered gravity, distance from Earth, hostile/closed environments, isolation. These match NASA HRP's own framing. |
| Physiological effects | Bone loss and muscle atrophy, reduced plasma volume, orthostatic intolerance, headward fluid shift leading to SANS, cognitive effects (memory, spatial orientation, decision-making), immune dysregulation. Environmental CO₂ and noise affect cardiovascular and cognitive health. |
| Psychological effects | Isolation and confinement are linked to mood disturbance, memory problems, anxiety and disrupted team dynamics (Basner 2014 Mars-520; Pagel & Choukèr 2016; Stuster 2000). |
| Sensors (Table 1) | Optical HR (PPG), accelerometer, gyroscope, EDA (stress proxy), pulse oximeter (SpO₂), bioimpedance (body composition), skin thermistor, ECG, GPS. |
| Autonomy driver | Communication delay, limited bandwidth and limited onboard medical resources mean deep-space crews need **autonomous** health support. |

### 1.2 The five reviewed systems

| System | Year | Focus | Sensors | Transmission / processing | Continuous? | Paper score (rank) |
|---|---|---|---|---|---|---|
| **Gemini** | 1965 | Cardiovascular | 2-lead ECG, impedance pneumogram, oral thermistor, BP | Radio telemetry to ground; ground-based monitoring | No (intermittent) | 2.35 (5) |
| **VPack** | 2010 | EVA physiology | Pulse oximetry, plethysmograph, GSR, skin temp | Wired to suit, local storage, wireless to MCC; real-time helmet display | Yes | 5.33 (4) |
| **Astroskin** | 2016–17 | Multi-parameter | ECG, BP, HR, SpO₂, respiration rate, skin temp, activity | Bluetooth to device; analysed **post-mission**; Bluetooth issues reported | Yes | 6.70 (3) |
| **EmbracePlus** | 2019–20 | Sleep/wake, fatigue | EDA, HR, SpO₂, temp, PPG, accelerometer | Bluetooth to app with AI analysis | Yes | 7.84 (2) |
| **SHAaaS** | 2023 | AI analytics platform | **No dedicated sensors.** Fuses existing wearables and spacecraft sensors | Hybrid: edge AI onboard plus cloud AI on Earth | Yes | 7.90 (1) |

Scoring weights (Table 3): Invasiveness & Wearability 20%, Data Processing 18%, Deep-Space Suitability 15%, Sensor Capability 12%, Power Efficiency 12%, Continuous Monitoring 8%, Data Transmission 8%, Primary-Focus Relevance 7%.

**Critical notes on the scoring.** We should read the scores as the authors' informed judgement, not as measurements:
- Scores were assigned by the authors from literature, not from benchmarking. The weights are also the authors' choice.
- SHAaaS is a software platform, while the other four are hardware. Ranking a platform with no sensors first on a list of devices compares different kinds of thing. It also shows that *the software and analytics layer is where much of the value now lies*, which is the layer ORBITAL works on.
- We recomputed the scores from the weights. Our results match the published totals for VPack, Astroskin, EmbracePlus and SHAaaS. For Gemini we get 2.30, not the published 2.35, so either the paper has a small arithmetic error or our extraction is off. The results text also writes "PF" in places where "PE" (power efficiency) is meant.
- Compliance ranks highest: Invasiveness & Wearability carries the largest weight. The paper argues that design for comfort and compliance matters as much as sensor count.

### 1.3 Identified limitations (paper §8)

1. Real-time, high-frequency monitoring is still limited. Most systems transmit data intermittently.
2. Autonomy is incomplete. Systems still need astronaut input or external computing.
3. Energy efficiency and durability under radiation, microgravity and thermal cycling need to improve.
4. Large data volumes need onboard compression and storage to cope with limited bandwidth.
5. **The main barrier to AI is training data.** There is very little high-quality, *labelled* astronaut physiological data, and Earth-based datasets may not transfer to people in space.
6. Sensors need recalibration to account for microgravity, radiation and signal interference.

### 1.4 The proposed next-generation framework (research direction, not built)

| Proposed element | Paper's claim | Our assessment |
|---|---|---|
| Miniaturised, low-power hardware | Space-grade, long life | Hardware. Out of scope for ORBITAL. |
| Minimal sensors: PPG (HR) + thermistor (skin temp) | Infer HRV, fatigue, stress, hydration and circadian shifts from these two through trends and AI | **Partly speculative.** HRV needs beat-to-beat intervals, which PPG can provide, but averaged HR can't. Fatigue, stress and hydration inferred from HR and temperature alone are not validated. ORBITAL labels these as **inferred** and shows their low confidence. |
| Adaptive sampling | Change the sampling rate with activity (EVA, sleep, exercise) | We model it in the synthetic data as sampling cadence that varies by context. |
| Edge ML | Process and compress data locally before sending | ORBITAL runs fully locally and offline. A store-and-forward export packet is future work. |
| Early detection against baseline | Flag deviations from personal baseline trends before symptoms appear | **This is ORBITAL's core idea**, built with explainable statistics instead of black-box ML. |
| Psychological state tracking | "Not implemented in the initial stage"; suggested future use of HRV, circadian disruption and EEG | **ORBITAL fills this gap directly**, with the Brain & Mental Health engine. |
| Validation | Needs rigorous mission-relevant and clinical validation before operational use | We accept this. ORBITAL is a demonstrator, and we say so in the UI. |

---

## 2. The official challenge (Space Apps 2026)

**"Create Health Monitoring Software for Astronauts on Space Missions"** (Intermediate). What it asks for:

- A **visual tool** that helps astronauts **assess their own health** and gives **guidance on treatments and health improvements**.
- Any type of input (keyboard, mouse, camera), as long as it represents a health indicator.
- Suggested indicators: **blood pressure, heart rate, blood sugar, body temperature, daily sleep hours, mood**.
- Questions teams should consider: Which measurements can be done in space? Why is an exam needed? How do hazards affect indicators? **When should a result go to the crew or to ground flight surgeons?** What prevents a critical condition?
- UI ideas: animation, interactivity, and **a clickable human figure** that shows each body part's function and health status.
- Optional: other environments (spacecraft, station, rover, planetary base), prompting the astronaut to take measurements as part of their routine, gamification, dynamic charts over time, **colour coding**, and simple explanations, because astronauts aren't assumed to be experts in assessing their own health.

**Official resources (Resources tab).** These are all *informational pages*, not datasets:
- NASA HRP: [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/), [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), [Ongoing HRP Research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- CSA: [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), [Why Do We Conduct Science Experiments in Space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)

**Gaps between the brief and the challenge that ORBITAL must close:**
1. The brief doesn't list **blood pressure** or **blood glucose**, but the challenge names both. We add them as *intermittent, measured* indicators (cuff, fingerstick) that the user enters manually.
2. The challenge asks for **guidance and treatment advice**, and for **when to escalate to flight surgeons**. ORBITAL provides deterministic, non-diagnostic guidance and an explicit escalation pathway.
3. The **clickable human figure** is a named idea. We'll build an original SVG body map, connected to the HRP risk catalogue.
4. **Colour coding vs. "do not invent clinical ranges".** The brief forbids invented ranges, so the default colours show deviation from the astronaut's **personal baseline**. Absolute ranges appear only when they come from a cited source in a reference-range registry. Otherwise no range is shown.

### 2.1 Verified NASA HRP risk catalogue (from the Risks page)

Physiology: Altered Immune System Responses · Altered Sensorimotor and Vestibular Function · Cardiovascular Adaptations · Decompression Sickness · Host-Microorganism Interactions · Hypoxia · Inadequate Food and Nutrition · Injury and Compromised Performance from Spacewalks · Reduced Cardiorespiratory and Musculoskeletal Fitness · Spaceflight Associated Neuro-ocular Syndrome (SANS) · Spaceflight-Induced Bone Changes.
Behavioural: **Behavioral Changes and Psychiatric Disorders** · Inadequate Teamwork · **Inadequate Sleep and Irregular Schedules** · Inadequate Systems Operations Support.
Other: Injury from Dynamic Loads · Radiation-Induced Cancers.

ORBITAL maps each monitored signal to the HRP hazards and risks it relates to. This is our main official-resource integration (see the architecture plan, §8).

### 2.2 Additional real NASA data (verified reachable, optional)

- **NASA OSDR (Open Science Data Repository)** exposes public JSON APIs. We confirmed that `https://osdr.nasa.gov/osdr/data/osd/meta/{id}` and `https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/{OSD-id}/` respond. For example, OSD-569 is a human study with complete blood count and omics assays.
- **Limitation:** individual astronauts' continuous physiological telemetry is **not public**, for privacy reasons. Human time-series data in NASA's Life Sciences Data Archive generally requires a data request. ORBITAL will therefore **not** claim to show real astronaut vitals. Real NASA data is used for (a) the hazard and risk knowledge layer and (b) optional study metadata. The vitals come from the synthetic simulation, clearly labelled.

---

## 3. Body-composition report (`body-composition-example.jpg`)

A consumer smart-scale report (bioelectrical impedance). **None of its personal measurements will be used.** All ORBITAL body data is synthetic.

**Patterns to keep:**
- A measurement table that shows the value, the proportion and a horizontal **range bar** with a marker.
- **Segmental** presentation: an anatomical figure with left/right arm, trunk and left/right leg values in callouts.
- Left/right and upper/lower **balance** summaries.
- Raw **impedance** per segment and frequency, shown as a technical appendix.
- A clear split between a summary column and a detail column.

**Patterns to change:**
- **No single "body score" out of 100.** An unexplained composite score is the opposite of explainable.
- **No BMI or "obesity" framing.** It's misleading for muscular, highly screened astronauts and doesn't help an astronaut assess their own health.
- **Unsourced "standard ranges".** The report doesn't say where its ranges come from. ORBITAL compares against the astronaut's own pre-flight and early-mission baseline unless a cited reference exists.
- The report itself says "segmental fat analysis is an inferred value". ORBITAL makes that visible by labelling segmental values **inferred**.
- **Space caveat:** bioimpedance is affected by fluid distribution. Microgravity's headward fluid shift (paper §4) can bias it, so ORBITAL shows that caveat next to every BIA-derived value.

---

## 4. The SCND / chess-engine concept (`scnd-engine-concept.png.jpeg`)

The note describes SCND as a chess-like engine with **rigid, customer-defined rules**, an **expandable board** and **new piece types**. It argues that:
- LLMs are expensive and non-deterministic, and they waste effort on moves that aren't legal in the current position. Checking their output by repeated runs is expensive too.
- A deterministic core ("S1") with a small specialised model as fallback ("SLM") fits rule-bound domains better.
- The author says plainly that the claim hasn't been tested by any lab.

**How the philosophy maps to ORBITAL:**

| Chess/SCND idea | ORBITAL equivalent |
|---|---|
| Rules of the game (non-negotiable) | Hard constraints: data-quality gates, data sufficiency, safety escalation, the non-diagnosis rule |
| Legal-move generation (don't evaluate illegal moves) | Signal applicability: only evaluate detectors on signals with reliable, sufficient data in the window. Missing or implausible data never reaches the statistics. |
| Expandable board | The signal registry: new indicators are declared, not coded into the engine |
| New piece types | New detectors and rules registered as plugins with a fixed interface |
| Evaluation function | Statistical layer: baseline z-scores, EWMA, CUSUM, change points |
| SLM fallback | Optional ML (Isolation Forest), **advisory only**. It can't change the state. |
| LLM | Optional *explainer* of an already-computed result. Never in the decision path. |
| Determinism | Same inputs and config give the same output. Every assessment carries an input hash, config hash and rule trace. |

---

## 5. How ORBITAL differs from existing systems

| Dimension | Existing systems (paper) | ORBITAL |
|---|---|---|
| Layer | Mostly hardware (Gemini → EmbracePlus). SHAaaS is a cloud/edge platform. | Sensor-agnostic **software** layer, like SHAaaS, but **local-first with no cloud dependency** |
| Primary user | Mission control or researchers (Astroskin analysed post-mission) | **The astronaut**, assessing their own health (the challenge's core ask) |
| Psychological wellbeing | Absent. The paper defers it as future work. | Built-in explainable early-warning engine |
| AI approach | "AI-driven", opaque, held back by lack of labelled data | Deterministic rules + personal-baseline statistics. ML is optional and advisory. **No supervised classifier trained on synthetic labels.** |
| Provenance | Not addressed | Every value carries source, classification (measured / derived / inferred / self-reported / reference) and quality |
| Compliance | Addressed through wearability (hardware) | Addressed through software: gamification that rewards consistency and a supportive companion, with no shaming and no reward for overexertion |
| Escalation | Implicit (ground monitoring) | An explicit, separate human-support escalation pathway |

## 6. Established vs. proposed: what we can claim

- **Established (we can state as fact, with citation):** the hazards and risks catalogue; the sensor modalities and their working principles; the descriptions of the five systems; the shortage of labelled astronaut data.
- **Proposed or speculative (we present as hypothesis):** inferring fatigue, stress or hydration from HR and temperature; the performance of the next-generation framework; SCND's claim that S1+SLM matches state-of-the-art performance.
- **ORBITAL's own claims are limited to:** the engine is deterministic, explainable and tested against synthetic scenarios with known ground truth. It is **not clinically validated** and it **does not diagnose**.
