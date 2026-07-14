// voices.ts — Ryoji-Ikeda-flavoured percussion: pure sine pips, razor digital clicks,
// hard-clipped knocks, and a heavy, tight low end. Everything is short, dry and precise
// (dot感). No melody, no sustain pads — just the grid made audible.

export type Lane = "kick" | "sub" | "knock" | "click" | "tick" | "noise" | "beep";
export const LANES: Lane[] = ["kick", "sub", "knock", "click", "tick", "noise", "beep"];

export interface VoiceParams {
  master: number;
  subTune: number;     // Hz, fundamental of kick/sub
  kickDrive: number;   // 0..1 hard-clip amount → weight & hardness
  clickTone: number;   // Hz, click centre
  beepTone: number;    // Hz, pure test-tone dot
  level: Record<Lane, number>;
}

// hard-clip curve — square-ish edges = the gutsy, solid knock
function clipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4)), g = 1 + drive * 16;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.max(-1, Math.min(1, x * g)) * 0.94;
  }
  return c;
}

export class Voices {
  private noise: AudioBuffer;
  constructor(private ctx: AudioContext, private out: AudioNode) {
    this.noise = this.makeNoise(0.5);
  }

  private makeNoise(sec: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  private noiseSrc(time: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.playbackRate.value = 0.9 + Math.random() * 0.2;
    s.start(time); s.stop(time + dur + 0.02);
    return s;
  }
  private pluck(time: number, dur: number, peak: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.0004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    return g;
  }
  private pan(p: number): StereoPannerNode {
    const n = this.ctx.createStereoPanner();
    n.pan.value = Math.max(-1, Math.min(1, p));
    return n;
  }

  trigger(lane: Lane, time: number, vel: number, p: VoiceParams, panPos = 0): void {
    const lvl = p.level[lane] * vel;
    if (lvl <= 0.001) return;
    switch (lane) {
      case "kick":  return this.kick(time, lvl, p, panPos);
      case "sub":   return this.subVoice(time, lvl, p, panPos);
      case "knock": return this.knock(time, lvl, p, panPos);
      case "click": return this.click(time, lvl, p, panPos);
      case "tick":  return this.tick(time, lvl, panPos);
      case "noise": return this.noiseHit(time, lvl, panPos);
      case "beep":  return this.beep(time, lvl, p, panPos);
    }
  }

  // KICK — heavy tight knock: fast pitch drop sine through a hard-clip shaper.
  // This is the low-end anchor: solid fundamental, square-hard transient.
  private kick(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = p.subTune;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f * 3.2, time);              // sharp click-y attack
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.028);
    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve(0.4 + p.kickDrive * 0.6); shaper.oversample = "4x";
    const dur = 0.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.9, time + 0.0006);  // +weight
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const pn = this.pan(pan * 0.2);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  // SUB — pure deep sine, longer, no drive: fills and holds the low end under the grid.
  private subVoice(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = p.subTune * 0.5;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = f;
    const dur = 0.26;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.8, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const pn = this.pan(pan * 0.15);
    osc.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  // KNOCK — dry wooden/plastic mid knock: short sine burst + hard clip. The "ノック".
  private knock(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = 180 + p.kickDrive * 120;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f * 2.4, time);
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.012);
    const shaper = ctx.createWaveShaper(); shaper.curve = clipCurve(0.7); shaper.oversample = "2x";
    const g = this.pluck(time, 0.05, lvl * 1.2);
    const pn = this.pan(pan * 0.5);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + 0.08);
  }

  // CLICK — Ikeda razor: pure sine pip with a tiny noise transient on top.
  private click(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const dur = 0.004 + Math.random() * 0.003;
    const freq = p.clickTone * (0.9 + Math.random() * 0.2);
    const pn = this.pan(pan);
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
    const g = this.pluck(time, dur, lvl);
    osc.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.02);
    // transient bite
    const nz = this.noiseSrc(time, 0.002);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const ng = this.pluck(time, 0.002, lvl * 0.5);
    nz.connect(hp); hp.connect(ng); ng.connect(pn);
  }

  // TICK — tiny high sine dot (dot感, the pointillist top layer).
  private tick(time: number, lvl: number, pan: number): void {
    const ctx = this.ctx;
    const freq = 3200 + Math.random() * 3000;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
    const g = this.pluck(time, 0.003, lvl * 0.8);
    const pn = this.pan(pan);
    osc.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + 0.02);
  }

  // NOISE — short digital grit snap (bandpassed white burst).
  private noiseHit(time: number, lvl: number, pan: number): void {
    const ctx = this.ctx;
    const dur = 0.008 + Math.random() * 0.01;
    const nz = this.noiseSrc(time, dur);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 1400 + Math.random() * 2600; bp.Q.value = 1.2;
    const g = this.pluck(time, dur, lvl * 0.7);
    const pn = this.pan(pan * 0.8);
    nz.connect(bp); bp.connect(g); g.connect(pn); pn.connect(this.out);
  }

  // BEEP — pure fixed-pitch test-tone dot (Ikeda sine-wave signature). Off by default.
  private beep(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = p.beepTone;
    const dur = 0.03;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 0.7, time + 0.001);
    g.gain.setValueAtTime(lvl * 0.7, time + dur - 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const pn = this.pan(pan);
    osc.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.02);
  }
}
