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
import type { CompanionLanguageModel, RephraseRequest } from './llm';

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
const calls: RephraseRequest[] = [];
let llmBehaviour: 'ok' | 'throw' = 'ok';
const fakeLlm: CompanionLanguageModel = {
  id: 'fake',
  status: () => ({ enabled: true, state: 'ready', smallModel: 'x', deepModel: 'y' }),
  check: async () => ({ enabled: true, state: 'ready', smallModel: 'x', deepModel: 'y' }),
  rephrase: async (req) => {
    calls.push(req);
    if (llmBehaviour === 'throw') throw new Error('offline');
    return 'Rephrased by the small model.';
  },
};
const convo = new ConversationService(storage, data, game, {
  prefs: () => prefs,
  selection: () => selection,
  manifest: () => manifest,
  emit: (e) => events.push(e),
  llm: () => fakeLlm,
});

describe('ConversationService', () => {
  it('works fully offline with templates when the language model is disabled', async () => {
    const r = await convo.chat({ action: 'open' });
    expect(r.voice).toBe('template');
    expect(r.reply.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it('uses the small model only for eligible small talk, and falls back to templates on failure', async () => {
    prefs = { ...prefs, privacy: { ...prefs.privacy, llmEnabled: true } };
    const ok = await convo.chat({ text: 'how are you?' });
    expect(ok.voice).toBe('llm');
    llmBehaviour = 'throw';
    const fallback = await convo.chat({ text: 'how are you?' });
    expect(fallback.voice).toBe('template');
    llmBehaviour = 'ok';
  });

  it('never sends journal content to the language model', async () => {
    const before = calls.length;
    await convo.chat({ action: 'start-journal' });
    await convo.chat({ text: 'Private: argued with mission control today, felt awful' });
    await convo.chat({ action: 'end' });
    expect(calls.length).toBe(before); // no LLM calls during the journal
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
