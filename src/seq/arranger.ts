// arranger.ts — 自動展開. Extends hado-dust's development model: a looping 5-stage narrative
// arc (sparse intro → build → full → BREAK bridge → finale) that pulls voices in/out for
// density ebb & flow (音数の増減), regenerates lane patterns via a natural-function ENGINE,
// and randomly drops in BREAKBEATS. The kick stays the anchor except during a break.
import { LANES, type Lane } from "../audio/voices";
import { METERS, FOLLOW, type LaneMode, type Layer } from "./sequencer";
import type { Sequencer } from "./sequencer";
import { WORLD_NAMES } from "./world";
import { lsysCurve, phyllotaxis, logisticNext } from "./nature";

export type ArrangeEngine = "LSYSTEM" | "PHYLLOTAXIS" | "LOGISTIC" | "FIELD";
export const ARRANGE_ENGINES: ArrangeEngine[] = ["LSYSTEM", "PHYLLOTAXIS", "LOGISTIC", "FIELD"];

export interface ArrangeOpts {
  on: boolean;
  engine: ArrangeEngine;
  sectionBars: number; // regenerate every N global bars
  intensity: number;   // 0..1 mutation strength
  stages: number;      // arc length before it loops
  breakProb: number;   // 0..1 chance a section drops into a breakbeat
}

export interface ArrangeGlobals {
  density: number; gateThresh: number; liqDepth: number; liqRate: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// per-stage voice activity (0 = pulled out, 1 = full), aligned to LANES:
// [kick, sub, drag, sus, cak, knock, brush, ride, roll, click, tick, noise, beep]
interface Stage { energy: number; brk: boolean; act: number[] }
const STAGES: Stage[] = [
  { energy: 0.50, brk: false, act: [1, 1,   0.5, 0.5, 0,   0.4, 0.4, 0.8, 0,   0.6, 0,   0,   0  ] }, // intro: kick+sub+ride (ECM open)
  { energy: 0.72, brk: false, act: [1, 1,   0.7, 0.6, 0.4, 0.8, 0.6, 0.9, 0.4, 0.9, 0.6, 0.3, 0.2] }, // build
  { energy: 0.95, brk: false, act: [1, 1,   0.9, 0.7, 0.7, 1,   0.6, 1,   0.7, 1,   0.9, 0.7, 0.5] }, // full
  { energy: 0.80, brk: true,  act: [1, 0.3, 0.2, 0.2, 1,   1,   0.2, 0.3, 0.9, 1,   1,   0.6, 0.3] }, // BREAK: electronic, ride pulled
  { energy: 1.00, brk: false, act: [1, 1,   1,   0.8, 0.8, 1,   0.5, 0.9, 0.8, 1,   1,   0.8, 0.6] }, // finale
];
const BREAK_ACT = STAGES[3].act;

// breakbeat kits (role → WORLD cell name in world.ts)
const KITS: { kick: string; snare: string; hat: string; ghost: string }[] = [
  { kick: "Break kick 1", snare: "Break snare",       hat: "Break hat",    ghost: "Break ghost" },
  { kick: "Break kick 2", snare: "Break snare ghost", hat: "Break hat 16", ghost: "Break ghost" },
];

export class Arranger {
  bar = 0;
  stage = 0;
  broke = false; // whether the last section was a breakbeat

  notifyBar(o: ArrangeOpts, seq: Sequencer, probe: (p: number) => number, applyGlobal: (g: ArrangeGlobals) => void): void {
    if (!o.on) return;
    this.bar++;
    if (this.bar % Math.max(1, Math.round(o.sectionBars)) === 0) {
      this.stage = (this.stage + 1) % Math.max(1, Math.round(o.stages));
      this.evolve(o, seq, probe, applyGlobal);
    }
  }

  reset(): void { this.bar = 0; this.stage = 0; this.broke = false; }

  private wl = (name: string): Layer[] => [{ mode: "WORLD", meter: FOLLOW, k: 4, len: 8, rot: 0, pattern: name }];

  private applyBreak(seq: Sequencer): void {
    const kit = KITS[Math.floor(Math.random() * KITS.length)];
    const set = (lane: Lane, name: string): void => { seq.lanes[lane].layers = this.wl(name); seq.lanes[lane].combine = "OR"; };
    set("kick", kit.kick);
    set("knock", kit.snare);
    set("cak", kit.snare);
    set("click", kit.hat);
    set("tick", kit.hat);
    set("roll", kit.ghost);
    set("noise", kit.ghost);
    // keep a sparse low pulse for weight, drop the sustained lows
    seq.lanes.sub.layers = [{ mode: "POLY", meter: FOLLOW, k: 1, len: 4, rot: 0, pattern: WORLD_NAMES[0] }];
  }

  private evolve(o: ArrangeOpts, seq: Sequencer, probe: (p: number) => number, applyGlobal: (g: ArrangeGlobals) => void): void {
    const st = STAGES[this.stage % STAGES.length];
    const energy = st.energy;
    const arc = 0.4 + 0.6 * energy;
    const inten = o.intensity;
    const breakActive = st.brk || Math.random() < o.breakProb;
    this.broke = breakActive;

    if (breakActive) {
      this.applyBreak(seq);
    } else {
      // restore the kick anchor (it may have been a break pattern last section)
      seq.lanes.kick.layers = [{ mode: "DOWNBEAT", meter: FOLLOW, k: 3, len: 8, rot: 0, pattern: WORLD_NAMES[0] }];
      seq.lanes.kick.combine = "OR";
      // regenerate each voice's primary layer via the chosen engine, scaled by stage energy
      const curve = lsysCurve(this.stage + 1);
      let lx = 0.31 + 0.4 * ((this.stage % 3) / 3);
      const N = LANES.length;
      LANES.forEach((lane, i) => {
        if (lane === "kick" || lane === "ride" || lane === "brush") return; // anchor + jazz kit kept
        const c = seq.lanes[lane];
        const l0 = c.layers[0];
        const cv = curve[(i * 3 + this.stage) % curve.length];
        const cv2 = curve[(i * 5 + this.stage * 2 + 1) % curve.length];
        let mode: LaneMode = l0.mode, k = l0.k, len = l0.len, rot = l0.rot, meter = l0.meter;
        switch (o.engine) {
          case "LSYSTEM":
            mode = cv > 0.5 ? "EUCLID" : "POLY";
            k = 1 + Math.round(cv * 6 * energy); len = 3 + Math.round(cv2 * 9); rot = Math.round(cv * 12);
            meter = cv2 > 0.6 ? METERS[1 + Math.floor(cv * (METERS.length - 1))] : FOLLOW; break;
          case "PHYLLOTAXIS": {
            const ph = phyllotaxis(i + this.stage * 5), ph2 = phyllotaxis(i * 3 + this.stage + 1);
            mode = "EUCLID"; k = 1 + Math.round(ph * 6 * energy); len = 4 + Math.round(ph2 * 8); rot = Math.round(ph * 12);
            meter = ph2 > 0.55 ? METERS[1 + Math.floor(ph2 * (METERS.length - 1))] : FOLLOW; break;
          }
          case "LOGISTIC": {
            lx = logisticNext(lx, 3.62 + 0.24 * arc);
            mode = lx > 0.5 ? "POLY" : "EUCLID"; k = 1 + Math.round(lx * 6 * energy);
            lx = logisticNext(lx, 3.7); len = 3 + Math.round(lx * 9);
            lx = logisticNext(lx, 3.7); rot = Math.round(lx * 12);
            meter = lx > 0.66 ? METERS[1 + Math.floor(lx * (METERS.length - 1))] : FOLLOW; break;
          }
          case "FIELD": {
            const e = probe(i / (N - 1));
            mode = e > 0.35 ? "EUCLID" : "POLY"; k = 1 + Math.round((0.3 + e) * 5 * energy);
            len = 4 + Math.round((1 - e) * 8); rot = Math.round(phyllotaxis(i + this.stage) * 12);
            meter = e > 0.5 ? METERS[1 + Math.floor(e * (METERS.length - 1))] : FOLLOW; break;
          }
        }
        l0.mode = mode; l0.k = clamp(k, 0, 16); l0.len = clamp(len, 1, 16); l0.rot = clamp(rot, 0, 15);
        if (Math.random() < inten * 0.5) l0.meter = meter;
        // occasional parallel world layer (混在)
        if (Math.random() < inten * 0.4) {
          c.layers[1] = { mode: "WORLD", meter: FOLLOW, k, len, rot, pattern: WORLD_NAMES[Math.floor(Math.random() * WORLD_NAMES.length)] };
          c.layers.length = 2;
        } else c.layers.length = 1;
      });
    }

    // ── density ebb & flow: pull voices in/out via per-lane probability ──
    const act = breakActive ? BREAK_ACT : st.act;
    LANES.forEach((lane, i) => {
      seq.lanes[lane].prob = clamp(act[i] * (0.55 + 0.45 * energy), 0, 1);
    });

    applyGlobal({
      density: 0.2 + 0.55 * arc * inten,
      gateThresh: 0.34 - 0.12 * arc,
      liqDepth: 350 + 1500 * arc * inten,
      liqRate: 0.2 + 1.3 * arc,
    });
  }
}
