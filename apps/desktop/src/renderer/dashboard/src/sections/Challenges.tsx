import { useEffect, useState } from 'react';
import { Award, Check, CircleDashed, Compass, Flag, Footprints, Gamepad2, Leaf, Lock, Music, Rocket, Sparkles, Users } from 'lucide-react';
import type { ActivityRestrictions, GameDifficulty, GameId, LogActivity, Mission, ProgressState, RecommendationSet } from '@orbital/contracts';
import { useApp, useAstronaut } from '../stores/app';
import { cn } from '../lib/cn';
import { Card, CardHeader, Pill, SectionHeader, SegmentedControl } from '../components/ui';
import { CrewPuzzle, GameHistory, PetHome, SolarSystemMap } from '../components/adventure';
import { ConstellationMemory, SignalCatch, type GameOutcome } from './Games';

/**
 * Mission Challenges — every number comes from @orbital/gamification via the main process.
 * Rewards are for completion and care; rest counts; nothing is ever taken away.
 * Phase 4: adaptive missions come from APPROVED recommendations (decision + statistics, never ML) and
 * replace the rotating slot, so a detected change never increases the XP on offer.
 */

const KIND_LABEL: Record<string, string> = {
  'checkin.completed': 'Check-ins',
  'measurement.completed': 'Measurements',
  'exercise.session': 'Prescribed exercise',
  'rest.day': 'Rest days',
  'recovery.session': 'Recovery',
  'mindfulness.session': 'Mindfulness',
  'cognitive-game.played': 'Cognitive challenges',
  'personal-best': 'Personal bests',
  'crew-activity.joined': 'Crew activities',
  'help.requested': 'Reaching out',
  'movement.break': 'Movement breaks',
  'journal.written': 'Journal',
  'companion.chat': 'Companion chats',
  'recreation.session': 'Recreation',
  'crew-puzzle.contributed': 'Crew puzzle',
  'companion.played': 'Pet playtime',
  missions: 'Mission bonuses',
};

type Tab = 'today' | 'explore' | 'habitat' | 'games' | 'crew' | 'rewards';

function useProgress() {
  const mission = useApp((s) => s.mission);
  const [p, setP] = useState<ProgressState | null>(null);
  const [recs, setRecs] = useState<RecommendationSet | null>(null);
  useEffect(() => {
    if (!mission) return;
    let alive = true;
    const sel = { astronautId: mission.astronautId, day: mission.day };
    void window.orbital.invoke('game:progress', sel).then((v) => alive && setP(v));
    void window.orbital.invoke('recommendations:list', sel).then((v) => alive && setRecs(v));
    return () => {
      alive = false;
    };
  }, [mission?.astronautId, mission?.day]);
  return [p, setP, recs] as const;
}

function MissionRow({ m, onDo }: { m: Mission; onDo(m: Mission): void }) {
  const first = m.counts[0];
  const loggable = !m.completed && first !== 'crew-activity.joined' && first !== 'journal.written' && first !== 'companion.chat';
  const goTo = !m.completed && (first === 'journal.written' || first === 'companion.chat');
  return (
    <div data-mission={m.id} data-adaptive={m.adaptive ? 'true' : undefined} className={cn('flex items-center gap-4 border-t border-line px-6 py-3.5 first:border-t-0', m.adaptive && 'bg-accent-soft/40')}>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.completed ? 'bg-teal-soft text-teal' : 'bg-surface-2 text-ink-3')}>
        {m.completed ? <Check size={16} strokeWidth={2.5} /> : m.adaptive ? <Compass size={16} /> : <CircleDashed size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-body font-medium text-ink">
          {m.title} {m.adaptive && <Pill tone="accent" className="ml-1 py-0">Adaptive · optional</Pill>}
        </p>
        <p className="t-caption text-ink-3">
          {m.description}
          {m.reason && <span className="text-accent"> · {m.reason}</span>}
        </p>
      </div>
      <span className="t-caption tabular text-ink-3">
        {m.progress}/{m.target}
      </span>
      <span className="t-caption tabular w-14 text-right text-ink-3">+{m.bonusXp} XP</span>
      {loggable || goTo ? (
        <button onClick={() => onDo(m)} className="t-footnote rounded-full border border-line px-3 py-1 font-medium text-ink hover:bg-surface-2">
          {first === 'cognitive-game.played' ? 'Play' : goTo ? 'Open' : 'Log it'}
        </button>
      ) : (
        <span className="w-[66px]" />
      )}
    </div>
  );
}

export function Challenges() {
  const mission = useApp((s) => s.mission);
  const navigate = useApp((s) => s.navigate);
  const p0 = useAstronaut();
  const [p, setP, recs] = useProgress();
  const [tab, setTab] = useState<Tab>('today');
  const [game, setGame] = useState<GameId | null>(null);
  const [difficulty, setDifficulty] = useState<GameDifficulty>('standard');
  const [played, setPlayed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [goalOptions, setGoalOptions] = useState<{ id: string; title: string; target: number }[]>([]);
  const [placing, setPlacing] = useState<{ room: string; slot: number } | null>(null);
  const [restrictions, setRestrictions] = useState<ActivityRestrictions | null>(null);

  useEffect(() => {
    void window.orbital.invoke('game:goal-options').then(setGoalOptions);
  }, []);
  useEffect(() => {
    if (mission) void window.orbital.invoke('restrictions:get', { astronautId: mission.astronautId }).then(setRestrictions);
  }, [mission?.astronautId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!mission || !p || !p0) return null;
  const id = mission.astronautId;
  const day = mission.day;
  const sel = { astronautId: id, day };

  const log = async (kind: LogActivity['kind'], amount = 1) => {
    setP(await window.orbital.invoke('game:log', { ...sel, kind, amount }));
    setToast(kind === 'rest.day' ? 'Rest logged — that counts!' : kind === 'help.requested' ? 'Reaching out counts. Thank you.' : 'Logged. Nicely done.');
  };
  const doMission = (m: Mission) => {
    const k = m.counts[0]!;
    if (k === 'cognitive-game.played') {
      setTab('games');
      return setGame('signal-catch');
    }
    if (k === 'journal.written') return navigate('journal');
    if (k === 'companion.chat') return void window.orbital.invoke('companion:openChat'); // opens Mochi's conversation
    if (k === 'exercise.session') return void log('exercise.session', 30);
    void log(k as LogActivity['kind']);
  };
  const finishGame = async (o: GameOutcome) => {
    const r = await window.orbital.invoke('game:play', { ...sel, ...o });
    setP(r.progress);
    setPlayed((n) => n + 1);
    setToast(r.personalBest ? 'New personal best! ✦' : 'Game recorded. Thanks for playing!');
  };

  const pct = Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100);
  const xpRows = Object.entries(p.xpByKind).sort((a, b) => b[1] - a[1]);
  const decoName = (d: string | null) => p.habitat.decorations.find((x) => x.id === d)?.name;
  const current = p.exploration.find((d) => d.current);

  return (
    <>
      <SectionHeader
        eyebrow={`${p0.name} · ${p0.id} · day ${day}`}
        title="Mission Challenges"
        subtitle="Progress comes from consistency and care — check-ins, prescribed exercise, rest, recovery, connection and play. Nothing is ever taken away."
      />

      {toast && (
        <div className="fixed top-16 right-10 z-50 rounded-full border border-line bg-surface px-4 py-2 shadow-raised" role="status">
          <p className="t-footnote font-medium text-ink">{toast}</p>
        </div>
      )}

      <div className="mb-5 flex items-center justify-between gap-4">
        <SegmentedControl<Tab>
          label="Challenges view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today', title: 'Today' },
            { value: 'explore', label: 'Explore', title: 'Explore' },
            { value: 'habitat', label: 'Habitat & pet', title: 'Habitat & pet' },
            { value: 'games', label: 'Games', title: 'Games' },
            { value: 'crew', label: 'Crew', title: 'Crew' },
            { value: 'rewards', label: 'Rewards', title: 'Rewards' },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="t-footnote tabular text-ink-2">
            Level <b className="text-ink">{p.level}</b> · {p.rankTitle}
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {tab === 'today' && (
        <>
          <div className="grid grid-cols-2 gap-5">
            <Card>
              <CardHeader eyebrow={`Day ${day}`} title="Today’s missions" />
              <div className="mt-2 pb-2">{p.dailyMissions.map((m) => <MissionRow key={m.id} m={m} onDo={doMission} />)}</div>
            </Card>
            <Card>
              <CardHeader eyebrow={`Week ${Math.floor(day / 7) + 1}`} title="This week" />
              <div className="mt-2 pb-2">{p.weeklyMissions.map((m) => <MissionRow key={m.id} m={m} onDo={doMission} />)}</div>
            </Card>
          </div>
          <div className="mt-5 grid grid-cols-5 gap-5">
            <Card className="col-span-3" data-testid="recommendations">
              <CardHeader eyebrow="Adaptive ideas · all optional" title="Why these suggestions?" />
              <div className="px-6 pt-3 pb-5">
                {recs && recs.recommendations.length ? (
                  <ul className="space-y-2.5">
                    {recs.recommendations.map((r) => (
                      <li key={r.id} data-recommendation={r.kind}>
                        <p className="t-footnote font-semibold text-ink">{r.title}</p>
                        <p className="t-caption text-ink-2">{r.description}</p>
                        <p className="t-caption text-ink-3">
                          Based on: {r.basis.source === 'safety' ? 'your request for support' : r.basis.source === 'decision' ? 'the deterministic wellbeing decision' : r.basis.source === 'trend' ? 'a longitudinal trend in physical measurements' : r.basis.source === 'data-quality' ? 'measurements that are due' : 'a statistical change from your personal baseline'}
                          {r.basis.domains.length ? ` (${r.basis.domains.join(', ')})` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-footnote text-ink-3">Nothing special today — your usual missions are all there.</p>
                )}
                {recs && recs.suppressed.length > 0 && (
                  <p className="t-caption mt-3 text-ink-3">Not suggested: {[...new Set(recs.suppressed.map((s) => s.reason))].join(' ')}</p>
                )}
                <p className="t-caption mt-3 text-ink-3">
                  Suggestions come only from the deterministic decision, statistical findings and data quality — never from the ML advisory, never from your journal. The top idea fills one daily slot; the XP on offer is the same either way.
                </p>
              </div>
            </Card>
            <Card className="col-span-2 p-6">
              <p className="t-eyebrow text-ink-3">Log a moment of care</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    ['rest.day', 'Rest day', Leaf],
                    ['recovery.session', 'Recovery', Sparkles],
                    ['mindfulness.session', 'Mindful minutes', Sparkles],
                    ['movement.break', 'Movement break', Footprints],
                    ['recreation.session', 'Recreation', Music],
                    ['help.requested', 'Asked for support', Users],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button key={k} onClick={() => void log(k)} className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2.5 text-left hover:bg-surface-2">
                    <Icon size={15} className="text-accent" />
                    <span className="t-footnote font-medium text-ink">{label}</span>
                  </button>
                ))}
              </div>
              <p className="t-caption mt-3 text-ink-3">Rest, recovery and reaching out are rewarded exactly like exercise.</p>
              {restrictions && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="t-caption mb-1.5 font-semibold text-ink-2">Activity restrictions (e.g. from the crew surgeon)</p>
                  <SegmentedControl<ActivityRestrictions['exercise']>
                    size="sm"
                    label="Exercise restriction"
                    value={restrictions.exercise}
                    onChange={async (v) => {
                      setRestrictions(await window.orbital.invoke('restrictions:set', { astronautId: id, restrictions: { ...restrictions, exercise: v } }));
                      setP(await window.orbital.invoke('game:progress', sel));
                    }}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'light-only', label: 'Light only' },
                      { value: 'no-exercise', label: 'No exercise' },
                    ]}
                  />
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'explore' && (
        <>
          <Card className="p-6">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="t-headline text-ink">Solar-system expedition</h2>
              <span className="t-caption text-ink-3">
                {p.explorationHistory.length}/{p.exploration.length} destinations
              </span>
            </div>
            <SolarSystemMap p={p} />
            {current && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {(['cognitive', 'recovery', 'exercise', 'connection'] as const).map((k) => (
                  <div key={k}>
                    <div className="flex justify-between">
                      <span className="t-caption text-ink-3 capitalize">{k}</span>
                      <span className="t-caption tabular text-ink-3">
                        {Math.min(current.have[k], current.needs[k])}/{current.needs[k]}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(1, current.have[k] / current.needs[k]) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="t-caption mt-3 text-ink-3">Next stop: {current?.name ?? 'route complete'}. A balanced mix is needed — training alone can’t finish the route; rest and connection count just as much.</p>
          </Card>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <Card>
              <CardHeader eyebrow="Personal exploration history" title="Where you’ve been" />
              <ol className="px-6 pt-3 pb-5">
                {p.explorationHistory.length ? (
                  p.explorationHistory.map((h) => {
                    const d = p.exploration.find((x) => x.id === h.destinationId)!;
                    return (
                      <li key={h.destinationId} className="flex gap-3 border-t border-line py-2.5 first:border-t-0">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal">
                          <Check size={13} strokeWidth={2.5} />
                        </span>
                        <div>
                          <p className="t-footnote font-semibold text-ink">
                            {h.name} <span className="t-caption font-normal text-ink-3">· day {h.day}</span>
                          </p>
                          <p className="t-caption text-ink-3">{d.fact}</p>
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <p className="t-footnote text-ink-3">Your first destination is the Moon.</p>
                )}
              </ol>
            </Card>
            <Card>
              <CardHeader eyebrow="Unlockable environments" title="Views for your habitat and pet home" />
              <div className="grid grid-cols-3 gap-2 px-6 pt-3 pb-5">
                {p.environments.map((e) => (
                  <div key={e.id} className={cn('rounded-[10px] border px-2 py-2', e.unlocked ? 'border-line' : 'border-dashed border-line opacity-60')}>
                    <p className="t-caption font-semibold text-ink">{e.unlocked ? e.name : `🔒 ${e.name}`}</p>
                    <p className="t-caption text-ink-3">{e.unlockedBy}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'habitat' && (
        <div className="grid grid-cols-5 gap-5">
          <Card className="col-span-3">
            <CardHeader eyebrow="Mission base" title="Your habitat" />
            <div className="grid grid-cols-3 gap-3 px-6 pt-4 pb-5">
              {p.habitat.rooms.map((r) => (
                <div key={r.id} data-room={r.id} className={cn('rounded-[14px] border p-3', r.unlocked ? 'border-line bg-surface-2/50' : 'border-dashed border-line-strong')}>
                  <div className="flex items-center justify-between">
                    <p className="t-footnote font-semibold text-ink">{r.name}</p>
                    {!r.unlocked && <Lock size={13} className="text-ink-3" />}
                  </div>
                  {r.unlocked ? (
                    <div className="mt-2 flex gap-1.5">
                      {r.slots.map((d, k) => (
                        <button key={k} onClick={() => setPlacing({ room: r.id, slot: k })} title={decoName(d) ?? 'Empty slot'} className="t-caption h-12 flex-1 truncate rounded-[10px] border border-line bg-surface px-1 text-ink-2 hover:border-accent">
                          {decoName(d) ?? '+'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p className="t-caption mt-1 text-ink-3">{r.requirement}</p>
                      <div className="mt-2 h-1 rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-teal" style={{ width: `${r.progress * 100}%` }} />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {placing && (
              <div className="mx-6 mb-5 rounded-[14px] border border-line p-3">
                <p className="t-caption mb-2 text-ink-3">Place a decoration</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.habitat.decorations.map((d) => (
                    <button
                      key={d.id}
                      disabled={!d.unlocked}
                      onClick={async () => {
                        setP(await window.orbital.invoke('game:habitat:place', { ...sel, roomId: placing.room, slot: placing.slot, decorationId: d.id }));
                        setPlacing(null);
                      }}
                      className="t-caption rounded-full border border-line px-2.5 py-1 font-medium text-ink disabled:opacity-40"
                      title={d.unlocked ? '' : `Unlocks via ${d.unlockedBy}`}
                    >
                      {d.unlocked ? d.name : `🔒 ${d.name}`}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      setP(await window.orbital.invoke('game:habitat:place', { ...sel, roomId: placing.room, slot: placing.slot, decorationId: null }));
                      setPlacing(null);
                    }}
                    className="t-caption rounded-full px-2.5 py-1 text-ink-3"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </Card>
          <Card className="col-span-2">
            <CardHeader eyebrow="Companion progression" title="Pet home" />
            <div className="px-6 pt-3 pb-5">
              <PetHome
                p={p}
                onEquip={async (slot, itemId) => setP(await window.orbital.invoke('companion:equip', { ...sel, slot, itemId }))}
                onPlay={async (toyId) => setP(await window.orbital.invoke('companion:play', { ...sel, toyId }))}
              />
              <p className="t-caption mt-3 text-ink-3">Items sit beside your companion — its artwork is never altered. Everything here works even if the desktop companion is hidden.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === 'games' && (
        <Card>
          <CardHeader
            eyebrow="Cognitive challenges"
            title="Brain games"
            action={
              <div className="flex items-center gap-3">
                <SegmentedControl<GameDifficulty> size="sm" label="Difficulty" value={difficulty} onChange={setDifficulty} options={[{ value: 'easy', label: 'Easy' }, { value: 'standard', label: 'Standard' }, { value: 'hard', label: 'Hard' }]} />
                <div className="flex gap-1.5">
                  {(['signal-catch', 'constellation-memory'] as const).map((g) => (
                    <button key={g} onClick={() => setGame(g)} className={cn('t-caption rounded-full px-3 py-1 font-medium', game === g ? 'bg-accent text-bg' : 'bg-surface-2 text-ink-2')}>
                      {g === 'signal-catch' ? 'Signal Catch (attention)' : 'Constellation Memory (working memory)'}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
          <div className="px-6 pt-4 pb-5">
            {game === 'signal-catch' && <SignalCatch key={`sc-${day}-${difficulty}-${played}`} difficulty={difficulty} onDone={finishGame} />}
            {game === 'constellation-memory' && <ConstellationMemory key={`cm-${day}-${difficulty}-${played}`} difficulty={difficulty} onDone={finishGame} />}
            {!game && (
              <button onClick={() => setGame('signal-catch')} className="flex h-24 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong text-ink-2 hover:bg-surface-2">
                <Gamepad2 size={18} /> <span className="t-footnote font-medium">Pick a game — about a minute each</span>
              </button>
            )}
            {game && (
              <div className="mt-4">
                <p className="t-caption mb-2 font-semibold text-ink-2">Your history — {game === 'signal-catch' ? 'median reaction time (lower is quicker)' : 'longest sequence recalled'}</p>
                <GameHistory astronautId={id} game={game} version={played} />
              </div>
            )}
            <p className="t-caption mt-3 text-ink-3">
              Keyboard: Space/Enter for Signal Catch, number keys 1–9 for Constellation Memory. XP is for playing; a personal best adds a small bonus. Game scores are personal — they are never used on their own for any wellbeing or mental-health decision.
            </p>
          </div>
        </Card>
      )}

      {tab === 'crew' && (
        <div className="grid grid-cols-2 gap-5">
          <Card>
            <CardHeader
              eyebrow="Crew cooperative missions"
              title="Shared goals this week"
              action={
                <button onClick={() => navigate('crew')} className="t-caption font-medium text-accent">
                  Crew activities →
                </button>
              }
            />
            <div className="space-y-4 px-6 pt-4 pb-5">
              {p.coop.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between">
                    <span className="t-footnote text-ink">{c.title}</span>
                    <span className="t-caption tabular text-ink-3">
                      {Math.min(c.crewTotal, c.target)}/{c.target}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(1, c.crewTotal / c.target) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="t-caption text-ink-3">Crew totals only — never individual breakdowns, health data or rankings.</p>
            </div>
          </Card>
          <div className="space-y-5">
            <Card className="p-6">
              <p className="t-eyebrow mb-2 text-ink-3">Shared puzzle</p>
              <CrewPuzzle p={p} />
              <button onClick={() => void log('crew-puzzle.contributed')} className="t-footnote mt-3 rounded-full border border-line px-3 py-1 font-medium text-ink hover:bg-surface-2">
                Add a piece
              </button>
            </Card>
            <Card className="p-6">
              <p className="t-eyebrow text-ink-3">Team expedition</p>
              <p className="t-title mt-1 flex items-center gap-2 text-ink">
                <Rocket size={18} className="text-accent" /> Heading for {p.teamExpedition.destination}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-teal" style={{ width: `${p.teamExpedition.progress * 100}%` }} />
              </div>
              <p className="t-caption mt-2 text-ink-3">
                The whole crew’s activity moves one shared ship ({p.teamExpedition.crewPoints.toLocaleString()} crew points). Reached together: {p.teamExpedition.reached.join(', ') || 'none yet'}.
              </p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'rewards' && (
        <>
          <div className="grid grid-cols-3 gap-5">
            <Card className="col-span-2 p-6">
              <p className="t-eyebrow text-ink-3">Rank</p>
              <p className="t-title text-ink">
                {p.rankTitle} · level {p.level}
              </p>
              <p className="t-footnote tabular mt-1 text-ink-2">
                {p.xp.toLocaleString()} XP · {(p.xpForNextLevel - p.xpIntoLevel).toLocaleString()} to level {p.level + 1} · +{p.todayXp} today
              </p>
              <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-1.5 border-t border-line pt-4">
                {xpRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="t-caption text-ink-3">{KIND_LABEL[k] ?? k}</span>
                    <span className="t-caption tabular font-medium text-ink-2">{v.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p className="t-caption mt-3 text-ink-3">Where your XP comes from: participation and completion only — never body measurements. Missed days never remove anything; there are no streaks.</p>
            </Card>
            <Card>
              <CardHeader eyebrow="Personal goals" title="Goals you chose" />
              <div className="px-6 pt-3 pb-5">
                {p.goals.map((g) => (
                  <div key={g.id} className="flex items-center justify-between border-t border-line py-2 first:border-t-0">
                    <span className="t-footnote text-ink">{g.title}</span>
                    <Pill tone={g.completed ? 'teal' : 'neutral'}>{g.completed ? 'Done' : `${g.progress}/${g.target}`}</Pill>
                  </div>
                ))}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {goalOptions.map((o) => {
                    const on = p.goals.some((g) => g.id === o.id);
                    return (
                      <button
                        key={o.id}
                        onClick={async () => {
                          const ids = on ? p.goals.filter((g) => g.id !== o.id).map((g) => g.id) : [...p.goals.map((g) => g.id), o.id].slice(-3);
                          setP(await window.orbital.invoke('game:goals:set', { ...sel, goalIds: ids }));
                        }}
                        className={cn('t-caption rounded-full border px-2.5 py-1 font-medium', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2')}
                      >
                        {o.title}
                      </button>
                    );
                  })}
                </div>
                <p className="t-caption mt-2 text-ink-3">Pick up to three. Goals count actions, never body values.</p>
              </div>
            </Card>
          </div>
          <Card className="mt-5">
            <CardHeader eyebrow="Achievements" title={`${p.achievements.filter((a) => a.unlocked).length} of ${p.achievements.length} unlocked`} />
            <div className="grid grid-cols-4 gap-3 px-6 pt-4 pb-6">
              {p.achievements.map((a) => (
                <div key={a.id} className={cn('rounded-[14px] border p-3', a.unlocked ? 'border-line bg-surface-2/50' : 'border-dashed border-line opacity-60')}>
                  <div className="flex items-center gap-2">
                    {a.unlocked ? <Award size={15} className="text-accent" /> : <Flag size={15} className="text-ink-3" />}
                    <p className="t-footnote font-semibold text-ink">{a.title}</p>
                  </div>
                  <p className="t-caption mt-1 text-ink-3">{a.description}</p>
                  {a.unlockedDay !== null && <p className="t-caption mt-1 tabular text-ink-3">Day {a.unlockedDay}</p>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
