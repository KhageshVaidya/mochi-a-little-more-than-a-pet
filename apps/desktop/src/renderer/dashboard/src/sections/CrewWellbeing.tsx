import { useEffect, useState } from 'react';
import { HeartHandshake, MessageCircleHeart, Sparkles, Users } from 'lucide-react';
import type { ActivityKind, AstronautId, CrewBoard, CrewStatusOption } from '@orbital/contracts';
import { useApp } from '../stores/app';
import { cn } from '../lib/cn';
import { Card, CardHeader, Pill } from '../components/ui';
import { Avatar } from '../components/crew';

/**
 * Voluntary crew wellbeing & shared activities. Only what people choose to share is shown, to the audience
 * they choose. Synthetic crewmates' statuses and replies are simulated and labelled. Declining is neutral.
 */

const STATUS: Record<CrewStatusOption, { label: string; hint: string }> = {
  company: { label: 'Up for company', hint: 'Happy to hang out' },
  activity: { label: 'Open to an activity', hint: 'Invite me to something' },
  space: { label: 'Need some personal space', hint: 'Not today, thanks' },
  support: { label: 'Would like support', hint: 'You choose who sees this' },
};
const KINDS: { id: ActivityKind; label: string }[] = [
  { id: 'puzzle', label: 'Puzzle' },
  { id: 'cognitive-game', label: 'Brain game' },
  { id: 'exercise', label: 'Exercise together' },
  { id: 'rec-evening', label: 'Recreational evening' },
  { id: 'meal', label: 'Shared meal' },
  { id: 'conversation', label: 'Conversation' },
];

export function CrewWellbeing() {
  const mission = useApp((s) => s.mission);
  const crew = useApp((s) => s.crew);
  const [board, setBoard] = useState<CrewBoard | null>(null);
  const [kind, setKind] = useState<ActivityKind>('puzzle');
  const [invite, setInvite] = useState<AstronautId[]>([]);
  const [audience, setAudience] = useState<'crew-support' | 'person' | 'crew'>('crew-support');
  const [person, setPerson] = useState<AstronautId | ''>('');
  const [error, setError] = useState<string | null>(null);

  const me = mission?.astronautId;
  const day = mission?.day ?? 0;
  useEffect(() => {
    if (!me) return;
    void window.orbital.invoke('crew:board', { astronautId: me, day }).then(setBoard);
    setInvite([]);
  }, [me, day]);
  if (!me || !board) return null;
  const sel = { astronautId: me, day };
  const name = (id: string) => crew.find((c) => c.id === id)?.name.split(' ')[0] ?? id;
  const statusOf = (id: string) => board.visibleStatuses.find((s) => s.subjectId === id);
  const run = async (p: Promise<CrewBoard>) => {
    setError(null);
    try {
      setBoard(await p);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : 'Something went wrong');
    }
  };
  const incoming = board.activities.filter((a) => a.proposedBy !== me && a.responses[me] === 'pending');
  const maxWeek = Math.max(1, ...board.participation.weeks.map((w) => w.checkins));

  return (
    <div className="mt-8 grid grid-cols-5 gap-5">
      <Card className="col-span-2">
        <CardHeader eyebrow="Voluntary" title="How you’d like to connect today" />
        <div className="px-6 pt-3 pb-5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Your status">
            {(Object.keys(STATUS) as CrewStatusOption[]).map((k) => {
              const on = board.myStatus?.status === k;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={on}
                  onClick={() => run(window.orbital.invoke('crew:status:set', { ...sel, status: on ? null : k, audience: k === 'support' ? audience : 'crew', ...(k === 'support' && audience === 'person' && person ? { audiencePersonId: person } : {}) }))}
                  className={cn('rounded-[12px] border px-3 py-2 text-left', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
                >
                  <p className="t-footnote font-medium text-ink">{STATUS[k].label}</p>
                  <p className="t-caption text-ink-3">{STATUS[k].hint}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="t-caption text-ink-3">“Would like support” visible to:</span>
            {(['crew-support', 'person', 'crew'] as const).map((a) => (
              <button key={a} onClick={() => setAudience(a)} className={cn('t-caption rounded-full border px-2 py-0.5', audience === a ? 'border-accent text-accent' : 'border-line text-ink-3')}>
                {a === 'crew-support' ? 'Crew-support only' : a === 'person' ? 'One crewmate' : 'Whole crew'}
              </button>
            ))}
            {audience === 'person' && (
              <select value={person} onChange={(e) => setPerson(e.target.value as AstronautId)} className="t-caption rounded-[8px] border border-line bg-surface px-1 text-ink">
                <option value="">choose…</option>
                {crew.filter((c) => c.id !== me).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="t-caption mt-3 text-ink-3">Optional, and it resets tomorrow. Not sharing anything is completely fine and is never interpreted.</p>
        </div>
      </Card>

      <Card className="col-span-3">
        <CardHeader eyebrow={`Day ${day}`} title="Crew board" action={<Pill>Crewmates simulated</Pill>} />
        <div className="grid grid-cols-5 gap-2 px-6 pt-3">
          {crew.map((c) => {
            const st = statusOf(c.id);
            return (
              <div key={c.id} className={cn('rounded-[12px] border p-2.5 text-center', c.id === me ? 'border-accent' : 'border-line')}>
                <div className="flex justify-center">
                  <Avatar p={c} size={28} />
                </div>
                <p className="t-caption mt-1 font-semibold text-ink">{c.id === me ? 'You' : c.name.split(' ')[0]}</p>
                <p className="t-caption text-ink-3">{st ? STATUS[st.status].label : '—'}</p>
              </div>
            );
          })}
        </div>
        {board.suggestion && (
          <div className="mx-6 mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-surface-2/70 px-3 py-2">
            <p className="t-footnote text-ink-2">
              <Sparkles size={13} className="mr-1 inline text-accent" />
              {board.suggestion.text}
            </p>
            <button onClick={() => run(window.orbital.invoke('crew:activity:propose', { ...sel, kind: board.suggestion!.kind, invitees: [board.suggestion!.invitee] }))} className="t-caption shrink-0 rounded-full bg-accent px-2.5 py-1 font-medium text-bg">
              Invite
            </button>
          </div>
        )}
        <div className="px-6 pt-3 pb-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="t-caption text-ink-3">Propose:</span>
            {KINDS.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} className={cn('t-caption rounded-full border px-2 py-0.5', kind === k.id ? 'border-accent text-accent' : 'border-line text-ink-3')}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="t-caption text-ink-3">With:</span>
            {crew
              .filter((c) => c.id !== me)
              .map((c) => {
                const space = statusOf(c.id)?.status === 'space';
                const on = invite.includes(c.id);
                return (
                  <button
                    key={c.id}
                    disabled={space}
                    title={space ? 'Asked for personal space today' : ''}
                    onClick={() => setInvite(on ? invite.filter((x) => x !== c.id) : [...invite, c.id])}
                    className={cn('t-caption rounded-full border px-2 py-0.5 disabled:opacity-40', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2')}
                  >
                    {c.name.split(' ')[0]}
                    {space && ' · space'}
                  </button>
                );
              })}
            <button disabled={!invite.length} onClick={() => run(window.orbital.invoke('crew:activity:propose', { ...sel, kind, invitees: invite }))} className="t-caption ml-auto rounded-full bg-accent px-3 py-1 font-medium text-bg disabled:opacity-40">
              Send invitation
            </button>
          </div>
          {error && <p className="t-caption mt-2 text-watch">{error}</p>}
        </div>
      </Card>

      <Card className="col-span-3">
        <CardHeader eyebrow="This week" title="Shared activities" />
        <div className="px-6 pt-3 pb-5">
          {incoming.map((a) => (
            <div key={a.id} className="mb-2 rounded-[12px] border border-accent/40 bg-accent-soft/40 px-3 py-2">
              <p className="t-footnote font-medium text-ink">
                {name(a.proposedBy)} invited you: {a.title}
              </p>
              {a.companionMessages.map((m, k) => (
                <p key={k} className="t-caption text-ink-2">
                  <MessageCircleHeart size={11} className="mr-1 inline" />
                  {m.from}: {m.text}
                </p>
              ))}
              <div className="mt-1.5 flex gap-1.5">
                <button onClick={() => run(window.orbital.invoke('crew:activity:respond', { ...sel, activityId: a.id, accept: true }))} className="t-caption rounded-full bg-accent px-2.5 py-0.5 font-medium text-bg">
                  Count me in
                </button>
                <button onClick={() => run(window.orbital.invoke('crew:activity:respond', { ...sel, activityId: a.id, accept: false }))} className="t-caption rounded-full px-2.5 py-0.5 font-medium text-ink-3">
                  Not this time
                </button>
              </div>
            </div>
          ))}
          {board.activities.filter((a) => !incoming.includes(a)).length === 0 && incoming.length === 0 && <p className="t-caption text-ink-3">No shared activities this week yet.</p>}
          {board.activities
            .filter((a) => !incoming.includes(a))
            .map((a) => (
              <div key={a.id} className="border-t border-line py-2 first:border-t-0">
                <p className="t-footnote text-ink">
                  <Users size={13} className="mr-1 inline text-ink-3" />
                  {a.title} · day {a.day} · {Object.entries(a.responses).filter(([, r]) => r === 'accepted').map(([id]) => (id === me ? 'you' : name(id))).join(', ')}
                </p>
                {a.companionMessages.map((m, k) => (
                  <p key={k} className="t-caption text-ink-3">
                    {m.from}: {m.text}
                  </p>
                ))}
              </div>
            ))}
          <p className="t-caption mt-2 text-ink-3">Companions only pass on activity invitations — never journals, moods or health information.</p>
        </div>
      </Card>

      <Card className="col-span-2">
        <CardHeader eyebrow="Team level only" title="Crew engagement" />
        <div className="px-6 pt-3 pb-5">
          <div className="flex h-24 items-end gap-3">
            {board.participation.weeks.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end gap-[2px]" style={{ height: 72 }}>
                  <div className="flex-1 rounded-t-[4px]" style={{ height: `${(w.checkins / maxWeek) * 100}%`, background: 'var(--crew-blue)' }} title={`${w.checkins} check-ins`} />
                  <div className="flex-1 rounded-t-[4px]" style={{ height: `${Math.min(100, (w.activities / Math.max(1, maxWeek / 4)) * 100)}%`, background: 'var(--crew-aqua)' }} title={`${w.activities} shared activities`} />
                </div>
                <span className="t-caption tabular text-ink-3">wk {Math.floor(w.weekStart / 7) + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3">
            <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--crew-blue)' }} /> Check-ins (crew)
            </span>
            <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--crew-aqua)' }} /> Shared activities
            </span>
          </div>
          {board.participation.suggestion && (
            <p className="t-footnote mt-3 rounded-[12px] bg-surface-2/70 px-3 py-2 text-ink-2">
              <HeartHandshake size={13} className="mr-1 inline text-accent" />
              {board.participation.suggestion}
            </p>
          )}
          <p className="t-caption mt-2 text-ink-3">Never broken down by person, never linked to health, never read as mood or conflict.</p>
        </div>
      </Card>
    </div>
  );
}
