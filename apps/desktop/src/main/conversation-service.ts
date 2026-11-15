import type { AlertItem, AstronautId, AuditEntry, ChatRequest, ChatResponse, ChatTurn, CompanionEvent, CompanionManifest, HealthRecord, JournalEntry, MemoryItem, Prefs } from '@orbital/contracts';
import { buildModelMessages, initialState, journalToMarkdown, respond, type CompanionContext, type DialogueState } from '@orbital/companion';
import { allSignals } from '@orbital/signals';
import { MISSION_START_UTC } from '@orbital/simulation';
import { deriveAlerts } from '@orbital/engine';
import { attachRiskContext } from '@orbital/data-sources';
import { hrpKnowledge } from './knowledge';
import type { DataService } from './data-service';
import type { GameService } from './game-service';
import type { Storage } from './storage';
import type { AiService } from './ai-service';

/**
 * Companion conversation, journal, memory and alerts (Phase 2 B + C4), main process.
 *  - Dialogue is deterministic (@orbital/companion). An optional language model may only rephrase
 *    eligible small talk; it never sees journal entries, memory, health values or assessments.
 *  - Urgent safety requests are recorded as safety events (→ engine P0), audited, and quiet the companion.
 *  - Journal and memory are private to the individual and editable/deletable by them.
 */
export class ConversationService {
  /**
   * Per-profile chat sessions. `modelTurns` holds ONLY ordinary conversation (model-eligible exchanges):
   * journal answers, check-ins, memory flows and safety turns are never added, so they can never reach a model.
   */
  private readonly sessions = new Map<AstronautId, { state: DialogueState; history: ChatTurn[]; modelTurns: { from: 'user' | 'companion'; text: string }[] }>();

  constructor(
    private readonly storage: Storage,
    private readonly data: DataService,
    private readonly game: GameService,
    private readonly deps: {
      prefs: () => Prefs;
      selection: () => { astronautId: AstronautId; day: number };
      manifest: () => CompanionManifest;
      emit: (e: CompanionEvent) => void;
      /** Conversational model service (local Ollama by default; null in unit tests that don't need it). */
      ai: () => AiService | null;
      /** Stream guarded model text to the companion window. */
      stream?: (turnId: string, text: string, done: boolean) => void;
      /** Open Dr G Zero (dashboard) at a section — deterministic command from the conversation. */
      openDashboard?: (section: string) => void;
      /** Phase 4: titles of today's approved recommendations (relayed verbatim; never LLM-rephrased). */
      suggestions?: (id: AstronautId, day: number) => string[];
    },
  ) {}

  private session(id: AstronautId) {
    let s = this.sessions.get(id);
    if (!s) {
      s = { state: initialState(), history: [], modelTurns: [] };
      this.sessions.set(id, s);
    }
    return s;
  }

  private context(id: AstronautId, day: number): CompanionContext {
    const progress = this.game.progress(id, day);
    const profile = this.data.profiles().find((p) => p.id === id)!;
    const below = (signal: string) => {
      const m = this.data.metric(id, signal, day);
      return !!(m?.baseline?.kind === 'baseline' && m.mean7 !== null && (m.mean7 - m.baseline.mean) / m.baseline.sd <= -1);
    };
    const hour = new Date().getHours();
    const fav = this.storage.memory(id).find((m) => m.kind === 'favourite-game');
    return {
      firstName: profile.name.split(' ')[0]!,
      timeOfDay: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night',
      restDay: day % 7 === 6,
      sleepBelowUsual: below('sleep.duration'),
      activityBelowUsual: below('activity.active-minutes'),
      measurementDue: progress.dailyMissions.some((m) => m.category === 'measurement' && !m.completed),
      exerciseDoneToday: progress.dailyMissions.some((m) => m.category === 'exercise' && m.completed),
      achievementsToday: progress.achievements.filter((a) => a.unlockedDay === day).map((a) => a.title),
      favouriteGame: fav?.text,
      alertActive: this.alerts(id, day, false).some((a) => a.tier === 'urgent'),
      journalingEnabled: this.deps.prefs().privacy.journalingEnabled,
      journalDoneToday: this.storage.journal(id).some((e) => e.missionDay === day),
      suggestions: this.deps.suggestions?.(id, day) ?? [],
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { astronautId: id, day } = this.deps.selection();
    const s = this.session(id);
    const now = Date.now();
    if (req.text) s.history.push({ from: 'user', text: req.text, at: new Date(now).toISOString() });
    // Participation fact (once per day): talking with the companion counts. Never depends on what is said.
    if (req.text) this.game.record(id, day, 'companion.chat');
    const m = this.deps.manifest();
    const voice = { name: m.displayName, ...m.personality.voice };
    const r = respond(s.state, req, this.context(id, day), voice, now, day * 131 + s.history.length);
    s.state = r.state;

    if (r.urgent) {
      // Deterministic escalation: record → engine P0 → urgent alert; audit; companion goes quiet.
      const at = new Date(now).toISOString();
      this.storage.addSafetyEvent({ id: `safety:${id}:${now}`, subjectId: id, missionDay: day, trigger: req.action === 'talk-to-someone' ? 'talk-request' : 'safety-item', at });
      this.storage.appendAudit({ subjectId: id, missionDay: day, event: 'safety-escalation', alertId: `safety:${now}`, tier: 'urgent', ruleId: 'P0-SAFETY-ESCALATION', detail: { trigger: req.action ?? 'chat-text' } });
      this.data.invalidate(id);
      this.deps.emit({ type: 'alert.active', active: true });
    }
    if (r.journalCompleted) {
      const ts = new Date(now).toISOString();
      this.storage.saveJournal({ id: `j:${id}:${now}`, subjectId: id, missionDay: day, createdAt: ts, updatedAt: ts, ...r.journalCompleted });
      this.game.record(id, day, 'journal.written');
    }
    if (r.memoryConfirmed) {
      this.storage.saveMemory({ id: `m:${id}:${now}`, subjectId: id, kind: r.memoryConfirmed.kind, text: r.memoryConfirmed.text, source: 'user-confirmed', createdAt: new Date(now).toISOString() });
    }
    if (r.mood !== undefined && this.deps.prefs().privacy.shareCheckinsWithMonitor) {
      const rec: HealthRecord = {
        id: `${id}:mood.vas:user:${day}:${now}`,
        subjectId: id,
        signalId: 'mood.vas',
        timestamp: new Date(MISSION_START_UTC + day * 86_400_000 + 12 * 3_600_000).toISOString(),
        missionDay: day,
        value: r.mood,
        unit: '{score}',
        aggregation: 'spot',
        source: { kind: 'user', adapterId: 'companion.checkin', device: 'Companion chat (shared with consent)' },
        classification: 'self-reported',
        quality: { score: 1, flags: [] },
      };
      this.data.addRecords([rec]);
    }

    let reply = r.reply;
    let voiceUsed: ChatResponse['voice'] = r.voice;
    let modelUsed: string | undefined;
    const turnId = `t:${id}:${now}`;
    if (r.action?.type === 'open-dashboard') this.deps.openDashboard?.(r.action.section);
    const ai = this.deps.ai();
    const simpleMode = !ai || ai.status().simpleMode;
    const ordinary = r.llmEligible && !r.urgent && !r.action;
    if (ordinary && req.text) s.modelTurns.push({ from: 'user', text: req.text });
    if (ordinary && ai && !simpleMode) {
      // The model answers ordinary conversation. Its input is built ONLY from persona, coarse context, approved
      // suggestion titles, confirmed memories and this profile's recent chat turns (no journal, no health data).
      const ctx = this.context(id, day);
      const messages = buildModelMessages(
        { name: m.displayName, traits: m.personality.traits },
        {
          firstName: ctx.firstName,
          timeOfDay: ctx.timeOfDay,
          restDay: ctx.restDay,
          suggestions: ctx.suggestions ?? [],
          memories: this.storage.memory(id).map((x) => x.text),
          achievementsToday: ctx.achievementsToday,
        },
        s.modelTurns,
        { opening: req.action === 'open' },
      );
      const out = await ai.generate(messages, (text, done) => this.deps.stream?.(turnId, text, done));
      if (out) {
        reply = out.text;
        voiceUsed = out.provider === 'ollama' ? 'model' : 'llm';
        modelUsed = out.model;
      }
    }
    if (ordinary) s.modelTurns = [...s.modelTurns, { from: 'companion' as const, text: reply }].slice(-24);
    s.history.push({ from: 'companion', text: reply, at: new Date().toISOString() });
    s.history = s.history.slice(-40);
    return {
      mode: r.state.mode,
      reply,
      voice: voiceUsed,
      ...(modelUsed ? { model: modelUsed } : {}),
      simpleMode,
      turnId,
      ...(r.action ? { action: r.action } : {}),
      quickReplies: r.quickReplies,
      memoryProposal: r.memoryProposal,
      urgent: r.urgent,
      history: s.history,
    };
  }

  // ── Journal ────────────────────────────────────────────────────────────────
  journal(id: AstronautId): JournalEntry[] {
    return this.storage.journal(id);
  }
  /** A journal entry written directly by the astronaut (their own words, stored verbatim; nothing generated). */
  createJournal(id: AstronautId, day: number, text: string, feelings: string[]): JournalEntry[] {
    const ts = new Date().toISOString();
    this.storage.saveJournal({ id: `j:${id}:${Date.now()}`, subjectId: id, missionDay: day, createdAt: ts, updatedAt: ts, turns: [{ question: 'Journal entry', answer: text }], feelings, events: [], summary: null, possibilities: [] });
    this.game.record(id, day, 'journal.written');
    return this.storage.journal(id);
  }

  saveJournal(e: JournalEntry): JournalEntry[] {
    const existing = this.storage.journal(e.subjectId).find((x) => x.id === e.id);
    if (!existing) throw new Error('Unknown journal entry');
    this.storage.saveJournal({ ...e, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    this.game.record(e.subjectId as AstronautId, e.missionDay, 'journal.written');
    return this.storage.journal(e.subjectId);
  }
  deleteJournal(id: AstronautId, entryId: string): JournalEntry[] {
    this.storage.deleteJournal(id, entryId);
    return this.storage.journal(id);
  }
  exportJournal(id: AstronautId, format: 'markdown' | 'json'): string {
    const entries = this.storage.journal(id);
    return format === 'json' ? JSON.stringify(entries, null, 2) : journalToMarkdown(entries);
  }

  // ── Memory ─────────────────────────────────────────────────────────────────
  memory(id: AstronautId): MemoryItem[] {
    return this.storage.memory(id);
  }
  saveMemory(item: Omit<MemoryItem, 'createdAt' | 'source'> & { createdAt?: string }): MemoryItem[] {
    this.storage.saveMemory({ ...item, source: 'user-stated', createdAt: item.createdAt ?? new Date().toISOString() });
    return this.storage.memory(item.subjectId);
  }
  deleteMemory(id: AstronautId, itemId: string): MemoryItem[] {
    this.storage.deleteMemory(id, itemId);
    return this.storage.memory(id);
  }

  // ── Alerts (C4) ────────────────────────────────────────────────────────────
  alerts(id: AstronautId, day: number, audit = true): AlertItem[] {
    const snap = this.data.snapshot(id, day);
    const progress = this.game.progress(id, day);
    const derived = deriveAlerts({
      day,
      assessment: this.data.assess(id, day),
      metrics: snap.metrics,
      signals: allSignals(),
      completeness: snap.completeness.overall,
      measurementDue: progress.dailyMissions.some((m) => m.category === 'measurement' && !m.completed),
    });
    // Explanatory NASA HRP context (Phase 3). Never changes tier, wording or reasons.
    const alerts = attachRiskContext(derived, hrpKnowledge());
    if (audit) {
      for (const a of alerts) {
        if (a.tier === 'routine' || this.storage.hasAudit(id, a.id, 'generated')) continue;
        this.storage.appendAudit({ subjectId: id, missionDay: day, event: 'generated', alertId: a.id, tier: a.tier, ruleId: a.ruleId, detail: { reasons: a.reasons, relatedRisks: a.riskContext?.map((l) => l.riskId) ?? [] } });
      }
    }
    return alerts;
  }
  acknowledge(id: AstronautId, day: number, alertId: string): void {
    const a = this.alerts(id, day, false).find((x) => x.id === alertId);
    this.storage.appendAudit({ subjectId: id, missionDay: day, event: 'acknowledged', alertId, tier: a?.tier ?? 'unknown', ruleId: a?.ruleId ?? 'unknown', detail: null });
    if (a?.tier === 'urgent') this.deps.emit({ type: 'alert.active', active: false });
  }
  recordShareDecision(id: AstronautId, day: number, alertId: string, share: boolean): void {
    const a = this.alerts(id, day, false).find((x) => x.id === alertId);
    this.storage.appendAudit({ subjectId: id, missionDay: day, event: share ? 'shared-with-crew-support' : 'not-shared', alertId, tier: a?.tier ?? 'unknown', ruleId: a?.ruleId ?? 'unknown', detail: { consent: share } });
  }
  audit(id: AstronautId): AuditEntry[] {
    return this.storage.audit(id);
  }
}
