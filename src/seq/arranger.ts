// arranger.ts — 自動展開. Every sectionBars, a natural-function engine regenerates the lane
// patterns (mode/k/len/rot/meter) and nudges global density/gate/liquid along a rising arc,
// so the piece evolves on its own. Engines are rooted in physics/nature: L-systems,
// phyllotaxis, the logistic map (chaos), and the |ψ|² quantum field itself.
import { LANES } from "../audio/voices";
import { METERS, FOLLOW, type LaneMode } from "./sequencer";
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
}

export interface ArrangeGlobals {
  density: number; gateThresh: number; liqDepth: number; liqRate: number;
}

export class Arranger {
  bar = 0;
  stage = 0;

  // main calls this at the start of every global bar
  notifyBar(o: ArrangeOpts, seq: Sequencer, probe: (p: number) => number, applyGlobal: (g: ArrangeGlobals) => void): void {
    if (!o.on) return;
    this.bar++;
    if (this.bar % Math.max(1, Math.round(o.sectionBars)) === 0) {
      this.stage = (this.stage + 1) % Math.max(1, Math.round(o.stages));
      this.evolve(o, seq, probe, applyGlobal);
    }
  }

  reset(): void { this.bar = 0; this.stage = 0; }

  private evolve(o: ArrangeOpts, seq: Sequencer, probe: (p: number) => number, applyGlobal: (g: ArrangeGlobals) => void): void {
    const s = this.stage;
    const arc = 0.4 + 0.6 * (s / Math.max(1, o.stages - 1)); // build across the arc
    const inten = o.intensity;
    const curve = lsysCurve(s + 1);
    let lx = 0.31 + 0.4 * ((s % 3) / 3); // logistic seed varies per stage
    const N = LANES.length;

    LANES.forEach((lane, i) => {
      const c = seq.lanes[lane];
      const anchor = lane === "kick"; // keep the downbeat anchor steady
      if (anchor) return;

      const l0 = c.layers[0];
      const cv = curve[(i * 3 + s) % curve.length];
      const cv2 = curve[(i * 5 + s * 2 + 1) % curve.length];
      let mode: LaneMode = l0.mode, k = l0.k, len = l0.len, rot = l0.rot, meter = l0.meter;

      switch (o.engine) {
        case "LSYSTEM":
          mode = cv > 0.5 ? "EUCLID" : "POLY";
          k = 1 + Math.round(cv * 6 * arc);
          len = 3 + Math.round(cv2 * 9);
          rot = Math.round(cv * 12);
          meter = cv2 > 0.6 ? METERS[1 + Math.floor(cv * (METERS.length - 1))] : FOLLOW;
          break;
        case "PHYLLOTAXIS": {
          const ph = phyllotaxis(i + s * 5), ph2 = phyllotaxis(i * 3 + s + 1);
          mode = "EUCLID";
          k = 1 + Math.round(ph * 6 * arc);
          len = 4 + Math.round(ph2 * 8);
          rot = Math.round(ph * 12);
          meter = ph2 > 0.55 ? METERS[1 + Math.floor(ph2 * (METERS.length - 1))] : FOLLOW;
          break;
        }
        case "LOGISTIC": {
          lx = logisticNext(lx, 3.62 + 0.24 * arc);
          mode = lx > 0.5 ? "POLY" : "EUCLID";
          k = 1 + Math.round(lx * 6 * arc);
          lx = logisticNext(lx, 3.7); len = 3 + Math.round(lx * 9);
          lx = logisticNext(lx, 3.7); rot = Math.round(lx * 12);
          meter = lx > 0.66 ? METERS[1 + Math.floor(lx * (METERS.length - 1))] : FOLLOW;
          break;
        }
        case "FIELD": {
          const e = probe(i / (N - 1)); // |ψ|² energy where this lane sits
          mode = e > 0.35 ? "EUCLID" : "POLY";
          k = 1 + Math.round((0.3 + e) * 5 * arc);
          len = 4 + Math.round((1 - e) * 8);
          rot = Math.round(phyllotaxis(i + s) * 12);
          meter = e > 0.5 ? METERS[1 + Math.floor(e * (METERS.length - 1))] : FOLLOW;
          break;
        }
      }

      l0.mode = mode;
      l0.k = Math.max(0, Math.min(16, k));
      l0.len = Math.max(1, Math.min(16, len));
      l0.rot = Math.max(0, Math.min(15, rot));
      if (Math.random() < inten * 0.5) l0.meter = meter; // occasionally re-meter

      // 並列混在: at higher intensity, layer a second parallel rhythm (often a world cell)
      if (Math.random() < inten * 0.45) {
        const useWorld = Math.random() < 0.6;
        c.layers[1] = useWorld
          ? { mode: "WORLD", meter: FOLLOW, k, len, rot, pattern: WORLD_NAMES[Math.floor(Math.random() * WORLD_NAMES.length)] }
          : { mode: cv2 > 0.5 ? "POLY" : "EUCLID", meter: FOLLOW, k: 1 + Math.round(cv2 * 6), len: 3 + Math.round(cv * 9), rot: Math.round(cv2 * 12), pattern: l0.pattern };
        c.layers.length = 2;
      } else {
        c.layers.length = 1;
      }
    });

    // global arc — the field/liquid breathe with the section
    applyGlobal({
      density: 0.2 + 0.55 * arc * inten,
      gateThresh: 0.34 - 0.12 * arc,
      liqDepth: 350 + 1500 * arc * inten,
      liqRate: 0.2 + 1.3 * arc,
    });
  }
}
