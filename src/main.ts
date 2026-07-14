// main.ts — HADŌ HEN / 波動変. Wires the odd-meter sequencer to the Ikeda voices,
// builds the minimal control surface, and animates a dot-scope + meter grid.
import "./style.css";
import { AudioEngine, type EngineParams } from "./audio/engine";
import { type Lane, LANES, type VoiceParams } from "./audio/voices";
import { Sequencer, type LaneMode, type SeqParams } from "./seq/sequencer";
import { GROOVES, barUnits, downbeats, euclid, type Groove } from "./seq/meter";
import { el, slider, select } from "./ui/controls";

// ---- state -----------------------------------------------------------------
const state = {
  bpm: 132, swing: 0.0, humanize: 0.0015, accent: 0.5,
  master: 0.9, drive: 0.28, lowBoost: 5, reverbMix: 0.0,
  subTune: 52, kickDrive: 0.6, clickTone: 2200, beepTone: 880,
  grooveName: "7+5+9",
  level: { kick: 1.0, sub: 0.85, knock: 0.7, click: 0.65, tick: 0.5, noise: 0.45, beep: 0 } as Record<Lane, number>,
};

const engine = new AudioEngine();
const seqParams = (): SeqParams => ({ bpm: state.bpm, swing: state.swing, humanize: state.humanize, accent: state.accent });

let curBar = 0, curUnit = 0, flash = 0;
const seq = new Sequencer(GROOVES[state.grooveName] as Groove, {
  now: () => engine.now,
  fire: (lane, time, vel, pan) => engine.voices.trigger(lane, time, vel, voiceParams(), pan),
  onStep: (bi, ui, _units, isDown, _time) => {
    curBar = bi; curUnit = ui;
    if (isDown) flash = 1;
  },
}, seqParams);

function voiceParams(): VoiceParams {
  return {
    master: state.master, subTune: state.subTune, kickDrive: state.kickDrive,
    clickTone: state.clickTone, beepTone: state.beepTone, level: state.level,
  };
}
function engineParams(): EngineParams {
  return { master: state.master, drive: state.drive, lowBoost: state.lowBoost, reverbMix: state.reverbMix, analyser: engine.analyser };
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
  await engine.resume();
  seq.toggle();
  playBtn.classList.toggle("on", seq.running);
  playBtn.textContent = seq.running ? "■ STOP" : "▶ PLAY";
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
const gridC = el("canvas"); gridC.width = 1088; gridC.height = 190;
canvases.append(scope, gridC);
app.appendChild(canvases);

// two columns: lanes | globals
const cols = el("div", "cols");
const lanePanel = el("div", "panel");
lanePanel.appendChild(el("h2", undefined, "LANES — mode · k · length · rot · prob · level"));
const globalPanel = el("div", "panel");
globalPanel.appendChild(el("h2", undefined, "TONE / GROOVE / MASTER"));
cols.append(lanePanel, globalPanel);
app.appendChild(cols);

const MODES: LaneMode[] = ["DOWNBEAT", "EUCLID", "POLY", "OFF"];
for (const lane of LANES) buildLane(lane);
buildGlobals();

function buildLane(lane: Lane): void {
  const c = seq.lanes[lane];
  const row = el("div", "lane");
  row.append(el("span", "name", lane));
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
  lanePanel.appendChild(row);
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
    "重い低域は KICK(hard-clip)+SUB+LOW BOOST、ドット感は CLICK/TICK/BEEP。";
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
    c.k = 1 + Math.floor(Math.random() * 7);
    c.len = 4 + Math.floor(Math.random() * 9);
    c.rot = Math.floor(Math.random() * 8);
  }
  // grid + sequencer read seq.lanes live; lane sliders keep their last shown values.
}

// ---- render loop -----------------------------------------------------------
const sctx = scope.getContext("2d")!;
const gctx = gridC.getContext("2d")!;
const freqData = new Uint8Array(engine.analyser.frequencyBinCount);
const timeData = new Uint8Array(engine.analyser.fftSize);

function draw(): void {
  seq.schedule();
  engine.apply(engineParams());
  flash *= 0.86;
  grooveTag.textContent = `${state.grooveName} · bar ${curBar + 1}/${seq.groove.length}`;

  // dot scope — Ikeda: sparse points from the time-domain signal
  engine.analyser.getByteTimeDomainData(timeData);
  engine.analyser.getByteFrequencyData(freqData);
  sctx.fillStyle = "#000"; sctx.fillRect(0, 0, scope.width, scope.height);
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
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, scope.height - 3, low * scope.width, 3);

  drawGrid();
  requestAnimationFrame(draw);
}

function drawGrid(): void {
  const W = gridC.width, H = gridC.height;
  gctx.fillStyle = "#000"; gctx.fillRect(0, 0, W, H);
  const groove = seq.groove;
  const bar = groove[curBar];
  const units = barUnits(bar);
  const dbSet = new Set(downbeats(bar));
  const rows = LANES;
  const padL = 62, padT = 20;
  const cellW = (W - padL - 8) / units;
  const cellH = (H - padT - 8) / rows.length;

  // meter header: group brackets + unit numbers
  gctx.font = "10px monospace"; gctx.textBaseline = "middle";
  gctx.fillStyle = "#666";
  gctx.fillText(`${units}u  ${bar.join("+")}`, 4, 10);
  for (let u = 0; u < units; u++) {
    const x = padL + u * cellW;
    gctx.strokeStyle = dbSet.has(u) ? "#444" : "#161616";
    gctx.lineWidth = dbSet.has(u) ? 1.4 : 1;
    gctx.beginPath(); gctx.moveTo(x, padT - 4); gctx.lineTo(x, H - 4); gctx.stroke();
  }

  // playhead
  const px = padL + curUnit * cellW;
  gctx.fillStyle = "rgba(255,255,255,0.10)";
  gctx.fillRect(px, padT - 4, cellW, H - padT);

  // lane rows + hit dots (computed the same way the sequencer fires)
  for (let r = 0; r < rows.length; r++) {
    const lane = rows[r];
    const c = seq.lanes[lane];
    const y = padT + r * cellH + cellH / 2;
    gctx.fillStyle = "#555";
    gctx.fillText(lane, 4, y);
    for (let u = 0; u < units; u++) {
      let on = false;
      if (c.mode === "DOWNBEAT") on = dbSet.has(u);
      else if (c.mode === "EUCLID") on = euclid(c.k, units, c.rot)[u];
      else if (c.mode === "POLY") { const L = Math.max(1, Math.round(c.len)); on = euclid(c.k, L, c.rot)[u % L]; }
      if (!on) continue;
      const x = padL + u * cellW + cellW / 2;
      const live = u === curUnit;
      const sz = live ? 4.5 : (dbSet.has(u) ? 3.2 : 2.4);
      gctx.fillStyle = live ? "#fff" : (dbSet.has(u) ? "#ddd" : "#888");
      gctx.beginPath(); gctx.arc(x, y, sz, 0, Math.PI * 2); gctx.fill();
    }
  }
}

requestAnimationFrame(draw);
