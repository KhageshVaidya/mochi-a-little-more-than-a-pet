import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { BedDouble, Eye, EyeOff, Hand, LayoutDashboard, MessageCircle, PartyPopper, Sun, type LucideIcon } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import type { CompanionAction, CompanionEvent, CompanionManifest, CompanionState, MissionState, Prefs } from '@orbital/contracts';
import { CompanionSprite } from './CompanionSprite';

/**
 * ORBITAL desktop companion window.
 * Interaction: click opens the menu; press-and-drag moves the window; transparent areas are click-through.
 * The companion receives only coarse, positive engagement events — never health data — and is never sad.
 */

const pet = window.orbitalPet;
const DRAG_THRESHOLD = 4;

type Messages = CompanionManifest['personality']['messages'];

interface BehaviourState {
  asleep: boolean;
  /** Current animation state (one-shot states return to idle/sleep). */
  anim: CompanionState;
  celebrations: number;
}
type Action = { type: 'play'; anim: CompanionState } | { type: 'settle' } | { type: 'sleep' } | { type: 'wake' } | { type: 'celebrated' };

function reduce(s: BehaviourState, a: Action): BehaviourState {
  switch (a.type) {
    case 'play':
      return { ...s, asleep: false, anim: a.anim };
    case 'settle':
      return { ...s, anim: s.asleep ? 'sleep' : 'idle' };
    case 'sleep':
      return { ...s, asleep: true, anim: 'sleep' };
    case 'wake':
      return { ...s, asleep: false, anim: 'wake' };
    case 'celebrated':
      return { ...s, celebrations: s.celebrations + 1 };
  }
}

const ACTIONS: Record<CompanionAction, { label: string; icon: LucideIcon }> = {
  chat: { label: 'Chat with Mochi', icon: MessageCircle },
  hello: { label: 'Say hello', icon: Hand },
  status: { label: 'Companion status', icon: Eye },
  celebrate: { label: 'Celebrate a completed mission', icon: PartyPopper },
  sleep: { label: 'Let Mochi sleep', icon: BedDouble },
  wake: { label: 'Wake Mochi', icon: Sun },
  'open-dashboard': { label: 'Open ORBITAL dashboard', icon: LayoutDashboard },
  hide: { label: 'Hide companion', icon: EyeOff },
};

export function Companion() {
  const [manifest, setManifest] = useState<CompanionManifest | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [mission, setMission] = useState<MissionState | null>(null);
  const [s, dispatch] = useReducer(reduce, { asleep: false, anim: 'idle', celebrations: 0 });
  const [panel, setPanel] = useState<'none' | 'menu' | 'status' | 'chat'>('none');
  const [bubble, setBubble] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);
  const counters = useRef<Partial<Record<keyof Messages, number>>>({});
  const lastInteraction = useRef(Date.now());
  const hovering = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: number; pending: { dx: number; dy: number }; raf: number } | null>(null);

  const interactive = prefs?.pet.interactionsEnabled ?? true;
  const name = manifest?.displayName ?? 'Companion';

  /** Rotates through a message category deterministically (no repeats back-to-back). */
  const say = useCallback(
    (cat: keyof Messages, suffix = '') => {
      if (!manifest || quiet) return;
      const list = manifest.personality.messages[cat];
      const n = counters.current[cat] ?? 0;
      counters.current[cat] = n + 1;
      setBubble(list[n % list.length]! + suffix);
    },
    [manifest, quiet],
  );

  // ── Wiring ────────────────────────────────────────────────────────────────
  useEffect(() => {
    void pet.invoke('companion:manifest').then(setManifest);
    void pet.invoke('prefs:get').then(setPrefs);
    const offs = [
      pet.on('prefs:changed', (p) => {
        setPrefs(p);
        void pet.invoke('companion:manifest').then(setManifest);
      }),
      pet.on('mission:state', setMission),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const lastSuggestion = useRef(0);
  // React to positive engagement events (gamification, milestones, previews).
  useEffect(() => {
    const off = pet.on('companion:event', (e: CompanionEvent) => {
      if (e.type === 'alert.active') {
        setQuiet(e.active);
        setPanel('none');
        setBubble(e.active ? 'Something needs your attention in ORBITAL.' : null);
        return;
      }
      lastInteraction.current = Date.now();
      const celebrate = (cat: keyof Messages, suffix = '') => {
        setPanel('none'); // make sure the celebration message is visible
        dispatch({ type: 'play', anim: 'celebrate' });
        dispatch({ type: 'celebrated' });
        say(cat, suffix);
      };
      switch (e.type) {
        case 'objective.completed':
          return celebrate('dailyMission');
        case 'cognitive.achievement':
          return celebrate('cognitive');
        case 'recovery.completed':
          return celebrate('recovery');
        case 'rest.logged':
          return celebrate('rest'); // rest is celebrated exactly like activity
        case 'milestone.reached':
          return celebrate('milestone', ` (Day ${e.day})`);
        case 'toy.played':
          setPanel('none');
          dispatch({ type: 'play', anim: 'celebrate' });
          setBubble(`Wheee — the ${e.title.toLowerCase()}! Thank you!`);
          return;
        case 'mission.suggested':
          // Gentle and rare: only with reminders on, and at most once every 20 minutes. Never urgent, never guilt.
          if (prefs?.pet.remindersEnabled && Date.now() - lastSuggestion.current > 20 * 60_000) {
            lastSuggestion.current = Date.now();
            dispatch({ type: 'play', anim: 'bounce' });
            setBubble(`Optional idea for today: “${e.title}”. Only if it sounds nice!`);
          }
          return;
        case 'break.suggested':
          if (prefs?.pet.remindersEnabled) {
            dispatch({ type: 'play', anim: 'bounce' });
            say('breakSuggestion');
          }
          return;
      }
    });
    return off;
  }, [say, prefs?.pet.remindersEnabled]);

  // One-shot animations settle back to idle (or sleep).
  useEffect(() => {
    if (!manifest || s.anim === 'idle' || s.anim === 'sleep') return;
    const def = manifest.animations[s.anim];
    const ms = def?.kind === 'still' ? (def.durationMs ?? 900) : 1200;
    const t = setTimeout(() => dispatch({ type: 'settle' }), ms);
    return () => clearTimeout(t);
  }, [s.anim, manifest]);

  // Occasional idle bounce and gentle auto-nap after a long quiet spell.
  useEffect(() => {
    if (!manifest) return;
    const every = manifest.interactions.idleBounceEverySec * 1000;
    const t = setInterval(() => {
      const idleFor = Date.now() - lastInteraction.current;
      const napAfter = manifest.interactions.autoSleepAfterMin * 60_000;
      if (napAfter > 0 && idleFor > napAfter && !s.asleep && panel === 'none') {
        dispatch({ type: 'sleep' });
        return;
      }
      if (!s.asleep && s.anim === 'idle') {
        const r = Math.random();
        if (r < 0.4) dispatch({ type: 'play', anim: 'bounce' });
        else if (r < 0.65) dispatch({ type: 'play', anim: 'curious' }); // curious head tilt
      }
    }, every / 2);
    return () => clearInterval(t);
  }, [manifest, s.asleep, s.anim, panel]);

  useEffect(() => {
    if (!bubble || quiet) return;
    const t = setTimeout(() => setBubble(null), 4800);
    return () => clearTimeout(t);
  }, [bubble, quiet]);

  // Close menus when the user clicks elsewhere on the desktop (the chat stays open until closed).
  useEffect(() => {
    const onBlur = () => setPanel((p) => (p === 'chat' ? p : 'none'));
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // ── Hit-testing: only the companion and its panels capture the mouse ───────
  const setInteractive = (on: boolean) => void pet.invoke('companion:setInteractive', on && interactive);
  const onEnter = () => {
    hovering.current = true;
    setInteractive(true);
  };
  const onLeave = () => {
    hovering.current = false;
    if (!drag.current) setInteractive(false);
  };

  // ── Click vs drag ──────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !interactive) return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    drag.current = { x: e.screenX, y: e.screenY, moved: 0, pending: { dx: 0, dy: 0 }, raf: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x;
    const dy = e.screenY - d.y;
    d.x = e.screenX;
    d.y = e.screenY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    d.pending.dx += dx;
    d.pending.dy += dy;
    if (d.moved >= DRAG_THRESHOLD && !d.raf) {
      d.raf = requestAnimationFrame(() => {
        const cur = drag.current;
        if (!cur) return;
        const { dx: px, dy: py } = cur.pending;
        cur.pending = { dx: 0, dy: 0 };
        cur.raf = 0;
        if (px || py) void pet.invoke('companion:move', { dx: Math.round(px), dy: Math.round(py) });
      });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    lastInteraction.current = Date.now();
    if (d.moved < DRAG_THRESHOLD) {
      if (s.asleep) {
        // Clicking a napping companion just wakes it (the wake message stays visible).
        dispatch({ type: 'wake' });
        say('wake');
        setPanel('none');
      } else {
        dispatch({ type: 'play', anim: 'react' });
        setPanel((p) => (p === 'none' ? 'menu' : 'none'));
      }
    } else void pet.invoke('companion:dragEnd');
    if (!hovering.current) setInteractive(false);
  };

  // ── Menu actions ───────────────────────────────────────────────────────────
  const run = (a: CompanionAction) => {
    lastInteraction.current = Date.now();
    setPanel(a === 'status' ? 'status' : a === 'chat' ? 'chat' : 'none');
    switch (a) {
      case 'chat':
        return;
      case 'hello':
        dispatch({ type: 'play', anim: 'react' });
        return say('hello');
      case 'celebrate':
        dispatch({ type: 'play', anim: 'celebrate' });
        dispatch({ type: 'celebrated' });
        return say('celebrate');
      case 'sleep':
        dispatch({ type: 'sleep' });
        return say('sleep');
      case 'wake':
        dispatch({ type: 'wake' });
        return say('wake');
      case 'open-dashboard':
        return void pet.invoke('app:focusDashboard');
      case 'hide':
        return void pet.invoke('companion:setVisible', false);
      case 'status':
        return;
    }
  };

  if (!manifest) return null;
  const menu = manifest.interactions.menu.filter((a) => (s.asleep ? a !== 'sleep' : a !== 'wake'));

  return (
    <div className="flex h-full w-full flex-col items-center justify-end pb-3" data-state={s.anim} data-asleep={s.asleep}>
      <div className="flex w-full flex-col items-center gap-2 px-3">
        {bubble && panel === 'none' && (
          <div
            data-testid="bubble"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onClick={quiet ? () => void pet.invoke('app:focusDashboard') : undefined}
            className="companion-bubble pet-bubble relative max-w-[240px] rounded-2xl border border-line bg-surface px-3.5 py-2 text-center text-[13px] leading-[18px] font-medium text-ink"
          >
            {bubble}
            <span className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b border-line bg-surface" />
          </div>
        )}

        {panel === 'menu' && interactive && (
          <div role="menu" aria-label={`${name} menu`} data-testid="menu" onMouseEnter={onEnter} onMouseLeave={onLeave} className="companion-panel w-[272px] overflow-hidden rounded-2xl border border-line bg-surface py-1.5 text-[13px] text-ink">
            <p className="px-3.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{name}</p>
            {menu.map((a) => {
              const { label, icon: Icon } = ACTIONS[a];
              return (
                <button key={a} role="menuitem" data-action={a} onClick={() => run(a)} className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left hover:bg-surface-2">
                  <Icon size={15} strokeWidth={1.75} className="text-ink-3" />
                  {label.replace('Mochi', name)}
                </button>
              );
            })}
          </div>
        )}

        {panel === 'chat' && (
          <div onMouseEnter={onEnter} onMouseLeave={onLeave}>
            <ChatPanel name={name} onClose={() => setPanel('none')} onUrgent={() => setQuiet(true)} />
          </div>
        )}

        {panel === 'status' && (
          <div data-testid="status" onMouseEnter={onEnter} onMouseLeave={onLeave} className="companion-panel w-[272px] rounded-2xl border border-line bg-surface p-3.5 text-[12px] leading-[18px] text-ink">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold">{name}</p>
              <button onClick={() => setPanel('none')} className="text-ink-3 hover:text-ink" aria-label="Close status">
                ✕
              </button>
            </div>
            <dl className="space-y-1">
              <Row k="Mood" v={s.asleep ? 'Napping peacefully' : 'Awake and curious'} />
              <Row k="Mission day" v={mission ? `${mission.day} of 180` : '—'} />
              <Row k="Celebrations" v={`${s.celebrations} this session`} />
              <Row k="Reminders" v={prefs?.pet.remindersEnabled ? 'Gentle, on' : 'Off'} />
              <Row k="Personality" v={manifest.personality.traits.slice(0, 3).join(', ')} />
            </dl>
          </div>
        )}
      </div>

      <div
        data-testid="companion"
        role="button"
        aria-label={`${name}. Click for menu, drag to move.`}
        aria-haspopup="menu"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          if (interactive) setPanel('menu');
        }}
        className="mt-1 touch-none select-none"
      >
        <CompanionSprite manifest={manifest} state={s.anim} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
