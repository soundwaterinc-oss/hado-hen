// engine.ts — dry, hard, heavy master chain (the opposite of a warm dub bus):
//   voices ─► bus ─► saturator ─► low-shelf (+weight) ─► sub-sonic HP ─┬─► dry ──────────┐
//                                                                      └─► short room ───┤─► limiter ─► out
// Clinical and tight, so the dots stay dots and the low end stays solid.
import { Voices } from "./voices";

function satCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4)), k = 1 + amount * 6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

function roomIR(ctx: AudioContext, sec: number): AudioBuffer {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(sec * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  }
  return buf;
}

export interface EngineParams {
  master: number;
  drive: number;      // master saturation
  lowBoost: number;   // dB low-shelf @ 90 Hz
  reverbMix: number;  // 0..1 short room send
  liquid: number;     // 0..1 wet mix of the LIQUID path
  liqCutoff: number;  // Hz — resonant LP cutoff (naturally modulated per frame)
  liqQ: number;       // resonance
  liqDelay: number;   // s — chorus/goo delay time (also naturally modulated)
  liqFb: number;      // 0..1 feedback
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly voices: Voices;
  readonly analyser: AnalyserNode;
  private master: GainNode;
  private sat: WaveShaperNode;
  private shelf: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private revSend: GainNode;
  private liquidSend: GainNode;
  private liquidLP: BiquadFilterNode;
  private liqDelay: DelayNode;
  private liqFb: GainNode;
  private limiter: DynamicsCompressorNode;
  started = false;

  constructor() {
    // No forced sampleRate: forcing one the hardware doesn't support throws on some
    // browsers (which would blank the whole page). Use the device default.
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const ctx = this.ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.6;

    const bus = ctx.createGain();
    this.sat = ctx.createWaveShaper(); this.sat.curve = satCurve(0.25); this.sat.oversample = "2x";
    this.shelf = ctx.createBiquadFilter(); this.shelf.type = "lowshelf";
    this.shelf.frequency.value = 90; this.shelf.gain.value = 4;
    this.hp = ctx.createBiquadFilter(); this.hp.type = "highpass";
    this.hp.frequency.value = 24; this.hp.Q.value = 0.5;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.ratio.value = 20; this.limiter.threshold.value = -3;
    this.limiter.attack.value = 0.0015; this.limiter.release.value = 0.08; // tighter grip

    this.master = ctx.createGain(); this.master.gain.value = 0.9;

    // short dry room (default off)
    const conv = ctx.createConvolver(); conv.buffer = roomIR(ctx, 0.25);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0;

    // LIQUID — a wet, squelchy parallel path: a high-resonance lowpass whose cutoff & delay
    // are modulated per frame by a NATURAL function (L-system / logistic / Kuramoto / |ψ|²),
    // into a short feedback delay → gooey, living "ねちょねちょ" movement.
    this.liquidSend = ctx.createGain(); this.liquidSend.gain.value = 0;
    this.liquidLP = ctx.createBiquadFilter(); this.liquidLP.type = "lowpass";
    this.liquidLP.frequency.value = 700; this.liquidLP.Q.value = 11;
    this.liqDelay = ctx.createDelay(0.4); this.liqDelay.delayTime.value = 0.05;
    this.liqFb = ctx.createGain(); this.liqFb.gain.value = 0.4;

    bus.connect(this.sat); this.sat.connect(this.shelf); this.shelf.connect(this.hp);
    this.hp.connect(this.limiter);            // dry
    this.hp.connect(this.revSend); this.revSend.connect(conv); conv.connect(this.limiter);
    this.hp.connect(this.liquidSend); this.liquidSend.connect(this.liquidLP);
    this.liquidLP.connect(this.liqDelay); this.liqDelay.connect(this.liqFb); this.liqFb.connect(this.liqDelay);
    this.liquidLP.connect(this.limiter); this.liqDelay.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.analyser); this.analyser.connect(ctx.destination);

    this.voices = new Voices(ctx, bus);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.started = true;
  }
  get now(): number { return this.ctx.currentTime; }

  apply(p: EngineParams): void {
    const t = this.now;
    this.master.gain.setTargetAtTime(p.master, t, 0.02);
    this.sat.curve = satCurve(p.drive);
    this.shelf.gain.setTargetAtTime(p.lowBoost, t, 0.05);
    this.revSend.gain.setTargetAtTime(p.reverbMix, t, 0.05);
    this.liquidSend.gain.setTargetAtTime(p.liquid, t, 0.05);
    this.liquidLP.frequency.setTargetAtTime(Math.max(80, Math.min(12000, p.liqCutoff)), t, 0.02);
    this.liquidLP.Q.setTargetAtTime(p.liqQ, t, 0.05);
    this.liqDelay.delayTime.setTargetAtTime(Math.max(0.002, Math.min(0.39, p.liqDelay)), t, 0.03);
    this.liqFb.gain.setTargetAtTime(Math.max(0, Math.min(0.85, p.liqFb)), t, 0.05);
  }
}
