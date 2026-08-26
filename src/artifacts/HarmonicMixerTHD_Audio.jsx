import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Play, Square, Sun, Moon, Save, FolderOpen, Trash2, RotateCcw, Volume2,
  VolumeX, Activity, BarChart3, Sliders, AlertTriangle, X, Link2, Link2Off, Music,
} from "lucide-react";

// ── identidad lightXtool: paleta dark/light AA, DEFAULT = oscuro ───────
const PALETTES = {
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", borderStrong: "rgba(0,160,250,0.45)",
    text: "#FFFFFF", textDim: "rgba(255,255,255,0.62)", textFaint: "rgba(255,255,255,0.34)",
    cyan: "#00A0FA", cyanLight: "#40A2FC", red: "#FF1D1D", redBg: "rgba(255,29,29,0.12)",
    glow: true,
  },
  light: {
    page: "#F5F5F5", panel: "#FFFFFF", panelAlt: "#F0F0F0",
    border: "rgba(0,160,250,0.3)", borderStrong: "rgba(0,160,250,0.5)",
    text: "#000000", textDim: "#3A3A3A", textFaint: "#6B6B6B",
    cyan: "#026B96", cyanLight: "#00A0FA", red: "#C81414", redBg: "#FFE5E5",
    glow: false,
  },
};
const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
const STORAGE_KEY = "harmonicMixer:mezclas:v2";
const TONE_COUNT = 9;
const MIN_DB = -99;

// ── utilidades numéricas ────────────────────────────────────────────────
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const ampFromDb = (db) => Math.pow(10, db / 20);
const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));

// Nota musical más cercana (afinación estándar 12-TET, A4 = 440Hz) + desvío
// en centésimas. Es la referencia usada en toda la industria de audio/música.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqToNote(freq) {
  if (!freq || freq <= 0) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return { label: `${name}${octave}`, cents };
}

function defaultTones(fundamental) {
  return Array.from({ length: TONE_COUNT }, (_, i) => ({
    level: i === 0 ? 0 : MIN_DB,
    freq: round((i + 1) * fundamental, 2),
    phase: 0,
  }));
}

// Peak / RMS / Crest Factor / THD-F — replica exacta de las fórmulas de la
// hoja "Mixer" del Excel original: todo se calcula sobre UN solo ciclo del
// tono 1 (0°-360°, referencia de la fundamental), independientemente de
// cuántos ciclos se estén mostrando en la gráfica de forma de onda. El
// ángulo de cada tono avanza según su propia frecuencia relativa a la
// fundamental (freq_i / freq_1), igual que hace el Excel con I51=Freq/Step.
// THD-F% = raíz(suma de cuadrados de tonos 2-9) / tono 1 × 100 — es la
// definición "ratio a la fundamental" (distinta de THD-R, que divide entre
// el RMS total); se etiqueta así para no confundirla con otros analizadores.
function computeStats(tones) {
  const N = 2000;
  const f0 = tones[0].freq || 1;
  let sumSq = 0, peak = 0;
  for (let s = 0; s < N; s++) {
    const deg = (s / N) * 360;
    let y = 0;
    for (const tone of tones) {
      const a = ampFromDb(tone.level);
      const ratio = tone.freq / f0;
      const angleDeg = deg * ratio + tone.phase;
      y += a * Math.sin((angleDeg * Math.PI) / 180);
    }
    sumSq += y * y;
    if (Math.abs(y) > peak) peak = Math.abs(y);
  }
  const rms = Math.sqrt(sumSq / N);
  const crestDb = rms > 0 ? 20 * Math.log10(peak / rms) : 0;
  const amp1 = ampFromDb(tones[0].level);
  const sumHarmSq = tones.slice(1).reduce((s, t) => s + ampFromDb(t.level) ** 2, 0);
  const thd = amp1 > 0 ? (100 * Math.sqrt(sumHarmSq)) / amp1 : 0;
  return { peak, rms, crestDb, thd };
}

// Puntos para la gráfica de forma de onda — misma lógica angular, pero
// extendida a "cycles" ciclos de la fundamental, con más muestras por
// ciclo para que la curva se vea suave.
function buildWavePoints(tones, cycles, samplesPerCycle = 180) {
  const N = cycles * samplesPerCycle;
  const f0 = tones[0].freq || 1;
  const pts = new Array(N + 1);
  for (let s = 0; s <= N; s++) {
    const deg = (s / samplesPerCycle) * 360;
    let y = 0;
    for (const tone of tones) {
      const a = ampFromDb(tone.level);
      const ratio = tone.freq / f0;
      const angleDeg = deg * ratio + tone.phase;
      y += a * Math.sin((angleDeg * Math.PI) / 180);
    }
    pts[s] = y;
  }
  return pts;
}

// ── presets: series de Fourier estándar de cada forma de onda clásica,
// truncadas a 9 armónicos (límite del mezclador). Nivel en dB relativo a
// 0dB = amplitud unitaria del armónico 1: cuadrada = impares 1/n,
// triangular = impares 1/n² alternando signo, sierra = todos 1/n
// alternando signo. NOTA: "ruido rosa"/"aleatorio" se quitaron de aquí — con
// solo 9 armónicos discretos de una misma fundamental, el resultado es un
// acorde/zumbido con altura tonal definida, no ruido real (señal de banda
// ancha, estocástica, sin periodicidad). El ruido real vive en su propia
// sección al final del artifact, generado con un motor distinto.
const PRESET_LABELS = {
  sine: "Senoidal", square: "Cuadrada", triangle: "Triangular",
  sawUp: "Sierra (subida)", sawDown: "Sierra (bajada)",
};

function presetTones(key, fundamental) {
  const t = defaultTones(fundamental);
  if (key === "sine") return t;
  if (key === "square") {
    [0, 2, 4, 6, 8].forEach((i) => { const n = i + 1; t[i].level = round(20 * Math.log10(1 / n)); t[i].phase = 0; });
    return t;
  }
  if (key === "triangle") {
    const sign = { 1: 1, 3: -1, 5: 1, 7: -1, 9: 1 };
    [0, 2, 4, 6, 8].forEach((i) => { const n = i + 1; t[i].level = round(-40 * Math.log10(n)); t[i].phase = sign[n] < 0 ? 180 : 0; });
    return t;
  }
  if (key === "sawUp" || key === "sawDown") {
    for (let i = 0; i < 9; i++) {
      const n = i + 1;
      const sign = n % 2 === 1 ? 1 : -1;
      const basePhase = sign < 0 ? 180 : 0;
      t[i].level = round(-20 * Math.log10(n));
      t[i].phase = key === "sawDown" ? (basePhase + 180) % 360 : basePhase;
    }
    return t;
  }
  return t;
}

// ── generación de ruido real (independiente del mezclador de 9 tonos) ──
// Técnicas prácticas estándar en programación de audio — aproximaciones,
// no la única forma de generarlas, pero sí las más citadas:
// - Blanco: muestras aleatorias independientes (densidad espectral plana).
// - Rosa: algoritmo de Voss-McCartney (suma de generadores actualizados a
//   distintas tasas de octava vía conteo de bits) — aproxima -3dB/octava.
// - Marrón/Rojo: integración con fuga de ruido blanco (paseo aleatorio
//   acotado) — aproxima -6dB/octava.
// - Azul: diferenciación de ruido blanco (inverso del rosa) — aproxima +3dB/octava.
const NOISE_TYPES = {
  white: { label: "Blanco", slopeDbOct: 0 },
  pink: { label: "Rosa", slopeDbOct: -3 },
  brown: { label: "Marrón / Rojo", slopeDbOct: -6 },
  blue: { label: "Azul", slopeDbOct: 3 },
};
function genWhite(n) { return Array.from({ length: n }, () => Math.random() * 2 - 1); }
function genPink(n) {
  const numRows = 16;
  const rows = new Array(numRows).fill(0).map(() => Math.random() * 2 - 1);
  let runningSum = rows.reduce((a, b) => a + b, 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let row = 0, x = i + 1;
    while ((x & 1) === 0 && row < numRows - 1) { x >>= 1; row++; }
    runningSum -= rows[row];
    rows[row] = Math.random() * 2 - 1;
    runningSum += rows[row];
    out[i] = (runningSum + (Math.random() * 2 - 1)) / (numRows + 1);
  }
  const m = Math.max(...out.map(Math.abs)) || 1;
  return out.map((v) => (v / m) * 0.9);
}
function genBrown(n) {
  let last = 0;
  const out = new Array(n);
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; out[i] = last; }
  const m = Math.max(...out.map(Math.abs)) || 1;
  return out.map((v) => (v / m) * 0.9);
}
function genBlue(n) {
  const w = genWhite(n);
  const out = new Array(n);
  out[0] = 0;
  for (let i = 1; i < n; i++) out[i] = w[i] - w[i - 1];
  const m = Math.max(...out.map(Math.abs)) || 1;
  return out.map((v) => (v / m) * 0.9);
}
function genNoise(type, n) {
  if (type === "pink") return genPink(n);
  if (type === "brown") return genBrown(n);
  if (type === "blue") return genBlue(n);
  return genWhite(n);
}
// Magnitud espectral por correlación directa (equivalente a un bin de
// Goertzel) para cada frecuencia objetivo — real, calculada sobre la
// muestra generada, no una curva inventada. Con fines ilustrativos se
// asume una frecuencia de muestreo nominal de 44100Hz (estándar de audio),
// aunque el buffer nunca se reproduce a esa tasa real en este panel.
const NOISE_FS = 44100;
function magnitudeAtFreq(buf, f, fs) {
  const N = buf.length;
  const w = (2 * Math.PI * f) / fs;
  let re = 0, im = 0;
  for (let n = 0; n < N; n++) { const a = w * n; re += buf[n] * Math.cos(a); im -= buf[n] * Math.sin(a); }
  return Math.sqrt(re * re + im * im) / N;
}

// ── bandas de mezcla estándar (nomenclatura de ingeniería de audio) y
// color por frecuencia: interpola el matiz entre los dos acentos de marca
// (cian ~200° para graves, rojo ~0° para agudos) sobre escala logarítmica.
// Al bajar el matiz de 200° a 0° se cruza por verde/amarillo de forma
// natural — el efecto visual clásico de "espectrómetro" sin salirse de los
// dos colores de marca en los extremos.
const BANDS = [
  { name: "Sub-graves", from: 20, to: 60 },
  { name: "Graves", from: 60, to: 250 },
  { name: "Medios-bajos", from: 250, to: 500 },
  { name: "Medios", from: 500, to: 2000 },
  { name: "Medios-altos", from: 2000, to: 4000 },
  { name: "Presencia", from: 4000, to: 6000 },
  { name: "Brillo / Aire", from: 6000, to: 20000 },
];
const FMIN = 20, FMAX = 20000;
function hueForFreq(f) {
  const logMin = Math.log10(FMIN), logMax = Math.log10(FMAX);
  const pos = clamp((Math.log10(clamp(f, FMIN, FMAX)) - logMin) / (logMax - logMin), 0, 1);
  return 200 - 200 * pos;
}

// ── input de texto controlado: se puede borrar el campo completo mientras
// se escribe (no fuerza ceros ni un mínimo en cada tecla); los límites solo
// se aplican al salir del campo (blur). Mismo patrón que el resto del
// ecosistema lightXtool. ─────────────────────────────────────────────────
function NumberField({ value, onCommit, min, max, decimals = 1, style, disabled, ...rest }) {
  const format = (v) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    const f = 10 ** decimals;
    return String(Math.round(v * f) / f);
  };
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(format(value)); }, [value]); // eslint-disable-line
  return (
    <input
      type="text" inputMode="decimal" value={text} disabled={disabled} style={style}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        if (raw !== "" && raw !== "-" && raw !== "." && !Number.isNaN(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        let n = Number(text);
        if (text === "" || text === "-" || text === "." || Number.isNaN(n)) n = value ?? 0;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        setText(format(n));
        onCommit(n);
      }}
      {...rest}
    />
  );
}

export default function HarmonicMixerTHD() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  const [fundamental, setFundamental] = useState(100);
  const [cyclesToShow, setCyclesToShow] = useState(3);
  const [linked, setLinked] = useState(true);
  const [tones, setTones] = useState(() => defaultTones(100));
  const [presetLabel, setPresetLabel] = useState("Senoidal");

  const [masterVolume, setMasterVolume] = useState(15); // % — deliberadamente conservador
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef({ ctx: null, master: null, comp: null, oscs: [] });

  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const wavCanvasRef = useRef(null);
  const specCanvasRef = useRef(null);

  // ── generador de ruido (sección independiente, meramente gráfica) ──────
  const [noiseType, setNoiseType] = useState("pink");
  const [noiseVersion, setNoiseVersion] = useState(0);
  const noiseWavCanvasRef = useRef(null);
  const noiseSpecCanvasRef = useRef(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  // ── vincular frecuencias de armónicos a la fundamental ────────────────
  useEffect(() => {
    if (!linked) return;
    setTones((prev) => prev.map((t, i) => ({ ...t, freq: round((i + 1) * fundamental, 2) })));
  }, [fundamental, linked]);

  const updateTone = (idx, patch) => {
    setTones((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setPresetLabel("Personalizado");
  };

  const applyPreset = (key) => {
    setTones(presetTones(key, fundamental));
    setPresetLabel(PRESET_LABELS[key]);
  };

  const resetAll = () => {
    setFundamental(100); setCyclesToShow(3); setLinked(true);
    setTones(defaultTones(100)); setPresetLabel("Senoidal");
    flash("✓ valores restablecidos");
  };

  // ── cálculos ────────────────────────────────────────────────────────
  const stats = useMemo(() => computeStats(tones), [tones]);
  const wavePts = useMemo(() => buildWavePoints(tones, cyclesToShow), [tones, cyclesToShow]);
  const fundamentalNote = useMemo(() => freqToNote(fundamental), [fundamental]);
  // ¿Hay algún tono 2-9 encendido cuya frecuencia NO sea un múltiplo entero
  // (±0.5%) de la fundamental? Si sí, ya no son armónicos reales y el THD
  // deja de ser riguroso en sentido estricto — se avisa en vez de callarlo.
  const hasInharmonicActive = useMemo(() => {
    const f0 = tones[0].freq || 1;
    return tones.slice(1).some((t) => {
      if (t.level <= MIN_DB + 0.5) return false;
      const ratio = t.freq / f0;
      return Math.abs(ratio - Math.round(ratio)) > 0.005;
    });
  }, [tones]);

  // ── guardado local (window.storage, personal) ─────────────────────────
  useEffect(() => {
    (async () => {
      try { const res = await window.storage.get(STORAGE_KEY, false); setSaved(res ? JSON.parse(res.value) : []); }
      catch { setSaved([]); }
    })();
  }, []);
  const saveMix = async () => {
    const name = (saveName || "").trim() || presetLabel || `Mezcla ${saved.length + 1}`;
    const entry = { id: `mix-${Date.now()}`, name, fundamental, cyclesToShow, linked, tones, savedAt: Date.now() };
    const next = [...saved, entry];
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); setSaved(next); setSaveName(""); flash(`✓ guardada "${name}"`); }
    catch { flash("× no se pudo guardar"); }
  };
  const loadMix = (m) => {
    setFundamental(m.fundamental); setCyclesToShow(m.cyclesToShow); setLinked(m.linked); setTones(m.tones);
    setPresetLabel(m.name); flash(`Cargada "${m.name}"`);
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const next = saved.filter((s) => s.id !== pendingDelete.id);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); setSaved(next); } catch {}
    setPendingDelete(null);
  };

  // ── Web Audio API: síntesis en vivo ────────────────────────────────────
  // Un oscilador senoidal real por tono activo (nivel > -90dB, frecuencia
  // audible 20Hz-20kHz), sumados en un nodo maestro con compresor de
  // seguridad para evitar clipping. Cambios de nivel/frecuencia/fase
  // mientras suena se aplican en vivo (setTargetAtTime) sin reiniciar.
  const ensureAudio = () => {
    if (audioRef.current.ctx) return audioRef.current;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 8;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    audioRef.current = { ctx, master, comp, oscs: [] };
    return audioRef.current;
  };

  const startAudio = () => {
    const { ctx, master } = ensureAudio();
    if (ctx.state === "suspended") ctx.resume();
    const oscs = tones.map((tone) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = clamp(tone.freq, 20, 20000);
      gain.gain.value = 0;
      osc.connect(gain); gain.connect(master);
      osc.start();
      return { osc, gain, tone };
    });
    audioRef.current.oscs = oscs;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime((masterVolume / 100) * 0.35, ctx.currentTime, 0.02);
    applyLiveLevels(oscs);
    setIsPlaying(true);
  };

  const stopAudio = () => {
    const { ctx, master, oscs } = audioRef.current;
    if (!ctx) return setIsPlaying(false);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    const toStop = oscs;
    setTimeout(() => { toStop.forEach(({ osc }) => { try { osc.stop(); } catch {} }); }, 150);
    audioRef.current.oscs = [];
    setIsPlaying(false);
  };

  const applyLiveLevels = useCallback((oscsArg) => {
    const { ctx } = audioRef.current;
    const oscs = oscsArg || audioRef.current.oscs;
    if (!ctx || !oscs.length) return;
    tones.forEach((tone, i) => {
      const pair = oscs[i];
      if (!pair) return;
      const audible = tone.level > -90 && tone.freq >= 20 && tone.freq <= 20000;
      const g = audible ? ampFromDb(tone.level) : 0;
      pair.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
      pair.osc.frequency.setTargetAtTime(clamp(tone.freq, 20, 20000), ctx.currentTime, 0.02);
    });
  }, [tones]);

  useEffect(() => { if (isPlaying) applyLiveLevels(); }, [tones, isPlaying, applyLiveLevels]);
  useEffect(() => {
    const { ctx, master } = audioRef.current;
    if (isPlaying && ctx) master.gain.setTargetAtTime((masterVolume / 100) * 0.35, ctx.currentTime, 0.02);
  }, [masterVolume, isPlaying]);
  useEffect(() => () => { try { stopAudio(); audioRef.current.ctx && audioRef.current.ctx.close(); } catch {} }, []); // eslint-disable-line

  // ── dibujo: forma de onda, con cotas de referencia ──────────────────────
  // Cota horizontal = periodo T de la fundamental (ms), entre dos cruces de
  // ciclo consecutivos. Cota vertical = amplitud pico. Línea punteada = RMS.
  useEffect(() => {
    const canvas = wavCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const padB = 30, padT = 10;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme === "dark" ? "#050505" : "#FAFAFA";
    ctx.fillRect(0, 0, W, H);

    const maxAbs = Math.max(0.05, stats.peak) * 1.2;
    const midY = padT + (H - padT - padB) / 2;
    const plotH = H - padT - padB;
    const toY = (v) => midY - (v / maxAbs) * (plotH / 2);
    const cycleW = W / cyclesToShow;

    // rejilla + marcas de tiempo por ciclo (en ms, según la fundamental)
    const T_ms = 1000 / (tones[0].freq || 1);
    ctx.font = "9px " + FONT; ctx.textAlign = "center";
    for (let c = 0; c <= cyclesToShow; c++) {
      const x = c * cycleW;
      ctx.strokeStyle = c === 0 ? C.border : (theme === "dark" ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)");
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillStyle = C.textFaint;
      ctx.fillText(`${round(c * T_ms, 2)}ms`, clamp(x, 20, W - 20), H - padB + 12);
    }
    // línea 0 (cero)
    ctx.strokeStyle = C.border; ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
    ctx.fillStyle = C.textFaint; ctx.textAlign = "left"; ctx.fillText("0", 4, midY - 4);

    // líneas RMS (referencia, punteadas)
    if (stats.rms > 0) {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = C.cyanLight; ctx.globalAlpha = 0.6;
      [stats.rms, -stats.rms].forEach((v) => { ctx.beginPath(); ctx.moveTo(0, toY(v)); ctx.lineTo(W, toY(v)); ctx.stroke(); });
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      ctx.fillStyle = C.cyanLight; ctx.font = "9px " + FONT; ctx.textAlign = "left";
      ctx.fillText(`RMS ${round(stats.rms, 3)}`, 4, toY(stats.rms) - 3);
    }

    // forma de onda
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath();
    wavePts.forEach((v, i) => {
      const x = (i / (wavePts.length - 1)) * W;
      const y = toY(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (C.glow) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0; }

    // cota de periodo T (primer ciclo, debajo del eje de tiempo)
    const cotaY = H - 6;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cotaY); ctx.lineTo(cycleW, cotaY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cotaY - 4); ctx.lineTo(0, cotaY + 4); ctx.moveTo(cycleW, cotaY - 4); ctx.lineTo(cycleW, cotaY + 4); ctx.stroke();

    // cota de amplitud pico (lado derecho)
    const px = W - 26;
    ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(px, midY); ctx.lineTo(px, toY(stats.peak)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 4, midY); ctx.lineTo(px + 4, midY); ctx.moveTo(px - 4, toY(stats.peak)); ctx.lineTo(px + 4, toY(stats.peak)); ctx.stroke();
    ctx.fillStyle = C.red; ctx.font = "9px " + FONT; ctx.textAlign = "left";
    ctx.fillText(`Peak ${round(stats.peak, 3)}`, px + 6, (midY + toY(stats.peak)) / 2);
  }, [wavePts, theme, C, cyclesToShow, stats, tones]);

  // ── dibujo: espectro tipo espectrómetro — bandas de mezcla sombreadas +
  // barras coloreadas por frecuencia (gradiente cian→rojo de marca) ───────
  useEffect(() => {
    const canvas = specCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const padB = 34, padT = 16, padL = 4, padR = 4;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme === "dark" ? "#050505" : "#FAFAFA";
    ctx.fillRect(0, 0, W, H);

    const logMin = Math.log10(FMIN), logMax = Math.log10(FMAX);
    const toX = (f) => padL + ((Math.log10(clamp(f, FMIN, FMAX)) - logMin) / (logMax - logMin)) * (W - padL - padR);
    const dbFloor = -100;
    const toY = (db) => padT + (1 - (clamp(db, dbFloor, 0) - dbFloor) / -dbFloor) * (H - padT - padB);

    // bandas de mezcla sombreadas + etiqueta
    ctx.font = "8px " + FONT;
    BANDS.forEach((b) => {
      const x0 = toX(b.from), x1 = toX(b.to);
      const hue = hueForFreq(Math.sqrt(b.from * b.to));
      ctx.fillStyle = `hsla(${hue},70%,50%,${theme === "dark" ? 0.07 : 0.1})`;
      ctx.fillRect(x0, padT, x1 - x0, H - padT - padB);
      ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)";
      ctx.beginPath(); ctx.moveTo(x1, padT); ctx.lineTo(x1, H - padB); ctx.stroke();
      ctx.fillStyle = C.textFaint; ctx.textAlign = "center";
      if (x1 - x0 > 30) ctx.fillText(b.name, (x0 + x1) / 2, padT + 9);
    });

    // marcas de frecuencia
    ctx.font = "9px " + FONT;
    [20, 100, 1000, 10000, 20000].forEach((f) => {
      const x = toX(f);
      ctx.fillStyle = C.textFaint; ctx.textAlign = "center";
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - padB + 12);
    });
    // línea base 0dB
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(padL, toY(0)); ctx.lineTo(W - padR, toY(0)); ctx.stroke();

    // barras por tono activo, color por frecuencia + degradado por nivel
    tones.forEach((tone, i) => {
      if (tone.level <= MIN_DB + 0.5) return;
      if (tone.freq < FMIN || tone.freq > FMAX) return;
      const x = toX(tone.freq);
      const y0 = toY(dbFloor), y1 = toY(tone.level);
      const hue = hueForFreq(tone.freq);
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, `hsla(${hue},80%,35%,0.5)`);
      grad.addColorStop(1, `hsla(${hue},95%,58%,0.95)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, y1, 8, y0 - y1);
      ctx.strokeStyle = `hsl(${hue},95%,70%)`; ctx.lineWidth = 1; ctx.strokeRect(x - 4, y1, 8, y0 - y1);

      const note = freqToNote(tone.freq);
      ctx.fillStyle = C.text; ctx.font = "8px " + FONT; ctx.textAlign = "center";
      ctx.fillText(`${i + 1}`, x, y1 - 12);
      if (note) { ctx.fillStyle = C.textDim; ctx.fillText(note.label, x, y1 - 3); }
    });
  }, [tones, theme, C]);

  // Genera una nueva realización del tipo de ruido elegido (buffer de 4096
  // muestras): el mismo buffer alimenta la forma de onda (recortada a una
  // ventana corta, tipo osciloscopio) y el espectro (magnitud real,
  // calculada sobre el buffer completo — no es una curva aparentada).
  const NOISE_BUF_LEN = 4096;
  const NOISE_WAVE_WINDOW = 400;
  const noiseData = useMemo(() => {
    const buf = genNoise(noiseType, NOISE_BUF_LEN);
    let sumSq = 0, peak = 0;
    for (const v of buf) { sumSq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const rms = Math.sqrt(sumSq / buf.length);
    const crestDb = rms > 0 ? 20 * Math.log10(peak / rms) : 0;
    const bins = 48;
    const logMin = Math.log10(FMIN), logMax = Math.log10(FMAX);
    const spectrum = Array.from({ length: bins }, (_, i) => {
      const f = Math.pow(10, logMin + (i / (bins - 1)) * (logMax - logMin));
      return { f, mag: magnitudeAtFreq(buf, f, NOISE_FS) };
    });
    const maxMag = Math.max(...spectrum.map((p) => p.mag)) || 1;
    spectrum.forEach((p) => { p.db = 20 * Math.log10(p.mag / maxMag); });
    return { wave: buf.slice(0, NOISE_WAVE_WINDOW), peak, rms, crestDb, spectrum };
  }, [noiseType, noiseVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // dibujo: forma de onda del ruido (ventana corta, tipo osciloscopio)
  useEffect(() => {
    const canvas = noiseWavCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme === "dark" ? "#050505" : "#FAFAFA";
    ctx.fillRect(0, 0, W, H);
    const midY = H / 2;
    ctx.strokeStyle = C.border; ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
    const pts = noiseData.wave;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.beginPath();
    pts.forEach((v, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = midY - v * (H / 2 - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (C.glow) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0; }
  }, [noiseData, theme, C]);

  // dibujo: espectro del ruido — área continua rellena (no barras aisladas,
  // para distinguirlo visualmente de los tonos discretos del mezclador) +
  // línea punteada con la pendiente teórica de referencia.
  useEffect(() => {
    const canvas = noiseSpecCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const padB = 30, padT = 14, padL = 4, padR = 4;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme === "dark" ? "#050505" : "#FAFAFA";
    ctx.fillRect(0, 0, W, H);

    const logMin = Math.log10(FMIN), logMax = Math.log10(FMAX);
    const toX = (f) => padL + ((Math.log10(clamp(f, FMIN, FMAX)) - logMin) / (logMax - logMin)) * (W - padL - padR);
    const dbFloor = -40;
    const toY = (db) => padT + (1 - (clamp(db, dbFloor, 0) - dbFloor) / -dbFloor) * (H - padT - padB);

    ctx.font = "9px " + FONT; ctx.textAlign = "center";
    [20, 100, 1000, 10000, 20000].forEach((f) => {
      const x = toX(f);
      ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillStyle = C.textFaint;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - padB + 12);
    });
    ctx.strokeStyle = C.border; ctx.beginPath(); ctx.moveTo(padL, toY(0)); ctx.lineTo(W - padR, toY(0)); ctx.stroke();

    // área rellena, coloreada por frecuencia (mismo criterio que el espectro del mezclador)
    const pts = noiseData.spectrum;
    ctx.beginPath();
    ctx.moveTo(toX(pts[0].f), toY(dbFloor));
    pts.forEach((p) => ctx.lineTo(toX(p.f), toY(p.db)));
    ctx.lineTo(toX(pts[pts.length - 1].f), toY(dbFloor));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, `hsla(${hueForFreq(FMIN)},85%,55%,0.55)`);
    grad.addColorStop(1, `hsla(${hueForFreq(FMAX)},85%,55%,0.55)`);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = C.cyanLight; ctx.lineWidth = 1.2;
    ctx.beginPath(); pts.forEach((p, i) => { const x = toX(p.f), y = toY(p.db); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();

    // pendiente teórica de referencia (dB/octava), anclada en el primer punto
    const slope = NOISE_TYPES[noiseType].slopeDbOct;
    const f0 = pts[0].f, db0 = pts[0].db;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = C.red; ctx.globalAlpha = 0.7; ctx.beginPath();
    pts.forEach((p, i) => {
      const octaves = Math.log2(p.f / f0);
      const dbTheor = clamp(db0 + slope * octaves, dbFloor, 0);
      const x = toX(p.f), y = toY(dbTheor);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
  }, [noiseData, theme, C, noiseType]);

  // ── estilos derivados ──────────────────────────────────────────────
  const panelStyle = { backgroundColor: C.panel, border: `1px solid ${C.border}`, borderRadius: "8px" };
  const inputStyle = {
    backgroundColor: theme === "dark" ? "#050505" : "#FAFAFA", border: `1px solid ${C.border}`,
    color: C.text, fontFamily: FONT, fontSize: "12px", padding: "5px 7px", borderRadius: "3px", outline: "none",
  };
  const labelStyle = { fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 };
  const glowText = (color) => (C.glow ? { textShadow: `0 0 10px ${color}` } : {});
  const glowBox = (rgba) => (C.glow ? { boxShadow: `0 0 10px ${rgba}` } : {});
  function btnStyle(variant = "default") {
    const base = { fontFamily: FONT, fontSize: "11px", padding: "6px 12px", borderRadius: "3px", cursor: "pointer", letterSpacing: ".4px", display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid transparent" };
    if (variant === "primary") return { ...base, background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700, ...glowBox("rgba(0,160,250,.25)") };
    if (variant === "danger") return { ...base, background: C.redBg, border: `1px solid ${C.red}`, color: C.red };
    if (variant === "active") return { ...base, background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700 };
    return { ...base, background: theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF", border: `1px solid ${C.border}`, color: C.textDim, fontWeight: 700 };
  }
  const SectionHeader = ({ icon: Icon, title, subtitle, right }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon size={14} style={{ color: C.cyan }} />
        <span style={{ fontFamily: FONT, fontSize: "12px", color: C.cyan, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, ...glowText("rgba(0,160,250,.4)") }}>{title}</span>
        {subtitle && <span style={{ fontFamily: FONT, fontSize: "10px", color: C.textFaint }}>· {subtitle}</span>}
      </div>
      {right}
    </div>
  );

  const isDefault = fundamental === 100 && cyclesToShow === 3 && linked && presetLabel === "Senoidal";

  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT, padding: "16px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h1 style={{ fontSize: "17px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}, 0 0 28px rgba(0,160,250,.35)`) }}>
              ⬡ MEZCLADOR ARMÓNICO · THD
            </h1>
            <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
              9 tonos senoidales · forma de onda · espectro · Peak/RMS/Crest/THD-F · audio en vivo
            </p>
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "3px" }}>
              Basado en el trabajo y estudio de{" "}
              <a href="https://www.instagram.com/elmagu64/" target="_blank" rel="noopener noreferrer"
                style={{ color: C.cyan, textDecoration: "none", fontWeight: 700 }}>
                Mauricio Ramírez (magu)
              </a>
            </p>
            {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
          </div>
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={btnStyle()} title="Cambiar tema claro/oscuro">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
        </div>

        <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

        {/* 1. MEZCLADOR — presets + play/stop + 9 tonos, todo en un solo panel */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Sliders} title="Mezclador" subtitle={presetLabel}
            right={
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button style={btnStyle(isPlaying ? "danger" : "primary")} onClick={isPlaying ? stopAudio : startAudio}>
                  {isPlaying ? <Square size={13} /> : <Play size={13} />} {isPlaying ? "Detener" : "Reproducir"}
                </button>
                <button style={btnStyle()} onClick={resetAll} disabled={isDefault} title="Restablecer todo a senoidal 100Hz">
                  <RotateCcw size={13} />
                </button>
              </div>
            } />

          {/* volumen — solo visible mientras suena, para no distraer si no se está escuchando */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
            {isPlaying ? <Volume2 size={13} style={{ color: C.cyan }} /> : <VolumeX size={13} style={{ color: C.textFaint }} />}
            <input type="range" min={0} max={100} value={masterVolume} style={{ flex: 1, maxWidth: "220px", accentColor: C.cyan }}
              onChange={(e) => setMasterVolume(Number(e.target.value))} />
            <span style={{ fontSize: "10px", color: C.textFaint }}>{masterVolume}% — sube con cuidado</span>
          </div>

          {/* presets */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            {Object.entries(PRESET_LABELS).map(([k, lb]) => (
              <button key={k} style={btnStyle(presetLabel === lb ? "active" : "default")} onClick={() => applyPreset(k)}>{lb}</button>
            ))}
          </div>
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
            Formas de onda periódicas (series de Fourier truncadas a 9 armónicos). El ruido real
            (blanco/rosa/marrón/azul) no se puede sintetizar con 9 tonos discretos — tiene su propia
            sección al final del artifact, con un motor de generación distinto.
          </p>

          {/* tabla de 9 tonos */}
          <div style={{ overflowX: "auto", marginTop: "12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", minWidth: "600px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {[linked ? "Armónico" : "Parcial", "Frecuencia", "Nivel (dB)", "Fase (°)", ""].map((h) => (
                    <th key={h} style={{ ...labelStyle, textAlign: "left", padding: "5px 8px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tones.map((tone, i) => {
                  const isOff = tone.level <= MIN_DB + 0.5;
                  const note = freqToNote(tone.freq);
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: i === 0 ? C.cyan : C.textDim }}>
                        {i === 0 ? "1 · fundamental" : i + 1}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        {linked ? (
                          // vinculada a la fundamental: se muestra como referencia clara
                          // (no como campo gris "en blanco"), no se edita aquí.
                          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                            <span style={{ color: C.text, fontWeight: 700 }}>{round(tone.freq, 2)} Hz</span>
                            <span style={{ color: C.textFaint, fontSize: "9px" }}>
                              {i === 0 ? "" : `${i + 1}× f₀ · `}{note ? `${note.label} ${note.cents >= 0 ? "+" : ""}${note.cents}¢` : ""}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <NumberField min={0.1} max={20000} decimals={2} value={tone.freq}
                              onCommit={(n) => updateTone(i, { freq: n })} style={{ ...inputStyle, width: "84px" }} />
                            <span style={{ color: C.textFaint, fontSize: "9px" }}>{note ? `${note.label} ${note.cents >= 0 ? "+" : ""}${note.cents}¢` : ""}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input type="range" min={MIN_DB} max={0} step={0.1} value={tone.level} style={{ width: "90px", accentColor: C.cyan }}
                            onChange={(e) => updateTone(i, { level: Number(e.target.value) })} />
                          <NumberField min={MIN_DB} max={0} decimals={1} value={tone.level}
                            onCommit={(n) => updateTone(i, { level: n })} style={{ ...inputStyle, width: "56px" }} />
                        </div>
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <NumberField min={-360} max={360} decimals={0} value={tone.phase}
                          onCommit={(n) => updateTone(i, { phase: n })} style={{ ...inputStyle, width: "56px" }} />
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <button style={{ ...btnStyle(isOff ? "default" : "danger"), padding: "3px 8px" }}
                          onClick={() => updateTone(i, { level: isOff ? 0 : MIN_DB })} title={isOff ? "Activar" : "Silenciar"}>
                          {isOff ? "Off" : "On"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
            <button style={btnStyle(linked ? "active" : "default")} onClick={() => setLinked((v) => !v)}>
              {linked ? <Link2 size={13} /> : <Link2Off size={13} />}
              {linked ? "Vinculados a la fundamental" : "Frecuencias libres (parciales inarmónicos)"}
            </button>
            {!linked && (
              <span style={{ fontSize: "9px", color: C.textFaint }}>
                Al desvincular, las frecuencias 2-9 se editan a mano y ya no son "armónicos" en sentido estricto salvo que resulten múltiplos enteros.
              </span>
            )}
          </div>
        </div>

        {/* 2. REFERENCIA — fundamental + nota musical */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Music} title="Referencia" subtitle="frecuencia fundamental" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "12px", marginTop: "10px", alignItems: "end" }}>
            <div>
              <div style={labelStyle}>Frecuencia fundamental (Hz)</div>
              <NumberField min={1} max={20000} decimals={1} value={fundamental}
                onCommit={(n) => setFundamental(clamp(n, 1, 20000))}
                style={{ ...inputStyle, width: "100%", marginTop: "4px" }} />
            </div>
            <div>
              <div style={labelStyle}>Nota musical más cercana</div>
              <div style={{ marginTop: "4px", fontSize: "20px", color: C.cyan, fontWeight: 700, ...glowText("rgba(0,160,250,.4)") }}>
                {fundamentalNote ? fundamentalNote.label : "-"}
                {fundamentalNote && (
                  <span style={{ fontSize: "11px", color: C.textFaint, fontWeight: 500, marginLeft: "8px" }}>
                    {fundamentalNote.cents >= 0 ? "+" : ""}{fundamentalNote.cents}¢ vs. afinación estándar (A4=440Hz)
                  </span>
                )}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Ciclos a mostrar (gráfica)</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input type="range" min={1} max={8} value={cyclesToShow} style={{ flex: 1, accentColor: C.cyan }}
                  onChange={(e) => setCyclesToShow(Number(e.target.value))} />
                <span style={{ fontSize: "12px", color: C.cyan, minWidth: "14px" }}>{cyclesToShow}</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Nota calculada con afinación estándar de 12 tonos (12-TET), A4 = 440Hz — la referencia usada en
            música e ingeniería de audio. El desvío en centésimas (¢) indica qué tan lejos está la fundamental
            de esa nota exacta (100 centésimas = un semitono).
          </p>
        </div>

        {/* 3. FORMA DE ONDA — con cotas de periodo, pico y RMS */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Activity} title="Forma de onda" subtitle={`${cyclesToShow} ciclo(s) de la fundamental`} />
          <canvas ref={wavCanvasRef} width={900} height={240} style={{ width: "100%", height: "auto", display: "block", marginTop: "10px", borderRadius: "4px", border: `1px solid ${C.border}` }} />
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Cota inferior: periodo T de la fundamental (1/frecuencia, en ms) sobre el primer ciclo. Cota
            derecha: amplitud pico. Líneas punteadas: nivel RMS (positivo y negativo).
          </p>
        </div>

        {/* 4. ESPECTRO — a color por frecuencia, con bandas de mezcla */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={BarChart3} title="Espectro" subtitle="20 Hz – 20 kHz, escala logarítmica" />
          <canvas ref={specCanvasRef} width={900} height={220} style={{ width: "100%", height: "auto", display: "block", marginTop: "10px", borderRadius: "4px", border: `1px solid ${C.border}` }} />
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Cada barra es un tono activo, coloreada según su posición en el espectro (gradiente cian→rojo de
            marca: graves en cian, agudos en rojo) y ubicada en su frecuencia real, no en una rejilla fija.
            El fondo sombrea las bandas de mezcla estándar (Sub-graves, Graves, Medios-bajos, Medios,
            Medios-altos, Presencia, Brillo/Aire). Debajo de cada barra: número de tono y nota musical más
            cercana.
          </p>
        </div>

        {/* 5. LECTURAS — al final */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={BarChart3} title="Lecturas" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "12px", marginTop: "10px" }}>
            {[
              ["Peak", `${round(stats.peak, 4)}`],
              ["RMS", `${round(stats.rms, 4)}`],
              ["Crest Factor", `${round(stats.crestDb, 2)} dB`],
              ["THD-F", `${round(stats.thd, 3)} %`],
            ].map(([lb, val]) => (
              <div key={lb} style={{ background: theme === "dark" ? "rgba(0,160,250,.06)" : "#E5F5FF", border: `1px solid ${C.border}`, borderRadius: "5px", padding: "8px 10px" }}>
                <div style={labelStyle}>{lb}</div>
                <div style={{ fontSize: "16px", color: C.cyan, fontWeight: 700, marginTop: "2px", ...glowText("rgba(0,160,250,.4)") }}>{val}</div>
              </div>
            ))}
          </div>
          {hasInharmonicActive && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "6px 10px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: "4px" }}>
              <AlertTriangle size={13} style={{ color: C.red, flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: C.red }}>
                Hay parciales activos que no son múltiplos enteros de la fundamental — el THD-F mostrado ya no
                es riguroso en sentido estricto (se sigue calculando igual, pero técnicamente ya no mide
                "distorsión armónica" sino inarmonicidad de la mezcla).
              </span>
            </div>
          )}
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Peak, RMS y THD-F se calculan sobre un solo ciclo del tono 1 (la fundamental), igual que la hoja de
            cálculo original — independiente de cuántos ciclos se muestren en la gráfica. THD-F = √(Σ armónicos
            2-9²) / fundamental × 100 (ratio contra la fundamental, no contra el RMS total — esa sería THD-R,
            un número distinto).
          </p>
        </div>

        {/* Guardar mezclas */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Save} title="Mezclas guardadas" subtitle={`${saved.length} guardada(s)`} />
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            <input style={{ ...inputStyle, flex: 1, minWidth: "180px" }} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nombre de la mezcla" />
            <button style={btnStyle("primary")} onClick={saveMix}><Save size={13} /> Guardar</button>
          </div>
          {saved.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {saved.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: theme === "dark" ? "rgba(255,255,255,.03)" : C.panelAlt, borderRadius: "4px", padding: "7px 10px", flexWrap: "wrap", fontSize: "11px" }}>
                  <span style={{ flex: 1, minWidth: "100px", fontWeight: 700 }}>{m.name}</span>
                  <span style={{ color: C.textFaint }}>f₀={m.fundamental}Hz</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button style={btnStyle()} onClick={() => loadMix(m)}><FolderOpen size={12} /> usar</button>
                    <button style={btnStyle("danger")} onClick={() => setPendingDelete(m)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generador de ruido — sección independiente, gráfica de referencia */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Activity} title="Generador de ruido" subtitle="referencia gráfica, motor independiente del mezclador"
            right={<button style={btnStyle()} onClick={() => setNoiseVersion((v) => v + 1)}><RotateCcw size={13} /> Nueva muestra</button>} />
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px", lineHeight: 1.6 }}>
            El mezclador de 9 tonos no puede sintetizar ruido real (señal aleatoria de banda ancha, sin
            periodicidad) — esto genera muestras reales con algoritmos de DSP estándar y las mide de verdad
            (no aparenta la curva): rosa vía Voss-McCartney, marrón vía integración con fuga, azul vía
            diferenciación de blanco. Son aproximaciones prácticas usuales, no la única forma de generarlas.
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            {Object.entries(NOISE_TYPES).map(([k, v]) => (
              <button key={k} style={btnStyle(noiseType === k ? "active" : "default")} onClick={() => setNoiseType(k)}>{v.label}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", marginTop: "12px" }}>
            {[
              ["Peak", round(noiseData.peak, 3)],
              ["RMS", round(noiseData.rms, 3)],
              ["Crest Factor", `${round(noiseData.crestDb, 2)} dB`],
            ].map(([lb, val]) => (
              <div key={lb} style={{ background: theme === "dark" ? "rgba(0,160,250,.06)" : "#E5F5FF", border: `1px solid ${C.border}`, borderRadius: "5px", padding: "6px 10px" }}>
                <div style={labelStyle}>{lb}</div>
                <div style={{ fontSize: "14px", color: C.cyan, fontWeight: 700, marginTop: "2px" }}>{val}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
            THD no aplica aquí — no hay una fundamental que sirva de referencia en una señal estocástica.
          </p>

          <div style={{ ...labelStyle, marginTop: "12px" }}>Forma de onda (ventana corta, tipo osciloscopio)</div>
          <canvas ref={noiseWavCanvasRef} width={900} height={140} style={{ width: "100%", height: "auto", display: "block", marginTop: "6px", borderRadius: "4px", border: `1px solid ${C.border}` }} />

          <div style={{ ...labelStyle, marginTop: "12px" }}>Espectro (magnitud real de la muestra, calculada — no aparentada)</div>
          <canvas ref={noiseSpecCanvasRef} width={900} height={180} style={{ width: "100%", height: "auto", display: "block", marginTop: "6px", borderRadius: "4px", border: `1px solid ${C.border}` }} />
          <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Línea sólida: magnitud real de esta muestra (48 puntos, escala log 20Hz-20kHz) — se ve irregular a
            propósito, es el comportamiento real de una realización de ruido. Línea roja punteada: pendiente
            teórica de referencia ({NOISE_TYPES[noiseType].slopeDbOct >= 0 ? "+" : ""}{NOISE_TYPES[noiseType].slopeDbOct}dB/octava),
            el promedio al que tiende esta familia de ruido a largo plazo.
          </p>
        </div>
      </div>

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999, background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px" }}>¿Eliminar "{pendingDelete.name}"? No se puede deshacer.</span>
          <button onClick={confirmDelete} style={btnStyle("danger")}>Eliminar</button>
          <button onClick={() => setPendingDelete(null)} style={btnStyle()}><X size={12} /> Cancelar</button>
        </div>
      )}
    </div>
  );
}
