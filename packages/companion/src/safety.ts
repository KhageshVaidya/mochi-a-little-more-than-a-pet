/**
 * On-device, deterministic safety screen. Runs on EVERY user message, in every mode, before anything else.
 * A match bypasses personality, games and any language model and opens the human-support pathway.
 * The list is intentionally broad (false positives are acceptable; misses are not) and is never used
 * to infer moods or conditions — it only triggers an offer of human support.
 */

const PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm)\s+(myself|me)\b/i,
  /\bsuicid/i,
  /\bend\s+(it\s+all|my\s+life|things)\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(be\s+alive|live|exist|wake\s+up)\b/i,
  /\bno\s+(point|reason)\s+(in\s+)?living\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\bself[-\s]?harm/i,
  /\b(i\s+need|get\s+me)\s+(help|a\s+doctor)\s+(now|urgently)\b/i,
  /\bemergency\b/i,
  /\b(chest\s+pain|can'?t\s+breathe|cannot\s+breathe)\b/i,
];

/** Typographic apostrophes/quotes (macOS autocorrect inserts ’ by default) are normalised before matching. */
export function normaliseText(text: string): string {
  return text.replace(/[\u2018\u2019\u02BC\u2032]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function screenSafety(text: string): { urgent: boolean } {
  const t = normaliseText(text);
  return { urgent: PATTERNS.some((p) => p.test(t)) };
}

/** Fixed wording. Never playful, never rephrased by a language model. */
export const SUPPORT_REPLY =
  'Thank you for telling me — this matters, and you don’t have to handle it alone. I’ve opened the human-support pathway so your crew-support contacts (crew medical officer, flight surgeon or behavioural-health team) can reach you. If you are in immediate danger, contact them directly right now.';
