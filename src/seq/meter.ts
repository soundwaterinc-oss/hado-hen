// meter.ts — the heart: odd-meter (変拍子) model.
// A BAR is an additive grouping of equal base-units (16th-note pulses):
//   [3,3,2]  = 8 units, felt as 3+3+2 (the classic 8/8 "odd" swing)
//   [2,2,3]  = 7 units = 7/8
// A GROOVE is a looping SEQUENCE of bars, so you can chain 7/8 → 5/8 → 9/8 etc.
// Group starts are downbeats (accents). Everything else derives from these two ideas.

export type Bar = number[]; // group sizes in base units
export type Groove = Bar[]; // looping sequence of bars

export const barUnits = (b: Bar): number => b.reduce((a, c) => a + c, 0);

// unit indices that begin a group (downbeats) within one bar
export function downbeats(b: Bar): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const g of b) { out.push(acc); acc += g; }
  return out;
}

// Bjorklund / Euclidean rhythm: k onsets spread as evenly as possible over n steps,
// then rotated. Returns a boolean array of length n. The backbone of 変拍子 phrasing.
export function euclid(k: number, n: number, rotate = 0): boolean[] {
  if (n <= 0) return [];
  k = Math.max(0, Math.min(n, Math.round(k)));
  const pattern: boolean[] = new Array(n).fill(false);
  if (k === 0) return pattern;
  // bucket method
  let bucket = 0;
  const raw: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) { bucket -= n; raw[i] = true; } else raw[i] = false;
  }
  const r = ((rotate % n) + n) % n;
  for (let i = 0; i < n; i++) pattern[i] = raw[(i - r + n) % n];
  return pattern;
}

// A library of ready-made bars/grooves. Names are the "felt" meter.
export const BARS: Record<string, Bar> = {
  "4/4": [4, 4, 4, 4],       // 16 units, straight
  "5/8 (3+2)": [3, 2],
  "5/8 (2+3)": [2, 3],
  "6/8 (3+3)": [3, 3],
  "7/8 (2+2+3)": [2, 2, 3],
  "7/8 (3+2+2)": [3, 2, 2],
  "8 (3+3+2)": [3, 3, 2],
  "9/8 (2+2+2+3)": [2, 2, 2, 3],
  "9/8 (3+3+3)": [3, 3, 3],
  "10 (3+3+2+2)": [3, 3, 2, 2],
  "11/8 (3+3+3+2)": [3, 3, 3, 2],
  "11/8 (2+2+3+2+2)": [2, 2, 3, 2, 2],
  "12 (3+2+2+3+2)": [3, 2, 2, 3, 2],
  "13/8 (3+3+3+2+2)": [3, 3, 3, 2, 2],
  "15 (4+4+4+3)": [4, 4, 4, 3],
};

// Named grooves: chained odd-meter sequences (the "組み合わせ").
export const GROOVES: Record<string, Groove> = {
  "STRAIGHT 4/4": [BARS["4/4"]],
  "7/8 loop": [BARS["7/8 (2+2+3)"]],
  "5+7": [BARS["5/8 (3+2)"], BARS["7/8 (2+2+3)"]],
  "7+5+9": [BARS["7/8 (3+2+2)"], BARS["5/8 (2+3)"], BARS["9/8 (2+2+2+3)"]],
  "BULGAR 11": [BARS["11/8 (2+2+3+2+2)"]],
  "13 loop": [BARS["13/8 (3+3+3+2+2)"]],
  "AKSAK 5+7+11": [BARS["5/8 (2+3)"], BARS["7/8 (2+2+3)"], BARS["11/8 (3+3+3+2)"]],
  "MACHINE 8/10": [BARS["8 (3+3+2)"], BARS["10 (3+3+2+2)"]],
  "IKEDA 9+7": [BARS["9/8 (3+3+3)"], BARS["7/8 (3+2+2)"]],
};
