// main.ts — HADŌ HEN / 波動変. Wires the odd-meter sequencer to the Ikeda voices,
// builds the minimal control surface, and animates a dot-scope + meter grid.
import "./style.css";
import { AudioEngine, type EngineParams } from "./audio/engine";
import { type Lane, LANES, type VoiceParams } from "./audio/voices";
import { Sequencer, laneHit, METERS, FOLLOW, type LaneMode, type SeqParams } from "./seq/sequencer";
import { GROOVES, type Groove } from "./seq/meter";
import { el, slider, select } from "./ui/controls";

// ---- state -----------------------------------------------------------------
const state = {
  bpm: 132, swing: 0.0, humanize: 0.0006, accent: 0.5,
  master: 0.9, drive: 0.28, lowBoost: 5, reverbMix: 0.0,
  subTune: 52, kickDrive: 0.6, clickTone: 2200, beepTone: 880, rollRate: 45, susLen: 0.45,
  grooveName: "7+5+9",
  level: { kick: 1.0, sub: 0.85, drag: 0.8, sus: 0.72, knock: 0.7, roll: 1.0, click: 0.74, tick: 0.66, noise: 0.5, beep: 0.3 } as Record<Lane, number>,
};

// Audio is created lazily on the first PLAY click (inside the user gesture). If audio
// init fails on a device, the whole UI still renders — the play button always appears.
let engine: AudioEngine | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let timeData: Uint8Array<ArrayBuffer> | null = null;
const seqParams = (): SeqParams => ({ bpm: state.bpm, swing: state.swing, humanize: state.humanize, accent: state.accent });

let curBar = 0, flash = 0;
const seq = new Sequencer(GROOVES[state.grooveName] as Groove, {
  now: () => (engine ? engine.now : 0),
  fire: (lane, time, vel, pan) => engine?.voices.trigger(lane, time, vel, voiceParams(), pan),
  onStep: (bi, _ui, _units, isDown, _time) => {
    curBar = bi;
    if (isDown) flash = 1;
  },
}, seqParams);

function voiceParams(): VoiceParams {
  return {
    master: state.master, subTune: state.subTune, kickDrive: state.kickDrive,
    clickTone: state.clickTone, beepTone: state.beepTone, rollRate: state.rollRate, susLen: state.susLen, level: state.level,
  };
}
function engineParams(): EngineParams {
  return { master: state.master, drive: state.drive, lowBoost: state.lowBoost, reverbMix: state.reverbMix };
}

// ---- UI --------------------------------------------------------------------
const app = document.getElementById("app")!;

const header = el("header");
const h1 = el("h1", undefined, "HADŌ HEN 波動変");
const sub = el("span", "sub", "変拍子 dot-beat generator · EL-SYSTEMA");
header.append(h1, sub);
app.appendChild(header);

// transport
const transport = el("div", "transport");
const playBtn = el("button", "play", "▶ PLAY");
playBtn.addEventListener("click", async () => {
  try {
    if (!engine) {
      engine = new AudioEngine();
      freqData = new Uint8Array(new ArrayBuffer(engine.analyser.frequencyBinCount));
      timeData = new Uint8Array(new ArrayBuffer(engine.analyser.fftSize));
    }
    await engine.resume();
    seq.toggle();
    playBtn.classList.toggle("on", seq.running);
    playBtn.textContent = seq.running ? "■ STOP" : "▶ PLAY";
  } catch (err) {
    console.error("audio init failed", err);
    playBtn.textContent = "⚠ AUDIO ERROR";
  }
});
const grooveSel = select(Object.keys(GROOVES), state.grooveName, (v) => {
  state.grooveName = v; seq.setGroove(GROOVES[v] as Groove);
});
const grooveTag = el("span", "tag");
const randBtn = el("button", undefined, "⤨ RANDOM");
randBtn.addEventListener("click", randomize);
transport.append(playBtn, el("span", "tag", "GROOVE"), grooveSel, randBtn, grooveTag);
app.appendChild(transport);

// canvases
const canvases = el("div", "canvases");
const scope = el("canvas"); scope.width = 1088; scope.height = 130;
const gridC = el("canvas"); gridC.width = 1088; gridC.height = 240;
canvases.append(scope, gridC);
app.appendChild(canvases);

// two columns: lanes | globals
const cols = el("div", "cols");
const lanePanel = el("div", "panel");
lanePanel.appendChild(el("h2", undefined, "LANES — 変拍子(meter) · mode · k · length · rot · prob · level"));
const laneRows = el("div");
lanePanel.appendChild(laneRows);
const globalPanel = el("div", "panel");
globalPanel.appendChild(el("h2", undefined, "TONE / GROOVE / MASTER"));
cols.append(lanePanel, globalPanel);
app.appendChild(cols);

const MODES: LaneMode[] = ["DOWNBEAT", "EUCLID", "POLY", "OFF"];
rebuildLanes();
buildGlobals();

function rebuildLanes(): void {
  laneRows.replaceChildren();
  for (const lane of LANES) buildLane(lane);
}

function buildLane(lane: Lane): void {
  const c = seq.lanes[lane];
  const row = el("div", "lane");
  row.append(el("span", "name", lane));
  const meterSel = select(METERS, c.meter, (v) => { c.meter = v; }, "mtr");
  row.appendChild(meterSel);
  const modeSel = select(MODES, c.mode, (v) => { c.mode = v as LaneMode; }, undefined);
  row.appendChild(modeSel);
  const sliders = el("div", "sliders");
  sliders.append(
    slider("k", 0, 16, 1, c.k, (v) => String(v), (v) => { c.k = v; }),
    slider("len", 1, 16, 1, c.len, (v) => String(v), (v) => { c.len = v; }),
    slider("rot", 0, 15, 1, c.rot, (v) => String(v), (v) => { c.rot = v; }),
    slider("prob", 0, 1, 0.05, c.prob, (v) => v.toFixed(2), (v) => { c.prob = v; }),
    slider("lvl", 0, 1.2, 0.05, state.level[lane], (v) => v.toFixed(2), (v) => { state.level[lane] = v; }),
  );
  row.appendChild(sliders);
  laneRows.appendChild(row);
}

function buildGlobals(): void {
  const g = globalPanel;
  g.append(
    slider("BPM", 60, 200, 1, state.bpm, (v) => String(v), (v) => { state.bpm = v; }),
    slider("SWING", 0, 0.6, 0.01, state.swing, (v) => v.toFixed(2), (v) => { state.swing = v; }),
    slider("HUMANIZE", 0, 0.02, 0.001, state.humanize, (v) => (v * 1000).toFixed(1) + "ms", (v) => { state.humanize = v; }),
    slider("ACCENT", 0, 1, 0.05, state.accent, (v) => v.toFixed(2), (v) => { state.accent = v; }),
    el("div", "tag", "· TONE ·"),
    slider("SUB TUNE", 32, 90, 1, state.subTune, (v) => v + "Hz", (v) => { state.subTune = v; }),
    slider("KICK DRIVE", 0, 1, 0.05, state.kickDrive, (v) => v.toFixed(2), (v) => { state.kickDrive = v; }),
    slider("CLICK TONE", 600, 6000, 50, state.clickTone, (v) => v + "Hz", (v) => { state.clickTone = v; }),
    slider("BEEP TONE", 220, 3000, 10, state.beepTone, (v) => v + "Hz", (v) => { state.beepTone = v; }),
    slider("ROLL BUZZ", 25, 150, 1, state.rollRate, (v) => v + "Hz", (v) => { state.rollRate = v; }),
    slider("SUS LEN", 0.15, 1.6, 0.05, state.susLen, (v) => v.toFixed(2) + "s", (v) => { state.susLen = v; }),
    el("div", "tag", "· MASTER ·"),
    slider("LOW BOOST", 0, 10, 0.5, state.lowBoost, (v) => "+" + v + "dB", (v) => { state.lowBoost = v; }),
    slider("DRIVE", 0, 1, 0.05, state.drive, (v) => v.toFixed(2), (v) => { state.drive = v; }),
    slider("ROOM", 0, 0.5, 0.02, state.reverbMix, (v) => v.toFixed(2), (v) => { state.reverbMix = v; }),
    slider("MASTER", 0, 1.2, 0.05, state.master, (v) => v.toFixed(2), (v) => { state.master = v; }),
  );
  const hint = el("div", "hint");
  hint.innerHTML =
    "変拍子 = 加算拍子(3+2+2…)の連結 × ポリメーター。<br>" +
    "DOWNBEAT: 各グループ頭 / EUCLID: 小節長に均等 k 発音 / POLY: 独立周期 len で位相ずれ。<br>" +
    "重い低域は KICK(hard-clip)+SUB+LOW BOOST、ドット感は CLICK/TICK/BEEP。<br>" +
    "ROLL = ずずずず…のバズロール(連符)。ROLL BUZZ でざらつきの速さを調整。<br>" +
    "DRAG = sub-kick的な低域を引きずるドット(ピッチ下降＋長い余韻)。<br>" +
    "SUB = クリック/ノック寄りの短い低打。SUS = 長めに伸びる持続サブ(SUS LEN で長さ)。<br>" +
    "音別 変拍子: 各レーンの meter を選ぶと独立拍子で回りポリメーターになる(FOLLOW=全体グルーヴ)。";
  g.appendChild(hint);
}

function randomize(): void {
  const names = Object.keys(GROOVES);
  state.grooveName = names[Math.floor(Math.random() * names.length)];
  seq.setGroove(GROOVES[state.grooveName] as Groove);
  grooveSel.value = state.grooveName;
  for (const lane of LANES) {
    const c = seq.lanes[lane];
    if (lane === "beep") continue;
    // ~55% of the time give the voice its OWN odd meter → polymeter scatter
    c.meter = Math.random() < 0.55 ? METERS[1 + Math.floor(Math.random() * (METERS.length - 1))] : FOLLOW;
    c.k = 1 + Math.floor(Math.random() * 7);
    c.len = 4 + Math.floor(Math.random() * 9);
    c.rot = Math.floor(Math.random() * 8);
  }
  rebuildLanes(); // reflect randomized meter/k/len/rot in the controls
}

// ---- render loop -----------------------------------------------------------
const sctx = scope.getContext("2d")!;
const gctx = gridC.getContext("2d")!;

function draw(): void {
  seq.schedule();
  if (engine) engine.apply(engineParams());
  flash *= 0.86;
  grooveTag.textContent = `${state.grooveName} · bar ${curBar + 1}/${seq.groove.length}`;

  // dot scope — Ikeda: sparse points from the time-domain signal (once audio is live)
  sctx.fillStyle = "#000"; sctx.fillRect(0, 0, scope.width, scope.height);
  if (engine && freqData && timeData) {
    engine.analyser.getByteTimeDomainData(timeData);
    engine.analyser.getByteFrequencyData(freqData);
    sctx.fillStyle = "#fff";
    const N = timeData.length, step = 4;
    for (let i = 0; i < N; i += step) {
      const x = (i / N) * scope.width;
      const y = (timeData[i] / 255) * scope.height;
      sctx.fillRect(x, y, 1.5, 1.5);
    }
    // low-end meter bar (bottom): mean of low bins → shows the weight
    let low = 0; const nb = 24;
    for (let i = 0; i < nb; i++) low += freqData[i];
    low = low / nb / 255;
    sctx.fillRect(0, scope.height - 3, low * scope.width, 3);
  } else {
    sctx.fillStyle = "#444"; sctx.font = "11px monospace"; sctx.textBaseline = "middle";
    sctx.fillText("press ▶ PLAY to start audio", 12, scope.height / 2);
  }

  drawGrid();
  requestAnimationFrame(draw);
}

// polymeter grid — every lane row shows its OWN meter's current bar (group boundaries,
// playhead, hit dots), so different meters visibly cycle at different widths.
function drawGrid(): void {
  const W = gridC.width, H = gridC.height;
  gctx.fillStyle = "#000"; gctx.fillRect(0, 0, W, H);
  const gu = seq.globalUnit;
  const rows = LANES;
  const padL = 104, padT = 6;
  const cellH = (H - padT - 6) / rows.length;
  gctx.textBaseline = "middle"; gctx.font = "9px monospace";

  for (let r = 0; r < rows.length; r++) {
    const lane = rows[r];
    const c = seq.lanes[lane];
    const e = seq.entryFor(lane, gu);
    const units = e.units, downs = e.downs, curU = e.unitInBar;
    const barStart = gu - curU;
    const y = padT + r * cellH + cellH / 2;
    const cellW = (W - padL - 8) / units;

    // labels: lane name + chosen meter
    gctx.fillStyle = "#999"; gctx.fillText(lane, 4, y - 4);
    const mLabel = c.meter === FOLLOW ? "follow" : c.meter.replace(/\s*\(.*\)/, "");
    gctx.fillStyle = "#555"; gctx.fillText(mLabel, 4, y + 6);

    // group boundaries within this lane's bar
    for (let u = 0; u < units; u++) {
      const x = padL + u * cellW;
      gctx.strokeStyle = downs.has(u) ? "#3a3a3a" : "#141414";
      gctx.lineWidth = downs.has(u) ? 1.3 : 1;
      gctx.beginPath(); gctx.moveTo(x, y - cellH / 2 + 2); gctx.lineTo(x, y + cellH / 2 - 2); gctx.stroke();
    }
    // playhead cell
    if (seq.running) {
      gctx.fillStyle = "rgba(255,255,255,0.10)";
      gctx.fillRect(padL + curU * cellW, y - cellH / 2 + 2, cellW, cellH - 4);
    }
    // hit dots — same rule the scheduler uses (POLY needs the absolute unit)
    for (let u = 0; u < units; u++) {
      if (!laneHit(c, units, downs, u, barStart + u)) continue;
      const x = padL + u * cellW + cellW / 2;
      const live = u === curU && seq.running;
      const sz = live ? 4.2 : (downs.has(u) ? 3 : 2.2);
      gctx.fillStyle = live ? "#fff" : (downs.has(u) ? "#ddd" : "#888");
      gctx.beginPath(); gctx.arc(x, y, sz, 0, Math.PI * 2); gctx.fill();
    }
  }
}

requestAnimationFrame(draw);
