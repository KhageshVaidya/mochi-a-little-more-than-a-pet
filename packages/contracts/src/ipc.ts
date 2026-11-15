import { z } from 'zod';
import { MissionCommand, MissionState } from './mission';
import { Prefs, PrefsPatch } from './prefs';
import { CompanionCatalogEntry, CompanionEvent, CompanionManifest } from './companion';
import { AstronautProfile } from './crew';
import { Assessment } from './assessment';
import {
  AssessRequest,
  AssessmentTimeline,
  CrewSummary,
  SeriesRequest,
  SeriesResponse,
  Snapshot,
  TelemetryDay,
} from './views';
import { AstronautId } from './crew';
import { GameHistoryEntry, GameId, GameResult, LogActivity, ProgressState } from './gamification';
import { ActivityRestrictions, IntelligenceReport, RecommendationSet } from './intelligence';
import { AiStatus, ChatRequest, ChatResponse, JournalEntry, MemoryItem, MemoryKind, SubjectRequest } from './conversation';
import { AlertItem, AuditEntry, WellbeingPatterns } from './alerts';
import { HrpKnowledgeState } from './knowledge';
import { ActivityKind, CrewBoard, CrewStatusOption } from './crew-social';

/**
 * The single source of truth for IPC.
 * - Main registers handlers ONLY for channels listed here, and validates every payload with `request`.
 * - Each preload exposes ONLY the channels allowed for its window.
 * A channel cannot exist on one side without the other.
 */

export const SystemInfo = z.object({
  appVersion: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  platform: z.string(),
  storage: z.object({
    engine: z.literal('node:sqlite'),
    sqliteVersion: z.string(),
    path: z.string(),
    schemaVersion: z.number().int(),
    ok: z.boolean(),
  }),
});
export type SystemInfo = z.infer<typeof SystemInfo>;

const Empty = z.undefined();

export const invokeChannels = {
  'system:info': { request: Empty, response: SystemInfo, windows: ['dashboard'] },
  'prefs:get': { request: Empty, response: Prefs, windows: ['dashboard', 'companion'] },
  'prefs:set': { request: PrefsPatch, response: Prefs, windows: ['dashboard', 'companion'] },
  'mission:get': { request: Empty, response: MissionState, windows: ['dashboard'] },
  'mission:command': { request: MissionCommand, response: MissionState, windows: ['dashboard'] },
  'crew:list': { request: Empty, response: z.array(AstronautProfile), windows: ['dashboard'] },
  'crew:summary': { request: z.object({ day: z.number().int().min(0).max(179) }), response: z.array(CrewSummary), windows: ['dashboard'] },
  'data:snapshot': { request: AssessRequest, response: Snapshot, windows: ['dashboard'] },
  'data:series': { request: SeriesRequest, response: SeriesResponse, windows: ['dashboard'] },
  'brain:assess': { request: AssessRequest, response: Assessment, windows: ['dashboard'] },
  'brain:timeline': { request: z.object({ astronautId: AstronautId }), response: AssessmentTimeline, windows: ['dashboard'] },
  'telemetry:day': { request: AssessRequest, response: TelemetryDay, windows: ['dashboard'] },
  'game:progress': { request: AssessRequest, response: ProgressState, windows: ['dashboard'] },
  'game:log': { request: LogActivity, response: ProgressState, windows: ['dashboard'] },
  'game:play': { request: GameResult, response: z.object({ progress: ProgressState, personalBest: z.boolean() }), windows: ['dashboard'] },
  'game:habitat:place': {
    request: z.object({ astronautId: AstronautId, day: z.number().int().min(0).max(179), roomId: z.string().max(32), slot: z.number().int().min(0).max(2), decorationId: z.string().max(40).nullable() }),
    response: ProgressState,
    windows: ['dashboard'],
  },
  'game:goals:set': {
    request: z.object({ astronautId: AstronautId, day: z.number().int().min(0).max(179), goalIds: z.array(z.string().max(40)).max(3) }),
    response: ProgressState,
    windows: ['dashboard'],
  },
  'game:goal-options': { request: Empty, response: z.array(z.object({ id: z.string(), title: z.string(), target: z.number() })), windows: ['dashboard'] },
  'companion:chat': { request: ChatRequest, response: ChatResponse, windows: ['dashboard', 'companion'] },
  // Journal & memory: private to the individual; dashboard window only (never the overlay).
  'journal:list': { request: SubjectRequest, response: z.array(JournalEntry), windows: ['dashboard'] },
  'journal:save': { request: JournalEntry, response: z.array(JournalEntry), windows: ['dashboard'] },
  'journal:delete': { request: SubjectRequest.extend({ id: z.string() }), response: z.array(JournalEntry), windows: ['dashboard'] },
  'journal:export': { request: SubjectRequest.extend({ format: z.enum(['markdown', 'json']) }), response: z.object({ saved: z.boolean(), path: z.string().optional() }), windows: ['dashboard'] },
  'memory:list': { request: SubjectRequest, response: z.array(MemoryItem), windows: ['dashboard'] },
  'memory:save': { request: SubjectRequest.extend({ id: z.string().optional(), kind: MemoryKind, text: z.string().min(1).max(200) }), response: z.array(MemoryItem), windows: ['dashboard'] },
  'memory:delete': { request: SubjectRequest.extend({ id: z.string() }), response: z.array(MemoryItem), windows: ['dashboard'] },
  // Conversational AI (local-first: Ollama default; Anthropic optional, off by default).
  'ai:status': { request: Empty, response: AiStatus, windows: ['dashboard', 'companion'] },
  'ai:check': { request: Empty, response: AiStatus, windows: ['dashboard', 'companion'] },
  /** First-run setup: download a model through Ollama — ONLY called after the user explicitly confirms. */
  'ai:pull': { request: z.object({ model: z.string().min(1).max(80) }), response: z.object({ ok: z.boolean(), error: z.string().optional() }), windows: ['dashboard'] },
  /** First-run setup: ask the active model for one short reply to prove it works. */
  'ai:verify': { request: Empty, response: z.object({ ok: z.boolean(), reply: z.string().optional(), ms: z.number().optional(), model: z.string().optional(), error: z.string().optional() }), windows: ['dashboard'] },
  /** Opens the official Ollama download page in the browser (fixed URL; nothing else can be opened). */
  'app:openOllamaDownload': { request: Empty, response: z.void(), windows: ['dashboard', 'companion'] },
  /** Write a journal entry directly (the user's own words, stored verbatim). */
  'journal:create': { request: SubjectRequest.extend({ day: z.number().int().min(0).max(179), text: z.string().min(1).max(4000), feelings: z.array(z.string().max(30)).max(8).default([]) }), response: z.array(JournalEntry), windows: ['dashboard'] },
  /** Show the companion and open its conversation (from dashboard mission links). */
  'companion:openChat': { request: Empty, response: z.void(), windows: ['dashboard'] },
  /** Open Dr G Zero (the dashboard) at a section, from the companion. */
  'app:openDashboard': { request: z.object({ section: z.string().max(40).optional() }), response: z.void(), windows: ['companion'] },
  'alerts:list': { request: AssessRequest, response: z.array(AlertItem), windows: ['dashboard'] },
  'alerts:ack': { request: AssessRequest.extend({ alertId: z.string() }), response: z.void(), windows: ['dashboard'] },
  'alerts:share': { request: AssessRequest.extend({ alertId: z.string(), share: z.boolean() }), response: z.void(), windows: ['dashboard'] },
  'alerts:audit': { request: SubjectRequest, response: z.array(AuditEntry), windows: ['dashboard'] },
  'brain:patterns': { request: AssessRequest, response: WellbeingPatterns, windows: ['dashboard'] },
  /** NASA HRP knowledge registry (offline, bundled, validated in main). */
  'knowledge:hrp': { request: Empty, response: HrpKnowledgeState, windows: ['dashboard'] },
  /** Opens an original NASA source in the OS browser. Main only opens URLs that are listed in the registry. */
  'knowledge:open-source': { request: z.object({ sourceId: z.string().max(80) }), response: z.object({ opened: z.boolean() }), windows: ['dashboard'] },
  // Phase 4 — hybrid intelligence & adaptive gamification
  'intelligence:report': { request: AssessRequest, response: IntelligenceReport, windows: ['dashboard'] },
  'recommendations:list': { request: AssessRequest, response: RecommendationSet, windows: ['dashboard'] },
  'restrictions:get': { request: SubjectRequest, response: ActivityRestrictions, windows: ['dashboard'] },
  'restrictions:set': { request: SubjectRequest.extend({ restrictions: ActivityRestrictions }), response: ActivityRestrictions, windows: ['dashboard'] },
  'game:history': { request: SubjectRequest.extend({ game: GameId }), response: z.array(GameHistoryEntry), windows: ['dashboard'] },
  'companion:equip': { request: AssessRequest.extend({ slot: z.enum(['accessory', 'toy', 'environment']), itemId: z.string().max(40).nullable() }), response: ProgressState, windows: ['dashboard'] },
  'companion:play': { request: AssessRequest.extend({ toyId: z.string().max(40) }), response: ProgressState, windows: ['dashboard'] },
  'crew:board': { request: AssessRequest, response: CrewBoard, windows: ['dashboard'] },
  'crew:status:set': {
    request: AssessRequest.extend({ status: CrewStatusOption.nullable(), audience: z.enum(['crew', 'crew-support', 'person']).default('crew'), audiencePersonId: AstronautId.optional() }),
    response: CrewBoard,
    windows: ['dashboard'],
  },
  'crew:activity:propose': { request: AssessRequest.extend({ kind: ActivityKind, invitees: z.array(AstronautId).min(1).max(4) }), response: CrewBoard, windows: ['dashboard'] },
  'crew:activity:respond': { request: AssessRequest.extend({ activityId: z.string(), accept: z.boolean() }), response: CrewBoard, windows: ['dashboard'] },
  'companion:catalog': { request: Empty, response: z.array(CompanionCatalogEntry), windows: ['dashboard'] },
  'companion:manifest': { request: Empty, response: CompanionManifest, windows: ['dashboard', 'companion'] },
  /** Dashboard → companion engagement events (gamification, previews). Validated positive-only events. */
  'companion:emit': { request: CompanionEvent, response: z.void(), windows: ['dashboard'] },
  'companion:setVisible': { request: z.boolean(), response: z.boolean(), windows: ['dashboard', 'companion'] },
  'companion:move': {
    request: z.object({ dx: z.number().int().min(-2000).max(2000), dy: z.number().int().min(-2000).max(2000) }),
    response: z.void(),
    windows: ['companion'],
  },
  'companion:dragEnd': { request: Empty, response: z.void(), windows: ['companion'] },
  'companion:setInteractive': { request: z.boolean(), response: z.void(), windows: ['companion'] },
  'app:focusDashboard': { request: Empty, response: z.void(), windows: ['companion'] },
} as const;

export type InvokeChannel = keyof typeof invokeChannels;
export type WindowRole = 'dashboard' | 'companion';
export type InvokeRequest<C extends InvokeChannel> = z.input<(typeof invokeChannels)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.output<(typeof invokeChannels)[C]['response']>;

/** Main → renderer pushes. */
export const eventChannels = {
  'mission:state': { payload: MissionState, windows: ['dashboard', 'companion'] },
  'prefs:changed': { payload: Prefs, windows: ['dashboard', 'companion'] },
  'companion:event': { payload: CompanionEvent, windows: ['companion'] },
  /** Streaming companion reply: the guarded text so far for a turn (replace, not append). */
  'chat:stream': { payload: z.object({ turnId: z.string(), text: z.string(), done: z.boolean() }), windows: ['companion'] },
  /** Ask the companion window to open its chat panel. */
  'companion:open-chat': { payload: Empty, windows: ['companion'] },
  'ai:status': { payload: AiStatus, windows: ['dashboard', 'companion'] },
  'ai:pull-progress': { payload: z.object({ model: z.string(), status: z.string(), completed: z.number().optional(), total: z.number().optional() }), windows: ['dashboard'] },
  /** Ask the dashboard to navigate to a section (e.g. from "Mochi, show me my health"). */
  'dashboard:navigate': { payload: z.object({ section: z.string() }), windows: ['dashboard'] },
} as const;

export type EventChannel = keyof typeof eventChannels;
export type EventPayload<C extends EventChannel> = z.output<(typeof eventChannels)[C]['payload']>;

export function channelsFor(role: WindowRole): { invoke: InvokeChannel[]; events: EventChannel[] } {
  const invoke = (Object.keys(invokeChannels) as InvokeChannel[]).filter((c) =>
    (invokeChannels[c].windows as readonly string[]).includes(role),
  );
  const events = (Object.keys(eventChannels) as EventChannel[]).filter((c) =>
    (eventChannels[c].windows as readonly string[]).includes(role),
  );
  return { invoke, events };
}

/** Typed API surface exposed on `window.orbital` (dashboard) and `window.orbitalPet` (companion). */
export interface RendererBridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeRequest<C> extends undefined ? [] : [InvokeRequest<C>]): Promise<InvokeResponse<C>>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void;
  /** Platform string, for platform-specific chrome (e.g. macOS traffic-light inset). */
  readonly platform: string;
}
