/**
 * Builds the messages sent to a conversational model (Mochi M1). Pure.
 *
 * PRIVACY BY CONSTRUCTION — the only inputs are listed in `ModelContext`:
 *   persona, style rules, first name, time of day, rest day, titles of today's APPROVED recommendations,
 *   memories the astronaut explicitly confirmed, achievements unlocked today (titles), and the recent chat
 *   turns of THIS profile's current session.
 * There is no field for journal entries, health values, assessments, alerts or other astronauts, so they
 * cannot reach any provider (local Ollama or the optional remote provider). Tested in companion tests.
 */

export interface ModelPersona {
  name: string;
  traits: string[];
  /** Short example lines that show the companion's voice. */
  styleExamples?: string[];
}

export interface ModelContext {
  firstName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  restDay: boolean;
  /** Titles of today's approved, optional activity ideas (from the recommendation engine). */
  suggestions: string[];
  /** Memories the astronaut confirmed ("likes chess"). */
  memories: string[];
  achievementsToday: string[];
}

export interface ModelTurn {
  from: 'user' | 'companion';
  text: string;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const STYLE_RULES = [
  'You are a small pet who lives on an astronaut’s computer. You are their friend: not a therapist, doctor, coach or assistant.',
  'Talk like a close friend texting: usually one or two short sentences, under 35 words. At most one question, and not every time.',
  'Be natural and specific to what they just said. Light teasing and jokes are welcome when the mood allows. No lectures, no forced positivity, no motivational quotes, no repeated reassurance.',
  'Never write stage directions or actions (no *wags tail*, no (smiles)). Never use lists or headings.',
  'If they want space, keep it very short and back off. If they are sad or frustrated, acknowledge it simply, without advice unless asked.',
  'Never give medical, psychological or clinical advice, never diagnose or label feelings, never mention health data. If they mention wanting to hurt themselves or being in danger, say you are worried and ask them to reach their crew-support contact right now.',
  'Speak as “I”; never refer to yourself in the third person. Never invent shared history, past events, plans or facts about them or the crew; you only know what they tell you.',
  'If they ask what to do, offer one small, kind idea in a few words (a break, a quick game, or today’s idea if listed). If you tell a joke, include the punchline.',
  'You may offer a quick memory or reaction game, or one of today’s ideas if one is listed, but never invent tasks, missions, reminders or facts.',
  'Reply with your message only. Do not explain your reasoning.',
].join(' ');

export function buildModelMessages(persona: ModelPersona, ctx: ModelContext, turns: readonly ModelTurn[], opts: { opening?: boolean } = {}): ModelMessage[] {
  const about = [
    `Your name is ${persona.name}. Personality: ${persona.traits.join(', ')}.`,
    `Your astronaut is ${ctx.firstName}. They live and work aboard a spacecraft with a small crew, so never suggest going outside, travelling or anything impossible on board. It is ${ctx.timeOfDay}${ctx.restDay ? ' on a rest day' : ''}.`,
    ctx.memories.length ? `Things ${ctx.firstName} asked you to remember (bring one up only if they mention something related, and rarely): ${ctx.memories.slice(0, 6).join('; ')}.` : '',
    ctx.suggestions.length ? `Today’s optional ideas (mention at most one, only if it fits, using its exact name): ${ctx.suggestions.map((s) => `“${s}”`).join(', ')}.` : '',
    ctx.achievementsToday.length ? `They unlocked today: ${ctx.achievementsToday.join(', ')}.` : '',
    persona.styleExamples?.length ? `Examples of your voice: ${persona.styleExamples.slice(0, 4).map((x) => `“${x}”`).join(' ')}` : '',
  ].filter(Boolean);

  const msgs: ModelMessage[] = [{ role: 'system', content: `${STYLE_RULES}\n${about.join('\n')}` }];
  // Last 12 turns, starting with a user turn (most chat templates expect user first after the system prompt).
  const recent = turns.slice(-12);
  const firstUser = recent.findIndex((t) => t.from === 'user');
  for (const t of firstUser === -1 ? [] : recent.slice(firstUser)) msgs.push({ role: t.from === 'user' ? 'user' : 'assistant', content: t.text });
  if (opts.opening || msgs.length === 1) {
    msgs.push({ role: 'user', content: `(${ctx.firstName} just clicked on you to chat. Greet them in your own way.)` });
  }
  return msgs;
}
