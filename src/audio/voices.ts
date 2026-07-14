// voices.ts — Ryoji-Ikeda-flavoured percussion: pure sine pips, razor digital clicks,
// hard-clipped knocks, and a heavy, tight low end. Everything is short, dry and precise
// (dot感). No melody, no sustain pads — just the grid made audible.

export type Lane = "kick" | "sub" | "drag" | "sus" | "cak" | "knock" | "roll" | "click" | "tick" | "noise" | "beep";
export const LANES: Lane[] = ["kick", "sub", "drag", "sus", "cak", "knock", "roll", "click", "tick", "noise", "beep"];

export interface VoiceParams {
  master: number;
  subTune: number;     // Hz, fundamental of kick/sub
  kickDrive: number;   // 0..1 hard-clip amount → weight & hardness
  clickTone: number;   // Hz, click centre
  beepTone: number;    // Hz, pure test-tone dot
  rollRate: number;    // Hz, buzz gate rate of the roll (ずずずず)
  susLen: number;      // sec, sustain length of the SUS low tone
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
      case "drag":  return this.drag(time, lvl, p, panPos);
      case "sus":   return this.sus(time, lvl, p, panPos);
      case "cak":   return this.cak(time, lvl, panPos);
      case "knock": return this.knock(time, lvl, p, panPos);
      case "roll":  return this.roll(time, lvl, p, panPos);
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
    osc.frequency.setValueAtTime(f * 3.4, time);              // sharp click-y attack
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.02);
    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve(0.4 + p.kickDrive * 0.6); shaper.oversample = "4x";
    const dur = 0.08;                                          // very tight punch
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.9, time + 0.0006);  // +weight
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const pn = this.pan(pan * 0.2);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.05);
  }

  // SUB — click/knock-leaning low hit: a very sharp pitch-snap sine through a hard clip,
  // short body, plus a bandpassed noise click on top for percussive knock definition.
  private subVoice(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = p.subTune;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f * 4.6, time);              // high snap → clicky attack
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.016);
    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve(0.5 + p.kickDrive * 0.5); shaper.oversample = "4x";
    const dur = 0.07;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.7, time + 0.0005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const pn = this.pan(pan * 0.15);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.03);
    // noise click transient → knock definition
    const nz = this.noiseSrc(time, 0.004);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 2;
    const ng = this.pluck(time, 0.004, lvl * 0.55);
    nz.connect(bp); bp.connect(ng); ng.connect(pn);
  }

  // SUS — long sustained deep sub (an octave below): attack, hold plateau, then release.
  // A drone-ish low that rings under the grid. Length set by SUS LEN.
  private sus(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = p.subTune * 0.5;
    const dur = Math.max(0.12, p.susLen);
    const a = Math.min(0.03, dur * 0.12);
    const r = Math.min(0.25, dur * 0.45);
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = f;
    const osc2 = ctx.createOscillator(); osc2.type = "triangle"; osc2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.5, time + a);
    g.gain.setValueAtTime(lvl * 1.5, time + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const pn = this.pan(pan * 0.1);
    osc.connect(g); osc2.connect(g2); g2.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.05);
    osc2.start(time); osc2.stop(time + dur + 0.05);
  }

  // DRAG — sub-kick that "引きずる": a deep sine whose pitch glides downward over the hit
  // and rings out with a long tail → a heavy low-bass dot that smears/drags the low end.
  private drag(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = p.subTune;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f * 1.9, time);
    osc.frequency.exponentialRampToValueAtTime(f * 0.7, time + 0.09);  // downward drag (tighter)
    const shaper = ctx.createWaveShaper();
    shaper.curve = clipCurve(0.2 + p.kickDrive * 0.35); shaper.oversample = "2x";
    const dur = 0.17;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.9, time + 0.001);          // dot attack
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);          // long dragging tail
    const pn = this.pan(pan * 0.15);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + dur + 0.06);
  }

  // CAK — Balinese Kecak "chak": a proper little VOICE. A pitched glottal source (buzzy
  // sawtooth in male-chant range + a fifth for the ensemble) is shaped by three vowel
  // formants that sweep "cha"→"ak"; a breathy noise adds the consonant. Scattered in
  // stereo like interlocking chanters.
  private cak(time: number, lvl: number, pan: number): void {
    const ctx = this.ctx;
    const pn = this.pan(pan + (Math.random() * 2 - 1) * 0.45);
    const dur = 0.10 + Math.random() * 0.04;                 // tight syllable
    const f0 = 110 * Math.pow(2, (Math.random() * 2 - 1) * 0.12); // ~male voice, slight spread

    // glottal source: sawtooth (rich harmonics) + a quiet fifth (chant ensemble)
    const src = ctx.createGain();
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = f0;
    o1.frequency.linearRampToValueAtTime(f0 * 0.94, time + dur); // tiny falling intonation
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f0 * 1.5;
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    o1.connect(src); o2.connect(o2g); o2g.connect(src);
    // breathy noise for the "ch" consonant + air
    const nz = this.noiseSrc(time, dur); const ng = ctx.createGain(); ng.gain.value = 0.4;
    nz.connect(ng); ng.connect(src);

    // vowel formants that glide "a"(cha) → "ə/ʌ"(ak) over the syllable
    const F = [[720, 1150, 2500], [560, 1000, 2400]]; // start vowel → end vowel
    const sum = ctx.createGain();
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      const jitter = 0.94 + Math.random() * 0.12;
      bp.frequency.setValueAtTime(F[0][k] * jitter, time);
      bp.frequency.linearRampToValueAtTime(F[1][k] * jitter, time + dur);
      bp.Q.value = 9 - k * 2;
      const fg = ctx.createGain(); fg.gain.value = [1, 0.7, 0.45][k];
      src.connect(bp); bp.connect(fg); fg.connect(sum);
    }
    // syllable envelope: sharp "ch" attack, short sustain, quick release
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(lvl * 1.25, time + 0.006);
    g.gain.setValueAtTime(lvl * 1.05, time + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    sum.connect(g); g.connect(pn); pn.connect(this.out);
    o1.start(time); o1.stop(time + dur + 0.03); o2.start(time); o2.stop(time + dur + 0.03);

    // bright "ch" consonant transient
    const nz2 = this.noiseSrc(time, 0.014);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3200;
    const tg = this.pluck(time, 0.014, lvl * 0.55);
    nz2.connect(hp); hp.connect(tg); tg.connect(pn);
  }

  // KNOCK — dry wooden/plastic mid knock: short sine burst + hard clip. The "ノック".
  private knock(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const f = 180 + p.kickDrive * 120;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f * 2.4, time);
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.012);
    const shaper = ctx.createWaveShaper(); shaper.curve = clipCurve(0.7); shaper.oversample = "2x";
    const g = this.pluck(time, 0.028, lvl * 1.2);
    const pn = this.pan(pan * 0.5);
    osc.connect(shaper); shaper.connect(g); g.connect(pn); pn.connect(this.out);
    osc.start(time); osc.stop(time + 0.05);
  }

  // ROLL — buzz roll / 連符 "ずずずず": low-mid noise + a low body tone, chopped by a fast
  // square gate that accelerates over the hit → a hard mechanical buzz that lands with weight.
  private roll(time: number, lvl: number, p: VoiceParams, pan: number): void {
    const ctx = this.ctx;
    const dur = 0.09 + Math.random() * 0.05;
    const pn = this.pan(pan * 0.4);
    const rate = p.rollRate;

    // fast square gate 0..1 (the buzz), accelerating so it reads as "ずずずずッ"
    const gate = ctx.createGain(); gate.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = "square";
    lfo.frequency.setValueAtTime(rate * 0.85, time);
    lfo.frequency.linearRampToValueAtTime(rate * 1.6, time + dur);
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.6; // deeper chop → clearer buzz
    lfo.connect(lfoAmt); lfoAmt.connect(gate.gain);

    // overall AD envelope — hard attack, quick decay. Pushed HOT so the buzz is
    // unmistakably present and not masked by the kick/sub/drag low end.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(lvl * 3.2, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    // rasp: mid/high bandpassed noise that CUTS THROUGH the low end (main character)
    const nz = this.noiseSrc(time, dur);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 700 + p.kickDrive * 900; bp.Q.value = 1.5;
    const bpG = ctx.createGain(); bpG.gain.value = 1.4;
    // secondary high fizz layer
    const nz2 = this.noiseSrc(time, dur);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600;
    const hpG = ctx.createGain(); hpG.gain.value = 0.6;
    // low body for the "zu" weight (kept modest so it doesn't fight the sub voices)
    const tone = ctx.createOscillator(); tone.type = "sawtooth";
    tone.frequency.value = Math.max(70, p.subTune * 1.5);
    const toneG = ctx.createGain(); toneG.gain.value = 0.3;

    nz.connect(bp); bp.connect(bpG); bpG.connect(gate);
    nz2.connect(hp); hp.connect(hpG); hpG.connect(gate);
    tone.connect(toneG); toneG.connect(gate);
    gate.connect(env); env.connect(pn); pn.connect(this.out);

    lfo.start(time); lfo.stop(time + dur + 0.02);
    tone.start(time); tone.stop(time + dur + 0.02);
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
