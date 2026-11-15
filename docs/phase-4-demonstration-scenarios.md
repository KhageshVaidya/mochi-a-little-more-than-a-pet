# ORBITAL — Phase 4 demonstration scenarios

> **SYNTHETIC DEMONSTRATION.** Five fictional crew members, simulated data, no clinical validation. Nothing here is a diagnosis.

Each row runs the complete chain on the real code: statistics → ML advisory → deterministic decision → recommendation → companion line → mission reward. The source is `tests/phase4-demo.test.ts`. Regenerate the full JSON (`docs/phase-4-demonstration-scenarios.results.json`) with `ORBITAL_WRITE_DEMO=1 npx vitest run tests/phase4-demo.test.ts`. The same chain is exercised in the built app by `npm run smoke` (5 Phase 4 checks per theme).

Model hash: `69db990e`. "Reward" is the XP gained by completing the adaptive mission's activity on that day: base XP for the activity plus the +10 mission bonus, if that slot wasn't already complete.

## 1. Healthy adaptation: Alex Morgan (CM-01), day 150

1. **Statistical engine:** no sustained, notable or trend findings.
2. **ML:** no alarm (score 0.372, threshold 0.525).
3. **Decision:** **NO** (P1 exclusions noted, then R-BRAIN-03: no sustained change from personal baseline).
4. **Recommendation:** none. The routine missions continue (check-in, prescribed exercise, rotating mission).
5. **Pet:** "Hi Alex! I was hoping you’d stop by." (a greeting, with no suggestion).
6. **Reward:** none extra. Normal missions earn their usual XP.

## 2. Sleep disruption: Maya Chen (CM-02), day 100 (onset day 45)

1. **Statistical engine:** 12 findings. Sustained changes in sleep, fatigue, cognition, mood and stress. Sleep and fatigue changed first (CUSUM onsets around days 39–46; mood around day 76). There is also a resting-HR trend.
2. **ML:** alarm (score 0.689, above threshold on recent days). Largest deviations are listed in the report.
3. **Decision:** **YES** via R-BRAIN-01, confirmed over 3 days (first YES on day 61).
4. **Recommendations:** Recovery expedition · Journal moment · A restful break. Sleep comes first because it changed first.
5. **Pet:** "I have an idea for today, if you fancy it: “Recovery expedition”. Totally optional!"
6. **Reward:** completing a recovery session earns **+35 XP** (25 + 10 mission bonus) and counts toward the recovery need for the next destination.

## 3. Physical deconditioning: Daniel Reed (CM-03), day 150 (onset day 55)

1. **Statistical engine:** 9 findings. Significant adverse **longitudinal trends** in active minutes, aerobic and resistance exercise, exercise performance and resting HR (Mann–Kendall + Theil–Sen, first flagged on day 93). There is a sustained activity change and a notable sleep deviation.
2. **ML:** alarm (score 0.535, just above threshold).
3. **Decision:** **NO** (R-BRAIN-03). This is correct: it is a physical change, not a wellbeing pattern, and activity is a supporting domain only.
4. **Recommendations:** Short movement break · Recovery expedition · Movement exploration quest. Movement suggestions disappear on rest days or under a `No exercise` restriction.
5. **Pet:** "I have an idea for today, if you fancy it: “Short movement break”. Totally optional!"
6. **Reward:** **+15 XP** for a movement break. The mission bonus had already been earned that day by the prescribed session, which also completes this mission.

## 4. Wellbeing changes: Sofia Patel (CM-04), day 130 (onset day 85)

1. **Statistical engine:** 10 findings. Sustained changes in stress (onset around day 48), isolation (around day 80), fatigue, motivation, cognition and sleep quality.
2. **ML:** alarm (score 0.704). Largest deviations: fatigue, perceived isolation, stress.
3. **Decision:** **YES** via R-BRAIN-01 (first YES on day 108). A human-review alert recommends a private conversation; the astronaut chooses whether to share the report.
4. **Recommendations:** Journal moment · Recovery expedition · A restful break. Connection comes first because the wellbeing domains changed first.
5. **Pet:** "I have an idea for today, if you fancy it: “Journal moment”. Totally optional!" It never mentions risk, diagnosis or the data.
6. **Reward:** writing a journal entry earns **+30 XP** (20 + 10). Only the fact that an entry exists is counted, never its content, and the entry stays private.

## 5. Incomplete telemetry: James Wilson (CM-05), day 120

1. **Statistical engine:** no findings. Data-quality report shows low coverage and long gaps.
2. **ML:** **withheld**. Fewer than 60% of features are present, so it does not score (withheld on 136 of 136 evaluable days).
3. **Decision:** **INSUFFICIENT DATA** (P2 sufficiency).
4. **Recommendation:** Measurement catch-up only, a gentle reminder for overdue scheduled measurements.
5. **Pet:** "I have an idea for today, if you fancy it: “Measurement catch-up”. Totally optional!"
6. **Reward:** **+15 XP** for completing a measurement. Nothing is ever lost for the missing data.

## Verified properties (tests)

- **Statistical and ML outputs stay separate:** approved outputs contain no ML data.
- **ML cannot override the decision.**
- **Recovery is positive:** CM-02's ML score falls after the day-120 intervention.
- **Rest and support count:** both complete adaptive missions.
- **Deterioration is never rewarded:** maximum XP is identical with or without recommendations.
- **Progress persists:** offers and missions are stored per day.
- **Companion hidden:** gamification still works.
- **Themes:** light and dark mode both verified by smoke.
