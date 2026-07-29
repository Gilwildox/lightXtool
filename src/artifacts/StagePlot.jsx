import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Plus, Trash2, Type, Ruler, Square, Circle as CircleIcon, Minus, Download,
  Upload, ZoomIn, ZoomOut, Copy, Save, X, FlipHorizontal, Eye, EyeOff,
  Layers as LayersIcon, Move, MousePointer2, Grid3x3, Lock, Unlock, Sun, Moon,
  FileImage, AlertTriangle,
} from "lucide-react";

// ── lightXtool identity: paletas dark/light — el color de los ICONOS lo
// define la capa del objeto, no el tema de pagina. ──────────────────────
const PALETTES = {
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", text: "#FFFFFF", textDim: "rgba(255,255,255,0.55)",
    textFaint: "rgba(255,255,255,0.32)", canvasBg: "#000000",
    gridMajor: "rgba(0,160,250,0.18)", gridMinor: "rgba(0,160,250,0.06)",
    accent: "#00A0FA", accentLight: "#40A2FC", danger: "#FF1D1D", dim: "rgba(0,0,0,0.55)",
  },
  light: {
    page: "#F5F5F5", panel: "#FFFFFF", panelAlt: "#F0F0F0",
    border: "rgba(0,120,190,0.3)", text: "#000000", textDim: "#3A3A3A",
    textFaint: "#6B6B6B", canvasBg: "#FFFFFF",
    gridMajor: "rgba(0,120,190,0.28)", gridMinor: "rgba(0,120,190,0.10)",
    accent: "#026B96", accentLight: "#00A0FA", danger: "#C81414", dim: "rgba(255,255,255,0.65)",
  },
};
const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";

const M = 60; // px por metro a zoom=1
const GRID_EXTENT = 25; // metros de radio de la cuadricula
const DRAFT_KEY = "lxt:stageplot:draft";
const DPI = 300;
const LAYER_COLORS = ["#00A0FA", "#FF7A1D", "#9B5DE5", "#00F5A0", "#FF1D6B", "#F5D300", "#40A2FC"];
const PAGE_MIN_M = 2, PAGE_MAX_M = 30;
const OBJECT_SNAP_THRESHOLD = 0.12; // metros — imantado entre objetos (solo planta)

const genId = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sanitize = (s) => (s || "").trim().replace(/[^\w\-]+/g, "_").replace(/_+/g, "_") || "stageplot";
function hexToRgba(hex, a) {
  const h = (hex || "#00A0FA").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0, g = parseInt(h.substring(2, 4), 16) || 0, b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}
function rotateVec(x, y, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

// ── catalogo reorganizado en 4 categorias ───────────────────────────────
const CATALOG = [
  { group: "Backline, consola y microfonia", items: [
    { type: "drums", label: "Bateria" },
    { type: "amp-guitar", label: "Amp guitarra" },
    { type: "amp-bass", label: "Amp bajo" },
    { type: "piano-grand", label: "Piano de cola" },
    { type: "piano-baby", label: "Piano media cola" },
    { type: "keyboard-full", label: "Teclado grande" },
    { type: "keyboard-small", label: "Teclado chico" },
    { type: "mic-straight", label: "Stand recto" },
    { type: "mic-boom", label: "Stand boom" },
    { type: "console-small", label: "Consola chica" },
    { type: "console-large", label: "Consola grande" },
  ]},
  { group: "Estructura", items: [
    { type: "truss", label: "Truss" },
    { type: "rigpoint", label: "Rig point" },
    { type: "distro", label: "Distro / rack" },
  ]},
  { group: "Modulos de pantalla", items: [
    { type: "modulo", label: "Modulo 0.5x1m", w: 0.5, h: 1 },
    { type: "modulo", label: "Modulo 0.5x0.5m", w: 0.5, h: 0.5 },
    { type: "modulo", label: "Modulo 1x1m", w: 1, h: 1 },
  ]},
  { group: "Referencias de escala", items: [
    { type: "ruler-fixed", label: "Regla 1m" },
    { type: "ruler-tape", label: "Cinta graduada" },
  ]},
];

const DEFAULTS = {
  truss: { length: 3 }, rigpoint: {}, distro: { w: 0.5, h: 0.4 }, modulo: { w: 1, h: 1 },
  "console-small": { w: 0.6, h: 0.5 }, "console-large": { w: 1.2, h: 0.7 },
  drums: { w: 1.6, h: 1.4 },
  "amp-guitar": { w: 0.6, h: 0.3, variant: "combo" }, "amp-bass": { w: 0.7, h: 0.35, variant: "4x10" },
  "mic-straight": { w: 0.56, h: 0.56 }, "mic-boom": { w: 0.7, h: 0.56 },
  "piano-grand": { w: 1.6, h: 1.5 }, "piano-baby": { w: 1.3, h: 1.2 },
  "keyboard-full": { w: 1.3, h: 0.4 }, "keyboard-small": { w: 0.8, h: 0.3 },
  "ruler-fixed": { length: 1, visualScale: 1 }, "ruler-tape": { length: 2, originMode: "end", visualScale: 1 },
};

// como responde cada tipo al girar en PLANTA cuando se ve en FRONTAL:
// 'fixed' = de frente fijo. 'foreshorten' = no rota, se angosta por |cos(rot)|.
const FRONT_BEHAVIOR = {
  truss: "foreshorten", modulo: "foreshorten", "console-small": "foreshorten", "console-large": "foreshorten",
  "amp-guitar": "foreshorten", "amp-bass": "foreshorten", "keyboard-full": "foreshorten", "keyboard-small": "foreshorten",
  "piano-grand": "foreshorten", "piano-baby": "foreshorten",
  rigpoint: "fixed", distro: "fixed", drums: "fixed", "mic-straight": "fixed", "mic-boom": "fixed",
  "ruler-fixed": "fixed", "ruler-tape": "fixed", rect: "fixed", circle: "fixed",
};
const RESIZABLE = new Set(["modulo", "distro", "console-small", "console-large", "amp-guitar", "amp-bass", "keyboard-full", "keyboard-small", "piano-grand", "piano-baby", "rect"]);
const POINT_TYPES = ["line", "polygon", "dimension"];
const FREEFORM_TYPES = ["rect", "circle", "line", "polygon", "dimension"];
const RULER_TYPES = new Set(["ruler-fixed", "ruler-tape"]);

function getBBox(o) {
  switch (o.type) {
    case "truss": return { w: o.length || 3, h: 0.3 };
    case "rigpoint": return { w: 0.3, h: 0.3 };
    case "circle": return { w: (o.rx || 0.3) * 2, h: (o.ry || 0.3) * 2 };
    case "ruler-fixed": return { w: o.length || 1, h: 0.15 };
    case "ruler-tape": return { w: o.length || 2, h: 0.15 };
    default: return { w: o.w || 1, h: o.h || 1 };
  }
}

// silueta de piano de cola: figura cerrada, sin tapa levantada
function pianoWingPath(w, h) {
  const hw = w / 2, hh = h / 2;
  return `M ${-hw} ${-hh * 0.5} L ${-hw * 0.35} ${-hh * 0.5} L ${-hw * 0.35} ${-hh}
    C ${hw * 0.25} ${-hh} ${hw * 0.85} ${-hh * 0.7} ${hw} ${-hh * 0.05}
    C ${hw * 0.95} ${hh * 0.55} ${hw * 0.35} ${hh} ${-hw * 0.2} ${hh}
    L ${-hw} ${hh} Z`;
}
function trussGeometry(o, color) {
  const len = (o.length || 3) * M, hh = 0.15 * M;
  const n = Math.max(2, Math.round(len / (0.35 * M)));
  const zig = [];
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + (i / n) * len, x1 = -len / 2 + ((i + 1) / n) * len;
    zig.push(<line key={i} x1={x0} y1={i % 2 === 0 ? -hh : hh} x2={x1} y2={i % 2 === 0 ? hh : -hh} stroke={color} strokeWidth={1.5} />);
  }
  return (<g><line x1={-len / 2} y1={-hh} x2={len / 2} y2={-hh} stroke={color} strokeWidth={3} /><line x1={-len / 2} y1={hh} x2={len / 2} y2={hh} stroke={color} strokeWidth={3} />{zig}</g>);
}

// ── render de simbolos ───────────────────────────────────────────────────
function renderSymbol(o, view, color, zoom, visualScale) {
  const w = (o.w || 1) * M, h = (o.h || 1) * M, hw = w / 2, hh = h / 2;
  switch (o.type) {
    case "rect":
      return <rect x={-hw} y={-hh} width={w} height={h} fill={hexToRgba(color, 0.06)} stroke={color} strokeWidth={2} />;
    case "circle":
      return <ellipse rx={(o.rx || 0.3) * M} ry={(o.ry || 0.3) * M} fill={hexToRgba(color, 0.06)} stroke={color} strokeWidth={2} />;
    case "truss":
      return trussGeometry(o, color);
    case "rigpoint": {
      const r = 0.09 * M;
      const upline = view === "front" ? <line x1={0} y1={-r} x2={0} y2={-r - 0.15 * M} stroke={color} strokeWidth={2} /> : null;
      return (<g stroke={color} strokeWidth={2} fill="none"><circle r={r} /><line x1={-r} y1={0} x2={r} y2={0} /><line x1={0} y1={-r} x2={0} y2={r} />{upline}</g>);
    }
    case "distro":
      return <rect x={-hw} y={-hh} width={w} height={h} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} />;
    case "modulo":
      if (view === "top") { const thin = 0.05 * M; return <rect x={-hw} y={-thin / 2} width={w} height={thin} fill={color} stroke={color} strokeWidth={1} />; }
      return (<g><rect x={-hw} y={-hh} width={w} height={h} fill={hexToRgba(color, 0.08)} stroke={color} strokeWidth={2} /><rect x={-hw + 4} y={-hh + 4} width={Math.max(0, w - 8)} height={Math.max(0, h - 8)} fill="none" stroke={color} strokeWidth={1} opacity={0.5} /></g>);
    case "console-small": case "console-large": {
      if (view === "top") {
        const stripes = [], n = 6;
        for (let i = 1; i < n; i++) { const x = -hw + (i / n) * w; stripes.push(<line key={i} x1={x} y1={-hh + 10} x2={x} y2={hh - 4} stroke={color} strokeWidth={1} />); }
        return (<g><rect x={-hw} y={-hh} width={w} height={h} rx={2} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} /><rect x={-hw + 2} y={-hh + 2} width={w - 4} height={8} fill={hexToRgba(color, 0.2)} />{stripes}</g>);
      }
      // aplastada (~55% de su alto) para dar sensacion de estar acostada en su posicion
      const fh = hh * 0.55;
      const trapezoid = `M ${-hw} ${fh} L ${-hw * 0.75} ${-fh} L ${hw * 0.75} ${-fh} L ${hw} ${fh} Z`;
      const knobs = []; const cols = 6;
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) knobs.push(<circle key={`${r}-${c}`} cx={-hw * 0.6 + (c / (cols - 1)) * hw * 1.2} cy={-fh * 0.65 + r * fh * 0.75} r={2} fill={color} />);
      return (<g><path d={trapezoid} fill={hexToRgba(color, 0.06)} stroke={color} strokeWidth={2} />{knobs}</g>);
    }
    case "drums": {
      if (view === "top") {
        const kickR = 0.28 * M, tomR = 0.11 * M, snareR = 0.1 * M, cymR = 0.15 * M;
        // girada 180 grados respecto a la version anterior
        return (<g transform="rotate(180)">
          <ellipse cx={0} cy={-0.05 * M} rx={0.75 * M} ry={0.55 * M} fill="none" stroke={color} strokeDasharray="2,4" strokeWidth={0.7} opacity={0.4} />
          <circle cx={0} cy={0.15 * M} r={kickR} fill={hexToRgba(color, 0.18)} stroke={color} strokeWidth={2} />
          <circle cx={-0.22 * M} cy={-0.2 * M} r={tomR} fill={hexToRgba(color, 0.1)} stroke={color} strokeWidth={1.5} />
          <circle cx={0.22 * M} cy={-0.2 * M} r={tomR} fill={hexToRgba(color, 0.1)} stroke={color} strokeWidth={1.5} />
          <circle cx={-0.45 * M} cy={0.12 * M} r={snareR} fill={hexToRgba(color, 0.14)} stroke={color} strokeWidth={1.8} />
          <line x1={-0.5 * M} y1={-0.1 * M} x2={-0.55 * M} y2={-0.35 * M} stroke={color} strokeWidth={1} />
          <circle cx={-0.55 * M} cy={-0.38 * M} r={cymR} fill="none" stroke={color} strokeWidth={1.2} />
          <line x1={0.5 * M} y1={-0.1 * M} x2={0.55 * M} y2={-0.35 * M} stroke={color} strokeWidth={1} />
          <circle cx={0.55 * M} cy={-0.38 * M} r={cymR} fill="none" stroke={color} strokeWidth={1.2} />
          <line x1={0} y1={0.05 * M} x2={0} y2={-0.5 * M} stroke={color} strokeWidth={1} />
          <circle cx={0} cy={-0.55 * M} r={cymR * 0.85} fill="none" stroke={color} strokeWidth={1.2} />
        </g>);
      }
      return (<g>
        <circle cx={0} cy={0.1 * M} r={0.34 * M} fill={hexToRgba(color, 0.15)} stroke={color} strokeWidth={2} />
        <line x1={-0.5 * M} y1={-0.05 * M} x2={-0.5 * M} y2={-0.45 * M} stroke={color} strokeWidth={1.2} />
        <circle cx={-0.5 * M} cy={-0.5 * M} r={0.16 * M} fill="none" stroke={color} strokeWidth={1.3} />
        <line x1={0.5 * M} y1={-0.05 * M} x2={0.5 * M} y2={-0.45 * M} stroke={color} strokeWidth={1.2} />
        <circle cx={0.5 * M} cy={-0.5 * M} r={0.16 * M} fill="none" stroke={color} strokeWidth={1.3} />
        <line x1={0} y1={-0.05 * M} x2={0} y2={-0.55 * M} stroke={color} strokeWidth={1.2} />
        <circle cx={0} cy={-0.6 * M} r={0.14 * M} fill="none" stroke={color} strokeWidth={1.3} />
      </g>);
    }
    case "amp-guitar": {
      if (view === "top") {
        const nd = 4, dots = [];
        for (let i = 0; i < nd; i++) dots.push(<circle key={i} cx={-hw * 0.7 + ((i + 0.5) / nd) * hw * 1.4} cy={-hh + 7} r={2} fill={color} />);
        return (<g><rect x={-hw} y={-hh} width={w} height={h} rx={3} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} />{dots}</g>);
      }
      const cid = `amp-${o.id}`;
      const hatch = [];
      for (let x = -hw; x < hw + h; x += 7) hatch.push(<line key={x} x1={x} y1={hh} x2={x - h} y2={-hh} stroke={color} strokeWidth={0.6} opacity={0.3} />);
      // estandar: 2 bocinas. Gabinete 4x12: 4 bocinas.
      const speakers = o.variant === "cab4x12"
        ? [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([dx, dy], i) => { const r = Math.min(w, h) * 0.16; return <g key={i}><circle cx={dx * w} cy={dy * h} r={r} fill="none" stroke={color} strokeWidth={1.5} /><circle cx={dx * w} cy={dy * h} r={r * 0.4} fill={color} /></g>; })
        : [[-0.22, 0], [0.22, 0]].map(([dx], i) => { const r = Math.min(w, h) * 0.3; return <g key={i}><circle cx={dx * w} cy={0} r={r} fill="none" stroke={color} strokeWidth={1.5} /><circle cx={dx * w} cy={0} r={r * 0.4} fill={color} /></g>; });
      return (<g><defs><clipPath id={cid}><rect x={-hw} y={-hh} width={w} height={h} rx={3} /></clipPath></defs><rect x={-hw} y={-hh} width={w} height={h} rx={3} fill={hexToRgba(color, 0.04)} stroke={color} strokeWidth={2} /><g clipPath={`url(#${cid})`}>{hatch}</g>{speakers}</g>);
    }
    case "amp-bass": {
      if (view === "top") {
        const nd = 3, dots = [];
        for (let i = 0; i < nd; i++) dots.push(<circle key={i} cx={-hw * 0.7 + ((i + 0.5) / nd) * hw * 1.4} cy={-hh + 7} r={2} fill={color} />);
        return (<g><rect x={-hw} y={-hh} width={w} height={h} rx={3} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} />{dots}</g>);
      }
      const cid = `amp-${o.id}`;
      const hatch = [];
      for (let x = -hw; x < hw + h; x += 7) hatch.push(<line key={x} x1={x} y1={hh} x2={x - h} y2={-hh} stroke={color} strokeWidth={0.6} opacity={0.3} />);
      let speakers, headamp = null;
      if (o.variant === "4x10") {
        speakers = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([dx, dy], i) => { const r = Math.min(w, h) * 0.15; return <g key={i}><circle cx={dx * w} cy={dy * h} r={r} fill="none" stroke={color} strokeWidth={1.5} /><circle cx={dx * w} cy={dy * h} r={r * 0.4} fill={color} /></g>; });
        const headH = h * 0.3, headW = w * 0.72, headY = -hh - headH - 3;
        headamp = (<g>
          <rect x={-headW / 2} y={headY} width={headW} height={headH} rx={2} fill={hexToRgba(color, 0.08)} stroke={color} strokeWidth={1.5} />
          <circle cx={-headW * 0.25} cy={headY + headH / 2} r={2} fill={color} /><circle cx={0} cy={headY + headH / 2} r={2} fill={color} /><circle cx={headW * 0.25} cy={headY + headH / 2} r={2} fill={color} />
        </g>);
      } else { const r = Math.min(w, h) * 0.36; speakers = <g><circle r={r} fill="none" stroke={color} strokeWidth={1.5} /><circle r={r * 0.4} fill={color} /></g>; }
      return (<g><defs><clipPath id={cid}><rect x={-hw} y={-hh} width={w} height={h} rx={3} /></clipPath></defs><rect x={-hw} y={-hh} width={w} height={h} rx={3} fill={hexToRgba(color, 0.04)} stroke={color} strokeWidth={2} /><g clipPath={`url(#${cid})`}>{hatch}</g>{speakers}{headamp}</g>);
    }
    case "mic-straight": case "mic-boom": {
      const legLen = view === "top" ? 0.28 * M : 0.2 * M;
      if (view === "top") {
        const legs = [0, 120, 240].map((a) => { const rad = (a * Math.PI) / 180; return <line key={a} x1={0} y1={0} x2={Math.cos(rad) * legLen} y2={Math.sin(rad) * legLen} stroke={color} strokeWidth={1.5} />; });
        const head = o.type === "mic-boom" ? (<g><line x1={0} y1={0} x2={0.35 * M} y2={-0.1 * M} stroke={color} strokeWidth={1.5} /><circle cx={0.35 * M} cy={-0.1 * M} r={4} fill={color} /></g>) : <circle r={4} fill={color} />;
        return (<g>{legs}<line x1={0} y1={0} x2={0} y2={-0.1 * M} stroke={color} strokeWidth={1.5} />{head}</g>);
      }
      const poleTop = -0.5 * M;
      const legs = [-1, 0, 1].map((d) => <line key={d} x1={0} y1={0} x2={d * legLen} y2={legLen * 0.6} stroke={color} strokeWidth={1.5} />);
      const head = o.type === "mic-boom" ? (<g><line x1={0} y1={poleTop} x2={0.3 * M} y2={poleTop - 0.15 * M} stroke={color} strokeWidth={1.5} /><circle cx={0.3 * M} cy={poleTop - 0.15 * M} r={4} fill={color} /></g>) : <circle cx={0} cy={poleTop} r={4} fill={color} />;
      return (<g>{legs}<line x1={0} y1={0} x2={0} y2={poleTop} stroke={color} strokeWidth={1.5} />{head}</g>);
    }
    case "piano-grand": case "piano-baby": {
      if (view === "top") return (<g><path d={pianoWingPath(w, h)} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} /><line x1={-hw * 0.35} y1={-hh} x2={-hw * 0.35} y2={hh * 0.3} stroke={color} strokeWidth={1} /></g>);
      // piano CERRADO visto de frente: bajo (no la tapa abierta), solo se
      // asoma el porta-partitura (atril) como unico elemento vertical.
      const fh = hh * 0.32;
      const legs = [-0.75, 0, 0.75].map((dx) => <line key={dx} x1={dx * hw} y1={fh} x2={dx * hw} y2={fh + 10} stroke={color} strokeWidth={2} />);
      const body = `M ${-hw} ${fh} L ${-hw} ${-fh * 0.4} Q ${-hw * 0.5} ${-fh} 0 ${-fh} Q ${hw * 0.6} ${-fh} ${hw} ${-fh * 0.3} L ${hw} ${fh} Z`;
      const atril = <rect x={hw * 0.15} y={-fh - 14} width={4} height={14} fill={color} />;
      return <g>{legs}<path d={body} fill={hexToRgba(color, 0.08)} stroke={color} strokeWidth={2} />{atril}</g>;
    }
    case "keyboard-full": case "keyboard-small":
      if (view === "top") return <rect x={-hw} y={-hh} width={w} height={h} rx={3} fill={hexToRgba(color, 0.05)} stroke={color} strokeWidth={2} />;
      { const bodyH = Math.min(h, 0.18 * M); return (<g stroke={color} strokeWidth={1.5}><rect x={-hw} y={-hh} width={w} height={bodyH} fill={hexToRgba(color, 0.08)} /><line x1={-hw + 6} y1={-hh + bodyH} x2={-hw + 6} y2={hh} /><line x1={hw - 6} y1={-hh + bodyH} x2={hw - 6} y2={hh} /><line x1={-hw + 6} y1={hh} x2={hw - 6} y2={-hh + bodyH} /><line x1={hw - 6} y1={hh} x2={-hw + 6} y2={-hh + bodyH} /></g>); }
    case "ruler-fixed": {
      const len = (o.length || 1) * M, vs = visualScale || 1;
      return (<g stroke={color} strokeWidth={1.5 * vs}><line x1={-len / 2} y1={0} x2={len / 2} y2={0} /><line x1={-len / 2} y1={-6 * vs} x2={-len / 2} y2={6 * vs} /><line x1={len / 2} y1={-6 * vs} x2={len / 2} y2={6 * vs} /><text x={0} y={-10 * vs} fill={color} fontSize={10 * vs} fontFamily={FONT} textAnchor="middle">{o.length || 1}m</text></g>);
    }
    case "ruler-tape": {
      const lenM = o.length || 2, len = lenM * M, vs = visualScale || 1, pxPerM = M * (zoom || 1);
      const showHalf = pxPerM >= 45, showQuarter = pxPerM >= 100;
      const center = o.originMode === "center";
      const n = Math.round(lenM / 0.25), items = [];
      for (let i = 0; i <= n; i++) {
        const d = i * 0.25, isM = Math.abs(d - Math.round(d)) < 1e-6, isHalf = Math.abs(d * 2 - Math.round(d * 2)) < 1e-6;
        if (!isM && !(isHalf && showHalf) && !(!isHalf && showQuarter)) continue;
        const x = -len / 2 + d * M, tickH = (isM ? 9 : isHalf ? 6 : 4) * vs; // el ancho SI se escala, la posicion x NUNCA (mantiene la distancia real)
        items.push(<line key={i} x1={x} y1={-tickH} x2={x} y2={tickH} stroke={color} strokeWidth={(isM ? 1.5 : 1) * vs} />);
        if (isM) { const val = center ? d - lenM / 2 : d; items.push(<text key={`t${i}`} x={x} y={-14 * vs} fill={color} fontSize={9 * vs} fontFamily={FONT} textAnchor="middle">{`${val > 0 ? "+" : ""}${val.toFixed(0)}m`}</text>); }
      }
      return <g>{items}<line x1={-len / 2} y1={0} x2={len / 2} y2={0} stroke={color} strokeWidth={1.5 * vs} /></g>;
    }
    default: return null;
  }
}

function ObjectView({ o, view, selected, color, zoom, locked, showHandles, onDown, onHandleDown }) {
  if (POINT_TYPES.includes(o.type)) {
    const pts = o.points.map((p) => `${p.x * M},${p.y * M}`).join(" ");
    let shape;
    if (o.type === "polygon") shape = <polygon points={pts} fill={hexToRgba(color, 0.1)} stroke={color} strokeWidth={2} />;
    else if (o.type === "line") shape = <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />;
    else {
      const [a, b] = o.points, dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midx = ((a.x + b.x) / 2) * M, midy = ((a.y + b.y) / 2) * M;
      shape = (<g>
        <line x1={a.x * M} y1={a.y * M} x2={b.x * M} y2={b.y * M} stroke={color} strokeWidth={1.5} strokeDasharray="4,3" />
        <circle cx={a.x * M} cy={a.y * M} r={3} fill={color} /><circle cx={b.x * M} cy={b.y * M} r={3} fill={color} />
        <text x={midx} y={midy - 6} fill={color} fontSize={11} fontFamily={FONT} textAnchor="middle">{`${dist.toFixed(2)} m`}</text>
        {o.label && <text x={midx} y={midy - 18} fill={color} fontSize={10} fontFamily={FONT} textAnchor="middle">{o.label}</text>}
      </g>);
    }
    return (<g onPointerDown={(e) => onDown(e, o)} style={{ cursor: locked ? "not-allowed" : "grab" }}>{shape}{selected && o.points.map((p, i) => <circle key={i} cx={p.x * M} cy={p.y * M} r={5} fill="#FF1D1D" />)}</g>);
  }
  if (o.type === "text") {
    return (<g transform={`translate(${o.x * M},${o.y * M})`} onPointerDown={(e) => onDown(e, o)} style={{ cursor: locked ? "not-allowed" : "grab" }}>{selected && <rect x={-6} y={-15} width={(o.label.length || 1) * 7 + 10} height={22} fill="none" stroke="#FF1D1D" strokeDasharray="3,3" />}<text x={0} y={0} fill={color} fontSize={13} fontFamily={FONT}>{o.label}</text></g>);
  }
  const bbox = getBBox(o);
  const behavior = FRONT_BEHAVIOR[o.type] || "fixed";
  const rot = view === "top" ? (o.rotation || 0) : 0;
  const foreshortenX = view === "front" && behavior === "foreshorten" ? Math.max(0.12, Math.abs(Math.cos(((o.rotation || 0) * Math.PI) / 180))) : 1;
  const isRuler = RULER_TYPES.has(o.type);
  const sx = (o.mirrored ? -1 : 1) * (isRuler ? 1 : (o.scaleX || 1)) * foreshortenX;
  const sy = isRuler ? 1 : (o.scaleY || 1);
  const tf = `translate(${o.x * M},${o.y * M}) rotate(${rot}) scale(${sx},${sy})`;
  const halfW = (bbox.w * M) / 2, halfH = (bbox.h * M) / 2;
  const handles = showHandles && !locked ? [["TL", -1, -1], ["TR", 1, -1], ["BR", 1, 1], ["BL", -1, 1]].map(([key, ux, uy]) => (
    <rect key={key} x={ux * halfW - 5} y={uy * halfH - 5} width={10} height={10} fill="#FF1D1D" stroke="#000" strokeWidth={1} onPointerDown={(e) => onHandleDown(e, o, key, view)} style={{ cursor: (ux * uy > 0) ? "nwse-resize" : "nesw-resize" }} />
  )) : null;
  return (
    <g transform={tf} onPointerDown={(e) => onDown(e, o)} style={{ cursor: locked ? "not-allowed" : "grab" }}>
      {selected && <rect x={-halfW - 6} y={-halfH - 6} width={bbox.w * M + 12} height={bbox.h * M + 12} fill="none" stroke="#FF1D1D" strokeDasharray="5,4" strokeWidth={1.5} />}
      {renderSymbol(o, view, color, zoom, o.visualScale)}
      {o.label && <text x={0} y={halfH + 15} textAnchor="middle" fill={color} fontSize={10} fontFamily={FONT}>{o.label}</text>}
      {handles}
    </g>
  );
}

function NumField({ value, onCommit, decimals = 2, style, ...rest }) {
  const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(Math.round(v * 10 ** decimals) / 10 ** decimals));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value)); }, [value]);
  return (<input type="text" inputMode="decimal" value={text} style={style} onFocus={() => { focused.current = true; }} onChange={(e) => { const r = e.target.value; if (!/^-?\d*\.?\d*$/.test(r)) return; setText(r); if (r !== "" && r !== "-" && r !== ".") onCommit(Number(r)); }} onBlur={() => { focused.current = false; const n = Number(text); if (text === "" || Number.isNaN(n)) setText(fmt(value)); else onCommit(n); }} {...rest} />);
}

// ── imantado entre objetos (solo planta): alinea bordes/centros con el
// objeto mas cercano dentro del umbral, para formar estructuras compuestas
// (p.ej. tilear modulos de pantalla uno junto a otro). ───────────────────
function snapToNeighbors(dragged, candX, candY, others) {
  const bbox = getBBox(dragged), hw = bbox.w / 2, hh = bbox.h / 2;
  let bestDx = null, bestDy = null;
  for (const other of others) {
    if (POINT_TYPES.includes(other.type) || other.type === "text") continue;
    const ob = getBBox(other), ohw = ob.w / 2, ohh = ob.h / 2;
    const left = candX - hw, right = candX + hw, top = candY - hh, bottom = candY + hh;
    const oleft = other.x - ohw, oright = other.x + ohw, otop = other.y - ohh, obottom = other.y + ohh;
    for (const d of [oright - left, oleft - right, other.x - candX]) if (Math.abs(d) < OBJECT_SNAP_THRESHOLD && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) bestDx = d;
    for (const d of [obottom - top, otop - bottom, other.y - candY]) if (Math.abs(d) < OBJECT_SNAP_THRESHOLD && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) bestDy = d;
  }
  return { x: bestDx !== null ? candX + bestDx : candX, y: bestDy !== null ? candY + bestDy : candY, snappedX: bestDx !== null, snappedY: bestDy !== null };
}

export default function StagePlot() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];
  const [objects, setObjects] = useState([]);
  const [layers, setLayers] = useState([{ id: "layer-1", name: "Capa 1", visible: true, locked: false, color: LAYER_COLORS[0] }]);
  const [activeLayerId, setActiveLayerId] = useState("layer-1");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("top");
  const [tool, setTool] = useState("select");
  const [touchMode, setTouchMode] = useState("editar");
  const [snap, setSnap] = useState(true);
  const [camera, setCamera] = useState({ x: 520, y: 340, zoom: 1 });
  const [polyPoints, setPolyPoints] = useState([]);
  const [dimStart, setDimStart] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [showCatalog, setShowCatalog] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [pendingClear, setPendingClear] = useState(false);
  const [msg, setMsg] = useState("");
  const [pageOrient, setPageOrient] = useState("vertical");
  const [pageWidthM, setPageWidthM] = useState(10);

  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const loaded = useRef(false);
  const userPanned = useRef(false); // deja de auto-centrar en cuanto el usuario mueve el lienzo a mano

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2200); };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setObjects(d.objects || []); setLayers(d.layers && d.layers.length ? d.layers : layers);
        setActiveLayerId(d.activeLayerId || "layer-1"); setView(d.view || "top");
        setProjectName(d.projectName || ""); setTheme(d.theme || "dark");
        setPageOrient(d.pageOrient || "vertical"); setPageWidthM(d.pageWidthM || 10);
      }
    } catch { /* sin borrador */ }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ objects, layers, activeLayerId, view, projectName, theme, pageOrient, pageWidthM })); } catch { /* llena/bloqueada */ } }, 500);
    return () => clearTimeout(t);
  }, [objects, layers, activeLayerId, view, projectName, theme, pageOrient, pageWidthM]);

  const pageInches = pageOrient === "vertical" ? { w: 8.5, h: 11 } : { w: 11, h: 8.5 };
  const pageHeightM = pageWidthM * (pageInches.h / pageInches.w);

  // centra la hoja al abrir (y mientras el usuario no haya movido el lienzo,
  // por si el borrador guardado trae un ancho de pagina distinto al default)
  useEffect(() => {
    if (userPanned.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const pageWpx = pageWidthM * M, pageHpx = pageHeightM * M, margin = 40;
    const z = clamp(Math.min((rect.width - margin * 2) / pageWpx, (rect.height - margin * 2) / pageHpx), 0.15, 3);
    setCamera({ x: (rect.width - pageWpx * z) / 2, y: (rect.height - pageHpx * z) / 2, zoom: z });
  }, [pageWidthM, pageHeightM]);

  const selected = useMemo(() => objects.find((o) => o.id === selectedId) || null, [objects, selectedId]);
  const layerOf = (o) => layers.find((l) => l.id === o.layerId);
  const isLocked = (o) => !!layerOf(o)?.locked;
  const colorOf = (o) => layerOf(o)?.color || C.accent;

  const screenToWorld = (clientX, clientY, rect) => ({ x: (clientX - rect.left - camera.x) / camera.zoom / M, y: (clientY - rect.top - camera.y) / camera.zoom / M });
  const viewportCenterWorld = () => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (rect.width / 2 - camera.x) / camera.zoom / M, y: (rect.height / 2 - camera.y) / camera.zoom / M }; };

  const addFromCatalog = (item) => {
    const c = viewportCenterWorld();
    const noLabel = RULER_TYPES.has(item.type); // la regla ya muestra su propia medida, no duplicar texto
    const obj = { id: genId("obj"), type: item.type, layerId: activeLayerId, x: c.x, y: c.y, rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, label: noLabel ? "" : item.label, ...DEFAULTS[item.type], ...(item.w ? { w: item.w, h: item.h } : {}) };
    setObjects((p) => [...p, obj]); setSelectedId(obj.id); setTool("select");
  };

  const onObjectPointerDown = (e, obj) => {
    if (isLocked(obj)) return;
    if (touchMode === "mover") return;
    e.stopPropagation(); e.preventDefault();
    setSelectedId(obj.id);
    if (tool !== "select") return;
    const rect = containerRef.current.getBoundingClientRect();
    const start = screenToWorld(e.clientX, e.clientY, rect);
    const isPts = POINT_TYPES.includes(obj.type);
    const startPts = isPts ? obj.points.map((p) => ({ ...p })) : null;
    const sx = obj.x, sy = obj.y;
    const neighbors = objects.filter((o2) => o2.id !== obj.id && layerOf(o2)?.visible !== false);
    const onMove = (ev) => {
      const w2 = screenToWorld(ev.clientX, ev.clientY, rect);
      let dx = w2.x - start.x, dy = w2.y - start.y;
      if (snap || ev.shiftKey) { dx = Math.round(dx / 0.25) * 0.25; dy = Math.round(dy / 0.25) * 0.25; }
      if (isPts) { setObjects((p) => p.map((o) => (o.id === obj.id ? { ...o, points: startPts.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : o))); return; }
      let nx = sx + dx, ny = sy + dy;
      if (view === "top") { const snapped = snapToNeighbors(obj, nx, ny, neighbors); nx = snapped.x; ny = snapped.y; }
      setObjects((p) => p.map((o) => (o.id === obj.id ? { ...o, x: nx, y: ny } : o)));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };

  const onHandleDown = (e, o, corner, viewAtDrag) => {
    e.stopPropagation(); e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const rot = viewAtDrag === "front" ? 0 : (o.rotation || 0);
    const ux = corner.includes("L") ? -1 : 1, uy = corner.includes("T") ? -1 : 1;
    const oppLocal = { x: -ux * (o.w / 2), y: -uy * (o.h / 2) };
    const oppRot = rotateVec(oppLocal.x, oppLocal.y, rot);
    const oppWorld = { x: o.x + oppRot.x, y: o.y + oppRot.y };
    const onMove = (ev) => {
      const w2 = screenToWorld(ev.clientX, ev.clientY, rect);
      const dx = w2.x - oppWorld.x, dy = w2.y - oppWorld.y;
      const inv = rotateVec(dx, dy, -rot);
      let newW = Math.max(0.05, Math.abs(inv.x)), newH = Math.max(0.05, Math.abs(inv.y));
      if (snap || ev.shiftKey) { newW = Math.max(0.05, Math.round(newW / 0.25) * 0.25); newH = Math.max(0.05, Math.round(newH / 0.25) * 0.25); }
      const centerLocal = { x: (inv.x / Math.abs(inv.x || 1)) * newW / 2, y: (inv.y / Math.abs(inv.y || 1)) * newH / 2 };
      const centerOff = rotateVec(centerLocal.x, centerLocal.y, rot);
      setObjects((p) => p.map((ob) => (ob.id === o.id ? { ...ob, w: newW, h: newH, x: oppWorld.x + centerOff.x, y: oppWorld.y + centerOff.y } : ob)));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };

  const onCanvasPointerDown = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    if (touchMode === "mover") {
      userPanned.current = true;
      const sx = e.clientX, sy = e.clientY, startCam = { ...camera };
      const onMove = (ev) => setCamera({ ...startCam, x: startCam.x + (ev.clientX - sx), y: startCam.y + (ev.clientY - sy) });
      const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY, rect);
    if (tool === "select") { setSelectedId(null); return; }

    if (tool === "rect" || tool === "circle" || tool === "line") {
      const id = genId("obj");
      let draft;
      if (tool === "rect") draft = { id, type: "rect", layerId: activeLayerId, x: world.x, y: world.y, w: 0.05, h: 0.05, rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, label: "", createdView: view };
      else if (tool === "circle") draft = { id, type: "circle", layerId: activeLayerId, x: world.x, y: world.y, rx: 0.05, ry: 0.05, rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, label: "", createdView: view };
      else draft = { id, type: "line", layerId: activeLayerId, points: [{ ...world }, { ...world }], rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, label: "", createdView: view };
      setObjects((p) => [...p, draft]); setSelectedId(id);
      const onMove = (ev) => {
        const w2 = screenToWorld(ev.clientX, ev.clientY, rect);
        const doSnap = snap || ev.shiftKey;
        const snapv = (v) => (doSnap ? Math.round(v / 0.25) * 0.25 : v);
        setObjects((p) => p.map((o) => {
          if (o.id !== id) return o;
          if (tool === "rect") return { ...o, w: Math.max(0.05, snapv(Math.abs(w2.x - world.x) * 2)), h: Math.max(0.05, snapv(Math.abs(w2.y - world.y) * 2)), x: (world.x + w2.x) / 2, y: (world.y + w2.y) / 2 };
          if (tool === "circle") return { ...o, rx: Math.max(0.05, snapv(Math.abs(w2.x - world.x))), ry: Math.max(0.05, snapv(Math.abs(w2.y - world.y))) };
          return { ...o, points: [o.points[0], { x: snapv(w2.x), y: snapv(w2.y) }] };
        }));
      };
      const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); setTool("select"); };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
      return;
    }
    if (tool === "polygon") { const doSnap = snap || e.shiftKey; const pt = doSnap ? { x: Math.round(world.x / 0.25) * 0.25, y: Math.round(world.y / 0.25) * 0.25 } : world; setPolyPoints((p) => [...p, pt]); return; }
    if (tool === "dimension") {
      if (!dimStart) setDimStart(world);
      else { setObjects((p) => [...p, { id: genId("obj"), type: "dimension", layerId: activeLayerId, points: [dimStart, world], label: "", rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, createdView: view }]); setDimStart(null); setTool("select"); }
      return;
    }
    if (tool === "text") { const id = genId("obj"); setObjects((p) => [...p, { id, type: "text", layerId: activeLayerId, x: world.x, y: world.y, label: "Texto", rotation: 0, scaleX: 1, scaleY: 1, mirrored: false }]); setSelectedId(id); setTool("select"); }
  };
  const finishPolygon = () => {
    if (polyPoints.length < 3) { setPolyPoints([]); return; }
    const id = genId("obj");
    setObjects((p) => [...p, { id, type: "polygon", layerId: activeLayerId, points: polyPoints, label: "", rotation: 0, scaleX: 1, scaleY: 1, mirrored: false, createdView: view }]);
    setPolyPoints([]); setSelectedId(id); setTool("select");
  };

  const onWheel = (e) => {
    e.preventDefault(); userPanned.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top, factor = e.deltaY < 0 ? 1.1 : 0.9;
    setCamera((prev) => { const nz = clamp(prev.zoom * factor, 0.15, 6); const wx = (cx - prev.x) / prev.zoom, wy = (cy - prev.y) / prev.zoom; return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz }; });
  };
  const zoomBtn = (factor) => {
    userPanned.current = true;
    const rect = containerRef.current.getBoundingClientRect(); const cx = rect.width / 2, cy = rect.height / 2;
    setCamera((prev) => { const nz = clamp(prev.zoom * factor, 0.15, 6); const wx = (cx - prev.x) / prev.zoom, wy = (cy - prev.y) / prev.zoom; return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz }; });
  };

  const patchSel = (patch) => setObjects((p) => p.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)));
  const deleteSel = () => { setObjects((p) => p.filter((o) => o.id !== selectedId)); setSelectedId(null); };
  const duplicateSel = () => {
    if (!selected) return;
    const copy = { ...selected, id: genId("obj") };
    if (POINT_TYPES.includes(copy.type)) copy.points = copy.points.map((p) => ({ x: p.x + 0.3, y: p.y + 0.3 }));
    else { copy.x += 0.3; copy.y += 0.3; }
    setObjects((p) => [...p, copy]); setSelectedId(copy.id);
  };

  const addLayer = () => { const id = genId("layer"); setLayers((p) => [...p, { id, name: `Capa ${p.length + 1}`, visible: true, locked: false, color: LAYER_COLORS[p.length % LAYER_COLORS.length] }]); setActiveLayerId(id); };
  const patchLayer = (id, patch) => setLayers((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const deleteLayer = (id) => {
    if (layers.length <= 1) { flash("Debe quedar al menos una capa"); return; }
    setLayers((p) => p.filter((l) => l.id !== id)); setObjects((p) => p.filter((o) => o.layerId !== id));
    if (activeLayerId === id) setActiveLayerId(layers.find((l) => l.id !== id).id);
  };

  const exportJSON = () => {
    const data = { app: "lightXtool StagePlot", version: 3, exportedAt: new Date().toISOString(), projectName, view, objects, layers, activeLayerId, pageOrient, pageWidthM };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${sanitize(projectName || "stageplot")}.json`; a.click();
    flash("Proyecto exportado (.json)");
  };
  const triggerImport = () => fileInputRef.current?.click();
  const onImportFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        setObjects(d.objects || []); setLayers(d.layers && d.layers.length ? d.layers : [{ id: "layer-1", name: "Capa 1", visible: true, locked: false, color: LAYER_COLORS[0] }]);
        setActiveLayerId(d.activeLayerId || d.layers?.[0]?.id || "layer-1");
        setView(d.view || "top"); setProjectName(d.projectName || ""); setSelectedId(null);
        setPageOrient(d.pageOrient || "vertical"); setPageWidthM(d.pageWidthM || 10);
        userPanned.current = false; // recentra con la pagina importada
        flash("Proyecto importado.");
      } catch { flash("Archivo invalido — no se pudo importar."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  // export PNG: solo el marco de pagina (lo de fuera queda editable pero no
  // se exporta), a 300dpi, independiente del pan/zoom en pantalla.
  const exportPNG = () => {
    try {
      const inches = pageOrient === "vertical" ? { w: 8.5, h: 11 } : { w: 11, h: 8.5 };
      const pxW = Math.round(inches.w * DPI), pxH = Math.round(inches.h * DPI);
      const pagePxPerM = pxW / pageWidthM, scaleFactor = pagePxPerM / M;
      const bg = theme === "dark" ? "#000000" : "#FFFFFF";
      const svgEl = containerRef.current?.querySelector("svg");
      if (!svgEl) { flash("No se encontro el lienzo para exportar."); return; }
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("width", pxW); clone.setAttribute("height", pxH); clone.setAttribute("viewBox", `0 0 ${pxW} ${pxH}`);
      const innerG = clone.querySelector("g");
      if (innerG) innerG.setAttribute("transform", `scale(${scaleFactor})`);
      clone.querySelectorAll('[data-pageframe]').forEach((el) => el.remove());
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", pxW); bgRect.setAttribute("height", pxH); bgRect.setAttribute("fill", bg);
      clone.insertBefore(bgRect, clone.firstChild);
      let svgStr = new XMLSerializer().serializeToString(clone);
      if (!svgStr.includes("xmlns=")) svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas"); canvas.width = pxW; canvas.height = pxH;
          const ctx = canvas.getContext("2d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, pxW, pxH); ctx.drawImage(img, 0, 0, pxW, pxH);
          URL.revokeObjectURL(url);
          const a = document.createElement("a"); a.download = `${sanitize(projectName || "stageplot")}.png`; a.href = canvas.toDataURL("image/png"); a.click();
        } catch (err) { flash(`Error al generar PNG: ${err?.message || "desconocido"}`); }
      };
      img.onerror = () => flash("No se pudo cargar el SVG para rasterizar (revisa que el navegador permita blob: URLs aqui).");
      img.src = url;
    } catch (err) { flash(`Error al exportar PNG: ${err?.message || "desconocido"}`); }
  };

  const clearAll = () => { setObjects([]); setSelectedId(null); setPendingClear(false); flash("Lienzo borrado."); };

  const panelStyle = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 };
  const inputStyle = { background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT, fontSize: 11, padding: "4px 6px", borderRadius: 3, outline: "none" };
  const lbl = { fontSize: 9, color: C.textDim, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 };
  const btn = (active, danger) => ({ background: active ? hexToRgba(C.accent, 0.15) : danger ? hexToRgba(C.danger, 0.1) : theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF", border: `1px solid ${active ? C.accent : danger ? C.danger : C.border}`, color: active ? C.accent : danger ? C.danger : C.textDim, fontFamily: FONT, fontSize: 10, padding: "5px 8px", borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" });

  const visibleObjects = objects.filter((o) => { if (layerOf(o)?.visible === false) return false; if (FREEFORM_TYPES.includes(o.type) && o.createdView && o.createdView !== view) return false; return true; });

  const gridLines = useMemo(() => {
    const lines = []; const majorStep = 1, minorStep = 0.25;
    for (let v = -GRID_EXTENT; v <= GRID_EXTENT; v += minorStep) {
      const isMajor = Math.abs(Math.round(v / majorStep) * majorStep - v) < 1e-6;
      lines.push(<line key={`v${v}`} x1={v * M} y1={-GRID_EXTENT * M} x2={v * M} y2={GRID_EXTENT * M} stroke={isMajor ? C.gridMajor : C.gridMinor} strokeWidth={isMajor ? 1 : 0.5} />);
      lines.push(<line key={`h${v}`} x1={-GRID_EXTENT * M} y1={v * M} x2={GRID_EXTENT * M} y2={v * M} stroke={isMajor ? C.gridMajor : C.gridMinor} strokeWidth={isMajor ? 1 : 0.5} />);
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const hasWH = selected && RESIZABLE.has(selected.type);
  const hasLen = selected && (selected.type === "truss" || selected.type === "ruler-fixed" || selected.type === "ruler-tape");
  const hasRxy = selected && selected.type === "circle";
  const hasVariant = selected && (selected.type === "amp-guitar" || selected.type === "amp-bass");
  const hasMirror = selected && (selected.type === "mic-boom" || selected.type === "mic-straight");
  const hasRotation = selected && !POINT_TYPES.includes(selected.type) && selected.type !== "text";
  const isRulerSel = selected && RULER_TYPES.has(selected.type);
  const hasScale = selected && !POINT_TYPES.includes(selected.type) && selected.type !== "text" && !hasWH && !hasRxy && !isRulerSel;
  const hasOrigin = selected && selected.type === "ruler-tape";
  const selLocked = selected && isLocked(selected);

  return (
    <div style={{ background: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT, display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, color: C.accent, letterSpacing: 3, fontWeight: 700, textShadow: theme === "dark" ? `0 0 12px ${C.accent}` : "none" }}>⬛ STAGE PLOT</div>
          <div style={{ ...lbl, marginTop: 2 }}>distribucion de piso · no es plano de luces ni de ingenieria certificada</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {msg && <span style={{ fontSize: 10, color: C.accent, fontStyle: "italic" }}>{msg}</span>}
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={btn()}>{theme === "dark" ? <Sun size={12} /> : <Moon size={12} />} {theme === "dark" ? "Claro" : "Oscuro"}</button>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={lbl}>proyecto</span>
        <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="nombre del plano" style={{ ...inputStyle, width: 150 }} />
        <div style={{ width: 1, height: 20, background: C.border }} />
        <span style={lbl}>vista</span>
        <button style={btn(view === "top")} onClick={() => setView("top")}>Planta</button>
        <button style={btn(view === "front")} onClick={() => setView("front")}>Frontal</button>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <span style={lbl}>pagina carta</span>
        <button style={btn(pageOrient === "vertical")} onClick={() => setPageOrient("vertical")}>Vertical</button>
        <button style={btn(pageOrient === "horizontal")} onClick={() => setPageOrient("horizontal")}>Horizontal</button>
        <span style={{ fontSize: 9, color: C.textFaint }}>ancho de pagina:</span>
        <NumField decimals={1} value={pageWidthM} onCommit={(n) => setPageWidthM(clamp(n, PAGE_MIN_M, PAGE_MAX_M))} style={{ ...inputStyle, width: 50 }} />
        <span style={{ fontSize: 9, color: C.textFaint }}>m ({PAGE_MIN_M}-{PAGE_MAX_M}m · {pageInches.w}x{pageInches.h}in · {DPI}dpi)</span>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button style={btn()} onClick={exportJSON}><Save size={12} /> Exportar .json</button>
        <button style={btn()} onClick={triggerImport}><Upload size={12} /> Importar .json</button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} style={{ display: "none" }} />
        <button style={btn()} onClick={exportPNG}><FileImage size={12} /> Exportar PNG</button>
        <button style={btn(false, true)} onClick={() => setPendingClear(true)}><Trash2 size={12} /> Borrar todo</button>
      </div>

      <div style={{ ...panelStyle, padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={lbl}>tactil</span>
        <button style={btn(touchMode === "mover")} onClick={() => setTouchMode("mover")}><Move size={12} /> Mover lienzo</button>
        <button style={btn(touchMode === "editar")} onClick={() => setTouchMode("editar")}><MousePointer2 size={12} /> Editar objetos</button>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button style={btn(snap)} onClick={() => setSnap((v) => !v)}><Grid3x3 size={12} /> Snap 0.25m</button>
        <span style={{ fontSize: 8, color: C.textFaint }}>(Shift = forzar · objetos se imantan entre si en planta)</span>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button style={btn()} onClick={() => zoomBtn(1.25)}><ZoomIn size={12} /></button>
        <button style={btn()} onClick={() => zoomBtn(0.8)}><ZoomOut size={12} /></button>
        <span style={{ fontSize: 10, color: C.textFaint }}>{Math.round(camera.zoom * 100)}%</span>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button style={btn(tool === "select")} onClick={() => { setTool("select"); setPolyPoints([]); setDimStart(null); }}><MousePointer2 size={12} /> Seleccionar</button>
        <button style={btn(tool === "rect")} onClick={() => setTool("rect")}><Square size={12} /> Rect. libre</button>
        <button style={btn(tool === "circle")} onClick={() => setTool("circle")}><CircleIcon size={12} /> Circulo</button>
        <button style={btn(tool === "line")} onClick={() => setTool("line")}><Minus size={12} /> Linea</button>
        <button style={btn(tool === "polygon")} onClick={() => setTool("polygon")}>⬠ Poligono</button>
        <button style={btn(tool === "text")} onClick={() => setTool("text")}><Type size={12} /> Texto</button>
        <button style={btn(tool === "dimension")} onClick={() => setTool("dimension")}><Ruler size={12} /> Regla</button>
        {polyPoints.length > 0 && (<><button style={btn(true)} onClick={finishPolygon}>✓ Finalizar ({polyPoints.length})</button><button style={btn(false, true)} onClick={() => setPolyPoints((p) => p.slice(0, -1))}>Deshacer punto</button><button style={btn()} onClick={() => setPolyPoints([])}>Cancelar</button></>)}
        {dimStart && <button style={btn(false, true)} onClick={() => setDimStart(null)}>Cancelar</button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button style={btn(showCatalog)} onClick={() => setShowCatalog((v) => !v)}>Catalogo</button>
          <button style={btn(showRight)} onClick={() => setShowRight((v) => !v)}>Propiedades / capas</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0, flexWrap: "wrap" }}>
        {showCatalog && (
          <div style={{ ...panelStyle, padding: 8, width: 200, maxHeight: 640, overflowY: "auto", flexShrink: 0 }}>
            <div style={{ ...lbl, marginBottom: 6 }}>catalogo — clic para agregar</div>
            {CATALOG.map((g) => (
              <div key={g.group} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>{g.group}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{g.items.map((it, i) => <button key={i} style={{ ...btn(), justifyContent: "flex-start" }} onClick={() => addFromCatalog(it)}><Plus size={11} /> {it.label}</button>)}</div>
              </div>
            ))}
          </div>
        )}

        <div ref={containerRef} onWheel={onWheel} style={{ ...panelStyle, flex: 1, minWidth: 300, height: 640, position: "relative", overflow: "hidden", cursor: touchMode === "mover" ? "grab" : "default" }}>
          <svg width="100%" height="100%" onPointerDown={onCanvasPointerDown} style={{ display: "block", background: C.canvasBg }}>
            <g transform={`translate(${camera.x},${camera.y}) scale(${camera.zoom})`}>
              {gridLines}
              <line x1={0} y1={-GRID_EXTENT * M} x2={0} y2={GRID_EXTENT * M} stroke={hexToRgba(C.danger, 0.25)} strokeWidth={1} />
              <line x1={-GRID_EXTENT * M} y1={0} x2={GRID_EXTENT * M} y2={0} stroke={hexToRgba(C.danger, 0.25)} strokeWidth={1} />
              {/* velo sobre el area fuera de la pagina: se puede seguir editando ahi
                  (pointer-events none, no bloquea clics) pero no se exporta a PNG */}
              <path data-pageframe="1" d={`M ${-GRID_EXTENT * M} ${-GRID_EXTENT * M} H ${GRID_EXTENT * M} V ${GRID_EXTENT * M} H ${-GRID_EXTENT * M} Z M 0 0 H ${pageWidthM * M} V ${pageHeightM * M} H 0 Z`} fillRule="evenodd" fill={C.dim} pointerEvents="none" />
              <rect data-pageframe="1" x={0} y={0} width={pageWidthM * M} height={pageHeightM * M} fill="none" stroke={C.accentLight} strokeDasharray="8,5" strokeWidth={1.5} opacity={0.8} pointerEvents="none" />
              {visibleObjects.map((o) => (<ObjectView key={o.id} o={o} view={view} selected={o.id === selectedId} color={colorOf(o)} zoom={camera.zoom} locked={isLocked(o)} showHandles={o.id === selectedId && tool === "select" && RESIZABLE.has(o.type)} onDown={onObjectPointerDown} onHandleDown={onHandleDown} />))}
              {polyPoints.length > 0 && (<g><polyline points={polyPoints.map((p) => `${p.x * M},${p.y * M}`).join(" ")} fill="none" stroke={C.accentLight} strokeDasharray="4,3" strokeWidth={1.5} />{polyPoints.map((p, i) => <circle key={i} cx={p.x * M} cy={p.y * M} r={4} fill={C.accentLight} />)}</g>)}
              {dimStart && <circle cx={dimStart.x * M} cy={dimStart.y * M} r={4} fill={C.danger} />}
            </g>
          </svg>
          <div style={{ position: "absolute", top: 8, left: 10, fontSize: 9, color: hexToRgba(C.accent, 0.8), letterSpacing: 1, textTransform: "uppercase", pointerEvents: "none" }}>
            {view === "top" ? "planta" : "frontal"} · {objects.length} objeto(s) · marco = pagina a exportar, lo demas queda dimeado
          </div>
        </div>

        {showRight && (
          <div style={{ width: 235, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...panelStyle, padding: 8 }}>
              <div style={{ ...lbl, marginBottom: 6 }}>propiedades</div>
              {!selected ? <p style={{ fontSize: 11, color: C.textFaint }}>Sin objeto seleccionado.</p> : selLocked ? (<p style={{ fontSize: 11, color: C.danger }}>Objeto en capa bloqueada.</p>) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div><div style={lbl}>Etiqueta {isRulerSel && "(se agrega como linea aparte, no reemplaza la medida)"}</div><input value={selected.label || ""} onChange={(e) => patchSel({ label: e.target.value })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div>
                  {hasRotation && (<div><div style={lbl}>Rotacion en planta (°)</div><input type="range" min={0} max={359} value={selected.rotation || 0} onChange={(e) => patchSel({ rotation: Number(e.target.value) })} style={{ width: "100%", accentColor: C.accent, marginTop: 3 }} /><NumField decimals={0} value={selected.rotation || 0} onCommit={(n) => patchSel({ rotation: ((n % 360) + 360) % 360 })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div>)}
                  {hasScale && (<div><div style={lbl}>Escala (x)</div><NumField decimals={2} value={selected.scaleX || 1} onCommit={(n) => patchSel({ scaleX: n, scaleY: n })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div>)}
                  {isRulerSel && (<div><div style={lbl}>Escala visual (no cambia la distancia)</div><NumField decimals={2} value={selected.visualScale || 1} onCommit={(n) => patchSel({ visualScale: Math.max(0.3, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div>)}
                  {hasWH && (<div style={{ display: "flex", gap: 6 }}><div style={{ flex: 1 }}><div style={lbl}>Ancho (m)</div><NumField value={selected.w} onCommit={(n) => patchSel({ w: Math.max(0.05, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div><div style={{ flex: 1 }}><div style={lbl}>Alto (m)</div><NumField value={selected.h} onCommit={(n) => patchSel({ h: Math.max(0.05, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div></div>)}
                  {hasWH && <p style={{ fontSize: 8, color: C.textFaint, margin: 0 }}>Tip: arrastra las manijas rojas para redimensionar, o acerca el objeto a otro para imantarlo.</p>}
                  {hasLen && (<div><div style={lbl}>Longitud (m)</div><NumField value={selected.length} onCommit={(n) => patchSel({ length: Math.max(0.1, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div>)}
                  {hasOrigin && (<div><div style={lbl}>Origen de medida</div><select value={selected.originMode || "end"} onChange={(e) => patchSel({ originMode: e.target.value })} style={{ ...inputStyle, width: "100%", marginTop: 3 }}><option value="end">Desde un extremo</option><option value="center">Desde el centro</option></select></div>)}
                  {hasRxy && (<div style={{ display: "flex", gap: 6 }}><div style={{ flex: 1 }}><div style={lbl}>Radio X (m)</div><NumField value={selected.rx} onCommit={(n) => patchSel({ rx: Math.max(0.05, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div><div style={{ flex: 1 }}><div style={lbl}>Radio Y (m)</div><NumField value={selected.ry} onCommit={(n) => patchSel({ ry: Math.max(0.05, n) })} style={{ ...inputStyle, width: "100%", marginTop: 3 }} /></div></div>)}
                  {hasVariant && (<div><div style={lbl}>Variante (vista frontal)</div><select value={selected.variant} onChange={(e) => patchSel({ variant: e.target.value })} style={{ ...inputStyle, width: "100%", marginTop: 3 }}>{selected.type === "amp-guitar" ? (<><option value="combo">Estandar — 2 bocinas</option><option value="cab4x12">Gabinete 4x12</option></>) : (<><option value="4x10">4x10 + head</option><option value="1x15">1x15</option></>)}</select></div>)}
                  {hasMirror && (<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}><input type="checkbox" checked={!!selected.mirrored} onChange={(e) => patchSel({ mirrored: e.target.checked })} /> <FlipHorizontal size={12} /> Espejear</label>)}
                  <div><div style={lbl}>Capa</div><select value={selected.layerId} onChange={(e) => patchSel({ layerId: e.target.value })} style={{ ...inputStyle, width: "100%", marginTop: 3 }}>{layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}><button style={{ ...btn(), flex: 1, justifyContent: "center" }} onClick={duplicateSel}><Copy size={12} /> Duplicar</button><button style={{ ...btn(false, true), flex: 1, justifyContent: "center" }} onClick={deleteSel}><Trash2 size={12} /> Eliminar</button></div>
                </div>
              )}
            </div>

            <div style={{ ...panelStyle, padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={lbl}><LayersIcon size={10} style={{ verticalAlign: "-1px" }} /> capas</span><button style={btn()} onClick={addLayer}><Plus size={11} /> nueva</button></div>
              <div style={{ marginBottom: 6 }}><div style={lbl}>Capa activa (recibe objetos nuevos)</div><select value={activeLayerId} onChange={(e) => setActiveLayerId(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 3 }}>{layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {layers.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 5, background: l.id === activeLayerId ? hexToRgba(C.accent, 0.08) : "transparent", padding: "3px 4px", borderRadius: 3, border: `1px solid ${l.id === activeLayerId ? C.accent : "transparent"}` }}>
                    <input type="color" value={l.color} onChange={(e) => patchLayer(l.id, { color: e.target.value })} style={{ width: 18, height: 18, padding: 0, border: "none", background: "none", cursor: "pointer" }} title="Color de los iconos de esta capa" />
                    <button onClick={() => patchLayer(l.id, { visible: !l.visible })} style={{ background: "none", border: "none", color: l.visible ? C.accent : C.textFaint, cursor: "pointer", display: "flex" }}>{l.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                    <button onClick={() => patchLayer(l.id, { locked: !l.locked })} style={{ background: "none", border: "none", color: l.locked ? C.danger : C.textFaint, cursor: "pointer", display: "flex" }}>{l.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                    <input value={l.name} onChange={(e) => patchLayer(l.id, { name: e.target.value })} onFocus={() => setActiveLayerId(l.id)} style={{ ...inputStyle, flex: 1, padding: "2px 4px", fontSize: 10 }} />
                    <button onClick={() => deleteLayer(l.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 9, color: C.textFaint, marginTop: 6 }}>El color tiñe los iconos de esa capa. Bloqueada = no se selecciona ni mueve, pero sigue visible.</p>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 9, color: C.textFaint, lineHeight: 1.5 }}>
        Herramienta de distribucion de piso — no sustituye un plano de luces profesional ni un plano certificado de
        ingenieria/arquitectura. Medidas de catalogo son valores default editables, no dato de fabricante verificado.
        El area fuera del marco punteado se puede seguir usando para editar, pero no se incluye en el PNG exportado.
        Los objetos se imantan entre si en vista de planta para armar estructuras compuestas (p.ej. modulos de pantalla).
      </p>

      {pendingClear && (
        <div style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 999, background: C.panel, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.danger, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.text }}>¿Borrar todo el lienzo? No se puede deshacer.</span>
          <button onClick={clearAll} style={btn(false, true)}>Borrar</button>
          <button onClick={() => setPendingClear(false)} style={btn()}><X size={13} /> Cancelar</button>
        </div>
      )}
    </div>
  );
}
