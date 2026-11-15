import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '@orbital/contracts';
import { useApp } from '../stores/app';
import { useHrpKnowledge } from '../lib/data';
import { Card, CardHeader, Pill, SectionHeader, SegmentedControl, SettingRow } from '../components/ui';

const SWATCHES = [
  ['bg', '--o-bg'],
  ['surface', '--o-surface'],
  ['surface-2', '--o-surface-2'],
  ['ink', '--o-ink'],
  ['ink-2', '--o-ink-2'],
  ['accent', '--o-accent'],
  ['teal', '--o-teal'],
  ['watch', '--o-watch'],
  ['attention', '--o-attention'],
] as const;

const TYPE_SCALE = [
  ['t-display', 'Display · 40'],
  ['t-large', 'Large title · 28'],
  ['t-title', 'Title · 22'],
  ['t-headline', 'Headline · 15 semibold'],
  ['t-body', 'Body · 14'],
  ['t-footnote', 'Footnote · 13'],
  ['t-caption', 'Caption · 12'],
] as const;

export function Settings() {
  const { prefs, system, setPrefs } = useApp();
  if (!prefs) return null;
  return (
    <>
      <SectionHeader title="Mission Settings" subtitle="Appearance, data sources and system information." />

      <Card>
        <CardHeader title="Appearance" />
        <div className="mt-3">
          <SettingRow title="Theme" description="Remembered between sessions. System follows your macOS appearance.">
            <SegmentedControl<ThemePreference>
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => void setPrefs({ theme })}
              options={[
                { value: 'light', label: <><Sun size={14} /> Light</> },
                { value: 'dark', label: <><Moon size={14} /> Dark</> },
                { value: 'system', label: <><Monitor size={14} /> System</> },
              ]}
            />
          </SettingRow>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Data sources" />
        <div className="mt-3">
          <SettingRow title="ORBITAL simulation" description="All physiological and wellbeing values in this build are synthetic and labelled as such.">
            <Pill tone="synthetic">Active</Pill>
          </SettingRow>
          <HrpSettingRow />
          <SettingRow title="NASA OSDR study metadata" description="Optional online source, off by default. Never presented as astronaut telemetry.">
            <Pill>Not built yet</Pill>
          </SettingRow>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Storage & system" />
        <dl className="mt-3">
          {system &&
            (
              [
                ['Local database', `SQLite ${system.storage.sqliteVersion} via ${system.storage.engine}`],
                ['Schema version', String(system.storage.schemaVersion)],
                ['Integrity check', system.storage.ok ? 'Passed' : 'Failed'],
                ['Database file', system.storage.path],
                ['Runtime', `Electron ${system.electron} · Chromium ${system.chrome} · Node ${system.node}`],
                ['Platform', system.platform],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-8 border-t border-line px-6 py-3 first:border-t-0">
                <dt className="t-footnote text-ink-3">{k}</dt>
                <dd className="t-footnote tabular min-w-0 truncate text-right font-mono text-ink-2 select-text" title={v}>
                  {v}
                </dd>
              </div>
            ))}
        </dl>
      </Card>

      <Card className="mt-5">
        <CardHeader eyebrow="Design system" title="Tokens" />
        <div className="grid grid-cols-9 gap-3 px-6 pt-4">
          {SWATCHES.map(([name, v]) => (
            <div key={name}>
              <div className="h-12 rounded-[12px] border border-line" style={{ background: `var(${v})` }} />
              <p className="t-caption mt-1.5 text-ink-3">{name}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2 px-6 pt-6 pb-6">
          {TYPE_SCALE.map(([cls, label]) => (
            <p key={cls} className={`${cls} text-ink`}>
              {label}
            </p>
          ))}
        </div>
      </Card>
    </>
  );
}

/** NASA HRP knowledge registry status (Phase 3): offline snapshot, version and retrieval date. */
function HrpSettingRow() {
  const k = useHrpKnowledge();
  const navigate = useApp((s) => s.navigate);
  const ok = k?.status === 'ok' ? k.registry : null;
  return (
    <SettingRow
      title="NASA Human Research Program reference"
      description={
        ok
          ? `Offline, cited snapshot of ${ok.risks.length} NASA HRP risks from ${ok.sources.length} official nasa.gov pages (registry v${ok.registryVersion}, retrieved ${ok.snapshotDate}). Explains which spaceflight risk an alert relates to — never a diagnosis.`
          : k?.status === 'unavailable'
            ? `Registry failed validation and is unavailable: ${k.errors[0] ?? 'unknown error'}`
            : 'Loading…'
      }
    >
      <div className="flex shrink-0 items-center gap-2">
        <Pill tone={ok ? 'teal' : 'attention'}>{ok ? 'Offline · v' + ok.registryVersion : k ? 'Unavailable' : '…'}</Pill>
        {ok && (
          <button onClick={() => navigate('knowledge')} className="t-caption rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink">
            Open
          </button>
        )}
      </div>
    </SettingRow>
  );
}
