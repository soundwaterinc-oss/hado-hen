// main.ts — HADŌ HEN / 波動変. Wires the odd-meter sequencer to the Ikeda voices,
// builds the minimal control surface, and animates a dot-scope + meter grid.
import "./style.css";
import { AudioEngine, type EngineParams } from "./audio/engine";
import { type Lane, LANES, type VoiceParams } from "./audio/voices";
import { Sequencer, laneHit, METERS, FOLLOW, type LaneMode, type SeqParams, type GateMode } from "./seq/sequencer";
import { GROOVES, type Groove } from "./seq/meter";
import { QuantumField } from "./field/field";
import { WORLD_NAMES } from "./seq/world";
import { NatureMod, NATURE_SOURCES, type NatureSource } from "./seq/nature";
import { Arranger, ARRANGE_ENGINES, type ArrangeEngine, type ArrangeOpts } from "./seq/arranger";
import { el, slider, select } from "./ui/controls";

// ---- state -----------------------------------------------------------------
const state = {
  bpm: 132, swing: 0.0, humanize: 0.0006, accent: 0.5,
  master: 0.9, drive: 0.28, lowBoost: 5, reverbMix: 0.0,
  subTune: 52, kickDrive: 0.6, clickTone: 2200, beepTone: 880, rollRate: 45, susLen: 0.45,
  // HADŌ quantum field
  gateMode: "OR" as GateMode, gateThresh: 0.3, density: 0.35, fieldAmt: 0.5, fieldSpeed: 1.0, fieldExcite: 0.7,
  // LIQUID — resonant squelch driven by a natural function
  liquid: 0.16, liqSource: "LSYS" as NatureSource, liqBase: 480, liqDepth: 900, liqQ: 11,
  liqRate: 0.5, liqDelay: 0.05, liqDelayMod: 0.4, liqFb: 0.4,
  // 自動展開 (auto-arranger)
  arrangeOn: false, arrangeEngine: "LSYSTEM" as ArrangeEngine, sectionBars: 4, arrangeIntensity: 0.6, arrangeStages: 5,
  grooveName: "7+5+9",
  level: { kick: 1.0, sub: 0.85, drag: 0.8, sus: 0.72, knock: 0.7, roll: 1.0, click: 0.74, tick: 0.66, noise: 0.5, beep: 0.3 } as Record<Lane, number>,
};

const field = new QuantumField(128);
const natureMod = new NatureMod();
const arranger = new Arranger();
let liqNature = 0.5; // current natural-modulator value (0..1) for the liquid filter

// Audio is created lazily on the first PLAY click (inside the user gesture). If audio
// init fails on a device, the whole UI still renders — the play button always appears.
let engine: AudioEngine | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let timeData: Uint8Array<ArrayBuffer> | null = null;
const seqParams = (): SeqParams => ({
  bpm: state.bpm, swing: state.swing, humanize: state.humanize, accent: state.accent,
  gateMode: state.gateMode, gateThresh: state.gateThresh, density: state.density, fieldAmt: state.fieldAmt,
});

let curBar = 0, flash = 0;
const seq = new Sequencer(GROOVES[state.grooveName] as Groove, {
  now: () => (engine ? engine.now : 0),
  fire: (lane, time, vel, pan) => {
    engine?.voices.trigger(lane, time, vel, voiceParams(), pan);
    // low-end hits excite the field → 拍 that stirs the 波動
    if (lane === "kick" || lane === "sub" || lane === "drag") {
      field.excite(0.5 + (Math.random() * 2 - 1) * 0.2, state.fieldExcite * vel, 4 + Math.random() * 4);
    }
  },
  probe: (pos01) => field.probe(pos01),
  onStep: (bi, _ui, _units, isDown, _time) => {
    curBar = bi;
    if (isDown) flash = 1;
    if (bi !== prevBar) { prevBar = bi; arranger.notifyBar(arrangeOpts(), seq, (p) => field.probe(p), applyArrange); }
  },
}, seqParams);

let prevBar = -1;
const arrangeOpts = (): ArrangeOpts => ({
  on: state.arrangeOn, engine: state.arrangeEngine, sectionBars: state.sectionBars,
  intensity: state.arrangeIntensity, stages: state.arrangeStages,
});
function applyArrange(g: { density: number; gateThresh: number; liqDepth: number; liqRate: number }): void {
  state.density = g.density; state.gateThresh = g.gateThresh;
  state.liqDepth = g.liqDepth; state.liqRate = g.liqRate;
  natureMod.reseed(arranger.stage);  // liquid movement evolves with the section, too
}

function voiceParams(): VoiceParams {
  return {
    master: state.master, subTune: state.subTune, kickDrive: state.kickDrive,
    clickTone: state.clickTone, beepTone: state.beepTone, rollRate: state.rollRate, susLen: state.susLen, level: state.level,
  };
}
function engineParams(): EngineParams {
  return {
    master: state.master, drive: state.drive, lowBoost: state.lowBoost, reverbMix: state.reverbMix,
    liquid: state.liquid,
    liqCutoff: state.liqBase + state.liqDepth * liqNature,        // natural-function sweep
    liqQ: state.liqQ,
    liqDelay: state.liqDelay + state.liqDelayMod * 0.05 * liqNature, // gooey pitch wobble
    liqFb: state.liqFb,
  };
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
    if (seq.running) { arranger.reset(); prevBar = -1; }
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
const autoBtn = el("button", "auto", "⟳ AUTO");
autoBtn.addEventListener("click", () => {
  state.arrangeOn = !state.arrangeOn;
  autoBtn.classList.toggle("on", state.arrangeOn);
  if (state.arrangeOn) { arranger.reset(); prevBar = -1; }
});
transport.append(playBtn, el("span", "tag", "GROOVE"), grooveSel, randBtn, autoBtn, grooveTag);
app.appendChild(transport);

// ---- settings / presets ----------------------------------------------------
const LS_KEY = "hadohen.presets.v1";
type Settings = { v: number; state: typeof state; lanes: typeof seq.lanes };
function loadPresets(): Record<string, Settings> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function storePresets(p: Record<string, Settings>): void { localStorage.setItem(LS_KEY, JSON.stringify(p)); }
function snapshot(): Settings {
  return { v: 1, state: JSON.parse(JSON.stringify(state)), lanes: JSON.parse(JSON.stringify(seq.lanes)) };
}
function applySettings(s: Settings | undefined): void {
  if (!s || !s.state) return;
  Object.assign(state, s.state);
  if (s.lanes) for (const k of LANES) if (s.lanes[k]) Object.assign(seq.lanes[k], s.lanes[k]);
  if (!GROOVES[state.grooveName]) state.grooveName = Object.keys(GROOVES)[0];
  seq.setGroove(GROOVES[state.grooveName] as Groove);
  grooveSel.value = state.grooveName;
  autoBtn.classList.toggle("on", state.arrangeOn);
  rebuildLanes(); rebuildGlobals();
}

const transport2 = el("div", "transport");
const presetSel = select(["— presets —"], "— presets —", (v) => {
  const p = loadPresets(); if (p[v]) applySettings(p[v]);
});
function refreshPresetSel(): void {
  presetSel.replaceChildren();
  for (const n of ["— presets —", ...Object.keys(loadPresets())]) {
    const o = el("option"); o.value = n; o.textContent = n; presetSel.appendChild(o);
  }
}
const saveBtn = el("button", undefined, "＋ SAVE");
saveBtn.addEventListener("click", () => {
  const name = prompt("preset name?");
  if (!name) return;
  const p = loadPresets(); p[name] = snapshot(); storePresets(p); refreshPresetSel(); presetSel.value = name;
});
const delBtn = el("button", undefined, "🗑 DEL");
delBtn.addEventListener("click", () => {
  const name = presetSel.value; if (name.startsWith("—")) return;
  const p = loadPresets(); delete p[name]; storePresets(p); refreshPresetSel();
});
const expBtn = el("button", undefined, "⇩ EXPORT");
expBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" }));
  a.download = "hado-hen-settings.json"; a.click(); URL.revokeObjectURL(a.href);
});
const impInput = el("input"); impInput.type = "file"; impInput.accept = "application/json"; impInput.style.display = "none";
impInput.addEventListener("change", async () => {
  const f = impInput.files?.[0]; if (!f) return;
  try { applySettings(JSON.parse(await f.text())); } catch (e) { console.error("import failed", e); }
  impInput.value = "";
});
const impBtn = el("button", undefined, "⇧ IMPORT");
impBtn.addEventListener("click", () => impInput.click());
transport2.append(el("span", "tag", "SETTINGS"), saveBtn, presetSel, delBtn, expBtn, impBtn, impInput);
app.appendChild(transport2);
refreshPresetSel();

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
const globalRows = el("div");
globalPanel.appendChild(globalRows);
cols.append(lanePanel, globalPanel);
app.appendChild(cols);

const MODES: LaneMode[] = ["DOWNBEAT", "EUCLID", "POLY", "WORLD", "OFF"];
rebuildLanes();
rebuildGlobals();

function rebuildLanes(): void {
  laneRows.replaceChildren();
  for (const lane of LANES) buildLane(lane);
}
function rebuildGlobals(): void {
  globalRows.replaceChildren();
  buildGlobals();
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
  // world rhythm cell — picking one switches the lane to WORLD mode
  const worldSel = select(WORLD_NAMES, c.pattern, (v) => { c.pattern = v; c.mode = "WORLD"; rebuildLanes(); }, "world");
  sliders.append(
    worldSel,
    slider("k", 0, 16, 1, c.k, (v) => String(v), (v) => { c.k = v; }),
    slider("len", 1, 16, 1, c.len, (v) => String(v), (v) => { c.len = v; }),
    slider("rot", 0, 15, 1, c.rot, (v) => String(v), (v) => { c.rot = v; }),
    slider("prob", 0, 1, 0.05, c.prob, (v) => v.toFixed(2), (v) => { c.prob = v; }),
    slider("lvl", 0, 1.2, 0.05, state.level[lane], (v) => v.toFixed(2), (v) => { state.level[lane] = v; }),
  );
  row.appendChild(sliders);
  laneRows.appendChild(row);
}

function labeledSelect(label: string, options: string[], value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = el("div", "ctl");
  wrap.appendChild(el("label", undefined, label));
  wrap.appendChild(select(options, value, onChange));
  return wrap;
}

function buildGlobals(): void {
  const g = globalRows;
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
    el("div", "tag", "· HADŌ FIELD |ψ|² ·"),
    labeledSelect("GATE MODE", ["MANUAL", "QUANTUM", "AND", "OR"], state.gateMode, (v) => { state.gateMode = v as GateMode; }),
    slider("GATE THRESH", 0, 1, 0.02, state.gateThresh, (v) => v.toFixed(2), (v) => { state.gateThresh = v; }),
    slider("DENSITY", 0, 1, 0.05, state.density, (v) => v.toFixed(2), (v) => { state.density = v; }),
    slider("FIELD→VEL", 0, 1, 0.05, state.fieldAmt, (v) => v.toFixed(2), (v) => { state.fieldAmt = v; }),
    slider("FIELD SPEED", 0.1, 3, 0.1, state.fieldSpeed, (v) => v.toFixed(1), (v) => { state.fieldSpeed = v; }),
    slider("EXCITE", 0, 2, 0.05, state.fieldExcite, (v) => v.toFixed(2), (v) => { state.fieldExcite = v; }),
    el("div", "tag", "· 自動展開 AUTO-ARRANGE ·"),
    labeledSelect("ENGINE", ARRANGE_ENGINES, state.arrangeEngine, (v) => { state.arrangeEngine = v as ArrangeEngine; }),
    slider("SECTION", 1, 16, 1, state.sectionBars, (v) => v + "bar", (v) => { state.sectionBars = v; }),
    slider("INTENSITY", 0, 1, 0.05, state.arrangeIntensity, (v) => v.toFixed(2), (v) => { state.arrangeIntensity = v; }),
    slider("STAGES", 2, 8, 1, state.arrangeStages, (v) => String(v), (v) => { state.arrangeStages = v; }),
    el("div", "tag", "· LIQUID (natural-fn) ·"),
    labeledSelect("SOURCE", NATURE_SOURCES, state.liqSource, (v) => { state.liqSource = v as NatureSource; }),
    slider("MIX", 0, 1, 0.02, state.liquid, (v) => v.toFixed(2), (v) => { state.liquid = v; }),
    slider("BASE", 100, 4000, 20, state.liqBase, (v) => v + "Hz", (v) => { state.liqBase = v; }),
    slider("DEPTH", 0, 3000, 20, state.liqDepth, (v) => v + "Hz", (v) => { state.liqDepth = v; }),
    slider("RESO Q", 0.5, 24, 0.5, state.liqQ, (v) => v.toFixed(1), (v) => { state.liqQ = v; }),
    slider("RATE", 0.05, 6, 0.05, state.liqRate, (v) => v.toFixed(2) + "Hz", (v) => { state.liqRate = v; }),
    slider("DELAY", 0.002, 0.3, 0.002, state.liqDelay, (v) => (v * 1000).toFixed(0) + "ms", (v) => { state.liqDelay = v; }),
    slider("DELAY MOD", 0, 1, 0.05, state.liqDelayMod, (v) => v.toFixed(2), (v) => { state.liqDelayMod = v; }),
    slider("FEEDBACK", 0, 0.85, 0.02, state.liqFb, (v) => v.toFixed(2), (v) => { state.liqFb = v; }),
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
    "音別 変拍子: 各レーンの meter を選ぶと独立拍子で回りポリメーターになる(FOLLOW=全体グルーヴ)。<br>" +
    "WORLD リズム: 各レーンのパターン選択で世界の民族リズム(クラーベ/ベンベ/マクスーム/サンバ等)を割当(mode=WORLD)。異なる伝統が重なり位相する。<br>" +
    "SETTINGS: ＋SAVE で名前付きプリセット保存、選択で読込、EXPORT/IMPORT で JSON 入出力(ブラウザに永続)。<br>" +
    "HADŌ FIELD: 量子場 |ψ|² が拍をゲート。AND=波動が開いた時だけ発音 / QUANTUM=波動のみ / OR=拍+波動 / MANUAL=場を無視。低音が場を励起し、場が発音密度と強弱を揺らす。<br>" +
    "AUTO 自動展開: L-system/フィロタキシス/ロジスティック写像/場(|ψ|²) の自然関数が SECTION 小節ごとにパターンを再生成し、STAGES 段のアークで展開(INTENSITY=変化の強さ)。<br>" +
    "LIQUID: 高レゾ共鳴フィルタ＋変調ディレイのねちょっとした経路。SOURCE の自然関数(LSYS/LOGISTIC/KURAMOTO/FIELD/SINE)がフィルタを有機的に動かす。BASE/DEPTH/Q/RATE/DELAY/FEEDBACK で追い込み。";
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
let lastT = performance.now();

function draw(): void {
  const t = performance.now();
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  field.step(dt, state.fieldSpeed); // HADŌ field always evolves
  // LIQUID moved by a natural function (optionally the field itself)
  const fSample = Math.max(field.probe(0.2), field.probe(0.5), field.probe(0.8));
  liqNature = natureMod.step(dt, state.liqRate, state.liqSource, fSample);
  seq.schedule();
  if (engine) engine.apply(engineParams());
  flash *= 0.86;
  grooveTag.textContent = `${state.grooveName} · bar ${curBar + 1}/${seq.groove.length}`;

  // scope — HADŌ |ψ|² wave field + Ikeda dots of the audio signal
  sctx.fillStyle = "#000"; sctx.fillRect(0, 0, scope.width, scope.height);
  // field: filled probability density curve
  sctx.fillStyle = "#141414"; sctx.beginPath(); sctx.moveTo(0, scope.height);
  for (let i = 0; i < field.N; i++) {
    const x = (i / (field.N - 1)) * scope.width;
    const y = scope.height - Math.min(1, field.mag[i]) * scope.height * 0.92;
    sctx.lineTo(x, y);
  }
  sctx.lineTo(scope.width, scope.height); sctx.closePath(); sctx.fill();
  sctx.strokeStyle = "#3a3a3a"; sctx.lineWidth = 1; sctx.beginPath();
  for (let i = 0; i < field.N; i++) {
    const x = (i / (field.N - 1)) * scope.width;
    const y = scope.height - Math.min(1, field.mag[i]) * scope.height * 0.92;
    i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
  }
  sctx.stroke();
  if (engine && freqData && timeData) {
    engine.analyser.getByteTimeDomainData(timeData);
    sctx.fillStyle = "#fff";
    const N = timeData.length, step = 4;
    for (let i = 0; i < N; i += step) {
      const x = (i / N) * scope.width;
      const y = (timeData[i] / 255) * scope.height;
      sctx.fillRect(x, y, 1.5, 1.5);
    }
  } else {
    sctx.fillStyle = "#555"; sctx.font = "11px monospace"; sctx.textBaseline = "middle";
    sctx.fillText("press ▶ PLAY to start audio", 12, 14);
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
