import { HeartHandshake, Eye, Library, Lightbulb, ShieldAlert } from 'lucide-react';
import { RISK_LINK_CAVEAT, type AlertItem } from '@orbital/contracts';
import { useApp } from '../stores/app';
import { cn } from '../lib/cn';
import { EvidenceChip, SourceButton } from './knowledge';

/** Tiered alert list. Tiers are visually distinct; urgent alerts use calm, serious styling (never playful). */
const TIER = {
  urgent: { label: 'Urgent · human support', icon: HeartHandshake, cls: 'border-attention/50 bg-attention-soft' },
  'human-review': { label: 'Human review recommended', icon: ShieldAlert, cls: 'border-watch/40 bg-watch-soft' },
  monitor: { label: 'Worth monitoring', icon: Eye, cls: 'border-line bg-surface-2/60' },
  routine: { label: 'Suggestion', icon: Lightbulb, cls: 'border-line bg-surface' },
} as const;

export function AlertList({ alerts, compact = false, onChanged }: { alerts: AlertItem[]; compact?: boolean; onChanged?: () => void }) {
  const mission = useApp((s) => s.mission);
  const navigate = useApp((s) => s.navigate);
  const openRisk = useApp((s) => s.openRisk);
  if (!mission) return null;
  const sel = { astronautId: mission.astronautId, day: mission.day };
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const t = TIER[a.tier];
        return (
          <li key={a.id} data-alert-tier={a.tier} className={cn('rounded-[12px] border px-3 py-2.5', t.cls)}>
            <div className="flex items-start gap-2.5">
              <t.icon size={16} className="mt-0.5 shrink-0 text-ink-2" />
              <div className="min-w-0 flex-1">
                <p className="t-caption font-semibold tracking-wide text-ink-3 uppercase">{t.label}</p>
                <button onClick={() => navigate(a.section === 'support' ? 'brain' : a.section)} className="t-footnote text-left font-semibold text-ink">
                  {a.title}
                </button>
                <p className="t-caption text-ink-2">{a.detail}</p>
                {!compact && a.reasons.length > 0 && <p className="t-caption mt-1 text-ink-3">Responsible: {a.reasons.join(' · ')}</p>}
                {a.tier !== 'urgent' && a.riskContext && a.riskContext.length > 0 && (
                  <RiskContext alert={a} compact={compact} openRisk={openRisk} />
                )}
                {!compact && a.tier === 'human-review' && (
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={async () => (await window.orbital.invoke('alerts:share', { ...sel, alertId: a.id, share: true }), onChanged?.())} className="t-caption rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink">
                      Share report with crew support
                    </button>
                    <button onClick={async () => (await window.orbital.invoke('alerts:share', { ...sel, alertId: a.id, share: false }), onChanged?.())} className="t-caption rounded-full px-2.5 py-1 font-medium text-ink-3">
                      Keep private
                    </button>
                  </div>
                )}
                {!compact && a.tier === 'urgent' && (
                  <button onClick={async () => (await window.orbital.invoke('alerts:ack', { ...sel, alertId: a.id }), onChanged?.())} className="t-caption mt-2 rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink">
                    I’ve been contacted / acknowledge
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Related NASA HRP research areas for an alert (Phase 3). Explanatory only; never a diagnosis. */
function RiskContext({ alert, compact, openRisk }: { alert: AlertItem; compact: boolean; openRisk(id: string): void }) {
  const links = alert.riskContext!;
  if (compact) {
    return (
      <p className="t-caption mt-1 flex items-center gap-1 text-ink-3" data-risk-context={alert.id}>
        <Library size={12} className="shrink-0" />
        Related NASA research area:{' '}
        <button onClick={() => openRisk(links[0]!.riskId)} className="font-medium text-accent hover:underline">
          {links[0]!.riskName}
        </button>
        {links.length > 1 && <span>+{links.length - 1}</span>}
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-[10px] border border-line bg-surface/70 px-2.5 py-2" data-risk-context={alert.id}>
      <p className="t-caption flex items-center gap-1.5 font-semibold text-ink-2">
        <Library size={12} /> Related NASA research {links.length > 1 ? 'areas' : 'area'}
      </p>
      <ul className="mt-1 space-y-1">
        {links.map((l) => (
          <li key={l.riskId} className="t-caption flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-2">
            <button onClick={() => openRisk(l.riskId)} className="font-medium text-ink hover:underline">
              {l.riskName}
            </button>
            <EvidenceChip evidence={l.evidence} />
            {l.source ? <SourceButton source={l.source} compact /> : <span className="text-attention">Source unavailable</span>}
          </li>
        ))}
      </ul>
      <p className="t-caption mt-1.5 text-ink-3">{RISK_LINK_CAVEAT}</p>
    </div>
  );
}
