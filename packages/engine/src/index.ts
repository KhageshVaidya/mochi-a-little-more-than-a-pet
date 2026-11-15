/**
 * @orbital/engine — Workstream C.
 * Deterministic, explainable Brain & Mental Health monitor. Not a diagnostic tool.
 */
export { evaluate, ENGINE_VERSION } from './evaluate';
export { DEFAULT_CONFIG, type EngineConfig } from './config';
export { DEFAULT_DETECTORS, zScoreDetector, persistenceDetector, ewmaDetector, cusumDetector, type DetectorCfg } from './detectors';
export { computeBaseline, toDailySeries, rejectReason, adverseZ, mean, sd, median, mad, hashJson } from './stats';
export { templateExplainer } from './explain';
export { deriveAlerts, type AlertInputs } from './alerts';
export { wellbeingPatterns } from './patterns';
// Phase 4 — hybrid intelligence
export { trainForest, anomalyScore, cFactor, mulberry32, type IsolationForest, type ForestOptions } from './ml/isolation-forest';
export { ML_FEATURES, ML_SETTINGS, extractDailyFeatures, trainModel, scoreDays, alarmDays, mlAdvisoryBlock, isolationForestAdvisor, presentFraction, encode, type TrainedModel, type DailyFeatures } from './ml/model';
export { TREND_SIGNALS, TREND_SETTINGS, mannKendall, theilSen, normalCdf, weeklyMeans, trendFinding } from './intelligence/trend';
export { buildIntelligenceReport, signalQuality, type ReportInput } from './intelligence/report';
export { runMission, summarise, forecastEvaluation, type EvalMission, type MissionResult, type GroupMetrics } from './ml/evaluation';
