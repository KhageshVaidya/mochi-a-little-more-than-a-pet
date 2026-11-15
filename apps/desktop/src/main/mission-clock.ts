import { EventEmitter } from 'node:events';
import { MISSION_LENGTH_DAYS, MissionState, type MissionCommand } from '@orbital/contracts';
import { CREW } from '@orbital/simulation';
import type { Storage } from './storage';

// v2: crew selection added. A new key means older persisted state is ignored rather than mis-parsed.
const KEY = 'mission.v2';
/** Opens on a meaningful mid-mission day so every scenario already shows its pattern. */
export const DEFAULT_DAY = 90;
const DEFAULT_STATE: MissionState = {
  day: DEFAULT_DAY,
  playing: false,
  speed: 15,
  astronautId: 'CM-01',
  scenario: CREW['CM-01'].profile.scenario,
  seed: CREW['CM-01'].profile.seed,
  synthetic: true,
};

/**
 * The single mission clock for every window. Speed is mission-days per real minute.
 * Workstream B's simulation consumes (scenario, seed, day) from here.
 */
export class MissionClock extends EventEmitter<{ changed: [MissionState] }> {
  private state: MissionState;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly storage: Storage) {
    super();
    const parsed = MissionState.safeParse(storage.getJSON(KEY));
    // Never resume in a playing state after restart.
    this.state = parsed.success ? { ...parsed.data, playing: false } : DEFAULT_STATE;
  }

  get(): MissionState {
    return this.state;
  }

  command(cmd: MissionCommand): MissionState {
    switch (cmd.type) {
      case 'play':
        if (this.state.day >= MISSION_LENGTH_DAYS - 1) this.update({ day: 0 });
        this.update({ playing: true });
        break;
      case 'pause':
        this.update({ playing: false });
        break;
      case 'reset':
        this.update({ day: 0, playing: false });
        break;
      case 'select': {
        // Switching crew member keeps the mission day so profiles can be compared at the same point.
        const p = CREW[cmd.astronautId].profile;
        this.update({ astronautId: p.id, scenario: p.scenario, seed: p.seed });
        break;
      }
      case 'seek':
        this.update({ day: cmd.day });
        break;
      case 'speed':
        this.update({ speed: cmd.speed });
        break;
    }
    this.reschedule();
    return this.state;
  }

  private reschedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (!this.state.playing) return;
    const msPerDay = 60_000 / this.state.speed;
    this.timer = setInterval(() => {
      if (this.state.day >= MISSION_LENGTH_DAYS - 1) {
        this.update({ playing: false });
        this.reschedule();
        return;
      }
      this.update({ day: this.state.day + 1 });
    }, msPerDay);
  }

  private update(patch: Partial<MissionState>): void {
    this.state = MissionState.parse({ ...this.state, ...patch });
    this.storage.setJSON(KEY, this.state);
    this.emit('changed', this.state);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
