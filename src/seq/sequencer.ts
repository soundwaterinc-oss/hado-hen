// sequencer.ts — lookahead scheduler on a shared 16th-note clock. Each lane can pick its
// OWN odd meter (変拍子): it walks its own bar cycle independently, so voices in e.g. 7/8,
// 5/8 and 9/8 run at once and phase against each other = per-voice polymeter. Lanes set to
// "FOLLOW" ride the global groove selected in the transport.
import { type Groove, type Bar, BARS, GROOVES, barUnits, downbeats, euclid } from "./meter";
import { WORLD_PATTERNS, DEFAULT_WORLD } from "./world";
import { type Lane, LANES } from "../audio/voices";

export type LaneMode = "DOWNBEAT" | "EUCLID" | "POLY" | "WORLD" | "OFF";

export interface LaneCfg {
  meter: string;   // "FOLLOW" (global groove) or a BARS/GROOVES key → this lane's own 変拍子
  mode: LaneMode;
  k: number;       // EUCLID: onsets per bar · POLY: onsets per cycle
  len: number;     // POLY: cycle length in units
  rot: number;     // rotation
  prob: number;    // 0..1 trigger probability
  pattern: string; // WORLD: name of the ethnic rhythm cell
}

// one base-unit slot in a resolved meter timeline
export interface TLEntry { barIndex: number; unitInBar: number; units: number; downs: Set<number>; }

export const FOLLOW = "FOLLOW";
// meter options offered to each lane (single bars + chained grooves)
export const METERS: string[] = [FOLLOW, ...Object.keys(BARS), ...Object.keys(GROOVES)];

const W = DEFAULT_WORLD;
export const DEFAULT_LANES: Record<Lane, LaneCfg> = {
  kick:  { meter: FOLLOW, mode: "DOWNBEAT", k: 3, len: 8,  rot: 0, prob: 1,    pattern: W },
  sub:   { meter: FOLLOW, mode: "POLY",     k: 1, len: 6,  rot: 0, prob: 1,    pattern: W },
  drag:  { meter: FOLLOW, mode: "POLY",     k: 1, len: 7,  rot: 3, prob: 1,    pattern: W },
  sus:   { meter: FOLLOW, mode: "POLY",     k: 2, len: 10, rot: 0, prob: 1,    pattern: W },
  knock: { meter: FOLLOW, mode: "POLY",     k: 3, len: 5,  rot: 0, prob: 1,    pattern: W },
  roll:  { meter: FOLLOW, mode: "POLY",     k: 2, len: 4,  rot: 0, prob: 0.9,  pattern: W },
  click: { meter: FOLLOW, mode: "EUCLID",   k: 6, len: 8,  rot: 2, prob: 1,    pattern: W },
  tick:  { meter: FOLLOW, mode: "POLY",     k: 5, len: 7,  rot: 0, prob: 0.95, pattern: W },
  noise: { meter: FOLLOW, mode: "EUCLID",   k: 3, len: 8,  rot: 1, prob: 0.85, pattern: W },
  beep:  { meter: FOLLOW, mode: "POLY",     k: 1, len: 12, rot: 5, prob: 0.8,  pattern: W },
};

export type GateMode = "MANUAL" | "QUANTUM" | "AND" | "OR";

export interface SeqParams {
  bpm: number;
  swing: number;      // 0..1 push of odd units
  humanize: number;   // seconds of jitter
  accent: number;     // 0..1 extra velocity on downbeats
  gateMode: GateMode; // how the quantum field |ψ|² combines with the meter hits
  gateThresh: number; // 0..1 |ψ|² threshold that opens the quantum gate
  density: number;    // 0..1 probability a quantum-gated slot actually fires
  fieldAmt: number;   // 0..1 how much |ψ|² modulates velocity
}

export interface SeqDeps {
  now: () => number;
  fire: (lane: Lane, time: number, vel: number, pan: number) => void;
  probe: (pos01: number) => number; // |ψ|² of the HADŌ field at a lane's probe position
  onStep: (barIndex: number, unitInBar: number, units: number, isDownbeat: boolean, time: number) => void;
}

function buildTimeline(g: Groove): TLEntry[] {
  const out: TLEntry[] = [];
  g.forEach((bar: Bar, bi: number) => {
    const units = barUnits(bar);
    const downs = new Set(downbeats(bar));
    for (let u = 0; u < units; u++) out.push({ barIndex: bi, unitInBar: u, units, downs });
  });
  return out.length ? out : buildTimeline([[4, 4, 4, 4]]);
}

// pure hit rule — shared by the scheduler and the grid so they never disagree
export function laneHit(c: LaneCfg, units: number, downs: Set<number>, unitInBar: number, globalUnit: number): boolean {
  switch (c.mode) {
    case "OFF": return false;
    case "DOWNBEAT": return downs.has(unitInBar);
    case "EUCLID": return euclid(c.k, units, c.rot)[unitInBar];
    case "POLY": {
      const L = Math.max(1, Math.round(c.len));
      return euclid(c.k, L, c.rot)[((globalUnit % L) + L) % L];
    }
    case "WORLD": {
      const pat = WORLD_PATTERNS[c.pattern] ?? WORLD_PATTERNS[DEFAULT_WORLD];
      const L = pat.length;
      return pat[((globalUnit % L) + L) % L];
    }
  }
}

export class Sequencer {
  running = false;
  groove: Groove;
  lanes: Record<Lane, LaneCfg> = structuredClone(DEFAULT_LANES);
  globalUnit = 0;
  private globalTL: TLEntry[];
  private tlCache = new Map<string, TLEntry[]>();
  private nextTime = 0;
  private lookahead = 0.3;

  constructor(groove: Groove, private deps: SeqDeps, private getParams: () => SeqParams) {
    this.groove = groove;
    this.globalTL = buildTimeline(groove);
  }

  setGroove(g: Groove): void {
    this.groove = g.length ? g : [[4, 4, 4, 4]];
    this.globalTL = buildTimeline(this.groove);
  }

  toggle(on?: boolean): void {
    this.running = on ?? !this.running;
    if (this.running) { this.globalUnit = 0; this.nextTime = this.deps.now() + 0.08; }
  }

  private resolveMeter(name: string): Groove {
    if (name === FOLLOW) return this.groove;
    if (GROOVES[name]) return GROOVES[name];
    if (BARS[name]) return [BARS[name]];
    return this.groove;
  }

  // resolved timeline for a lane's chosen meter (cached; FOLLOW tracks the live global groove)
  timelineFor(lane: Lane): TLEntry[] {
    const name = this.lanes[lane].meter;
    if (name === FOLLOW) return this.globalTL;
    let tl = this.tlCache.get(name);
    if (!tl) { tl = buildTimeline(this.resolveMeter(name)); this.tlCache.set(name, tl); }
    return tl;
  }

  entryFor(lane: Lane, globalUnit: number): TLEntry {
    const tl = this.timelineFor(lane);
    return tl[((globalUnit % tl.length) + tl.length) % tl.length];
  }

  get globalEntry(): TLEntry {
    const tl = this.globalTL;
    return tl[((this.globalUnit % tl.length) + tl.length) % tl.length];
  }

  private lanePan(lane: Lane): number {
    const i = LANES.indexOf(lane);
    return ((i / (LANES.length - 1)) * 2 - 1) * 0.55;
  }
  // each lane samples the field at a spread-out probe position
  private laneProbePos(lane: Lane): number {
    return LANES.indexOf(lane) / (LANES.length - 1);
  }

  schedule(): void {
    if (!this.running) return;
    const p = this.getParams();
    const now = this.deps.now();
    const unitDur = 60 / p.bpm / 4; // 16th-note base unit
    while (this.nextTime < now + this.lookahead) {
      this.fireUnit(this.globalUnit, this.nextTime, p, unitDur);
      this.nextTime += unitDur;
      this.globalUnit++;
    }
  }

  private fireUnit(gu: number, baseTime: number, p: SeqParams, unitDur: number): void {
    // transport/reference display follows the global groove
    const g = this.globalTL[((gu % this.globalTL.length) + this.globalTL.length) % this.globalTL.length];
    this.deps.onStep(g.barIndex, g.unitInBar, g.units, g.downs.has(g.unitInBar), baseTime);

    const swing = (gu % 2 === 1) ? p.swing * unitDur * 0.5 : 0;

    for (const lane of LANES) {
      const c = this.lanes[lane];
      if (c.mode === "OFF") continue;
      const e = this.entryFor(lane, gu);
      const manual = laneHit(c, e.units, e.downs, e.unitInBar, gu);

      // HADŌ quantum gate: |ψ|² at this lane's probe opens the gate
      const mag = this.deps.probe(this.laneProbePos(lane));
      const gateOpen = mag >= p.gateThresh;
      const quantum = gateOpen && Math.random() < p.density;
      let hit = false;
      switch (p.gateMode) {
        case "MANUAL": hit = manual; break;
        case "QUANTUM": hit = quantum; break;
        case "AND": hit = manual && gateOpen; break;
        case "OR": hit = manual || quantum; break;
      }
      if (!hit) continue;
      if (Math.random() > c.prob) continue;

      const human = (Math.random() * 2 - 1) * p.humanize;
      // accent on the lane's OWN downbeats / bar start, then modulated by the field
      let vel = 0.62;
      if (e.downs.has(e.unitInBar)) vel = 0.78 + p.accent * 0.3;
      if (e.unitInBar === 0) vel = 0.9 + p.accent * 0.1;
      vel = Math.min(1, vel * (1 - p.fieldAmt + p.fieldAmt * (0.4 + 0.9 * mag)));
      this.deps.fire(lane, baseTime + swing + human, vel, this.lanePan(lane));
    }
  }
}
