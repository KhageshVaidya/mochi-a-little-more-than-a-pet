import { useEffect, useState } from 'react';
import { BedDouble, Brain, Flag, HeartHandshake, PartyPopper, Sparkles } from 'lucide-react';
import type { CompanionCatalogEntry, CompanionEvent, CompanionManifest } from '@orbital/contracts';
import { cn } from '../lib/cn';
import { useApp } from '../stores/app';
import { Card, CardHeader, Pill, SectionHeader, SettingRow, Switch } from '../components/ui';

const assetUrl = (id: string, file: string) => `orbital-asset://pets/${id}/${encodeURI(file)}`;

/** Reaction previews send the same validated, positive-only events the gamification system will send. */
const PREVIEWS: { label: string; icon: typeof Sparkles; event: (day: number) => CompanionEvent }[] = [
  { label: 'Daily mission completed', icon: PartyPopper, event: () => ({ type: 'objective.completed', title: 'Morning check-in' }) },
  { label: 'Cognitive game achievement', icon: Brain, event: () => ({ type: 'cognitive.achievement', title: 'Vigilance personal best' }) },
  { label: 'Recovery activity completed', icon: HeartHandshake, event: () => ({ type: 'recovery.completed', title: 'Guided stretch' }) },
  { label: 'Rest day logged', icon: BedDouble, event: () => ({ type: 'rest.logged' }) },
  { label: 'Mission milestone', icon: Flag, event: (day) => ({ type: 'milestone.reached', day: Math.min(179, Math.max(0, day)) }) },
];

export function Companion() {
  const { prefs, setPrefs, mission } = useApp();
  const [manifest, setManifest] = useState<CompanionManifest | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CompanionCatalogEntry[]>([]);

  useEffect(() => {
    void window.orbital.invoke('companion:catalog').then(setCatalog);
  }, []);

  useEffect(() => {
    void window.orbital.invoke('companion:manifest').then(setManifest);
  }, [prefs?.pet.companionId, prefs?.pet.companionByProfile, mission?.astronautId]);

  if (!prefs) return null;
  const pet = prefs.pet;
  const preview = (p: (typeof PREVIEWS)[number]) => {
    void window.orbital.invoke('companion:emit', p.event(mission?.day ?? 0));
    setSent(p.label);
    setTimeout(() => setSent(null), 2000);
  };

  return (
    <>
      <SectionHeader
        title="Desktop Companion"
        subtitle="Mochi lives on your desktop in its own window — click it to chat. Each astronaut has their own companion. It celebrates healthy routines, rest included, and is never sad or disappointed."
      />

      <div className="mb-5 grid grid-cols-4 gap-4" role="radiogroup" aria-label="Choose your companion">
        {catalog.map((c) => {
          const selected = c.id === manifest?.id; // each astronaut has their own companion
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={selected}
              data-companion-option={c.id}
              onClick={() => mission && void setPrefs({ pet: { companionByProfile: { ...pet.companionByProfile, [mission.astronautId]: c.id } } })}
              className={cn(
                'flex flex-col rounded-card border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] duration-200',
                selected ? 'border-accent ring-4 ring-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <div className="flex h-28 items-end justify-center rounded-[14px] bg-surface-2/70 p-2">
                <img src={assetUrl(c.id, c.preview)} alt="" draggable={false} className="h-full w-full object-contain object-bottom" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="t-headline text-ink">{c.displayName}</span>
                {c.official ? <Pill tone="accent">Official</Pill> : <Pill>Placeholder art</Pill>}
              </div>
              <span className="t-caption mt-0.5 text-ink-3">{c.species}</span>
            </button>
          );
        })}
      </div>

      {manifest && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[280px_1fr]">
            <div className="flex items-end justify-center bg-gradient-to-b from-surface-2/40 to-surface-2 px-8 pt-8 pb-6">
              <img
                src={assetUrl(manifest.id, manifest.artwork.default)}
                alt={manifest.artwork.alt}
                draggable={false}
                className="h-[200px] w-full object-contain object-bottom drop-shadow-[0_4px_8px_rgb(0_0_0/0.15)]"
              />
            </div>
            <div className="p-7">
              <div className="flex items-center gap-2.5">
                <h2 className="t-title text-ink">{manifest.displayName}</h2>
                {manifest.official && <Pill tone="accent">Official companion</Pill>}
                <Pill tone={pet.visible ? 'teal' : 'neutral'}>{pet.visible ? 'On desktop' : 'Hidden'}</Pill>
              </div>
              <p className="t-body mt-2 max-w-xl text-ink-2">
                {manifest.displayName} is your personal companion throughout the mission — {manifest.personality.traits.join(', ')}.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {manifest.personality.traits.map((t) => (
                  <span key={t} className="t-caption rounded-full bg-surface-2 px-2.5 py-1 font-medium text-ink-2">
                    {t}
                  </span>
                ))}
              </div>
              <p className="t-caption mt-5 text-ink-3">
                Click {manifest.displayName} on the desktop for the menu, or drag to move. Position is remembered per display.
              </p>
              <p className="t-caption mt-1 text-ink-3">{manifest.credits}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader title="Behaviour" />
        <div className="mt-3">
          <SettingRow title="Show companion" description="Also available from View → Show Companion (⇧⌘P).">
            <Switch label="Show companion" checked={pet.visible} onChange={(visible) => void setPrefs({ pet: { visible } })} />
          </SettingRow>
          <SettingRow title="Float above other windows" description="Stays below system notifications and Dr G Zero alerts.">
            <Switch label="Always on top" checked={pet.alwaysOnTop} onChange={(alwaysOnTop) => void setPrefs({ pet: { alwaysOnTop } })} />
          </SettingRow>
          <SettingRow title="Interactions" description="When off, the companion is display-only and every click passes straight through to your desktop.">
            <Switch label="Companion interactions" checked={pet.interactionsEnabled} onChange={(interactionsEnabled) => void setPrefs({ pet: { interactionsEnabled } })} />
          </SettingRow>
          <SettingRow title="Gentle reminders" description="Optional break and hydration nudges. Turn off to silence all reminders.">
            <Switch label="Gentle reminders" checked={pet.remindersEnabled} onChange={(remindersEnabled) => void setPrefs({ pet: { remindersEnabled } })} />
          </SettingRow>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader
          eyebrow="Gamification hooks"
          title="Preview reactions"
          action={sent ? <Pill tone="teal">Sent: {sent}</Pill> : undefined}
        />
        <div className="grid grid-cols-5 gap-3 px-6 pt-4 pb-3">
          {PREVIEWS.map((p) => (
            <button key={p.label} onClick={() => preview(p)} disabled={!pet.visible} className="flex flex-col items-start gap-2 rounded-[14px] border border-line p-4 text-left hover:bg-surface-2 disabled:opacity-50">
              <p.icon size={18} className="text-accent" />
              <span className="t-footnote font-medium text-ink">{p.label}</span>
            </button>
          ))}
        </div>
        <p className="t-caption px-6 pb-5 text-ink-3">
          These send the same validated events the Mission Challenges system will send. Mission milestones (days 1, 30, 60, 90, 100, 120, 150, 179) are
          celebrated automatically when playback reaches them. There is deliberately no “missed objective” event.
        </p>
      </Card>

      <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-line bg-surface-2/50 px-5 py-4">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <p className="t-footnote text-ink-2">
          <span className="font-semibold text-ink">More companions later.</span> Each character is a package in <code className="font-mono text-[12px]">assets/pets/&lt;id&gt;/</code>{' '}
          with a manifest (display name, personality and messages, animation and interaction definitions) and its artwork. New illustrations or frame
          animations can be added to a manifest without code changes.
        </p>
      </div>
    </>
  );
}
