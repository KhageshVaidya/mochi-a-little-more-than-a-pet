import { useEffect, useState } from 'react';
import { BookOpen, Download, Lock, PenLine, Pencil, Sparkles, Trash2 } from 'lucide-react';
import type { JournalEntry, MemoryItem, MemoryKind } from '@orbital/contracts';
import { useApp, useAstronaut } from '../stores/app';
import { cn } from '../lib/cn';
import { Card, CardHeader, Pill, SectionHeader, SettingRow, Switch } from '../components/ui';

const FEELINGS = ['calm', 'happy', 'energised', 'tired', 'stressed', 'lonely', 'frustrated', 'proud', 'homesick', 'okay'];
const MEMORY_KINDS: { id: MemoryKind; label: string }[] = [
  { id: 'preferred-activity', label: 'Preferred activity' },
  { id: 'favourite-game', label: 'Favourite game' },
  { id: 'interest', label: 'Interest' },
  { id: 'goal', label: 'Goal' },
  { id: 'companion-preference', label: 'Companion preference' },
];


function EntryCard({ e, onSave, onDelete }: { e: JournalEntry; onSave(e: JournalEntry): void; onDelete(): void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(e);
  useEffect(() => setDraft(e), [e]);
  return (
    <div className="border-t border-line px-6 py-4 first:border-t-0">
      <div className="flex items-center justify-between">
        <p className="t-footnote font-semibold text-ink">Mission day {e.missionDay}</p>
        <div className="flex gap-1">
          <button onClick={() => (editing ? (onSave(draft), setEditing(false)) : setEditing(true))} className="t-caption flex items-center gap-1 rounded-full px-2 py-1 font-medium text-accent hover:bg-surface-2">
            <Pencil size={12} /> {editing ? 'Save' : 'Edit'}
          </button>
          <button onClick={onDelete} aria-label="Delete entry" className="t-caption flex items-center gap-1 rounded-full px-2 py-1 font-medium text-ink-3 hover:bg-surface-2 hover:text-attention">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="t-caption text-ink-3">Feelings you reported:</span>
        {(editing ? FEELINGS : draft.feelings).map((f) => {
          const on = draft.feelings.includes(f);
          return editing ? (
            <button key={f} onClick={() => setDraft({ ...draft, feelings: on ? draft.feelings.filter((x) => x !== f) : [...draft.feelings, f] })} className={cn('t-caption rounded-full border px-2 py-0.5', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3')}>
              {f}
            </button>
          ) : (
            <Pill key={f}>{f}</Pill>
          );
        })}
        {!editing && draft.feelings.length === 0 && <span className="t-caption text-ink-3">none</span>}
      </div>
      <div className="mt-3 space-y-2">
        {draft.turns.map((t, k) => (
          <div key={k}>
            <p className="t-caption text-ink-3">{t.question}</p>
            {editing ? (
              <textarea
                value={t.answer ?? ''}
                onChange={(ev) => setDraft({ ...draft, turns: draft.turns.map((x, j) => (j === k ? { ...x, answer: ev.target.value || null } : x)) })}
                className="t-footnote mt-0.5 w-full rounded-[10px] border border-line bg-surface-2 px-2 py-1 text-ink outline-none"
                rows={2}
              />
            ) : (
              <p className="t-footnote text-ink">{t.answer ?? <span className="text-ink-3 italic">skipped</span>}</p>
            )}
          </div>
        ))}
      </div>
      {draft.summary && (
        <div className="mt-3 rounded-[12px] bg-surface-2/70 px-3 py-2">
          <p className="t-caption flex items-center gap-1 font-semibold text-ink-3">
            <Sparkles size={11} /> Generated summary (not your words)
          </p>
          <p className="t-footnote text-ink-2">{draft.summary.text}</p>
        </div>
      )}
      {draft.possibilities.map((p, k) => (
        <div key={k} className="mt-2 flex items-center justify-between gap-3 rounded-[12px] border border-dashed border-line px-3 py-2">
          <p className="t-footnote text-ink-2">
            <span className="t-caption mr-1 font-semibold text-ink-3">Possibility · {p.status}</span>
            {p.text}
          </p>
          {p.status === 'unconfirmed' && (
            <div className="flex shrink-0 gap-1">
              {(['confirmed', 'dismissed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => onSave({ ...draft, possibilities: draft.possibilities.map((x, j) => (j === k ? { ...x, status: st } : x)) })}
                  className="t-caption rounded-full border border-line px-2 py-0.5 font-medium text-ink"
                >
                  {st === 'confirmed' ? 'Yes, that’s right' : 'Not really'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Journal() {
  const { prefs, setPrefs } = useApp();
  const p = useAstronaut();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [draft, setDraft] = useState('');
  const [draftFeelings, setDraftFeelings] = useState<string[]>([]);
  const day = useApp((s) => s.mission?.day ?? 0);
  const [newMem, setNewMem] = useState<{ kind: MemoryKind; text: string }>({ kind: 'preferred-activity', text: '' });
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    if (!p) return;
    void window.orbital.invoke('journal:list', { astronautId: p.id }).then(setEntries);
    void window.orbital.invoke('memory:list', { astronautId: p.id }).then(setMemory);
  }, [p?.id]);
  if (!p || !prefs) return null;

  return (
    <>
      <SectionHeader
        eyebrow={`${p.name} · private`}
        title="Journal & Memory"
        subtitle="Your private space. Journal entries and companion memory are visible only to you — never in crew views, never to mission administrators, and never sent to an AI model."
      />

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2">
          <CardHeader
            eyebrow="Daily journal"
            title={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
            action={
              <div className="flex gap-1.5">
                {(['markdown', 'json'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={async () => {
                      const r = await window.orbital.invoke('journal:export', { astronautId: p.id, format: f });
                      setExported(r.saved ? `Saved to ${r.path}` : null);
                    }}
                    className="t-caption flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-medium text-ink hover:bg-surface-2"
                  >
                    <Download size={12} /> {f === 'markdown' ? 'Markdown' : 'JSON'}
                  </button>
                ))}
              </div>
            }
          />
          {exported && <p className="t-caption px-6 pt-2 text-teal">{exported}</p>}
          <div className="mx-6 mt-3 rounded-[12px] border border-line p-3" data-testid="journal-new">
            <p className="t-caption mb-1.5 flex items-center gap-1.5 font-semibold text-ink-2">
              <PenLine size={12} /> New entry · day {day}
            </p>
            <textarea
              id="journal-new-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write as much or as little as you like. Only you can see this."
              rows={3}
              maxLength={4000}
              className="t-footnote w-full resize-y rounded-[8px] border border-line bg-surface-2 px-2.5 py-2 text-ink outline-none focus:border-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {FEELINGS.map((f) => (
                <button
                  key={f}
                  onClick={() => setDraftFeelings((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}
                  className={cn('t-caption rounded-full border px-2 py-0.5', draftFeelings.includes(f) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3')}
                >
                  {f}
                </button>
              ))}
              <button
                disabled={!draft.trim()}
                onClick={async () => {
                  setEntries(await window.orbital.invoke('journal:create', { astronautId: p.id, day, text: draft.trim(), feelings: draftFeelings }));
                  setDraft('');
                  setDraftFeelings([]);
                }}
                className="t-caption ml-auto rounded-full bg-accent px-3 py-1 font-medium text-bg disabled:opacity-40"
              >
                Save entry
              </button>
            </div>
          </div>
          <div className="mt-2 pb-2">
            {entries.length === 0 && (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <BookOpen size={22} className="text-ink-3" />
                <p className="t-body mt-2 text-ink-2">No entries yet.</p>
                <p className="t-caption mt-1 max-w-sm text-ink-3">Write one above, or tell Mochi about your day in chat. It’s always optional.</p>
              </div>
            )}
            {entries.map((e) => (
              <EntryCard
                key={e.id}
                e={e}
                onSave={async (next) => setEntries(await window.orbital.invoke('journal:save', next))}
                onDelete={async () => setEntries(await window.orbital.invoke('journal:delete', { astronautId: p.id, id: e.id }))}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Companion memory" title="What your companion remembers" />
            <div className="px-6 pt-3 pb-5">
              {memory.length === 0 && <p className="t-caption text-ink-3">Nothing yet. Your companion only remembers things you confirm.</p>}
              {memory.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                  <div className="min-w-0">
                    <p className="t-footnote truncate text-ink">{m.text}</p>
                    <p className="t-caption text-ink-3">
                      {MEMORY_KINDS.find((k) => k.id === m.kind)?.label} · {m.source === 'user-confirmed' ? 'you confirmed' : 'you added'}
                    </p>
                  </div>
                  <button onClick={async () => setMemory(await window.orbital.invoke('memory:delete', { astronautId: p.id, id: m.id }))} aria-label={`Forget ${m.text}`} className="text-ink-3 hover:text-attention">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="mt-3 flex gap-1.5">
                <select value={newMem.kind} onChange={(e) => setNewMem({ ...newMem, kind: e.target.value as MemoryKind })} className="t-caption rounded-[8px] border border-line bg-surface px-1.5 text-ink">
                  {MEMORY_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input value={newMem.text} onChange={(e) => setNewMem({ ...newMem, text: e.target.value })} placeholder="Add something…" maxLength={200} className="t-caption min-w-0 flex-1 rounded-[8px] border border-line bg-surface-2 px-2 py-1 text-ink outline-none" />
                <button
                  disabled={!newMem.text.trim()}
                  onClick={async () => {
                    setMemory(await window.orbital.invoke('memory:save', { astronautId: p.id, kind: newMem.kind, text: newMem.text.trim() }));
                    setNewMem({ ...newMem, text: '' });
                  }}
                  className="t-caption rounded-full bg-accent px-2.5 font-medium text-bg disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Privacy & AI" title="Your choices" />
            <div className="mt-2">
              <SettingRow title="Daily journal" description="Your companion may offer a voluntary daily chat.">
                <Switch label="Daily journal" checked={prefs.privacy.journalingEnabled} onChange={(v) => void setPrefs({ privacy: { journalingEnabled: v } })} />
              </SettingRow>
              <SettingRow title="Share chat mood check-ins with the monitor" description="Your 0–10 answers count as self-reported mood. Free text is never used.">
                <Switch label="Share check-ins" checked={prefs.privacy.shareCheckinsWithMonitor} onChange={(v) => void setPrefs({ privacy: { shareCheckinsWithMonitor: v } })} />
              </SettingRow>
              <p className="t-caption px-6 pb-4 text-ink-3">
                Mochi’s conversation model runs locally (Dr G Zero › Settings). It never receives your journal entries or health data.
              </p>
            </div>
          </Card>
          <p className="t-caption flex items-start gap-1.5 px-1 text-ink-3">
            <Lock size={12} className="mt-0.5 shrink-0" /> Stored locally on this device. Generated summaries and possibilities are labelled and never treated as facts unless you confirm them.
          </p>
        </div>
      </div>
    </>
  );
}
