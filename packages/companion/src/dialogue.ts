import type { ChatMode, ChatRequest, JournalEntry, MemoryKind } from '@orbital/contracts';
import { LINES, pick, render, type Category, type Slots, type Voice } from './phrasebank';
import { SUPPORT_REPLY, normaliseText, screenSafety } from './safety';

/**
 * Deterministic companion dialogue policy. Pure: (state, request, context) → (state, reply, …).
 * Intent routing is rule-based. A language model, if enabled, may only rephrase the `reply` of
 * mode 'chat' afterwards (see `llmEligible`) — it never decides intent, safety, journal flow or alerts.
 */

/** Coarse, derived facts only — no raw health values, no journal text, no assessment state. */
export interface CompanionContext {
  firstName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  restDay: boolean;
  sleepBelowUsual: boolean;
  activityBelowUsual: boolean;
  measurementDue: boolean;
  exerciseDoneToday: boolean;
  achievementsToday: string[];
  favouriteGame?: string;
  alertActive: boolean;
  journalingEnabled: boolean;
  journalDoneToday: boolean;
  /**
   * Phase 4: titles of today's APPROVED recommendations (from the recommendation engine). The companion
   * only relays these; it never creates, changes or ranks recommendations, and these lines are never
   * sent to a language model for rephrasing.
   */
  suggestions?: string[];
}

export interface JournalDraft {
  turns: { question: string; answer: string | null }[];
  feelings: string[];
  asked: string[];
}

export interface DialogueState {
  mode: ChatMode;
  used: Record<string, number[]>;
  turn: number;
  journal?: JournalDraft;
  pendingMemory?: { kind: MemoryKind; text: string };
  /** Time of the last unsolicited suggestion (ms) — suggestions are rate-limited. */
  lastSuggestionAt?: number;
}

export interface QuickReply {
  label: string;
  request: ChatRequest;
}

export interface DialogueResult {
  state: DialogueState;
  reply: string;
  voice: 'template' | 'safety';
  quickReplies: QuickReply[];
  urgent: boolean;
  /** Only 'chat'-mode small talk may be rephrased by a language model. */
  llmEligible: boolean;
  memoryProposal?: { kind: MemoryKind; text: string };
  memoryConfirmed?: { kind: MemoryKind; text: string };
  journalCompleted?: Omit<JournalEntry, 'id' | 'subjectId' | 'missionDay' | 'createdAt' | 'updatedAt'>;
  mood?: number;
}

export const initialState = (): DialogueState => ({ mode: 'chat', used: {}, turn: 0 });

export const FEELINGS = ['calm', 'happy', 'energised', 'tired', 'stressed', 'lonely', 'frustrated', 'proud', 'homesick', 'okay'];
const SUGGESTION_GAP_MS = 90 * 60_000;

const KW = {
  greeting: /\b(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i,
  howAreYou: /\bhow (are|r) (you|u)\b|\bhow'?s it going\b/i,
  thanks: /\b(thanks|thank you|ty|cheers)\b/i,
  positive: /\b(good|great|fun|nice|happy|awesome|lovely|enjoyed|amazing|best|wonderful|fantastic)\b/i,
  tired: /\b(tired|exhausted|sleepy|drained|knackered|worn out|fatigued)\b/i,
  stressed: /\b(stress(ed|ful)?|hard|difficult|tough|overwhelm(ed|ing)?|anxious|worried|pressure|frustrat(ed|ing))\b/i,
  lonely: /\b(lonely|alone|isolated|miss(ing)? (home|family|everyone)|homesick)\b/i,
  social: /\b(crew|talked|chatted|together|friend|family|called|dinner with|lunch with)\b/i,
  bored: /\b(bored|boring|nothing to do)\b/i,
  game: /\b(games?|play|puzzles?)\b/i,
  joke: /\b(joke|funny|make me laugh)\b/i,
  journal: /\b(journal|diary|my day|about today)\b/i,
  checkin: /\b(check[- ]?in|mood)\b/i,
  bye: /\b(bye|goodbye|good night|see you|later)\b/i,
  stop: /^\s*(stop|end|that'?s all|done|enough|no more)\s*[.!]?\s*$/i,
  skip: /^\s*(skip|pass|next|rather not|prefer not)\b/i,
  like: /\bi (really )?(like|love|enjoy)\s+([a-z0-9' -]{3,40})/i,
  favGame: /\bmy fav(ou)?rite game is\s+([a-z0-9' -]{3,40})/i,
  suggest: /\b(what (should|can|could) i do|any ideas|ideas for today|suggest(ion)?s?|recommend(ation)?s?|what now)\b/i,
};

/** Journal follow-ups: chosen from what the person said; at most three; never interrogating. */
function nextJournalQuestion(d: JournalDraft, lastAnswer: string): string | null {
  const ask = (q: string) => (d.asked.includes(q) ? null : q);
  if (d.asked.length >= 4) return null;
  const options = [
    KW.positive.test(lastAnswer) ? ask('What was the best part?') : null,
    KW.stressed.test(lastAnswer) || KW.tired.test(lastAnswer) ? ask('Was anything particularly stressful?') : null,
    !KW.social.test(lastAnswer) ? ask('Did you get a chance to talk to the others?') : null,
    lastAnswer.length > 120 ? ask('Would you like to tell me more about that?') : null,
    ask('How are you feeling about tomorrow?'),
  ].filter((q): q is string => !!q);
  return options[0] ?? null;
}

function summarise(d: JournalDraft): DialogueResult['journalCompleted'] {
  const answered = d.turns.filter((t) => t.answer && t.answer.trim());
  const events = answered.map((t) => t.answer!.trim());
  const best = d.turns.find((t) => t.question.startsWith('What was the best part') && t.answer)?.answer;
  const parts = [`You shared how your day went${d.feelings.length ? ` and said you felt ${d.feelings.join(' and ')}` : ''}.`];
  if (best) parts.push(`Best part, in your words: “${best.trim().slice(0, 140)}”.`);
  const all = events.join(' ');
  const possibilities: { text: string; kind: 'model-possibility'; status: 'unconfirmed' }[] = [];
  if (KW.stressed.test(all) && !d.feelings.includes('stressed'))
    possibilities.push({ text: 'Parts of the day may have felt stressful — is that right?', kind: 'model-possibility', status: 'unconfirmed' });
  if (KW.tired.test(all) && !d.feelings.includes('tired'))
    possibilities.push({ text: 'You might have been feeling tired — is that right?', kind: 'model-possibility', status: 'unconfirmed' });
  if (KW.lonely.test(all) && !d.feelings.includes('lonely'))
    possibilities.push({ text: 'You may have been missing some company — is that right?', kind: 'model-possibility', status: 'unconfirmed' });
  return {
    turns: d.turns,
    feelings: d.feelings,
    events,
    summary: answered.length ? { text: parts.join(' '), kind: 'model-summary' } : null,
    possibilities,
  };
}

export function respond(prev: DialogueState, req: ChatRequest, ctx: CompanionContext, voice: Voice, now: number, seed: number): DialogueResult {
  let state: DialogueState = { ...prev, turn: prev.turn + 1 };
  const slots: Slots = { name: ctx.firstName, timeOfDay: ctx.timeOfDay, game: ctx.favouriteGame ?? 'Constellation Memory' };
  const line = (cat: Category, extra: Partial<Slots> = {}) => {
    const r = pick(cat, state.used, seed + state.turn * 7919 + cat.length);
    state = { ...state, used: r.used };
    return render(cat, r.index, { ...slots, ...extra }, voice);
  };
  const out = (reply: string, extra: Partial<DialogueResult> = {}): DialogueResult => ({
    state,
    reply,
    voice: 'template',
    quickReplies: [],
    urgent: false,
    llmEligible: false,
    ...extra,
  });
  const text = normaliseText(req.text ?? '').trim();

  // ── 0. Safety first, in every mode ────────────────────────────────────────
  if (req.action === 'talk-to-someone' || (text && screenSafety(text).urgent)) {
    state = { ...state, mode: 'support', journal: undefined, pendingMemory: undefined };
    return out(SUPPORT_REPLY, { voice: 'safety', urgent: true, quickReplies: [{ label: 'Open ORBITAL support', request: { action: 'end' } }] });
  }

  // ── Memory confirmation ─────────────────────────────────────────────────────
  if ((req.action === 'confirm-memory' || req.action === 'dismiss-memory') && state.pendingMemory) {
    const pm = state.pendingMemory;
    state = { ...state, pendingMemory: undefined };
    return req.action === 'confirm-memory' ? out(line('memorySaved'), { memoryConfirmed: pm }) : out(line('memoryDismissed'));
  }

  // ── Journal flow ────────────────────────────────────────────────────────────
  if (req.action === 'start-journal') {
    if (!ctx.journalingEnabled) return out('Journaling is turned off. You can switch it on in ORBITAL’s Journal page any time.');
    const q = line('journalInvite');
    state = { ...state, mode: 'journal', journal: { turns: [{ question: q, answer: null }], feelings: [], asked: [] } };
    return out(q, { quickReplies: journalQuick() });
  }
  if (state.mode === 'journal' && state.journal) {
    const d = { ...state.journal, turns: [...state.journal.turns], feelings: [...state.journal.feelings], asked: [...state.journal.asked] };
    if (req.action === 'feeling' && req.value && FEELINGS.includes(req.value) && !d.feelings.includes(req.value)) {
      d.feelings.push(req.value);
      state = { ...state, journal: d };
      return out(`Noted: ${d.feelings.join(', ')}. Anything else on your mind?`, { quickReplies: journalQuick() });
    }
    const ending = req.action === 'end' || (text && KW.stop.test(text));
    if (ending) {
      state = { ...state, mode: 'chat', journal: undefined };
      return out(line('journalEnd'), { journalCompleted: summarise(d) });
    }
    const skipped = req.action === 'skip' || (text && KW.skip.test(text));
    const last = d.turns[d.turns.length - 1]!;
    last.answer = skipped ? null : text || null;
    const nextQ = nextJournalQuestion(d, skipped ? '' : text);
    if (!nextQ) {
      state = { ...state, mode: 'chat', journal: undefined };
      return out(line('journalEnd'), { journalCompleted: summarise(d) });
    }
    d.asked.push(nextQ);
    d.turns.push({ question: nextQ, answer: null });
    state = { ...state, journal: d };
    const ack = skipped ? line('skipAck') : line('journalAck');
    return out(`${ack} ${nextQ}`, { quickReplies: journalQuick() });
  }

  // ── Mood check-in ───────────────────────────────────────────────────────────
  if (req.action === 'start-checkin' || (text && KW.checkin.test(text) && state.mode === 'chat')) {
    state = { ...state, mode: 'checkin' };
    return out(line('checkinPrompt'), { quickReplies: [0, 2, 4, 6, 8, 10].map((v) => ({ label: String(v), request: { action: 'mood', value: String(v) } })) });
  }
  if (req.action === 'mood' && req.value !== undefined) {
    const mood = Math.max(0, Math.min(10, Math.round(Number(req.value))));
    state = { ...state, mode: 'chat' };
    if (Number.isNaN(mood)) return out(line('unknown'));
    // Neutral acknowledgement only — the companion never interprets a single answer.
    return out(mood <= 3 ? line('checkinLow') : line('checkinThanks'), { mood, quickReplies: mood <= 3 ? [{ label: 'Talk about it', request: { action: 'start-journal' } }, { label: 'Something gentle', request: { text: 'game' } }] : [] });
  }

  // ── Opening the chat: one contextual line (rate-limited suggestions) ───────
  if (req.action === 'open') {
    state = { ...state, mode: 'chat' };
    if (ctx.alertActive) return out(line('greeting'));
    if (ctx.journalingEnabled && !ctx.journalDoneToday && (ctx.timeOfDay === 'evening' || ctx.timeOfDay === 'night'))
      return out(line('journalInvite'), { quickReplies: [{ label: 'Sure', request: { action: 'start-journal' } }, { label: 'Not tonight', request: { text: 'not now' } }] });
    const canSuggest = !state.lastSuggestionAt || now - state.lastSuggestionAt > SUGGESTION_GAP_MS;
    const ach = ctx.achievementsToday[0];
    if (ach) return out(line('achievement', { achievement: ach }), { llmEligible: true });
    if (ctx.exerciseDoneToday) return out(line('exerciseDone'), { llmEligible: true });
    if (ctx.restDay) return out(line('restDay'), { llmEligible: true });
    if (canSuggest && ctx.suggestions?.length) {
      state = { ...state, lastSuggestionAt: now };
      return out(line('adaptiveSuggestion', { suggestion: ctx.suggestions[0]! }), { llmEligible: false, quickReplies: [{ label: 'Sounds nice', request: { text: 'sounds good' } }, { label: 'Not now', request: { text: 'not now' } }] });
    }
    if (canSuggest) {
      const cat: Category | null = ctx.measurementDue ? 'measurementDue' : ctx.sleepBelowUsual ? 'poorSleep' : ctx.activityBelowUsual ? 'lowActivity' : null;
      if (cat) {
        state = { ...state, lastSuggestionAt: now };
        return out(line(cat), { llmEligible: true, quickReplies: [{ label: 'Okay!', request: { text: 'sounds good' } }, { label: 'Not now', request: { text: 'not now' } }] });
      }
    }
    return out(line('greeting'), { llmEligible: true, quickReplies: defaultQuick(ctx) });
  }

  // ── Free chat (rule-based intents) ──────────────────────────────────────────
  if (req.action === 'end') return out(line('goodbye'));
  const like = text.match(KW.favGame) ?? text.match(KW.like);
  if (like) {
    const thing = (like[3] ?? like[2] ?? '').trim().replace(/[.!?]+$/, '');
    if (thing) {
      const kind: MemoryKind = KW.favGame.test(text) || KW.game.test(thing) ? 'favourite-game' : 'interest';
      state = { ...state, pendingMemory: { kind, text: thing } };
      return out(line('memoryAsk', { memory: thing }), {
        memoryProposal: { kind, text: thing },
        quickReplies: [{ label: 'Yes, remember', request: { action: 'confirm-memory' } }, { label: 'No thanks', request: { action: 'dismiss-memory' } }],
      });
    }
  }
  if (/\b(not now|no thanks|maybe later|nah)\b/i.test(text)) return out(line('suggestionDeclined'), { llmEligible: true });
  if (/\b(sounds good|okay|ok|sure|yes|let'?s go)\b/i.test(text)) return out(line('suggestionAccepted'), { llmEligible: true });
  if (KW.suggest.test(text)) {
    return ctx.suggestions?.length
      ? out(line('suggestionList', { suggestion: ctx.suggestions.map((t) => `“${t}”`).join(', ') }), { llmEligible: false })
      : out(line('noSuggestions'), { llmEligible: false, quickReplies: defaultQuick(ctx) });
  }
  if (KW.journal.test(text)) return respond(state, { action: 'start-journal' }, ctx, voice, now, seed);
  if (KW.bye.test(text)) return out(line('goodbye'));
  if (KW.thanks.test(text)) return out(line('thanks'), { llmEligible: true });
  if (KW.joke.test(text)) return out(line('joke'), { llmEligible: false });
  if (KW.howAreYou.test(text)) return out(line('howAreYouCompanion'), { llmEligible: true });
  if (KW.lonely.test(text)) return out(line('lonely'), { llmEligible: true, quickReplies: [{ label: 'Tell you more', request: { action: 'start-journal' } }] });
  if (KW.stressed.test(text)) return out(line('stressed'), { llmEligible: true, quickReplies: [{ label: 'Talk about it', request: { action: 'start-journal' } }, { label: 'A calm game', request: { text: 'game' } }] });
  if (KW.tired.test(text)) return out(line('tired'), { llmEligible: true });
  if (KW.bored.test(text) || KW.game.test(text)) return out(line('bored'), { llmEligible: true });
  if (KW.positive.test(text)) return out(line('positive'), { llmEligible: true });
  if (KW.greeting.test(text)) return out(line('greeting'), { llmEligible: true, quickReplies: defaultQuick(ctx) });
  return out(line('unknown'), { llmEligible: true });
}

function journalQuick(): QuickReply[] {
  return [
    ...['calm', 'happy', 'tired', 'stressed', 'proud'].map((f) => ({ label: f, request: { action: 'feeling' as const, value: f } })),
    { label: 'Skip', request: { action: 'skip' } },
    { label: 'That’s all', request: { action: 'end' } },
  ];
}

function defaultQuick(ctx: CompanionContext): QuickReply[] {
  return [
    ...(ctx.journalingEnabled && !ctx.journalDoneToday ? [{ label: 'Tell you about my day', request: { action: 'start-journal' as const } }] : []),
    { label: 'Mood check-in', request: { action: 'start-checkin' } },
    { label: 'Tell me a joke', request: { text: 'tell me a joke' } },
  ];
}

export { LINES };
