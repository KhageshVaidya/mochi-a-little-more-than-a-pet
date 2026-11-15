/**
 * Phrasebank: varied, slot-filled companion lines. Selection is deterministic for a given (seed, history),
 * and avoids repeating any of the last few lines in a category. Personality flavour comes from the
 * companion manifest's `voice` (interjections, happy action, sign-off).
 *
 * Tone rules (tested): supportive, playful where appropriate, never shaming, never clinical, never diagnostic.
 */

export type Category =
  | 'adaptiveSuggestion'
  | 'suggestionList'
  | 'noSuggestions'
  | 'greeting'
  | 'howAreYouCompanion'
  | 'thanks'
  | 'positive'
  | 'tired'
  | 'stressed'
  | 'lonely'
  | 'bored'
  | 'unknown'
  | 'measurementDue'
  | 'lowActivity'
  | 'poorSleep'
  | 'exerciseDone'
  | 'achievement'
  | 'restDay'
  | 'journalInvite'
  | 'journalAck'
  | 'journalEnd'
  | 'skipAck'
  | 'checkinPrompt'
  | 'checkinThanks'
  | 'checkinLow'
  | 'joke'
  | 'memoryAsk'
  | 'memorySaved'
  | 'memoryDismissed'
  | 'suggestionAccepted'
  | 'suggestionDeclined'
  | 'goodbye';

export const LINES: Record<Category, string[]> = {
  // Phase 4: the companion relays APPROVED recommendations verbatim by title — it never invents one.
  adaptiveSuggestion: ['I have an idea for today, if you fancy it: “{suggestion}”. Totally optional!', 'Psst — “{suggestion}” is on today’s optional list. No pressure at all.', 'How about “{suggestion}” today? Only if it sounds nice.'],
  suggestionList: ['Here are today’s optional ideas: {suggestion}. Pick any, or none — both are fine.', 'A few optional ideas for today: {suggestion}. Your call, {name}.'],
  noSuggestions: ['Nothing special on the list today — your usual missions are all there. Want a game or a chat?', 'No extra ideas today. Shall we just hang out?'],
  greeting: ['Hi {name}! I was hoping you’d stop by.', 'Hello, {name}! What’s orbiting your mind today?', '{name}! Perfect timing — I was just practising my space float.', 'Hey you. Good {timeOfDay}!'],
  howAreYouCompanion: [
    'I’m great! I counted three sunrises this morning. Well, I tried. How about you?',
    'Floaty and cheerful, thanks! How are you doing?',
    'I’m good — I {happyAction} every time you say hi. How’s your {timeOfDay} going?',
  ],
  thanks: ['Any time, {name}.', 'Always happy to help.', 'Aww. That’s what crewmates are for.'],
  positive: ['That’s lovely to hear! What made it good?', 'Yay! I {happyAction}.', 'Ooh, I like that. Tell me more if you feel like it.'],
  tired: [
    'Sounds like a lot today. I think we both deserve a cosy evening.',
    'Tired days happen, even in orbit. Rest counts as a win, you know.',
    'Thanks for telling me. Want to take things gently for the rest of the {timeOfDay}?',
  ],
  stressed: [
    'That sounds like a heavy load. Would it help to tell me about it, or would you rather do something calm together?',
    'Thanks for sharing that with me. Want to try five slow breaths with me? No pressure at all.',
    'Stressful moments are tough. I’m here — talk, game, or quiet company, your pick.',
  ],
  lonely: [
    'Space is big, and missing people is very human. Would you like to share something with the crew, or just chat with me for a bit?',
    'I’m glad you told me. I’m right here — and the crew board might have someone up for company.',
  ],
  bored: ['Boredom detected! Want to try {game}? I promise not to peek.', 'Ooh, a quick game of {game}? Or shall we look out of the window?', 'How about a little challenge — {game}?'],
  unknown: ['Hmm, tell me more?', 'I’m listening.', 'Interesting! What else?', 'I don’t quite follow, but I’d love to hear more.'],
  measurementDue: [
    'Psst! We forgot something today. Could you help me with my little measurement checklist?',
    'Tiny reminder from your friendly checklist keeper: today is measurement day. Whenever suits you!',
  ],
  lowActivity: [
    'Come on, five little push-ups together? I promise I won’t count incorrectly!',
    'Fancy a quick stretch with me? Even a lap of the module counts.',
    'Wiggle break? I’ll go first.',
  ],
  poorSleep: ['I think we both deserve a cosy evening today.', 'How about winding down a little earlier tonight? I’ll bring the imaginary blanket.'],
  exerciseDone: ['YES! Look at us go! Another mission accomplished!', 'Workout done! I {happyAction}.', 'That session = done. You’re doing great, {name}.'],
  achievement: ['Hey, you unlocked “{achievement}” today! Proud of you.', 'Look at that — “{achievement}”! I {happyAction}.'],
  restDay: ['Rest day today! Enjoy it — it’s part of the plan.', 'It’s a rest day. Even rockets cool down between launches.'],
  journalInvite: ['Hey! How was your day?', 'Evening check-in time — how was today, {name}?', 'Want to tell me about your day? Totally optional.'],
  journalAck: ['Thanks for sharing that.', 'I hear you.', 'Got it — thank you.'],
  journalEnd: ['Thanks for telling me about your day. I’ve saved it to your private journal — only you can see it.', 'All saved in your private journal. Thanks for chatting, {name}.'],
  skipAck: ['No problem, we can skip that.', 'Sure — skipping that one.'],
  checkinPrompt: ['Quick one: how’s your mood today, from 0 to 10?', 'On a scale from 0 to 10, how are you feeling right now?'],
  checkinThanks: ['Thanks for checking in!', 'Noted — thank you.', 'Thanks! That helps keep your baseline accurate.'],
  checkinLow: ['Thanks for being honest with me. Want to talk about it, or shall we do something gentle together?'],
  joke: [
    'Why did the astronaut break up with the moon? It needed space.',
    'How do you throw a party in space? You planet.',
    'What’s an astronaut’s favourite key on the keyboard? The space bar!',
  ],
  memoryAsk: ['Shall I remember that you like {memory}?', 'Ooh — want me to remember “{memory}”? You can always change it later.'],
  memorySaved: ['Remembered! You can see or delete it in ORBITAL any time.', 'Saved to my memory — you’re in charge of it.'],
  memoryDismissed: ['Okay, I won’t remember that.', 'No problem — forgotten.'],
  suggestionAccepted: ['Lovely. I’ll be right here cheering.', 'Great choice!'],
  suggestionDeclined: ['No worries at all.', 'Totally fine — another time, maybe.'],
  goodbye: ['{signoff}', 'Talk soon, {name}. {signoff}'],
};

export interface Voice {
  name: string;
  interjections: string[];
  happyAction: string;
  signoff: string;
}

export interface Slots {
  name: string;
  timeOfDay: string;
  game: string;
  achievement?: string;
  memory?: string;
  suggestion?: string;
}

/** Deterministic pick avoiding the last `avoid` used indices for the category. */
export function pick(cat: Category, used: Record<string, number[]>, seed: number, avoid = 3): { index: number; used: Record<string, number[]> } {
  const n = LINES[cat].length;
  const recent = used[cat] ?? [];
  const candidates = Array.from({ length: n }, (_, i) => i).filter((i) => !recent.slice(-Math.min(avoid, n - 1)).includes(i));
  const index = candidates[Math.abs(seed) % candidates.length]!;
  return { index, used: { ...used, [cat]: [...recent, index].slice(-5) } };
}

export function render(cat: Category, index: number, s: Slots, v: Voice): string {
  return LINES[cat][index]!
    .replaceAll('{name}', s.name)
    .replaceAll('{timeOfDay}', s.timeOfDay)
    .replaceAll('{game}', s.game)
    .replaceAll('{achievement}', s.achievement ?? '')
    .replaceAll('{memory}', s.memory ?? '')
    .replaceAll('{suggestion}', s.suggestion ?? '')
    .replaceAll('{happyAction}', v.happyAction)
    .replaceAll('{signoff}', v.signoff);
}
