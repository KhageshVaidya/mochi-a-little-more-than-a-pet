/**
 * @orbital/companion — Workstream B. Deterministic conversation engine for the desktop companion.
 * Works fully offline. A conversational model (local Ollama by default) may answer eligible small talk;
 * safety, journal, memory and app commands are always deterministic (see main/ai-service.ts).
 */
export { respond, initialState, dashboardCommand, FEELINGS, type CompanionContext, type DialogueState, type DialogueResult, type QuickReply, type JournalDraft } from './dialogue';
export { screenSafety, SUPPORT_REPLY } from './safety';
export { LINES, pick, render, type Category, type Voice, type Slots } from './phrasebank';
export { journalToMarkdown } from './export';
export { guardReply, stripReasoning, cleanStyle, CLINICAL, DEFAULT_GUARD, type GuardOptions, type GuardResult } from './guard';
export { buildModelMessages, STYLE_RULES, type ModelContext, type ModelMessage, type ModelPersona, type ModelTurn } from './prompt';
