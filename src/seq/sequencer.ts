// sequencer.ts — lookahead scheduler on a shared 16th-note clock. Each lane can pick its
// OWN odd meter (変拍子): it walks its own bar cycle independently, so voices in e.g. 7/8,
// 5/8 and 9/8 run at once and phase against each other = per-voice polymeter. Lanes set to
// "FOLLOW" ride the global groove selected in the transport.
import { type Groove, type Bar, BARS, GROOVES, barUnits, downbeats, euclid } from "./meter";
import { WORLD_PATTERNS, DEFAULT_WORLD } from "./world";
import { type Lane, LANES } from "../audio/voices";

export type LaneMode = "DOWNBEAT" | "EUCLID" | "POLY" | "WORLD" | "OFF";
export type Combine = "OR" | "AND" | "XOR";

// one rhythm generator inside a voice. A voice can stack several of these in parallel.
export interface Layer {
  mode: LaneMode;
  meter: string;   // "FOLLOW" (global groove) or a BARS/GROOVES key → this layer's own 変拍子
  k: number;       // EUCLID: onsets per bar · POLY: onsets per cycle
  len: number;     // POLY: cycle length in units
  rot: number;     // rotation
  pattern: string; // WORLD: name of the ethnic rhythm cell
}

// a voice: one or more parallel layers combined, plus trigger probability
export interface LaneCfg {
  layers: Layer[];
  combine: Combine; // OR = union, AND = intersection, XOR = exclusive
  prob: number;     // 0..1 trigger probability
}

// one base-unit slot in a resolved meter timeline
export interface TLEntry { barIndex: number; unitInBar: number; units: number; downs: Set<number>; }

export const FOLLOW = "FOLLOW";
// meter options offered to each layer (single bars + chained grooves)
export const METERS: string[] = [FOLLOW, ...Object.keys(BARS), ...Object.keys(GROOVES)];

const W = DEFAULT_WORLD;
const ly = (mode: LaneMode, meter: string, k: number, len: number, rot: number, pattern = W): Layer =>
  ({ mode, meter, k, len, rot, pattern });
export const DEFAULT_LANES: Record<Lane, LaneCfg> = {
  kick:  { layers: [ly("DOWNBEAT", FOLLOW, 3, 8, 0)],  combine: "OR", prob: 1 },
  sub:   { layers: [ly("POLY", FOLLOW, 1, 6, 0)],      combine: "OR", prob: 1 },
  drag:  { layers: [ly("POLY", FOLLOW, 1, 7, 3)],      combine: "OR", prob: 1 },
  sus:   { layers: [ly("POLY", FOLLOW, 1, 12, 0)],     combine: "OR", prob: 1 },
  cak:   { layers: [ly("WORLD", FOLLOW, 3, 8, 0, "Cinquillo")], combine: "OR", prob: 0.7 },
  brush: { layers: [ly("WORLD", FOLLOW, 3, 8, 0, "Jazz comp")], combine: "OR", prob: 0.8 },
  ride:  { layers: [ly("WORLD", FOLLOW, 3, 8, 0, "Jazz ride")], combine: "OR", prob: 0.9 },
  roll:  { layers: [ly("POLY", FOLLOW, 1, 6, 0)],      combine: "OR", prob: 0.8 },
  click: { layers: [ly("EUCLID", FOLLOW, 4, 8, 2)],    combine: "OR", prob: 1 },
  tick:  { layers: [ly("POLY", FOLLOW, 3, 8, 0)],      combine: "OR", prob: 0.85 },
  noise: { layers: [ly("EUCLID", FOLLOW, 2, 8, 1)],    combine: "OR", prob: 0.7 },
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

// pure hit rule for one layer — shared by scheduler and grid so they never disagree
export function layerHit(l: Layer, units: number, downs: Set<number>, unitInBar: number, globalUnit: number): boolean {
  switch (l.mode) {
    case "OFF": return false;
    case "DOWNBEAT": return downs.has(unitInBar);
    case "EUCLID": return euclid(l.k, units, l.rot)[unitInBar];
    case "POLY": {
      const L = Math.max(1, Math.round(l.len));
      return euclid(l.k, L, l.rot)[((globalUnit % L) + L) % L];
    }
    case "WORLD": {
      const pat = WORLD_PATTERNS[l.pattern] ?? WORLD_PATTERNS[DEFAULT_WORLD];
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
  lookahead = 0.5; // scheduled ahead of the clock — covers background timer jitter

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

  // resolved timeline for a meter name (cached; FOLLOW tracks the live global groove)
  timelineForMeter(name: string): TLEntry[] {
    if (name === FOLLOW) return this.globalTL;
    let tl = this.tlCache.get(name);
    if (!tl) { tl = buildTimeline(this.resolveMeter(name)); this.tlCache.set(name, tl); }
    return tl;
  }

  entryForMeter(name: string, globalUnit: number): TLEntry {
    const tl = this.timelineForMeter(name);
    return tl[((globalUnit % tl.length) + tl.length) % tl.length];
  }

  // combined hit of all a voice's parallel layers (no probability/gate) — for scheduler & grid
  laneHitAt(lane: Lane, gu: number): boolean {
    const c = this.lanes[lane];
    const active = c.layers.filter((l) => l.mode !== "OFF");
    if (active.length === 0) return false;
    const hits = active.map((l) => {
      const e = this.entryForMeter(l.meter, gu);
      return layerHit(l, e.units, e.downs, e.unitInBar, gu);
    });
    if (c.combine === "AND") return hits.every(Boolean);
    if (c.combine === "XOR") return hits.filter(Boolean).length % 2 === 1;
    return hits.some(Boolean); // OR
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
      const manual = this.laneHitAt(lane, gu); // union/AND/XOR of the voice's parallel layers

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
      // accent on the primary layer's OWN downbeats / bar start, then modulated by the field
      const e = this.entryForMeter(c.layers[0].meter, gu);
      let vel = 0.62;
      if (e.downs.has(e.unitInBar)) vel = 0.78 + p.accent * 0.3;
      if (e.unitInBar === 0) vel = 0.9 + p.accent * 0.1;
      vel = Math.min(1, vel * (1 - p.fieldAmt + p.fieldAmt * (0.4 + 0.9 * mag)));
      this.deps.fire(lane, baseTime + swing + human, vel, this.lanePan(lane));
    }
  }
}
