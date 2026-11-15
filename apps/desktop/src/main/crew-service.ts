import type { ActivityKind, AstronautId, CrewActivity, CrewBoard, CrewStatus, CrewStatusOption } from '@orbital/contracts';
import { CREW, CREW_IDS, hashSeed } from '@orbital/simulation';
import type { GameService } from './game-service';
import type { Storage } from './storage';

/**
 * Voluntary crew wellbeing & shared activities (Phase 2 D), main process.
 *  - Only statuses people CHOOSE to share are visible, and only to the audience they chose.
 *  - The other four crew members are synthetic: their statuses and replies are simulated deterministically
 *    and labelled 'simulation'. Nothing is inferred from anyone's data or silence.
 *  - Companion messages carry activity logistics only.
 *  - Participation is aggregated at team level; it is never attributed to individuals or linked to health.
 */

const ACTIVITY_TITLE: Record<ActivityKind, string> = {
  puzzle: 'Puzzle challenge',
  'cognitive-game': 'Brain-game duel (just for fun)',
  exercise: 'Exercise together',
  'rec-evening': 'Recreational evening',
  meal: 'Shared meal',
  conversation: 'A good conversation',
};
/** Synthetic crewmates' companions (for companion-to-companion invitations). */
const CREW_COMPANION: Record<AstronautId, { name: string; line: (who: string, what: string) => string }> = {
  'CM-01': { name: 'Comet', line: (who, what) => `Woof! I heard someone is looking for a ${what} partner — ${who} is in!` },
  'CM-02': { name: 'Nova', line: (who, what) => `Mrrp. ${who} would enjoy a ${what}. I’ll allow it.` },
  'CM-03': { name: 'Zib', line: (who, what) => `Bleep! ${who} accepted the ${what}. Fascinating teamwork!` },
  'CM-04': { name: 'Mochi', line: (who, what) => `Yay! ${who} said yes to the ${what}!` },
  'CM-05': { name: 'Comet', line: (who, what) => `Arf! ${who} is up for the ${what}!` },
};
const firstName = (id: AstronautId) => CREW[id].profile.name.split(' ')[0]!;

export class CrewService {
  constructor(
    private readonly storage: Storage,
    private readonly game: GameService,
  ) {}

  /** Deterministic simulated status for a synthetic crewmate (no inference from their health data). */
  private simulatedStatus(id: AstronautId, day: number): CrewStatus | null {
    const r = hashSeed(id, 'crew-status', day) % 100;
    const status: CrewStatusOption | null = r < 35 ? null : r < 60 ? 'activity' : r < 82 ? 'company' : 'space';
    return status ? { subjectId: id, day, status, audience: 'crew', source: 'simulation' } : null;
  }

  private userStatuses(): CrewStatus[] {
    return this.storage.getJSON<CrewStatus[]>('crew.statuses') ?? [];
  }
  private activities(): CrewActivity[] {
    return this.storage.getJSON<CrewActivity[]>('crew.activities') ?? [];
  }

  /** A status someone actually set takes precedence; otherwise synthetic crewmates get a simulated one. */
  private statusOf(id: AstronautId, day: number, me: AstronautId): CrewStatus | null {
    const set = this.userStatuses().find((s) => s.subjectId === id && s.day === day);
    if (set || id === me) return set ?? null;
    return this.simulatedStatus(id, day);
  }

  private visibleTo(s: CrewStatus, me: AstronautId): boolean {
    if (s.subjectId === me) return true;
    if (s.audience === 'crew') return true;
    if (s.audience === 'person') return s.audiencePersonId === me;
    return false; // 'crew-support' statuses are not shown to crewmates
  }

  board(me: AstronautId, day: number): CrewBoard {
    const statuses = CREW_IDS.map((id) => this.statusOf(id, day, me)).filter((s): s is CrewStatus => !!s);
    const visible = statuses.filter((s) => this.visibleTo(s, me));
    this.ensureIncomingInvitation(me, day);
    const activities = this.activities().filter((a) => (a.proposedBy === me || a.invitees.includes(me)) && a.day <= day && a.day > day - 7);

    // Suggest only people who said they're open; never anyone who asked for personal space.
    const open = visible.filter((s) => s.subjectId !== me && (s.status === 'activity' || s.status === 'company'));
    const pickIdx = open.length ? hashSeed(me, 'suggest', day) % open.length : -1;
    const who = pickIdx >= 0 ? open[pickIdx]! : null;
    const kinds: ActivityKind[] = ['puzzle', 'cognitive-game', 'meal', 'rec-evening', 'exercise', 'conversation'];
    const kind = kinds[day % kinds.length]!;
    const suggestion = who
      ? { text: `Should we invite ${firstName(who.subjectId)} for a little ${ACTIVITY_TITLE[kind].toLowerCase()}? They said they’re ${who.status === 'activity' ? 'open to an activity' : 'up for company'} today.`, invitee: who.subjectId, kind }
      : null;

    return { day, me, myStatus: statuses.find((s) => s.subjectId === me) ?? null, visibleStatuses: visible, activities, suggestion, participation: this.participation(day) };
  }

  setStatus(me: AstronautId, day: number, status: CrewStatusOption | null, audience: CrewStatus['audience'], audiencePersonId?: AstronautId): CrewBoard {
    const rest = this.userStatuses().filter((s) => !(s.subjectId === me && s.day === day));
    if (status) rest.push({ subjectId: me, day, status, audience: status === 'support' ? audience : 'crew', ...(audiencePersonId && status === 'support' ? { audiencePersonId } : {}), source: 'user' });
    this.storage.setJSON('crew.statuses', rest.slice(-400));
    return this.board(me, day);
  }

  propose(me: AstronautId, day: number, kind: ActivityKind, invitees: AstronautId[]): CrewBoard {
    // Consent rule: people who asked for personal space today are never invited.
    const allowed = invitees.filter((id) => id !== me && this.statusOf(id, day, me)?.status !== 'space');
    if (!allowed.length) throw new Error('Nobody available to invite (personal space is respected).');
    const responses: CrewActivity['responses'] = { [me]: 'accepted' };
    const messages: CrewActivity['companionMessages'] = [];
    for (const id of allowed) {
      const st = this.statusOf(id, day, me)?.status;
      const yes = (st === 'activity' || st === 'company') && hashSeed(id, 'accept', day, kind) % 10 < 8;
      responses[id] = yes ? 'accepted' : 'declined';
      if (yes) messages.push({ from: CREW_COMPANION[id].name, text: CREW_COMPANION[id].line(firstName(id), ACTIVITY_TITLE[kind].toLowerCase()) });
    }
    const act: CrewActivity = { id: `act:${me}:${day}:${Date.now()}`, day, kind, title: ACTIVITY_TITLE[kind], proposedBy: me, invitees: allowed, responses, companionMessages: messages };
    this.storage.setJSON('crew.activities', [...this.activities(), act].slice(-300));
    this.recordJoins(act);
    return this.board(me, day);
  }

  respond(me: AstronautId, day: number, activityId: string, accept: boolean): CrewBoard {
    const acts = this.activities();
    const a = acts.find((x) => x.id === activityId);
    if (!a || !a.invitees.includes(me)) throw new Error('Unknown invitation');
    a.responses[me] = accept ? 'accepted' : 'declined';
    this.storage.setJSON('crew.activities', acts);
    if (accept) this.recordJoins({ ...a, responses: { [me]: 'accepted' } });
    return this.board(me, day);
  }

  /** One simulated invitation per day from a synthetic crewmate who said they're open to an activity. */
  private ensureIncomingInvitation(me: AstronautId, day: number): void {
    const acts = this.activities();
    if (acts.some((a) => a.day === day && a.invitees.includes(me) && a.proposedBy !== me)) return;
    const host = CREW_IDS.filter((id) => id !== me).find((id) => this.simulatedStatus(id, day)?.status === 'activity');
    if (!host || hashSeed(host, 'invite', day) % 3 !== 0) return;
    const kind: ActivityKind = (['puzzle', 'meal', 'rec-evening', 'cognitive-game'] as const)[day % 4]!;
    acts.push({
      id: `act:${host}:${day}:invite`,
      day,
      kind,
      title: ACTIVITY_TITLE[kind],
      proposedBy: host,
      invitees: [me],
      responses: { [host]: 'accepted', [me]: 'pending' },
      companionMessages: [{ from: CREW_COMPANION[host].name, text: `Psst! ${firstName(host)} is looking for company for a ${ACTIVITY_TITLE[kind].toLowerCase()}. No pressure at all!` }],
    });
    this.storage.setJSON('crew.activities', acts.slice(-300));
  }

  private recordJoins(a: CrewActivity): void {
    for (const [id, r] of Object.entries(a.responses)) {
      if (r !== 'accepted') continue;
      this.storage.insertEngagement({ id: `crew:${a.id}:${id}`, subjectId: id, missionDay: a.day, kind: 'crew-activity.joined', amount: 1, source: id === a.proposedBy || a.invitees.length === 1 ? 'user' : 'simulation', ref: a.id });
    }
  }

  /** Team-level participation for the last 4 weeks; a gentle suggestion if engagement dips vs the crew's own earlier weeks. */
  private participation(day: number): CrewBoard['participation'] {
    const events = CREW_IDS.flatMap((id) => this.game.allEvents(id));
    const weeks: CrewBoard['participation']['weeks'] = [];
    const thisWeek = day - (day % 7);
    for (let w = 3; w >= 0; w--) {
      const start = thisWeek - w * 7;
      if (start < 0) continue;
      const inWeek = events.filter((e) => e.missionDay >= start && e.missionDay < start + 7 && e.missionDay <= day);
      weeks.push({ weekStart: start, activities: inWeek.filter((e) => e.kind === 'crew-activity.joined').length, checkins: inWeek.filter((e) => e.kind === 'checkin.completed').length });
    }
    const earlier = events.filter((e) => e.kind === 'checkin.completed' && e.missionDay >= 10 && e.missionDay < Math.max(10, thisWeek - 14));
    const earlierWeeks = Math.max(1, (Math.max(10, thisWeek - 14) - 10) / 7);
    const recent = weeks.slice(-2).reduce((s, w) => s + w.checkins, 0) / Math.max(1, weeks.slice(-2).length);
    const baseline = earlier.length / earlierWeeks;
    const suggestion = thisWeek >= 42 && baseline > 0 && recent < baseline * 0.8 ? 'Team check-ins have been a bit quieter lately. A relaxed team get-together might be nice this week — entirely optional.' : null;
    return { weeks, suggestion };
  }
}
