/**
 * @orbital/companion — Workstream B. Deterministic conversation engine for the desktop companion.
 * Works fully offline. A language model may only rephrase eligible small-talk replies (see main/llm.ts).
 */
export { respond, initialState, FEELINGS, type CompanionContext, type DialogueState, type DialogueResult, type QuickReply, type JournalDraft } from './dialogue';
export { screenSafety, SUPPORT_REPLY } from './safety';
export { LINES, pick, render, type Category, type Voice, type Slots } from './phrasebank';
export { journalToMarkdown } from './export';
