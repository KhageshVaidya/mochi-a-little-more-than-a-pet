import { useEffect, useState } from 'react';
import type {
  Assessment,
  AssessmentTimeline,
  AstronautId,
  CrewSummary,
  SeriesResponse,
  Snapshot,
  TelemetryDay,
} from '@orbital/contracts';
import { useApp } from '../stores/app';

/**
 * Data hooks. All values come from the main-process DataService via typed IPC.
 * - Responses for a superseded key are ignored (no out-of-order updates during playback).
 * - The previous value stays on screen until the next arrives (no flicker).
 */
function useKeyed<T>(key: string | null, load: () => Promise<T>): T | null {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    load().then(
      (value) => alive && setState({ key, value }),
      (err) => console.warn('[orbital] data request failed', key, err),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.value ?? null;
}

export function useSelection(): { astronautId: AstronautId; day: number } | null {
  const id = useApp((s) => s.mission?.astronautId);
  const day = useApp((s) => s.mission?.day);
  return id !== undefined && day !== undefined ? { astronautId: id, day } : null;
}

export function useSnapshot(override?: { astronautId: AstronautId; day: number }): Snapshot | null {
  const sel = useSelection();
  const s = override ?? sel;
  return useKeyed(s ? `snap:${s.astronautId}:${s.day}` : null, () => window.orbital.invoke('data:snapshot', s!));
}

const seriesCache = new Map<string, Promise<SeriesResponse>>();
/** Full-mission series for the selected (or given) crew member. Charts slice to the current day. */
export function useSeries(signalIds: readonly string[], astronautId?: AstronautId): SeriesResponse | null {
  const sel = useApp((s) => s.mission?.astronautId);
  const id = astronautId ?? sel;
  const key = id ? `series:${id}:${signalIds.join(',')}` : null;
  return useKeyed(key, () => {
    let p = seriesCache.get(key!);
    if (!p) {
      p = window.orbital.invoke('data:series', { astronautId: id!, signalIds: [...signalIds], fromDay: 0, toDay: 179 });
      seriesCache.set(key!, p);
    }
    return p;
  });
}

export function useAssessment(): Assessment | null {
  const s = useSelection();
  return useKeyed(s ? `assess:${s.astronautId}:${s.day}` : null, () => window.orbital.invoke('brain:assess', s!));
}

export function useTimeline(): AssessmentTimeline | null {
  const id = useApp((s) => s.mission?.astronautId);
  return useKeyed(id ? `timeline:${id}` : null, () => window.orbital.invoke('brain:timeline', { astronautId: id! }));
}

export function useTelemetry(): TelemetryDay | null {
  const s = useSelection();
  return useKeyed(s ? `tele:${s.astronautId}:${s.day}` : null, () => window.orbital.invoke('telemetry:day', s!));
}

export function useCrewSummary(): CrewSummary[] | null {
  const day = useApp((s) => s.mission?.day);
  return useKeyed(day !== undefined ? `crew:${day}` : null, () => window.orbital.invoke('crew:summary', { day: day! }));
}

export function usePatterns(): import('@orbital/contracts').WellbeingPatterns | null {
  const s = useSelection();
  return useKeyed(s ? `patterns:${s.astronautId}:${s.day}` : null, () => window.orbital.invoke('brain:patterns', s!));
}

/** Tiered, deterministic alerts from the main process. `version` lets callers refetch after actions. */
export function useAlerts(version = 0): import('@orbital/contracts').AlertItem[] | null {
  const s = useSelection();
  return useKeyed(s ? `alerts:${s.astronautId}:${s.day}:${version}` : null, () => window.orbital.invoke('alerts:list', s!));
}

/** NASA HRP knowledge registry (offline, bundled; validated in main). Static for the app's lifetime. */
export function useHrpKnowledge(): import('@orbital/contracts').HrpKnowledgeState | null {
  return useKeyed('knowledge:hrp', () => window.orbital.invoke('knowledge:hrp'));
}

export async function openNasaSource(sourceId: string): Promise<boolean> {
  return (await window.orbital.invoke('knowledge:open-source', { sourceId })).opened;
}

/** Phase 4: hybrid intelligence report (statistics + separate ML advisory + data quality). */
export function useIntelligence(): import('@orbital/contracts').IntelligenceReport | null {
  const s = useSelection();
  return useKeyed(s ? `intel:${s.astronautId}:${s.day}` : null, () => window.orbital.invoke('intelligence:report', s!));
}
