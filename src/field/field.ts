// field.ts — the HADŌ core: a 1-D quantum wave field. A complex wavefunction ψ evolves by
// the Schrödinger equation (Visscher's stable staggered-leapfrog scheme); its probability
// density |ψ|² is probed per lane to GATE and accent the beat. The beat in turn excites the
// field (injects packets), so 波動 and 拍 drive each other.
//
//   i ∂ψ/∂t = Hψ,   H = -½∂²/∂x² + V     ψ = R + iI
//   ∂R/∂t = H I,  ∂I/∂t = -H R
export class QuantumField {
  readonly N: number;
  private R: Float32Array;
  private I: Float32Array;
  private V: Float32Array;
  private scale = 1e-6; // running max of |ψ|² for normalising probes
  mag: Float32Array;    // |ψ|² snapshot for the visualiser (0..~1)

  constructor(n = 128) {
    this.N = n;
    this.R = new Float32Array(n);
    this.I = new Float32Array(n);
    this.V = new Float32Array(n);
    this.mag = new Float32Array(n);
    // a soft double-well potential so packets slosh and interfere
    for (let i = 0; i < n; i++) {
      const x = i / n;
      this.V[i] = 0.6 * (Math.cos(x * Math.PI * 2) * 0.5 + 0.5) - 0.2 * Math.sin(x * Math.PI * 4);
    }
    this.excite(0.5, 1, 6); // seed packet with momentum
  }

  private lap(f: Float32Array, i: number): number {
    const n = this.N;
    return f[(i - 1 + n) % n] - 2 * f[i] + f[(i + 1) % n]; // periodic boundary
  }

  // advance by real dt; speed scales the number/size of internal steps
  step(dt: number, speed: number): void {
    const sub = 6;
    const h = Math.min(0.35, dt * speed * 12 / sub);
    const N = this.N, R = this.R, I = this.I, V = this.V;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < N; i++) R[i] += h * (-0.5 * this.lap(I, i) + V[i] * I[i]);
      for (let i = 0; i < N; i++) I[i] -= h * (-0.5 * this.lap(R, i) + V[i] * R[i]);
    }
    // mild damping keeps injected energy from blowing up
    let mx = 1e-6;
    for (let i = 0; i < N; i++) {
      R[i] *= 0.9995; I[i] *= 0.9995;
      const m = R[i] * R[i] + I[i] * I[i];
      this.mag[i] = m;
      if (m > mx) mx = m;
    }
    // track a decaying running max so probes sit in ~0..1
    this.scale = Math.max(mx, this.scale * 0.995);
    const inv = 1 / this.scale;
    for (let i = 0; i < N; i++) this.mag[i] *= inv;
  }

  // inject a Gaussian wave packet (a "beat" exciting the field)
  excite(pos01: number, amt: number, momentum = 4): void {
    const N = this.N, c = Math.floor(pos01 * N), w = N * 0.05;
    for (let d = -12; d <= 12; d++) {
      const i = ((c + d) % N + N) % N;
      const g = amt * Math.exp(-(d * d) / (2 * w * w));
      this.R[i] += g * Math.cos((d / w) * momentum);
      this.I[i] += g * Math.sin((d / w) * momentum);
    }
  }

  // |ψ|² at a probe position, normalised to ~0..1
  probe(pos01: number): number {
    const i = Math.min(this.N - 1, Math.max(0, Math.floor(pos01 * (this.N - 1))));
    return Math.min(1, this.mag[i]);
  }
}
