import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, type CompanionEvent, type Prefs } from '@orbital/contracts';

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '' }, net: {}, protocol: {} }));
const { Storage } = await import('./storage');
const { DataService } = await import('./data-service');
const { GameService } = await import('./game-service');
const { ConversationService } = await import('./conversation-service');
const { loadCompanionManifest } = await import('./companion-assets');
import type { AiService } from './ai-service';
import type { AiStatus } from '@orbital/contracts';
import type { ModelMessage } from '@orbital/companion';

const dir = mkdtempSync(join(tmpdir(), 'orbital-convo-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const storage = new Storage(join(dir, 'c.sqlite'));
const data = new DataService(storage);
data.init();
const events: CompanionEvent[] = [];
const game = new GameService(storage, data, (e) => events.push(e));
const manifest = loadCompanionManifest('mochi', resolve(__dirname, '../../../../assets'));
let prefs: Prefs = structuredClone(DEFAULT_PREFS);
let selection = { astronautId: 'CM-04' as const, day: 130 };
const calls: ModelMessage[][] = [];
const streamed: string[] = [];
const opened: string[] = [];
let aiMode: 'off' | 'ok' | 'fail' = 'off';
const status = (): AiStatus => ({ provider: 'ollama', state: aiMode === 'off' ? 'unreachable' : 'ready', activeModel: aiMode === 'off' ? null : 'fake-model', preferredModel: 'fake-model', fallbackModel: 'fake-fallback', installedModels: [], ollamaVersion: null, lastTurn: null, simpleMode: aiMode === 'off' });
/** Fake conversational model: records exactly what it receives and streams a reply. */
const fakeAi = {
  status,
  generate: async (messages: ModelMessage[], onText: (t: string, done: boolean) => void) => {
    calls.push(messages);
    if (aiMode !== 'ok') return null;
    onText('Oof.', false);
    onText('Oof. Long day?', true);
    return { text: 'Oof. Long day?', model: 'fake-model', provider: 'ollama' as const, firstTokenMs: 10, totalMs: 20, rawChars: 14, reasoningChars: 0 };
  },
} as unknown as AiService;
const convo = new ConversationService(storage, data, game, {
  prefs: () => prefs,
  selection: () => selection,
  manifest: () => manifest,
  emit: (e) => events.push(e),
  ai: () => fakeAi,
  stream: (_id, text) => streamed.push(text),
  openDashboard: (section) => opened.push(section),
});

describe('ConversationService', () => {
  it('works fully offline in visible simple mode when no model is available (never claims to be AI)', async () => {
    const r = await convo.chat({ action: 'open' });
    expect(r.voice).toBe('template');
    expect(r.simpleMode).toBe(true);
    expect(r.reply.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it('the model answers ordinary conversation (streamed) and failures fall back to labelled templates', async () => {
    aiMode = 'ok';
    const ok = await convo.chat({ text: 'I had a terrible day.' });
    expect(ok).toMatchObject({ voice: 'model', model: 'fake-model', simpleMode: false, reply: 'Oof. Long day?' });
    expect(streamed).toContain('Oof.');
    const last = calls.at(-1)!;
    expect(last[0]!.role).toBe('system');
    expect(last.at(-1)).toEqual({ role: 'user', content: 'I had a terrible day.' });
    aiMode = 'fail';
    const fallback = await convo.chat({ text: 'how are you?' });
    expect(fallback.voice).toBe('template');
    expect(fallback.model).toBeUndefined();
    aiMode = 'ok';
  });

  it('"Open Dr G Zero" and "show me my health" are deterministic commands, never sent to the model', async () => {
    const before = calls.length;
    expect((await convo.chat({ text: 'Mochi, open Dr G Zero' })).action).toEqual({ type: 'open-dashboard', section: 'overview' });
    expect((await convo.chat({ text: 'show me my health' })).action).toEqual({ type: 'open-dashboard', section: 'physical' });
    expect(opened).toEqual(['overview', 'physical']);
    expect(calls.length).toBe(before);
  });

  it('never sends journal content to the language model', async () => {
    const before = calls.length;
    await convo.chat({ action: 'start-journal' });
    await convo.chat({ text: 'Private: argued with mission control today, felt awful' });
    await convo.chat({ action: 'end' });
    expect(calls.length).toBe(before); // no model calls during the journal
    // …and later ordinary conversation never carries journal answers into the model's context.
    await convo.chat({ text: 'anyway, how are you?' });
    expect(calls.length).toBe(before + 1);
    for (const c of calls) expect(JSON.stringify(c)).not.toMatch(/argued with mission control/);
    const j = convo.journal('CM-04');
    expect(j).toHaveLength(1);
    expect(j[0]!.summary?.kind).toBe('model-summary');
  });

  it('journal entries can be edited, deleted and exported', () => {
    const [e] = convo.journal('CM-04');
    const edited = convo.saveJournal({ ...e!, feelings: ['tired'] });
    expect(edited[0]!.feelings).toEqual(['tired']);
    expect(convo.exportJournal('CM-04', 'markdown')).toMatch(/Mission day 130/);
    expect(convo.deleteJournal('CM-04', e!.id)).toHaveLength(0);
  });

  it('memory needs confirmation and can be deleted', async () => {
    await convo.chat({ text: 'my favourite game is constellation memory' });
    expect(convo.memory('CM-04')).toHaveLength(0);
    await convo.chat({ action: 'confirm-memory' });
    const mem = convo.memory('CM-04');
    expect(mem[0]).toMatchObject({ kind: 'favourite-game', source: 'user-confirmed' });
    expect(convo.deleteMemory('CM-04', mem[0]!.id)).toHaveLength(0);
  });

  it('shared mood check-ins require consent', async () => {
    const count = () => data.records('CM-04').filter((r) => r.source.kind === 'user' && r.signalId === 'mood.vas').length;
    await convo.chat({ action: 'start-checkin' });
    await convo.chat({ action: 'mood', value: '6' });
    expect(count()).toBe(0);
    prefs = { ...prefs, privacy: { ...prefs.privacy, shareCheckinsWithMonitor: true } };
    await convo.chat({ action: 'start-checkin' });
    await convo.chat({ action: 'mood', value: '6' });
    expect(count()).toBe(1);
  });

  it('urgent requests: fixed reply (no LLM), safety event → engine P0 → urgent alert, audited, companion quiet', async () => {
    selection = { astronautId: 'CM-01', day: 90 };
    const before = calls.length;
    const r = await convo.chat({ text: 'I don’t want to be alive anymore' });
    expect(r.urgent).toBe(true);
    expect(r.voice).toBe('safety');
    expect(calls.length).toBe(before);
    expect(data.assess('CM-01', 90).escalation?.pathway).toBe('human-support');
    const alerts = convo.alerts('CM-01', 90);
    expect(alerts[0]!.tier).toBe('urgent');
    expect(alerts[0]!.detail).not.toMatch(/!|haha|yay/i);
    expect(events.some((e) => e.type === 'alert.active' && e.active)).toBe(true);
    expect(convo.audit('CM-01').some((a) => a.event === 'safety-escalation')).toBe(true);
  });

  it('a Brain Health YES produces a human-review alert, and share decisions are audited', () => {
    const alerts = convo.alerts('CM-04', 150);
    const review = alerts.find((a) => a.tier === 'human-review')!;
    expect(review).toBeDefined();
    convo.recordShareDecision('CM-04', 150, review.id, false);
    expect(convo.audit('CM-04').some((a) => a.event === 'not-shared')).toBe(true);
  });

  it('SCND decisions remain deterministic and are never changed by the conversation layer', () => {
    const a = data.assess('CM-02', 110);
    expect(data.assess('CM-02', 110)).toEqual(a);
    expect(a.state).toBe('YES');
  });

  it('Phase 3: alerts explain related NASA HRP risks with sources; urgent alerts never do; decisions unchanged', () => {
    const before = data.assess('CM-04', 150);
    const review = convo.alerts('CM-04', 150).find((a) => a.tier === 'human-review')!;
    expect(review.signalIds?.length).toBeGreaterThan(0);
    expect(review.riskContext?.length).toBeGreaterThan(0);
    for (const l of review.riskContext!) {
      expect(l.source?.url).toMatch(/^https:\/\/www\.nasa\.gov\//);
      expect(['nasa-stated', 'nasa-related', 'orbital-hypothesis']).toContain(l.evidence);
    }
    // Alert wording stays the fixed, non-diagnostic copy.
    expect(review.title).toBe('A private conversation is recommended');
    expect(data.assess('CM-04', 150)).toEqual(before);
    const urgent = convo.alerts('CM-01', 90).filter((a) => a.tier === 'urgent');
    expect(urgent.length).toBeGreaterThan(0);
    expect(urgent.every((a) => a.riskContext === undefined)).toBe(true);
    // Related risks are recorded in the audit trail for provenance.
    const gen = convo.audit('CM-04').find((a) => a.alertId === review.id && a.event === 'generated')!;
    expect((gen.detail as { relatedRisks: string[] }).relatedRisks).toEqual(review.riskContext!.map((l) => l.riskId));
  });
});
