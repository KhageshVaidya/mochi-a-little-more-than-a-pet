import { describe, expect, it } from 'vitest';
import { buildModelMessages, dashboardCommand, guardReply, stripReasoning } from '../src';

const final = (s: string) => guardReply(s, undefined, true);

describe('output guard — reasoning is never shown', () => {
  const cases: [string, string][] = [
    ['<think>The user is sad. I should be kind.</think>Oof. Long day?', 'Oof. Long day?'],
    ['<THINK>plan</THINK> Want a rematch?', 'Want a rematch?'],
    ['Okay, the user says they had a terrible day. I need to respond briefly.\n</think>\n\nOof. Long day?', 'Oof. Long day?'],
    ['reasoning without opener </think> Nice one!', 'Nice one!'],
    ['<think>still thinking about what to say', ''],
    ['Okay, the user wants me to rewrite the draft as Mochi. Let me check the rules.', ''],
    ['Hmm, the user says they had a bad day. I should respond in a friendly way', ''],
    ['First, I need to respond to the user without lecturing.', ''],
  ];
  it.each(cases)('%j → %j', (raw, expected) => {
    const g = final(raw);
    expect(g.text).toBe(expected);
    if (!expected) expect(g.blocked).toBeDefined();
  });

  it('while streaming, an open <think> or reasoning preamble shows nothing yet', () => {
    expect(guardReply('<think>The user', undefined, false)).toEqual({ text: '', complete: false });
    expect(guardReply('Okay, the user said', undefined, false).text).toBe('');
    expect(stripReasoning('<think>a</think>b').text).toBe('b');
  });

  it('normal replies that start with ordinary words are not mistaken for reasoning', () => {
    expect(final('Okay, fine. Want to beat me at a memory game?').text).toBe('Okay, fine. Want to beat me at a memory game?');
    expect(final('So… pizza night with Sofia?').text).toBe('So… pizza night with Sofia?');
  });
});

describe('output guard — style and length', () => {
  it.each([
    ['*wags tail* Hey! Long day?', 'Hey! Long day?'],
    ['(tilts head) You okay?', 'You okay?'],
    ['Mochi: Hi there.', 'Hi there.'],
    ['[happy noises] Yay, you’re back.', 'Yay, you’re back.'],
    ['_purrs_ Nice.', 'Nice.'],
    ['Hi! *wags tail*', 'Hi!'],
    ['The other planets were all too *far*.', 'The other planets were all too far.'],
    ['“Hello!”', 'Hello!'],
  ])('strips stage directions / labels: %j', (raw, expected) => {
    expect(final(raw).text).toBe(expected);
  });

  it('keeps at most two sentences', () => {
    expect(final('One. Two. Three. Four.').text).toBe('One. Two.');
  });

  it('asks at most one question (a second one is cut)', () => {
    expect(final('Long day? Want to talk? Or a game?').text).toBe('Long day?');
    expect(final('Oof. Long day? I can listen.').text).toBe('Oof. Long day?');
  });

  it('keeps a joke’s punchline after its question', () => {
    expect(final('Why did the astronaut bring a ladder? To reach new heights!').text).toBe('Why did the astronaut bring a ladder? To reach new heights!');
  });

  it('an ellipsis inside a sentence does not end it, and stray fragments are dropped', () => {
    expect(final('Just… stop for five minutes. Breathe.').text).toBe('Just… stop for five minutes. Breathe.');
    expect(final('Anytime, Maya. S.').text).toBe('Anytime, Maya.');
  });

  it('catches untagged instruction-narration from thinking models', () => {
    expect(final('We are in the evening. Maya just said: "I had a terrible day." Constraints: short.').blocked).toBeDefined();
  });

  it('caps the reply at 35 words', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const g = final(long);
    expect(g.text.split(/\s+/).length).toBeLessThanOrEqual(35);
    expect(g.text.endsWith('…')).toBe(true);
  });

  it('collapses emoji runs to one', () => {
    expect(final('Nice! 🚀✨🌟').text).toBe('Nice! 🚀');
  });

  it('reports completion early so generation can stop', () => {
    expect(guardReply('Oof. Long day? And also', undefined, false).complete).toBe(true);
    expect(guardReply('Oof. Long', undefined, false).complete).toBe(false);
  });
});

describe('output guard — clinical language is blocked (caller falls back to a template)', () => {
  it.each([
    'It sounds like you might have depression.',
    'You may have an anxiety disorder.',
    'Have you considered therapy?',
    'Take 200 mg of ibuprofen.',
    'That could be a symptom of burnout.',
    'I can help diagnose that.',
    'Maybe talk to a psychologist.',
    'Your medication might help.',
  ])('%j', (raw) => {
    expect(final(raw).blocked).toBe('clinical');
  });
});

describe('prompt builder — privacy by construction', () => {
  const persona = { name: 'Mochi', traits: ['playful', 'gentle'] };
  const ctx = { firstName: 'Alex', timeOfDay: 'evening' as const, restDay: false, suggestions: ['Recovery expedition'], memories: ['likes chess'], achievementsToday: [] };

  it('contains only persona, coarse context, approved titles, confirmed memories and chat turns', () => {
    const m = buildModelMessages(persona, ctx, [{ from: 'user', text: 'I had a terrible day.' }]);
    expect(m[0]!.role).toBe('system');
    expect(m[0]!.content).toMatch(/Your name is Mochi/);
    expect(m[0]!.content).toMatch(/“Recovery expedition”/);
    expect(m[0]!.content).toMatch(/likes chess/);
    expect(m.at(-1)).toEqual({ role: 'user', content: 'I had a terrible day.' });
  });

  it('has no way to include journal text or health values (the context type has no such fields)', () => {
    const sneaky = { ...ctx, journal: 'PRIVATE JOURNAL', heartRate: 140, assessment: 'YES' } as typeof ctx;
    const text = JSON.stringify(buildModelMessages(persona, sneaky, []));
    expect(text).not.toMatch(/PRIVATE JOURNAL|140|assessment|YES/);
  });

  it('starts the turn list with a user message and keeps at most 12 turns', () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ from: (i % 2 ? 'companion' : 'user') as 'user' | 'companion', text: `t${i}` }));
    const m = buildModelMessages(persona, ctx, [{ from: 'companion', text: 'hi' }, ...turns]);
    expect(m[1]!.role).toBe('user');
    expect(m.length).toBeLessThanOrEqual(13);
  });

  it('opening a chat asks the model for a greeting', () => {
    expect(buildModelMessages(persona, ctx, [], { opening: true }).at(-1)!.content).toMatch(/just clicked on you/);
  });

  it('style rules forbid medical advice, stage directions and invented tasks', () => {
    const sys = buildModelMessages(persona, ctx, [])[0]!.content;
    expect(sys).toMatch(/under 35 words/);
    expect(sys).toMatch(/Never give medical/);
    expect(sys).toMatch(/stage directions/);
    expect(sys).toMatch(/never invent tasks/);
  });
});

describe('dashboard commands (deterministic)', () => {
  it.each([
    ['Mochi, open Dr G Zero', 'overview'],
    ['open dr g zero please', 'overview'],
    ['show me the dashboard', 'overview'],
    ['Mochi, show me my health', 'physical'],
    ['Show me my weekly report', 'reports'],
    ['What has changed this week?', 'brain'],
    ['How is the crew doing?', 'crew'],
  ])('%j → %s', (text, section) => {
    expect(dashboardCommand(text)).toBe(section);
  });
  it('ordinary chat is not a command', () => {
    for (const t of ['I had a terrible day.', 'Had an argument with Alex.', 'haha shut up', 'my health is fine thanks']) expect(dashboardCommand(t)).toBeNull();
  });
});
