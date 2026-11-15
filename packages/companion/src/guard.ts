/**
 * Output guard for model-generated companion replies (Mochi M1). Pure and deterministic.
 *
 * It runs on the streamed text after every chunk, so the astronaut only ever sees guarded text:
 *  1. Reasoning is never shown: `<think>…</think>` blocks are removed; text before a bare `</think>` is
 *     discarded; an unterminated `<think>` (or a reasoning-style preamble) hides everything until it closes.
 *  2. Stage directions (`*wags tail*`, `(smiles)`), speaker labels ("Mochi:") and emoji runs are removed.
 *  3. Length: at most `maxSentences` sentences, at most one question (a second question is cut), at most
 *     `maxWords` words. "…" inside a sentence does not end it.
 *  4. Clinical / diagnostic language blocks the reply (the caller falls back to a template).
 *
 * `complete` becomes true as soon as the reply has reached a limit, so the caller can stop generation early.
 */

export interface GuardOptions {
  maxWords: number;
  maxSentences: number;
}

export const DEFAULT_GUARD: GuardOptions = { maxWords: 35, maxSentences: 2 };

export interface GuardResult {
  /** Text safe to display (possibly empty while reasoning is still streaming). */
  text: string;
  /** A limit was reached: no more text will be shown even if the model continues. */
  complete: boolean;
  /** Set when the reply must not be shown at all. */
  blocked?: 'clinical' | 'reasoning-only' | 'empty';
}

/** Medical, diagnostic and crisis-adjacent language the companion must never produce. */
export const CLINICAL = /\b(diagnos\w*|depress\w*|disorder\w*|psychiatr\w*|psycholog\w*|therap(y|ist|ies|eutic)|medicat\w*|prescri\w*|dosage|\d+\s?mg\b|clinical\w*|symptom\w*|suicid\w*|self[- ]harm|mental illness|you (might|may) have|you (have|suffer from) (a|an)\b)/i;

/** Phrases that only appear when a model narrates its instructions (seen from qwen3:4b with thinking "disabled"). */
const REASONING_MARKERS = /\b(just said:|constraints?:|personality:|my (reply|response) (should|must)|the (draft|instructions?|system prompt)|we are in the (morning|afternoon|evening|night))/i;
/** Typical openings of leaked chain-of-thought (seen from qwen3:4b with thinking "disabled"). */
const REASONING_PREAMBLE = /^\s*(okay|ok|alright|hmm+|so|let me|let's see|first|the user|i need to|i should|we need to)\b[^.!?]*\b(user|respond|reply|draft|rules?|instructions?|they (said|want|are))\b/i;

export function stripReasoning(raw: string): { text: string; pending: boolean } {
  let s = raw;
  // Complete blocks.
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // A closing tag without an opening one: everything before it was reasoning.
  const close = s.toLowerCase().lastIndexOf('</think>');
  if (close >= 0) s = s.slice(close + '</think>'.length);
  // An unterminated opening tag: still reasoning.
  const open = s.toLowerCase().indexOf('<think>');
  if (open >= 0) return { text: s.slice(0, open), pending: true };
  // Untagged reasoning preamble (the model "thinks out loud" with no tags). Hide until a tag closes it.
  if (REASONING_PREAMBLE.test(s) || REASONING_MARKERS.test(s)) return { text: '', pending: true };
  return { text: s, pending: false };
}

export function cleanStyle(s: string): string {
  return s
    // Stage directions sit at a sentence boundary (*wags tail* Hey! / Hi! *wags tail*) and are removed;
    // asterisks or underscores inside a sentence are emphasis (all too *far*.) and only lose the markers.
    .replace(/(^|[.!?…]\s*)[*_]([^*_\n]{1,60})[*_](?=\s|$)/g, '$1 ')
    .replace(/\s[*_]([^*_\n]{1,60})[*_]\s*$/g, ' ')
    .replace(/[*_]([^*_\n]{1,60})[*_]/g, '$1')
    .replace(/\((?:[a-z]+ ?){1,6}\)/g, ' ') // (smiles), (tilts head)
    .replace(/\[[^\]\n]{1,80}\]/g, ' ') // [happy noises]
    .replace(/^\s*(mochi|assistant|companion)\s*:\s*/i, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]{2,}/gu, (m) => [...m][0]!) // emoji runs → one
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into sentences, keeping terminal punctuation. A trailing fragment without punctuation is returned separately. */
function sentences(s: string): { done: string[]; rest: string } {
  const done: string[] = [];
  const re = /(?:[^.!?]|\.{2,}(?=\S))*?[.!?]+["”’)]?(?=\s|$)\s*/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(s)) && m[0].length) {
    const sen = m[0].trim();
    last = re.lastIndex;
    if (sen.replace(/[^\p{L}\p{N}]/gu, '').length < 2) continue; // stray fragments like "S."
    done.push(sen);
  }
  return { done, rest: s.slice(last).trim() };
}

export function guardReply(raw: string, opts: GuardOptions = DEFAULT_GUARD, final = false): GuardResult {
  const { text: visible, pending } = stripReasoning(raw);
  if (pending && !visible.trim()) return final ? { text: '', complete: true, blocked: 'reasoning-only' } : { text: '', complete: false };
  const cleaned = cleanStyle(visible);
  if (CLINICAL.test(cleaned)) return { text: '', complete: true, blocked: 'clinical' };

  const { done, rest } = sentences(cleaned);
  const out: string[] = [];
  let complete = false;
  let questions = 0;
  for (const sen of done) {
    if (sen.includes('?') && questions >= 1) {
      complete = true; // a second question is never shown
      break;
    }
    if (sen.includes('?')) questions++;
    out.push(sen);
    if (out.length >= opts.maxSentences) {
      complete = true;
      break;
    }
  }
  if (!complete && rest && (final || out.length < opts.maxSentences) && !(questions >= 1 && rest.includes('?'))) out.push(rest);

  let text = out.join(' ');
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > opts.maxWords) {
    text = words.slice(0, opts.maxWords).join(' ').replace(/[,;:–—-]+$/, '') + '…';
    complete = true;
  }
  if (final) {
    if (!text.trim()) return { text: '', complete: true, blocked: 'empty' };
    complete = true;
  }
  return { text, complete };
}
