// sequencer.ts — lookahead scheduler that walks a Groove (sequence of odd-meter bars)
// one base-unit (16th) at a time. Each lane derives its own hits from a rule that adapts
// to whatever bar length is current, or free-runs in polymeter against the bars.
import { type Groove, barUnits, downbeats, euclid } from "./meter";
import { type Lane, LANES } from "../audio/voices";

export type LaneMode = "DOWNBEAT" | "EUCLID" | "POLY" | "OFF";

export interface LaneCfg {
  mode: LaneMode;
  k: number;      // EUCLID: onsets per bar · POLY: onsets per cycle
  len: number;    // POLY: cycle length in units
  rot: number;    // rotation
  prob: number;   // 0..1 trigger probability
}

export const DEFAULT_LANES: Record<Lane, LaneCfg> = {
  kick:  { mode: "DOWNBEAT", k: 3, len: 8,  rot: 0, prob: 1 },
  sub:   { mode: "POLY",     k: 1, len: 6,  rot: 0, prob: 1 },
  knock: { mode: "POLY",     k: 3, len: 5,  rot: 0, prob: 1 },
  roll:  { mode: "EUCLID",   k: 2, len: 8,  rot: 6, prob: 0.7 },
  click: { mode: "EUCLID",   k: 5, len: 8,  rot: 2, prob: 1 },
  tick:  { mode: "POLY",     k: 5, len: 7,  rot: 0, prob: 0.9 },
  noise: { mode: "EUCLID",   k: 2, len: 8,  rot: 1, prob: 0.8 },
  beep:  { mode: "OFF",      k: 1, len: 8,  rot: 0, prob: 1 },
};

export interface SeqParams {
  bpm: number;
  swing: number;     // 0..1 push of odd units
  humanize: number;  // seconds of jitter
  accent: number;    // 0..1 extra velocity on downbeats
}

export interface SeqDeps {
  now: () => number;
  fire: (lane: Lane, time: number, vel: number, pan: number) => void;
  onStep: (barIndex: number, unitInBar: number, units: number, isDownbeat: boolean, time: number) => void;
}

export class Sequencer {
  running = false;
  groove: Groove;
  lanes: Record<Lane, LaneCfg> = structuredClone(DEFAULT_LANES);
  private barIndex = 0;
  private unitInBar = 0;
  private globalUnit = 0;
  private nextTime = 0;
  private lookahead = 0.3;

  constructor(groove: Groove, private deps: SeqDeps, private getParams: () => SeqParams) {
    this.groove = groove;
  }

  setGroove(g: Groove): void {
    this.groove = g.length ? g : [[4, 4, 4, 4]];
    this.barIndex = 0; this.unitInBar = 0;
  }

  toggle(on?: boolean): void {
    this.running = on ?? !this.running;
    if (this.running) {
      this.barIndex = 0; this.unitInBar = 0; this.globalUnit = 0;
      this.nextTime = this.deps.now() + 0.08;
    }
  }

  // pan spread per lane so the dots scatter across the stereo field
  private lanePan(lane: Lane): number {
    const i = LANES.indexOf(lane);
    return ((i / (LANES.length - 1)) * 2 - 1) * 0.55;
  }

  private hit(lane: Lane, units: number, dbSet: Set<number>): boolean {
    const c = this.lanes[lane];
    switch (c.mode) {
      case "OFF": return false;
      case "DOWNBEAT": return dbSet.has(this.unitInBar);
      case "EUCLID": return euclid(c.k, units, c.rot)[this.unitInBar];
      case "POLY": {
        const L = Math.max(1, Math.round(c.len));
        return euclid(c.k, L, c.rot)[this.globalUnit % L];
      }
    }
  }

  schedule(): void {
    if (!this.running) return;
    const p = this.getParams();
    const now = this.deps.now();
    const unitDur = 60 / p.bpm / 4; // 16th-note base unit
    while (this.nextTime < now + this.lookahead) {
      this.fireUnit(this.nextTime, p, unitDur);
      const bar = this.groove[this.barIndex];
      const units = barUnits(bar);
      this.nextTime += unitDur;
      this.unitInBar++;
      this.globalUnit++;
      if (this.unitInBar >= units) {
        this.unitInBar = 0;
        this.barIndex = (this.barIndex + 1) % this.groove.length;
      }
    }
  }

  private fireUnit(baseTime: number, p: SeqParams, unitDur: number): void {
    const bar = this.groove[this.barIndex];
    const units = barUnits(bar);
    const dbList = downbeats(bar);
    const dbSet = new Set(dbList);
    const isDownbeat = dbSet.has(this.unitInBar);
    const isBarStart = this.unitInBar === 0;
    this.deps.onStep(this.barIndex, this.unitInBar, units, isDownbeat, baseTime);

    // swing: delay every other unit; humanize: tiny symmetric jitter (Ikeda stays near 0)
    const swing = (this.unitInBar % 2 === 1) ? p.swing * unitDur * 0.5 : 0;

    for (const lane of LANES) {
      const c = this.lanes[lane];
      if (!this.hit(lane, units, dbSet)) continue;
      if (Math.random() > c.prob) continue;
      const human = (Math.random() * 2 - 1) * p.humanize;
      let vel = 0.62;
      if (isDownbeat) vel = Math.min(1, 0.78 + p.accent * 0.3);
      if (isBarStart) vel = Math.min(1, 0.9 + p.accent * 0.1);
      this.deps.fire(lane, baseTime + swing + human, vel, this.lanePan(lane));
    }
  }
}
