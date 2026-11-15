import { describe, expect, it } from 'vitest';
import { JournalEntry } from '@orbital/contracts';
import { LINES, initialState, journalToMarkdown, respond, screenSafety, SUPPORT_REPLY, type CompanionContext } from '../src';

const ctx: CompanionContext = {
  firstName: 'Sofia', timeOfDay: 'afternoon', restDay: false, sleepBelowUsual: false, activityBelowUsual: false,
  measurementDue: false, exerciseDoneToday: false, achievementsToday: [], alertActive: false, journalingEnabled: true, journalDoneToday: false,
};
const voice = { name: 'Mochi', interjections: ['Ooh'], happyAction: 'does a happy ear-wiggle', signoff: 'Mochi out!' };
const say = (state = initialState(), req: Parameters<typeof respond>[1], c: Partial<CompanionContext> = {}) => respond(state, req, { ...ctx, ...c }, voice, 1_000_000, 42);

describe('safety screen', () => {
  it('urgent phrases trigger the fixed human-support reply in every mode, never via a language model', () => {
    for (const t of ['I want to hurt myself', 'i dont want to be alive', 'This is an emergency', 'I have chest pain']) expect(screenSafety(t).urgent).toBe(true);
    const inJournal = say(say(undefined, { action: 'start-journal' }).state, { text: 'honestly I can’t go on like this' });
    expect(inJournal.urgent).toBe(true);
    expect(inJournal.reply).toBe(SUPPORT_REPLY);
    expect(inJournal.voice).toBe('safety');
    expect(inJournal.llmEligible).toBe(false);
    expect(say(undefined, { action: 'talk-to-someone' }).urgent).toBe(true);
  });
  it('ordinary sadness or tiredness is not escalated', () => {
    expect(screenSafety('I am tired and a bit sad today').urgent).toBe(false);
  });
});

describe('contextual, varied replies', () => {
  it('opening line follows context (the user’s own examples)', () => {
    expect(say(undefined, { action: 'open' }, { measurementDue: true }).reply).toMatch(/measurement/i);
    expect(say(undefined, { action: 'open' }, { activityBelowUsual: true }).reply).toMatch(/push-ups|stretch|wiggle/i);
    expect(say(undefined, { action: 'open' }, { sleepBelowUsual: true }).reply).toMatch(/cosy|wind/i);
    expect(say(undefined, { action: 'open' }, { exerciseDoneToday: true }).reply).toMatch(/YES|done/i);
  });
  it('unsolicited suggestions are rate-limited', () => {
    const first = say(undefined, { action: 'open' }, { measurementDue: true });
    const again = respond(first.state, { action: 'open' }, { ...ctx, measurementDue: true }, voice, 1_000_000 + 60_000, 42);
    expect(again.reply).not.toMatch(/measurement/i);
  });
  it('does not repeat the same line back-to-back', () => {
    let s = initialState();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = respond(s, { text: 'tell me a joke' }, ctx, voice, 0, 7);
      seen.push(r.reply);
      s = r.state;
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
  it('is deterministic for the same state and seed', () => {
    expect(say(undefined, { text: 'I feel stressed' })).toEqual(say(undefined, { text: 'I feel stressed' }));
  });
});

describe('journal', () => {
  it('asks relevant follow-ups, allows skip and end, and labels generated content', () => {
    let r = say(undefined, { action: 'start-journal' });
    expect(r.state.mode).toBe('journal');
    r = say(r.state, { text: 'Pretty good day, the experiment worked and it was fun' });
    expect(r.reply).toMatch(/best part/i);
    r = say(r.state, { action: 'feeling', value: 'proud' });
    r = say(r.state, { text: 'Seeing the data come in. A bit stressful before the deadline though.' });
    r = say(r.state, { action: 'skip' });
    r = say(r.state, { action: 'end' });
    const j = r.journalCompleted!;
    expect(j.feelings).toEqual(['proud']);
    expect(j.summary?.kind).toBe('model-summary');
    expect(j.possibilities.every((p) => p.kind === 'model-possibility' && p.status === 'unconfirmed')).toBe(true);
    expect(j.possibilities.some((p) => /stressful/.test(p.text))).toBe(true);
    expect(j.turns.some((t) => t.answer === null)).toBe(true); // skipped question recorded as skipped
    expect(JournalEntry.safeParse({ ...j, id: 'x', subjectId: 'CM-04', missionDay: 3, createdAt: 'a', updatedAt: 'a' }).success).toBe(true);
  });
  it('never asks more than four follow-ups', () => {
    let r = say(undefined, { action: 'start-journal' });
    let questions = 0;
    while (r.state.mode === 'journal' && questions < 10) {
      r = say(r.state, { text: 'it was okay' });
      questions++;
    }
    expect(questions).toBeLessThanOrEqual(5);
    expect(r.journalCompleted).toBeDefined();
  });
  it('respects journaling being disabled', () => {
    expect(say(undefined, { action: 'start-journal' }, { journalingEnabled: false }).state.mode).toBe('chat');
  });
  it('journal content is never LLM-eligible', () => {
    let r = say(undefined, { action: 'start-journal' });
    r = say(r.state, { text: 'had a great day' });
    expect(r.llmEligible).toBe(false);
  });
  it('markdown export keeps generated content labelled', () => {
    let r = say(undefined, { action: 'start-journal' });
    r = say(r.state, { text: 'tough day, so tired' });
    r = say(r.state, { action: 'end' });
    const md = journalToMarkdown([{ ...r.journalCompleted!, id: '1', subjectId: 'CM-04', missionDay: 9, createdAt: 'a', updatedAt: 'a' }]);
    expect(md).toMatch(/Generated possibility \(unconfirmed\)/);
  });
});

describe('memory', () => {
  it('nothing is remembered without confirmation', () => {
    const r = say(undefined, { text: 'I really love chess puzzles' });
    expect(r.memoryProposal).toEqual({ kind: 'favourite-game', text: 'chess puzzles' });
    expect(r.memoryConfirmed).toBeUndefined();
    expect(say(r.state, { action: 'confirm-memory' }).memoryConfirmed?.text).toBe('chess puzzles');
    expect(say(r.state, { action: 'dismiss-memory' }).memoryConfirmed).toBeUndefined();
  });
});

describe('tone', () => {
  it('no shaming, guilt or clinical/diagnostic wording anywhere in the phrasebank', () => {
    const all = Object.values(LINES).flat().join(' ').toLowerCase();
    for (const banned of ['you should have', 'you failed', 'lazy', 'disappoint', 'depress', 'disorder', 'diagnos', 'symptom', 'patient', 'you must']) expect(all).not.toContain(banned);
  });
  it('a low mood check-in is acknowledged neutrally, never alarmed or interpreted', () => {
    const r = say(say(undefined, { action: 'start-checkin' }).state, { action: 'mood', value: '2' });
    expect(r.mood).toBe(2);
    expect(r.urgent).toBe(false);
    expect(r.reply).not.toMatch(/worr|concern|alert/i);
  });
});
