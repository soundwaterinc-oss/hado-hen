// nature.ts — the physical/natural functions at the root of EL-SYSTEMA: L-systems,
// phyllotaxis (golden angle), the logistic map (chaos), and Kuramoto phase coupling.
// Used both to auto-arrange the beat and to move the LIQUID filter organically.

// ---- L-system --------------------------------------------------------------
// Deterministic Lindenmayer expansion, then a turtle reads it into a 0..1 curve
// (self-similar rises/falls) that drives rhythm density and filter motion.
export function lindenmayer(axiom: string, rules: Record<string, string>, iters: number): string {
  let s = axiom;
  for (let i = 0; i < iters; i++) {
    let next = "";
    for (const ch of s) next += rules[ch] ?? ch;
    s = next;
  }
  return s;
}

// growth curve: '+' raises, '-' lowers, letters advance & sample the running height
export function lsysCurve(seed: number, iters = 4): number[] {
  // a couple of classic branching grammars, chosen by seed
  const grammars = [
    { axiom: "A", rules: { A: "AB+A-", B: "A+B" } as Record<string, string> },
    { axiom: "F", rules: { F: "F+F-F-F+F" } as Record<string, string> },
    { axiom: "X", rules: { X: "F+[X]-X", F: "FF" } as Record<string, string> },
  ];
  const g = grammars[Math.abs(seed) % grammars.length];
  const s = lindenmayer(g.axiom, g.rules, iters);
  const out: number[] = [];
  let h = 0.5;
  for (const ch of s) {
    if (ch === "+") h = Math.min(1, h + 0.12);
    else if (ch === "-") h = Math.max(0, h - 0.12);
    else if (ch === "[") h = Math.min(1, h + 0.05);
    else if (ch === "]") h = Math.max(0, h - 0.05);
    else out.push(h);
  }
  return out.length ? out : [0.5];
}

// ---- phyllotaxis -----------------------------------------------------------
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5°
// nth floret angle normalised to 0..1
export function phyllotaxis(n: number): number {
  const a = (n * GOLDEN_ANGLE) % (Math.PI * 2);
  return a / (Math.PI * 2);
}

// ---- logistic map (chaos) --------------------------------------------------
export function logisticNext(x: number, r: number): number {
  const nx = r * x * (1 - x);
  return nx <= 0 || nx >= 1 || Number.isNaN(nx) ? 0.5 : nx;
}

// ---- Kuramoto coupled oscillators ------------------------------------------
// A tiny ensemble of phase oscillators that pull toward sync — quasi-periodic,
// living movement (nothing in nature is a pure sine).
export class Kuramoto {
  private phases: number[];
  private omegas: number[];
  constructor(n = 5, spread = 0.6) {
    this.phases = Array.from({ length: n }, () => Math.random() * Math.PI * 2);
    this.omegas = Array.from({ length: n }, (_, i) => 1 + (i / n - 0.5) * spread);
  }
  step(dt: number, rate: number, coupling = 1.2): number {
    const n = this.phases.length;
    let sinSum = 0, cosSum = 0;
    for (const p of this.phases) { sinSum += Math.sin(p); cosSum += Math.cos(p); }
    const meanPhase = Math.atan2(sinSum / n, cosSum / n);
    const order = Math.hypot(sinSum / n, cosSum / n); // 0..1 synchrony
    for (let i = 0; i < n; i++) {
      this.phases[i] += dt * rate * (this.omegas[i] + coupling * order * Math.sin(meanPhase - this.phases[i]));
    }
    return (Math.sin(this.phases[0]) * 0.6 + Math.sin(meanPhase) * 0.4 + 1) / 2; // 0..1
  }
}

// ---- LIQUID natural modulator ---------------------------------------------
// One selectable natural source → a 0..1 value stream that moves the LIQUID filter.
export type NatureSource = "LSYS" | "LOGISTIC" | "KURAMOTO" | "FIELD" | "SINE";
export const NATURE_SOURCES: NatureSource[] = ["LSYS", "LOGISTIC", "KURAMOTO", "FIELD", "SINE"];

export class NatureMod {
  private phase = 0;
  private lx = 0.5;
  private acc = 0;
  private seq = lsysCurve(1);
  private idx = 0;
  private cur = 0.5;
  private kur = new Kuramoto();

  reseed(seed: number): void { this.seq = lsysCurve(seed); this.idx = 0; }

  // rate in Hz; fieldSample is the current |ψ|² 0..1; returns a smoothed 0..1 value
  step(dt: number, rate: number, source: NatureSource, fieldSample: number): number {
    let target = this.cur;
    switch (source) {
      case "SINE":
        this.phase += dt * rate * Math.PI * 2;
        target = (Math.sin(this.phase) + 1) / 2; break;
      case "LOGISTIC":
        this.acc += dt * rate;
        while (this.acc >= 1) { this.acc -= 1; this.lx = logisticNext(this.lx, 3.72); }
        target = this.lx; break;
      case "LSYS":
        this.acc += dt * rate;
        while (this.acc >= 1) { this.acc -= 1; this.idx = (this.idx + 1) % this.seq.length; }
        target = this.seq[this.idx]; break;
      case "KURAMOTO":
        target = this.kur.step(dt, rate); break;
      case "FIELD":
        target = fieldSample; break;
    }
    // organic smoothing (critically-ish damped toward target)
    this.cur += (target - this.cur) * Math.min(1, dt * (6 + rate * 4));
    return Math.max(0, Math.min(1, this.cur));
  }
}
