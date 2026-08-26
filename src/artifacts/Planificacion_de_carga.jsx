import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Trash2, AlertTriangle, Package, Truck, Download, Layers, FileText,
  ChevronDown, ChevronUp, Sun, Moon, FileSpreadsheet, Copy, Save, FolderOpen,
  Upload, X, Printer, StickyNote, BookOpen, Boxes, Info, HelpCircle, Move, RotateCw,
} from "lucide-react";

// ── id / nombre de archivo ──────────────────────────────────────────────
const genId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};
const sanitizeFileName = (s) =>
  (s || "").trim().replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "proyecto";

const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
// v3: la pieza de la distribución interactiva cambió de {caseId,rot} a
// {stack:[{caseId,rot}]} para soportar apilado.
// v4: las dimensiones (largo/ancho/alto de Cases y Vehículos) cambiaron de
// cm a metros como unidad por default. Se sube de versión a propósito para
// NO migrar datos viejos en cm — se descartan (decisión tomada: no había
// proyectos importados que conservar).
const CURRENT_KEY = "cubicaje:project:v4";
const PROJECTS_INDEX_KEY = "cubicaje:proyectos:index:v4";
const PROJECT_KEY = (id) => `cubicaje:proyecto:v4:${id}`;
const ONBOARDING_KEY = "cubicaje:onboarding:seen:v2";

// Normaliza viajes cargados desde storage/JSON: si alguna pieza del
// diagrama no tiene un "stack" válido (por ejemplo, datos de una versión
// anterior del artifact), se descarta esa pieza en vez de tronar el render.
// También migra el formato con "niveles" (versión anterior a esta, cuando
// existían pestañas de nivel) aplanando todas sus piezas a un solo arreglo
// — así no se pierde el trabajo ya colocado al quitar esa función. Las
// cantidades de la tabla de asignación (alloc) nunca se tocan aquí.
function sanitizeViajes(list) {
  if (!Array.isArray(list)) return [];
  return list.map((v) => {
    const dist = v?.distribucion;
    const rawPiezas = Array.isArray(dist?.piezas)
      ? dist.piezas
      : Array.isArray(dist?.niveles)
      ? dist.niveles.flatMap((n) => (Array.isArray(n?.piezas) ? n.piezas : []))
      : [];
    const piezas = rawPiezas.filter((pz) => Array.isArray(pz?.stack) && pz.stack.length > 0);
    return { ...v, distribucion: { piezas } };
  });
}

// ── identidad lightXtool: dos paletas completas, contraste AA revisado ──
const PALETTES = {
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", borderStrong: "rgba(0,160,250,0.45)",
    text: "#FFFFFF", textDim: "rgba(255,255,255,0.6)", textFaint: "rgba(255,255,255,0.32)",
    cyan: "#00A0FA", cyanLight: "#40A2FC", red: "#FF1D1D", redBg: "rgba(255,29,29,0.10)",
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

const DEFAULT_FACTOR_EFICIENCIA = 70; // % — estimado de referencia, no norma técnica
const DEFAULT_MARGEN_SEGURIDAD = 10; // % — colchón sobre capacidad de carga, no norma legal

// Colores para identificar cada tipo de Case en el diagrama de distribución
// — biblioteca independiente del cian/rojo de marca, mismo patrón ya usado
// en EscaletaTecnica para franjas de color de tarjetas.
const CASE_COLORS = [
  "#E53935", "#FB8C00", "#FDD835", "#43A047",
  "#00897B", "#3949AB", "#8E24AA", "#D81B60",
];

// Oscurece/aclara un hex (percent negativo = oscurece) — se usa para dibujar
// la segunda tonalidad de cada patrón (rayas/puntos/cuadrícula) a partir del
// color base del Case, sin tener que capturar un segundo color a mano.
function shade(hex, percent) {
  const num = parseInt((hex || "#888888").replace("#", ""), 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(2.55 * percent);
  let b = (num & 0x0000ff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Patrones visuales de Case: además del color, cada Case puede llevar un
// entramado (rayas/puntos/cuadrícula) para diferenciarse de otro Case con
// color parecido en el diagrama de distribución — útil con muchos tipos de
// equipo o para quien tiene dificultad para distinguir colores similares.
const CASE_PATTERNS = [
  { id: "solid", name: "Sólido", css: (hex) => ({ backgroundColor: hex }) },
  { id: "diag1", name: "Rayas diagonales /", css: (hex) => ({ backgroundColor: hex, backgroundImage: `repeating-linear-gradient(45deg, transparent 0, transparent 5px, ${shade(hex, -30)} 5px, ${shade(hex, -30)} 8px)` }) },
  { id: "diag2", name: "Rayas diagonales \\", css: (hex) => ({ backgroundColor: hex, backgroundImage: `repeating-linear-gradient(-45deg, transparent 0, transparent 5px, ${shade(hex, -30)} 5px, ${shade(hex, -30)} 8px)` }) },
  { id: "horiz", name: "Rayas horizontales", css: (hex) => ({ backgroundColor: hex, backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent 4px, ${shade(hex, -30)} 4px, ${shade(hex, -30)} 7px)` }) },
  { id: "vert", name: "Rayas verticales", css: (hex) => ({ backgroundColor: hex, backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 4px, ${shade(hex, -30)} 4px, ${shade(hex, -30)} 7px)` }) },
  { id: "dots", name: "Puntos", css: (hex) => ({ backgroundColor: hex, backgroundImage: `radial-gradient(${shade(hex, -35)} 30%, transparent 31%)`, backgroundSize: "7px 7px" }) },
  { id: "cross", name: "Cuadrícula", css: (hex) => ({ backgroundColor: hex, backgroundImage: `linear-gradient(${shade(hex, -35)} 1px, transparent 1px), linear-gradient(90deg, ${shade(hex, -35)} 1px, transparent 1px)`, backgroundSize: "7px 7px" }) },
];
function patternStyle(caseObj) {
  const hex = caseObj?.color || CASE_COLORS[0];
  const pat = CASE_PATTERNS.find((p) => p.id === (caseObj?.pattern || "solid")) || CASE_PATTERNS[0];
  return pat.css(hex);
}

// Tabla de referencia — SOLO consulta, rangos aproximados de mercado (no
// ficha técnica de fabricante específico). Mismo criterio que la tabla de
// lentes PAR en BeamThrowCalculator: no inventar specs de una marca/modelo.
const REFERENCIA_VEHICULOS = [
  { tipo: "Van de carga (tipo Sprinter/Transit larga)", interior: "≈ 3.00–4.00 × 1.70–1.90 × 1.90 m", carga: "≈ 1,200–1,500 kg" },
  { tipo: "Caja seca 3.5 t", interior: "≈ 4.00–4.50 × 2.00–2.10 × 2.00–2.10 m", carga: "≈ 1,500–2,000 kg" },
  { tipo: "Rabón (caja seca mediana)", interior: "≈ 5.00–6.00 × 2.20–2.40 × 2.20–2.40 m", carga: "≈ 3,000–4,500 kg" },
  { tipo: "Torton (caja seca grande)", interior: "≈ 7.00–9.00 × 2.40–2.50 × 2.40–2.60 m", carga: "≈ 8,000–12,000 kg" },
];

const SIMBOLOGIA = [
  ["m³", "Metros cúbicos — volumen"],
  ["kg", "Kilogramos — peso"],
  ["m", "Metros — unidad por default de largo/ancho/alto. Puedes escribir en cm (ej. 25cm) y el campo lo convierte solo a metros"],
  ["⚠", "Valor estimado (factor de eficiencia o margen) no confirmado a mano, o case que no cabe"],
  ["% volumen / % peso", "Uso del viaje contra la capacidad efectiva del vehículo asignado"],
];

function fmt(n, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toFixed(d);
}

// Si el texto capturado es "<número>cm" o "<número> cm", lo devuelve
// convertido a metros (÷100). Si no trae ese sufijo, se toma tal cual (ya en
// metros). Solo lo usan los campos de dimensión (unitConvert=true).
function parseMaybeCm(text) {
  const m = String(text).trim().match(/^(-?\d+\.?\d*)\s*cm$/i);
  if (m) return Number(m[1]) / 100;
  return Number(text);
}

// Input numérico "de texto controlado": se puede borrar el campo completo
// mientras se escribe; el número solo se confirma cuando el texto ya es
// válido, y los límites (min/max) solo se aplican al salir del campo.
// unitConvert=true habilita el atajo de escribir en cm (ej. "25cm" o
// "25 cm") dentro de un campo que vive en metros — se detecta el sufijo
// "cm" y se convierte solo, tanto en vivo (mientras se escribe, si el
// sufijo ya quedó completo) como al salir del campo.
function NumberField({ value, onCommit, decimals = 2, min, max, unitConvert = false, style, ...rest }) {
  const format = (v) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    const f = 10 ** decimals;
    return String(Math.round(v * f) / f);
  };
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const pattern = unitConvert ? /^-?\d*\.?\d*\s*[a-zA-Z]*$/ : /^-?\d*\.?\d*$/;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!pattern.test(raw)) return;
        setText(raw);
        if (unitConvert && /cm$/i.test(raw.trim())) {
          const n = parseMaybeCm(raw);
          if (!Number.isNaN(n)) onCommit(n);
          return;
        }
        if (raw !== "" && raw !== "-" && raw !== "." && !Number.isNaN(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        let n = unitConvert ? parseMaybeCm(text) : Number(text);
        if (text === "" || text === "-" || text === "." || Number.isNaN(n)) n = min ?? 0;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        setText(format(n));
        onCommit(n);
      }}
      style={style}
      {...rest}
    />
  );
}

// Verificación dimensional: ¿cabe un case (caja rectangular) dentro de un
// vehículo, permitiendo rotarlo sobre sus ejes (90°)? Condición necesaria y
// suficiente comparando las 3 dimensiones ordenadas de menor a mayor.
// LIMITACIÓN: verifica UN case a la vez, no garantiza que varios quepan
// simultáneamente (empaquetado 3D real, fuera de alcance del cálculo — la
// sección de distribución interactiva es una guía visual, no un solver).
function cabeDimensionalmente(caseItem, vehiculo) {
  if (!caseItem || !vehiculo) return null;
  const b = [Number(caseItem.largo) || 0, Number(caseItem.ancho) || 0, Number(caseItem.alto) || 0].sort((a, z) => a - z);
  const v = [Number(vehiculo.largoInt) || 0, Number(vehiculo.anchoInt) || 0, Number(vehiculo.altoInt) || 0].sort((a, z) => a - z);
  return b[0] <= v[0] && b[1] <= v[1] && b[2] <= v[2];
}
// Dimensiones ya vienen en metros (antes eran cm, de ahí la división entre
// 1,000,000 que existía aquí — ya no aplica).
function volumenM3(largo, ancho, alto) {
  return (Number(largo) || 0) * (Number(ancho) || 0) * (Number(alto) || 0);
}

// ── geometría de la distribución interactiva (piso del vehículo) ───────
// footprintOf: huella (ancho×profundidad) de un case según su rotación 2D.
// clampPos: recorta una posición para que la pieza completa (no solo su
// esquina) quede dentro del piso — así se respeta el borde derecho/inferior,
// no solo el superior/izquierdo.
// rectsOverlap: colisión AABB entre dos huellas, con tolerancia (EPS) para
// no bloquear por errores de redondeo de escala.
function footprintOf(caseObj, rot) {
  return rot
    ? { w: Number(caseObj?.ancho) || 0, h: Number(caseObj?.largo) || 0 }
    : { w: Number(caseObj?.largo) || 0, h: Number(caseObj?.ancho) || 0 };
}
function clampPos(x, y, w, h, maxW, maxH) {
  return {
    x: Math.max(0, Math.min(Math.max(0, maxW - w), x)),
    y: Math.max(0, Math.min(Math.max(0, maxH - h), y)),
  };
}
function rectsOverlap(a, b) {
  const EPS = 0.005; // 5 mm de tolerancia (antes 0.5 cm, ahora en metros)
  return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
}

// Busca la posición libre más cercana al punto deseado: primero pegada a
// los bordes de la(s) pieza(s) con las que chocó, y si ninguna sirve,
// expande una búsqueda en anillos alrededor del punto. NO es un acomodo a
// cuadrícula visual — es solo el método para no dejar huecos ni rechazar
// la colocación por un simple traslape. Devuelve null si de plano no cabe
// en ningún lado del piso.
function findNearestFreeSpot(desiredX, desiredY, w, h, maxW, maxH, otherRects, step = 0.05) {
  const start = clampPos(desiredX, desiredY, w, h, maxW, maxH);
  const collidesWith = (rect) => otherRects.some((r) => rectsOverlap(rect, r));
  if (!collidesWith({ x: start.x, y: start.y, w, h })) return start;

  // 1) pegado a los bordes de las piezas con las que chocó, el más cercano al punto deseado
  const collided = otherRects.filter((r) => rectsOverlap({ x: start.x, y: start.y, w, h }, r));
  const candidates = [];
  collided.forEach((r) => {
    candidates.push({ x: r.x + r.w, y: start.y });
    candidates.push({ x: r.x - w, y: start.y });
    candidates.push({ x: start.x, y: r.y + r.h });
    candidates.push({ x: start.x, y: r.y - h });
  });
  let best = null, bestDist = Infinity;
  candidates.forEach((c) => {
    const cc = clampPos(c.x, c.y, w, h, maxW, maxH);
    if (Math.abs(cc.x - c.x) > 0.001 || Math.abs(cc.y - c.y) > 0.001) return; // se saldría del piso, se descarta
    if (collidesWith({ x: cc.x, y: cc.y, w, h })) return;
    const dist = Math.hypot(cc.x - desiredX, cc.y - desiredY);
    if (dist < bestDist) { bestDist = dist; best = cc; }
  });
  if (best) return best;

  // 2) búsqueda expandida en anillos alrededor del punto deseado
  const maxRadius = Math.max(maxW, maxH);
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dy = -radius; dy <= radius; dy += step) {
        if (Math.abs(dx) < radius - step / 2 && Math.abs(dy) < radius - step / 2) continue; // solo el borde del anillo
        const cc = clampPos(desiredX + dx, desiredY + dy, w, h, maxW, maxH);
        if (!collidesWith({ x: cc.x, y: cc.y, w, h })) return cc;
      }
    }
  }
  return null;
}

function xlsxDownload(filename, rows, sheetName = "Datos") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
function xlsxDownloadMulti(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, (s.name || "Hoja").slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}
function jsonDownload(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const ELEVATION_Z_BUDGET = 140; // px máximos de alto para los paneles de corte (frente/lateral)

// Arma, a partir de las piezas ya colocadas, las barras verticales de un
// corte (frente o lateral): cada pila se convierte en una barra con un
// segmento por caja estibada (de abajo hacia arriba), en la posición y
// tamaño que le corresponde sobre el eje horizontal indicado.
function buildBars(piezas, caseByIdLocal, axis) {
  return piezas
    .map((pz) => {
      if (!Array.isArray(pz?.stack) || pz.stack.length === 0) return null;
      const base = caseByIdLocal[pz.stack[0]?.caseId];
      if (!base) return null;
      const fp = footprintOf(base, pz.stack[0].rot);
      const pos = axis === "x" ? pz.x : pz.y;
      const size = axis === "x" ? fp.w : fp.h;
      let z = 0;
      const segments = pz.stack.map((it) => {
        const h = Number(caseByIdLocal[it.caseId]?.alto) || 0;
        const seg = { caseId: it.caseId, z, h };
        z += h;
        return seg;
      });
      return { id: pz.id, pos, size, alturaTotal: z, segments };
    })
    .filter(Boolean);
}

// Vista de planta de solo lectura (sin arrastre) — para el PDF exportado.
// El editor interactivo real vive dentro de DistribucionViaje. Incluye cota
// de largo (arriba) y ancho (izquierda) fuera del marco del vehículo.
function VistaPlantaEstatica({ piezas, caseByIdLocal, styleFor, largo, ancho, scale, C }) {
  const w = largo * scale, h = ancho * scale;
  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ marginLeft: "32px", width: w }}>
        <div style={{ borderTop: "1px solid #333", position: "relative", height: "8px" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: "1px", height: "8px", background: "#333" }} />
          <div style={{ position: "absolute", right: 0, top: 0, width: "1px", height: "8px", background: "#333" }} />
        </div>
        <div style={{ fontSize: "8px", textAlign: "center", marginBottom: "2px" }}>Largo: {fmt(largo, 2)} m</div>
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: "32px", height: h, display: "flex", alignItems: "center" }}>
          <div style={{ borderLeft: "1px solid #333", height: "100%", position: "relative", width: 0 }}>
            <div style={{ position: "absolute", top: 0, left: "-4px", width: "8px", height: "1px", background: "#333" }} />
            <div style={{ position: "absolute", bottom: 0, left: "-4px", width: "8px", height: "1px", background: "#333" }} />
          </div>
          <div style={{ fontSize: "8px", marginLeft: "2px", writingMode: "vertical-rl" }}>Ancho: {fmt(ancho, 2)} m</div>
        </div>
        <div style={{ position: "relative", width: w, height: h, background: "#f2f2f2", border: "1.5px solid #333", borderRadius: "3px", overflow: "hidden" }}>
          {piezas.map((pz) => {
            if (!Array.isArray(pz?.stack) || pz.stack.length === 0) return null;
            const base = caseByIdLocal[pz.stack[0]?.caseId];
            if (!base) return null;
            const fp = footprintOf(base, pz.stack[0].rot);
            return (
              <div key={pz.id} style={{
                position: "absolute", left: pz.x * scale, top: pz.y * scale,
                width: Math.max(fp.w * scale, 8), height: Math.max(fp.h * scale, 8),
                ...styleFor(pz.stack[0].caseId), border: "1px solid #000",
                fontSize: "7px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                textAlign: "center", overflow: "hidden", lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,.8)",
              }}>
                {base.nombre || ""}{pz.stack.length > 1 ? ` ×${pz.stack.length}` : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Vista de corte (frente o lateral) — de solo lectura. Cada pila se dibuja
// como una barra vertical apilada por segmentos; se usa tanto en la vista
// interactiva (en vivo, junto a la planta) como en el PDF exportado. NO es
// un render 3D: son dos proyecciones 2D complementarias de los mismos
// datos (frente = eje largo/alto, lateral = eje ancho/alto).
function VistaElevacion({ piezas, caseByIdLocal, styleFor, axis, dimHorizontal, alturaVehiculo, scale, C, selectedId, onSelect, forPrint }) {
  const bars = useMemo(() => buildBars(piezas, caseByIdLocal, axis), [piezas, caseByIdLocal, axis]);
  const panelW = dimHorizontal * scale;
  const scaleZ = alturaVehiculo > 0 ? Math.min(ELEVATION_Z_BUDGET / alturaVehiculo, scale * 1.5) : scale;
  const panelH = Math.max(40, alturaVehiculo > 0 ? alturaVehiculo * scaleZ : ELEVATION_Z_BUDGET);
  const bg = forPrint ? "#f2f2f2" : C.panelAlt;
  const borderC = forPrint ? "#333" : C.borderStrong;
  const stroke = forPrint ? "#333" : C.cyan;

  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
        <div style={{ position: "relative", width: panelW, height: panelH, background: bg, border: `${forPrint ? "1.5px solid #333" : `2px solid ${borderC}`}`, borderRadius: "3px", overflow: "hidden" }}>
          {alturaVehiculo > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: `1.5px dashed ${forPrint ? "#C81414" : C.red}` }} />
          )}
          {bars.map((b) => {
            const excede = alturaVehiculo > 0 && b.alturaTotal > alturaVehiculo;
            const barH = Math.min(b.alturaTotal * scaleZ, panelH);
            const sel = selectedId === b.id;
            return (
              <div
                key={b.id}
                onClick={() => onSelect?.(b.id)}
                title={excede ? `Excede el alto del vehículo` : `${fmt(b.alturaTotal, 2)} m`}
                style={{
                  position: "absolute", left: b.pos * scale, bottom: 0, width: Math.max(b.size * scale, 6), height: barH,
                  cursor: onSelect ? "pointer" : "default", display: "flex", flexDirection: "column-reverse", overflow: "hidden",
                  border: `${forPrint ? "1px solid #000" : `2px solid ${sel ? C.cyan : excede ? C.red : "rgba(0,0,0,.35)"}`}`,
                  boxShadow: !forPrint && sel ? `0 0 0 2px ${C.cyan}` : "none",
                }}
              >
                {b.segments.map((s, i) => (
                  <div key={i} style={{
                    width: "100%", height: Math.max(s.h * scaleZ, 2), ...styleFor(s.caseId),
                    borderTop: i > 0 ? `1px solid ${forPrint ? "#fff" : "rgba(255,255,255,.6)"}` : "none", flexShrink: 0,
                  }} />
                ))}
              </div>
            );
          })}
        </div>
        {/* cota vertical: alto del vehículo */}
        <div style={{ width: "30px", height: panelH, display: "flex", alignItems: "center", flexShrink: 0 }}>
          <div style={{ borderLeft: `1px solid ${stroke}`, height: "100%", position: "relative", width: 0 }}>
            <div style={{ position: "absolute", top: 0, left: "-4px", width: "8px", height: "1px", background: stroke }} />
            <div style={{ position: "absolute", bottom: 0, left: "-4px", width: "8px", height: "1px", background: stroke }} />
          </div>
          <div style={{ fontSize: forPrint ? "8px" : "9px", color: stroke, fontFamily: FONT, fontWeight: 700, marginLeft: "3px", writingMode: "vertical-rl" }}>
            Alto: {fmt(alturaVehiculo, 2)} m
          </div>
        </div>
      </div>
      {/* cota horizontal: largo (vista frontal) o ancho (vista lateral) */}
      <div style={{ width: panelW, marginTop: "3px" }}>
        <div style={{ borderTop: `1px solid ${stroke}`, position: "relative", height: "7px" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: "1px", height: "7px", background: stroke }} />
          <div style={{ position: "absolute", right: 0, top: 0, width: "1px", height: "7px", background: stroke }} />
        </div>
        <div style={{ fontSize: forPrint ? "8px" : "9px", color: stroke, fontFamily: FONT, fontWeight: 700, textAlign: "center" }}>
          {axis === "x" ? "Largo" : "Ancho"}: {fmt(dimHorizontal, 2)} m
        </div>
      </div>
    </div>
  );
}


// ── Selector de color + patrón de un Case. Se usa al final de cada renglón
// del catálogo — el botón muestra el color/patrón actual; al abrir permite
// elegir uno de los CASE_COLORS (o un color personalizado) y uno de los
// CASE_PATTERNS. Es la identidad visual con la que ese Case aparecerá en el
// diagrama de distribución de todos los viajes donde se use.
function CaseStylePicker({ caseItem, onChange, C }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);
  const hex = caseItem.color || CASE_COLORS[0];
  const currentPattern = caseItem.pattern || "solid";
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Cambiar color y patrón"
        style={{ width: "30px", height: "22px", borderRadius: "3px", border: "1px solid rgba(0,0,0,.3)", cursor: "pointer", ...patternStyle(caseItem) }}
      />
      {open && (
        <div style={{
          position: "absolute", zIndex: 300, top: "26px", left: 0, background: C.panel,
          border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px", minWidth: "170px",
          boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          <div style={{ fontSize: "9px", color: C.textDim, marginBottom: "4px" }}>Color</div>
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginBottom: "8px" }}>
            {CASE_COLORS.map((c) => (
              <button key={c} onClick={() => onChange({ color: c })}
                title={c}
                style={{ width: "16px", height: "16px", borderRadius: "3px", background: c, cursor: "pointer",
                  border: hex.toLowerCase() === c.toLowerCase() ? "2px solid #fff" : "1px solid rgba(0,0,0,.3)",
                  outline: hex.toLowerCase() === c.toLowerCase() ? `1px solid ${C.cyan}` : "none" }} />
            ))}
            <input type="color" value={hex} onChange={(e) => onChange({ color: e.target.value })}
              title="Color personalizado"
              style={{ width: "16px", height: "16px", padding: 0, border: "1px solid rgba(0,0,0,.3)", borderRadius: "3px", cursor: "pointer" }} />
          </div>
          <div style={{ fontSize: "9px", color: C.textDim, marginBottom: "4px" }}>Patrón</div>
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
            {CASE_PATTERNS.map((p) => (
              <button key={p.id} title={p.name} onClick={() => onChange({ pattern: p.id })}
                style={{ width: "22px", height: "22px", borderRadius: "3px", cursor: "pointer",
                  border: currentPattern === p.id ? `2px solid ${C.cyan}` : "1px solid rgba(0,0,0,.3)",
                  ...p.css(hex) }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Distribución interactiva de un viaje: vista superior a escala del piso
// del vehículo. Arrastra un Case desde la paleta hacia el diagrama para
// colocarlo; arrastra una pieza ya colocada para reacomodarla. Las piezas
// respetan los 4 bordes del piso; si se sueltan sobre un hueco ocupado, se
// reacomodan solas al espacio libre más cercano (no rechazan la colocación,
// no hay cuadrícula visual, solo evitan traslapes). Soltar un case sobre
// otro igual o más grande lo apila por snap (misma posición, footprint del
// de abajo) — se ve el contorno de cada caja estibada, no solo la de abajo.
function DistribucionViaje({ viaje, casesEnViaje, C, btnStyle, labelStyle, onAddPieza, onUpdatePieza, onRemovePieza, onPopTop, onMergeIntoStack, onRequestClearAll }) {
  const canvasRef = useRef(null);
  const [selectedPieza, setSelectedPieza] = useState(null);
  const [dragPreview, setDragPreview] = useState(null); // {type:'new'|'move', ..., x, y, w, h}
  const dragPreviewRef = useRef(null);
  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);
  const [noSpaceMsg, setNoSpaceMsg] = useState(false);

  const caseByIdLocal = useMemo(() => Object.fromEntries(casesEnViaje.map((c) => [c.id, c])), [casesEnViaje]);

  const vehiculo = viaje.vehiculo;
  const piezas = viaje.distribucion?.piezas || [];

  const MAX_W = 480, MAX_H = 300;
  const largo = Number(vehiculo.largoInt) || 1;
  const ancho = Number(vehiculo.anchoInt) || 1;
  const scale = Math.max(0.01, Math.min(MAX_W / largo, MAX_H / ancho));
  const canvasW = largo * scale, canvasH = ancho * scale;

  // Color y patrón vienen del propio Case (definidos en el catálogo), no de
  // su posición en la lista — así un Case conserva su identidad visual en
  // todos los viajes donde aparezca.
  const colorFor = (caseId) => caseByIdLocal[caseId]?.color || CASE_COLORS[0];
  const styleFor = (caseId) => patternStyle(caseByIdLocal[caseId]);

  const piezaRect = (pz) => {
    if (!Array.isArray(pz?.stack) || pz.stack.length === 0) return null; // dato corrupto/legado, se ignora sin tronar
    const base = caseByIdLocal[pz.stack[0]?.caseId];
    if (!base) return null;
    const fp = footprintOf(base, pz.stack[0].rot);
    return { x: pz.x, y: pz.y, w: fp.w, h: fp.h };
  };

  // ¿El punto (centro de la pieza soltada) cae dentro de una pieza ya
  // colocada cuya huella sea igual o mayor? Si sí, es un objetivo de apilado.
  const findStackTarget = (excludeId, centerX, centerY, w, h) => {
    for (const pz of piezas) {
      if (pz.id === excludeId) continue;
      const r = piezaRect(pz);
      if (!r) continue;
      const within = centerX >= r.x && centerX <= r.x + r.w && centerY >= r.y && centerY <= r.y + r.h;
      if (within && w <= r.w + 0.5 && h <= r.h + 0.5) return pz;
    }
    return null;
  };
  const otherRects = (excludeId) => piezas.filter((pz) => pz.id !== excludeId).map(piezaRect).filter(Boolean);
  const flashNoSpace = () => { setNoSpaceMsg(true); setTimeout(() => setNoSpaceMsg(false), 2200); };

  const startDragFromPalette = (e, caseId, disabled) => {
    if (disabled) return;
    e.preventDefault();
    setSelectedPieza(null);
    const cs = caseByIdLocal[caseId];
    if (!cs) return;
    const fp = footprintOf(cs, false);

    const place = (clientX, clientY) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x, y } = clampPos((clientX - rect.left) / scale - fp.w / 2, (clientY - rect.top) / scale - fp.h / 2, fp.w, fp.h, largo, ancho);
      const preview = { type: "new", caseId, x, y, w: fp.w, h: fp.h };
      dragPreviewRef.current = preview;
      setDragPreview(preview);
    };
    place(e.clientX, e.clientY);

    const onMove = (ev) => place(ev.clientX, ev.clientY);
    const onUp = () => {
      const dp = dragPreviewRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragPreviewRef.current = null;
      setDragPreview(null);
      if (!dp) return;
      const centerX = dp.x + dp.w / 2, centerY = dp.y + dp.h / 2;
      const target = findStackTarget(null, centerX, centerY, dp.w, dp.h);
      if (target) {
        onMergeIntoStack(viaje.id, null, target.id, { caseId: dp.caseId, rot: false });
        return;
      }
      const spot = findNearestFreeSpot(dp.x, dp.y, dp.w, dp.h, largo, ancho, otherRects(null));
      if (!spot) { flashNoSpace(); return; }
      onAddPieza(viaje.id, dp.caseId, spot.x, spot.y, false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startDragPieza = (e, pieza) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPieza(pieza.id);
    const rect0 = piezaRect(pieza);
    if (!rect0) return;
    const startClientX = e.clientX, startClientY = e.clientY;
    const startX = pieza.x, startY = pieza.y;

    const preview = { type: "move", pieceId: pieza.id, x: startX, y: startY, w: rect0.w, h: rect0.h };
    dragPreviewRef.current = preview;
    setDragPreview(preview);

    const onMove = (ev) => {
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;
      const { x, y } = clampPos(startX + dx, startY + dy, rect0.w, rect0.h, largo, ancho);
      const p = { type: "move", pieceId: pieza.id, x, y, w: rect0.w, h: rect0.h };
      dragPreviewRef.current = p;
      setDragPreview(p);
    };
    const onUp = () => {
      const dp = dragPreviewRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragPreviewRef.current = null;
      setDragPreview(null);
      if (!dp) return;
      const centerX = dp.x + dp.w / 2, centerY = dp.y + dp.h / 2;
      if (pieza.stack.length === 1) {
        const target = findStackTarget(pieza.id, centerX, centerY, dp.w, dp.h);
        if (target) {
          onMergeIntoStack(viaje.id, pieza.id, target.id, null);
          return;
        }
      }
      const spot = findNearestFreeSpot(dp.x, dp.y, dp.w, dp.h, largo, ancho, otherRects(pieza.id));
      if (!spot) { flashNoSpace(); return; } // se queda donde estaba
      onUpdatePieza(viaje.id, pieza.id, { x: spot.x, y: spot.y });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const piezasTotalPorCase = (caseId) => piezas.reduce((s, pz) => s + pz.stack.filter((it) => it.caseId === caseId).length, 0);
  const asignadasPorCase = (caseId) => viaje.alloc.filter((a) => a.caseId === caseId).reduce((s, a) => s + (Number(a.cantidad) || 0), 0);
  const alturaTotal = (pz) => pz.stack.reduce((s, it) => s + (Number(caseByIdLocal[it.caseId]?.alto) || 0), 0);
  const selected = piezas.find((pz) => pz.id === selectedPieza) || null;

  // Alto real del vehículo (eje Z) — el diagrama es una vista de planta, así
  // que la altura no se ve en el dibujo; se indica aparte, por pila, contra
  // este techo. Es una advertencia (no bloquea apilar), igual que el resto
  // de validaciones de capacidad de la herramienta.
  const alturaVehiculo = Number(vehiculo.altoInt) || 0;
  const pilasQueExceden = piezas.filter((pz) => alturaVehiculo > 0 && alturaTotal(pz) > alturaVehiculo).length;

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontSize: "10px", color: C.textFaint }}>
          Alto del vehículo: <b style={{ color: C.cyan }}>{alturaVehiculo ? `${fmt(alturaVehiculo, 2)} m` : "?"}</b>
        </span>
        <button
          style={{ ...btnStyle("danger"), marginLeft: "auto" }}
          onClick={() => onRequestClearAll(viaje.id, viaje.nombre)}
          disabled={piezas.length === 0}
          title="Quita todas las piezas colocadas de este viaje (no toca las cantidades asignadas de la tabla)"
        >
          <Trash2 size={12} /> Borrar todo y empezar de nuevo
        </button>
      </div>
      {pilasQueExceden > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px", fontSize: "10px", color: C.red }}>
          <AlertTriangle size={12} />
          {pilasQueExceden} pila(s) superan el alto del vehículo.
        </div>
      )}

      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* diagrama (vista superior, a escala) + cotas de largo/ancho fuera del marco */}
        <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
          {/* cota superior: largo */}
          <div style={{ position: "absolute", left: 36, top: 0, width: canvasW }}>
            <div style={{ borderBottom: `1px solid ${C.cyan}`, position: "relative", height: "9px" }}>
              <div style={{ position: "absolute", left: 0, bottom: 0, width: "1px", height: "8px", background: C.cyan }} />
              <div style={{ position: "absolute", right: 0, bottom: 0, width: "1px", height: "8px", background: C.cyan }} />
            </div>
            <div style={{ fontSize: "9px", color: C.cyan, fontFamily: FONT, fontWeight: 700, textAlign: "center" }}>
              Largo: {fmt(largo, 2)} m
            </div>
          </div>
          {/* cota izquierda: ancho */}
          <div style={{ position: "absolute", left: 0, top: 26, height: canvasH, display: "flex", alignItems: "center" }}>
            <div style={{ borderRight: `1px solid ${C.cyan}`, position: "relative", width: "9px", height: "100%" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: "8px", height: "1px", background: C.cyan }} />
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "8px", height: "1px", background: C.cyan }} />
            </div>
            <div style={{ fontSize: "9px", color: C.cyan, fontFamily: FONT, fontWeight: 700, marginLeft: "2px", writingMode: "vertical-rl" }}>
              Ancho: {fmt(ancho, 2)} m
            </div>
          </div>

          <div
            ref={canvasRef}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedPieza(null); }}
            style={{
              position: "relative", width: canvasW, height: canvasH, marginTop: "26px", marginLeft: "36px",
              background: C.panelAlt, border: `2px solid ${C.borderStrong}`, borderRadius: "4px",
              overflow: "hidden", touchAction: "none",
            }}
          >
          {piezas.map((pz) => {
            const isDraggingThis = dragPreview?.type === "move" && dragPreview.pieceId === pz.id;
            const r = isDraggingThis ? { x: dragPreview.x, y: dragPreview.y, w: dragPreview.w, h: dragPreview.h } : piezaRect(pz);
            if (!r) return null;
            const base = caseByIdLocal[pz.stack[0]?.caseId];
            const sel = selectedPieza === pz.id;
            const alto = alturaTotal(pz);
            const excede = alturaVehiculo > 0 && alto > alturaVehiculo;
            const wpx = Math.max(r.w * scale, 14), hpx = Math.max(r.h * scale, 14);
            return (
              <div
                key={pz.id}
                onPointerDown={(e) => startDragPieza(e, pz)}
                title={excede ? `Excede el alto del vehículo por ${fmt(alto - alturaVehiculo, 2)} m` : `${fmt(alto, 2)} m de altura`}
                style={{
                  position: "absolute", left: r.x * scale, top: r.y * scale, width: wpx, height: hpx,
                  ...styleFor(pz.stack[0]?.caseId), opacity: isDraggingThis ? 0.75 : 1,
                  border: `2px solid ${sel ? C.cyan : excede ? C.red : "rgba(0,0,0,.35)"}`, borderRadius: "2px",
                  cursor: "grab", overflow: "hidden",
                  boxShadow: sel ? `0 0 0 2px ${C.cyan}` : excede ? `0 0 0 2px ${C.red}` : "0 1px 3px rgba(0,0,0,.35)",
                  zIndex: isDraggingThis ? 50 : 1,
                }}
              >
                {/* contorno de cada caja estibada arriba de la base — así se ve
                    cuál es más chica dentro de la pila, no solo la de abajo */}
                {pz.stack.slice(1).map((it, idx) => {
                  const itCase = caseByIdLocal[it.caseId];
                  if (!itCase) return null;
                  const fp2 = footprintOf(itCase, it.rot);
                  const iw = Math.min(fp2.w * scale, wpx), ih = Math.min(fp2.h * scale, hpx);
                  return (
                    <div key={idx} style={{
                      position: "absolute", left: Math.max(0, (wpx - iw) / 2), top: Math.max(0, (hpx - ih) / 2),
                      width: iw, height: ih, ...styleFor(it.caseId),
                      border: "1px solid rgba(255,255,255,.7)", borderRadius: "1px", opacity: 0.95,
                    }} />
                  );
                })}
                <div style={{
                  position: "relative", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#fff", fontFamily: FONT,
                  textAlign: "center", padding: "1px", lineHeight: 1.15, textShadow: "0 1px 2px rgba(0,0,0,.85)",
                }}>
                  <span style={{ fontWeight: 700 }}>{excede ? "⚠ " : ""}{base?.nombre || "case"}</span>
                  <span style={{ opacity: 0.95 }}>{pz.stack.length > 1 ? `${pz.stack.length}× · ` : ""}{fmt(alto, 2)}m</span>
                </div>
              </div>
            );
          })}

          {dragPreview?.type === "new" && (
            <div style={{
              position: "absolute", left: dragPreview.x * scale, top: dragPreview.y * scale,
              width: dragPreview.w * scale, height: dragPreview.h * scale,
              background: `${colorFor(dragPreview.caseId)}88`, border: `2px dashed ${colorFor(dragPreview.caseId)}`,
              borderRadius: "2px", pointerEvents: "none", zIndex: 60,
            }} />
          )}
          </div>
        </div>

        {/* paleta de cases para arrastrar */}
        <div style={{ minWidth: "175px", flex: 1 }}>
          <div style={labelStyle}>Arrastra al diagrama</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
            {casesEnViaje.map((cs) => {
              const colocadas = piezasTotalPorCase(cs.id);
              const asignadas = asignadasPorCase(cs.id);
              const atLimite = asignadas > 0 && colocadas >= asignadas;
              return (
                <div
                  key={cs.id}
                  onPointerDown={(e) => startDragFromPalette(e, cs.id, atLimite)}
                  title={atLimite ? "Ya colocaste todas las unidades asignadas de este case en este viaje" : "Arrastra al diagrama"}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "4px",
                    background: atLimite ? C.panelAlt : `${colorFor(cs.id)}22`, border: `1px solid ${atLimite ? C.textFaint : colorFor(cs.id)}`,
                    opacity: atLimite ? 0.55 : 1, cursor: atLimite ? "not-allowed" : "grab", touchAction: "none", fontSize: "10px",
                  }}
                >
                  <span style={{ width: "14px", height: "14px", borderRadius: "2px", flexShrink: 0, border: "1px solid rgba(0,0,0,.3)", ...styleFor(cs.id) }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cs.nombre || "(sin nombre)"}</span>
                  <span style={{ color: C.textFaint, flexShrink: 0 }}>{fmt(cs.largo, 2)}×{fmt(cs.ancho, 2)}m</span>
                  <span style={{ color: atLimite ? C.red : C.textFaint, flexShrink: 0, fontWeight: atLimite ? 700 : 400 }}>{colocadas}/{asignadas || "∞"}</span>
                </div>
              );
            })}
          </div>

          {noSpaceMsg && (
            <p style={{ fontSize: "10px", color: C.red, marginTop: "8px" }}>
              <AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> No hay espacio libre en el piso para esa pieza.
            </p>
          )}

          {selected?.stack?.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              {alturaVehiculo > 0 && (() => {
                const altoSel = alturaTotal(selected);
                const restante = alturaVehiculo - altoSel;
                return (
                  <p style={{ fontSize: "10px", color: restante < 0 ? C.red : C.textDim, marginBottom: "6px" }}>
                    Pila seleccionada: <b>{fmt(altoSel, 2)} m</b> de {fmt(alturaVehiculo, 2)} m del vehículo —{" "}
                    {restante >= 0 ? `${fmt(restante, 2)} m libres arriba` : `excede por ${fmt(-restante, 2)} m`}.
                  </p>
                );
              })()}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  style={btnStyle()}
                  title="Rotar 90° (gira la huella de toda la pila)"
                  onClick={() => onUpdatePieza(viaje.id, selected.id, { stack: [{ ...selected.stack[0], rot: !selected.stack[0].rot }, ...selected.stack.slice(1)] })}
                >
                  <RotateCw size={12} /> Rotar
                </button>
                {selected.stack.length > 1 && (
                  <button style={btnStyle()} onClick={() => onPopTop(viaje.id, selected.id)}>
                    <Trash2 size={12} /> Quitar de arriba
                  </button>
                )}
                <button style={btnStyle("danger")} onClick={() => { onRemovePieza(viaje.id, selected.id); setSelectedPieza(null); }}>
                  <Trash2 size={12} /> Quitar todo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vistas de corte, en vivo — dos proyecciones 2D complementarias de las
          mismas piezas (no es un render 3D): frente muestra el largo del
          vehículo contra la altura, lateral muestra el ancho contra la
          altura. Se actualizan solas al editar la planta. */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "12px" }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: "4px" }}>Vista frontal (largo × alto)</div>
          <VistaElevacion
            piezas={piezas} caseByIdLocal={caseByIdLocal} styleFor={styleFor} axis="x"
            dimHorizontal={largo} alturaVehiculo={alturaVehiculo} scale={scale} C={C}
            selectedId={selectedPieza} onSelect={setSelectedPieza}
          />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: "4px" }}>Vista lateral (ancho × alto)</div>
          <VistaElevacion
            piezas={piezas} caseByIdLocal={caseByIdLocal} styleFor={styleFor} axis="y"
            dimHorizontal={ancho} alturaVehiculo={alturaVehiculo} scale={scale} C={C}
            selectedId={selectedPieza} onSelect={setSelectedPieza}
          />
        </div>
      </div>

      <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "8px" }}>
        Vista superior a escala ({fmt(largo, 2)}×{fmt(ancho, 2)} m de piso). Si sueltas una pieza sobre un hueco
        ocupado, se acomoda sola en el espacio libre más cercano (no hay cuadrícula, solo evita
        traslapes; si de plano no hay espacio, se avisa y no se coloca). Suelta un case sobre otro
        igual o más grande para apilarlo por snap — se ve el contorno de cada caja estibada, no solo
        la de abajo. Para girar un case (o una pila completa), selecciónalo en el diagrama y usa el
        botón "Rotar" — el giro es 90° sobre el largo/ancho. El contador de la paleta muestra piezas
        colocadas / cantidad asignada al viaje — al llegar al límite, ese case se deshabilita para
        arrastrar. Las vistas de frente y lateral de abajo son dos cortes 2D de las mismas piezas (no
        un render 3D) — puedes tocar una barra ahí para seleccionar esa pila también en la planta.
      </p>
    </div>
  );
}

export default function CubicajeTransporte() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  const [proyectoInfo, setProyectoInfo] = useState({ nombre: "", fecha: "", responsable: "" });
  const [cases, setCases] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [viajes, setViajes] = useState([]);
  const [margenSeguridad, setMargenSeguridad] = useState(DEFAULT_MARGEN_SEGURIDAD);
  const [notas, setNotas] = useState("");
  const [invCollapsed, setInvCollapsed] = useState(false);
  const [vehCollapsed, setVehCollapsed] = useState(false);
  const [showReferencia, setShowReferencia] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [msg, setMsg] = useState("");
  const loaded = useRef(false);

  const [fileBaseName, setFileBaseName] = useState("");
  const [fileBaseEditado, setFileBaseEditado] = useState(false);
  useEffect(() => {
    if (!fileBaseEditado) setFileBaseName(sanitizeFileName(`LXT-Cubicaje_${proyectoInfo.nombre || "Proyecto"}`));
  }, [proyectoInfo.nombre, fileBaseEditado]);

  const [pendingDelete, setPendingDelete] = useState(null); // { type, id, label }
  const requestDelete = (type, id, label) => setPendingDelete({ type, id, label });
  const cancelDelete = () => setPendingDelete(null);

  const [savedProjects, setSavedProjects] = useState([]);
  const [saveProjectNameInput, setSaveProjectNameInput] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const fileInputRef = useRef(null);

  // ── carga inicial: autoguardado del proyecto de trabajo actual ────
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(CURRENT_KEY, false);
        if (res) {
          const s = JSON.parse(res.value);
          setProyectoInfo(s.proyectoInfo || { nombre: "", fecha: "", responsable: "" });
          setCases(s.cases || []);
          setVehiculos(s.vehiculos || []);
          setViajes(sanitizeViajes(s.viajes || []));
          setMargenSeguridad(s.margenSeguridad ?? DEFAULT_MARGEN_SEGURIDAD);
          setNotas(s.notas || "");
          setTheme(s.theme || "dark");
        }
      } catch {
        // sin proyecto guardado aún
      } finally {
        loaded.current = true;
      }
    })();
    (async () => {
      try {
        const res = await window.storage.get(PROJECTS_INDEX_KEY, false);
        setSavedProjects(res ? JSON.parse(res.value) : []);
      } catch {
        setSavedProjects([]);
      }
    })();
    (async () => {
      try {
        const res = await window.storage.get(ONBOARDING_KEY, false);
        if (!res) {
          setShowHelp(true);
          await window.storage.set(ONBOARDING_KEY, "1", false);
        }
      } catch {
        // si falla el storage, no forzamos el modal en el primer uso
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage
        .set(CURRENT_KEY, JSON.stringify({ proyectoInfo, cases, vehiculos, viajes, margenSeguridad, notas, theme }), false)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [proyectoInfo, cases, vehiculos, viajes, margenSeguridad, notas, theme]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  // ── estilos derivados del tema (idénticos a VoltageGeneratorCalculator) ─
  const panelStyle = { backgroundColor: C.panel, border: `1px solid ${C.border}`, borderRadius: "8px" };
  const inputStyle = {
    backgroundColor: theme === "dark" ? "#050505" : "#FAFAFA",
    border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT, fontSize: "12px",
    padding: "6px 8px", borderRadius: "3px", outline: "none",
  };
  const selectStyle = { ...inputStyle, cursor: "pointer" };
  const labelStyle = { fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 };
  const thStyle = { padding: "6px 10px", textAlign: "left", fontFamily: FONT };
  const tdStyle = { padding: "6px 10px", fontFamily: FONT, fontSize: "12px", color: C.text };
  const glowText = (color) => (C.glow ? { textShadow: `0 0 10px ${color}` } : {});
  const glowBox = (rgba) => (C.glow ? { boxShadow: `0 0 10px ${rgba}` } : {});

  function btnStyle(variant = "default") {
    const base = {
      fontFamily: FONT, fontSize: "11px", padding: "6px 12px", borderRadius: "3px",
      cursor: "pointer", letterSpacing: ".4px", display: "inline-flex", alignItems: "center", gap: "6px",
    };
    if (variant === "primary") return { ...base, background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700, ...glowBox("rgba(0,160,250,.25)") };
    if (variant === "danger") return { ...base, background: C.redBg, border: `1px solid ${C.red}`, color: C.red };
    if (variant === "active") return { ...base, background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700 };
    return { ...base, background: theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF", border: `1px solid ${C.border}`, color: C.textDim, fontWeight: 700 };
  }

  const SectionHeader = ({ icon: Icon, title, subtitle, right }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon size={14} style={{ color: C.cyan }} />
        <span style={{ fontFamily: FONT, fontSize: "12px", color: C.cyan, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, ...glowText("rgba(0,160,250,.4)") }}>
          {title}
        </span>
        {subtitle && <span style={{ fontFamily: FONT, fontSize: "10px", color: C.textFaint }}>· {subtitle}</span>}
      </div>
      {right}
    </div>
  );

  // ── cases ───────────────────────────────────────────────────────────
  const addCase = () => {
    setCases((p) => [...p, {
      id: genId("case"), nombre: "", largo: 0, ancho: 0, alto: 0, peso: 0, cantidadDisponible: 0, notasLibres: "",
      color: CASE_COLORS[p.length % CASE_COLORS.length], pattern: "solid",
    }]);
    setInvCollapsed(false);
  };
  const duplicateCase = (id) => {
    setCases((p) => {
      const idx = p.findIndex((c) => c.id === id);
      if (idx === -1) return p;
      const copy = { ...p[idx], id: genId("case"), nombre: `${p[idx].nombre || "Case"} (copia)` };
      const next = [...p];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const updateCase = (id, patch) => setCases((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // ── vehículos ───────────────────────────────────────────────────────
  const addVehiculo = () => {
    setVehiculos((p) => [...p, {
      id: genId("veh"), nombre: "", largoInt: 0, anchoInt: 0, altoInt: 0,
      capacidadCarga: 0, factorEficiencia: DEFAULT_FACTOR_EFICIENCIA, factorEditado: false,
      cantidadDisponible: 1,
    }]);
    setVehCollapsed(false);
  };
  const duplicateVehiculo = (id) => {
    setVehiculos((p) => {
      const idx = p.findIndex((v) => v.id === id);
      if (idx === -1) return p;
      const copy = { ...p[idx], id: genId("veh"), nombre: `${p[idx].nombre || "Vehículo"} (copia)` };
      const next = [...p];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const updateVehiculo = (id, patch) => setVehiculos((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const onFactorChange = (id, val) =>
    setVehiculos((p) => p.map((v) => (v.id === id ? { ...v, factorEficiencia: Math.min(100, Math.max(1, Number(val) || 1)), factorEditado: true } : v)));

  // ── viajes ──────────────────────────────────────────────────────────
  const addViaje = () => setViajes((p) => [...p, { id: genId("viaje"), nombre: `Viaje ${p.length + 1}`, vehiculoId: vehiculos[0]?.id || "", colapsado: false, alloc: [], distribucion: { piezas: [] } }]);
  const patchViaje = (id, patch) => setViajes((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const addAllocation = (viajeId) =>
    setViajes((p) => p.map((v) => (v.id === viajeId ? { ...v, alloc: [...v.alloc, { caseId: cases[0]?.id || "", cantidad: 1 }] } : v)));
  const updateAllocation = (viajeId, idx, patch) =>
    setViajes((p) => p.map((v) => (v.id === viajeId ? { ...v, alloc: v.alloc.map((a, i) => (i === idx ? { ...a, ...patch } : a)) } : v)));
  const removeAllocation = (viajeId, idx) =>
    setViajes((p) => p.map((v) => (v.id === viajeId ? { ...v, alloc: v.alloc.filter((_, i) => i !== idx) } : v)));

  // ── distribución interactiva (niveles / piezas colocadas) ────────────
  const ensureDistribucion = (viaje) =>
    Array.isArray(viaje.distribucion?.piezas) ? viaje.distribucion : { piezas: [] };

  const addPieza = (viajeId, caseId, x, y, rot) => setViajes((p) => p.map((v) => {
    if (v.id !== viajeId) return v;
    const dist = ensureDistribucion(v);
    return { ...v, distribucion: { piezas: [...dist.piezas, { id: genId("pz"), x, y, stack: [{ caseId, rot: !!rot }] }] } };
  }));
  const updatePieza = (viajeId, piezaId, patch) => setViajes((p) => p.map((v) => {
    if (v.id !== viajeId) return v;
    const dist = ensureDistribucion(v);
    return { ...v, distribucion: { piezas: dist.piezas.map((pz) => (pz.id === piezaId ? { ...pz, ...patch } : pz)) } };
  }));
  const removePieza = (viajeId, piezaId) => setViajes((p) => p.map((v) => {
    if (v.id !== viajeId) return v;
    const dist = ensureDistribucion(v);
    return { ...v, distribucion: { piezas: dist.piezas.filter((pz) => pz.id !== piezaId) } };
  }));
  // Apilar: agrega el item nuevo (newItem) o el stack completo de otra pieza
  // (sourcePieceId) encima de la pieza destino (targetPieceId); si viene de
  // otra pieza, esa pieza se elimina (se fusiona en el destino).
  const mergeIntoStack = (viajeId, sourcePieceId, targetPieceId, newItem) => setViajes((p) => p.map((v) => {
    if (v.id !== viajeId) return v;
    const dist = ensureDistribucion(v);
    const target = dist.piezas.find((pz) => pz.id === targetPieceId);
    if (!target) return v;
    let addedStack, piezas;
    if (sourcePieceId) {
      const source = dist.piezas.find((pz) => pz.id === sourcePieceId);
      if (!source || source.id === targetPieceId) return v;
      addedStack = source.stack;
      piezas = dist.piezas.filter((pz) => pz.id !== sourcePieceId);
    } else {
      addedStack = [newItem];
      piezas = dist.piezas;
    }
    piezas = piezas.map((pz) => (pz.id === targetPieceId ? { ...pz, stack: [...pz.stack, ...addedStack] } : pz));
    return { ...v, distribucion: { piezas } };
  }));
  // Quita solo la caja de hasta arriba de una pila (sin borrar la pieza si aún quedan más abajo)
  const popTopFromStack = (viajeId, piezaId) => setViajes((p) => p.map((v) => {
    if (v.id !== viajeId) return v;
    const dist = ensureDistribucion(v);
    const piezas = dist.piezas
      .map((pz) => (pz.id === piezaId && pz.stack.length > 1 ? { ...pz, stack: pz.stack.slice(0, -1) } : pz))
      .filter((pz) => pz.stack.length > 0);
    return { ...v, distribucion: { piezas } };
  }));
  // Vacía por completo el diagrama de un viaje (no toca las cantidades de la tabla de asignación)
  const clearDistribucion = (viajeId) => setViajes((p) => p.map((v) => (v.id === viajeId ? { ...v, distribucion: { piezas: [] } } : v)));

  // ── borrado con confirmación ────────────────────────────────────────
  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === "case") {
      setCases((p) => p.filter((c) => c.id !== id));
      setViajes((p) => p.map((v) => ({ ...v, alloc: v.alloc.filter((a) => a.caseId !== id) })));
    } else if (type === "vehiculo") {
      setVehiculos((p) => p.filter((v) => v.id !== id));
      setViajes((p) => p.map((v) => (v.vehiculoId === id ? { ...v, vehiculoId: "" } : v)));
    } else if (type === "viaje") {
      setViajes((p) => p.filter((v) => v.id !== id));
    } else if (type === "diagrama") {
      clearDistribucion(id);
    } else if (type === "proyecto") {
      (async () => {
        try { await window.storage.delete(PROJECT_KEY(id), false); } catch {}
        const newList = savedProjects.filter((p) => p.id !== id);
        try { await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false); } catch {}
        setSavedProjects(newList);
        setProjectMsg("Proyecto eliminado.");
      })();
    }
    setPendingDelete(null);
  };

  // ── resolución dimensional y de capacidad ───────────────────────────
  const casesResolved = useMemo(
    () => cases.map((c) => {
      const volUnit = volumenM3(c.largo, c.ancho, c.alto);
      const fitsPerVehicle = vehiculos.map((v) => ({ vehiculoId: v.id, nombre: v.nombre, cabe: cabeDimensionalmente(c, v) }));
      const fitsAnyVehicle = vehiculos.length === 0 ? null : fitsPerVehicle.some((f) => f.cabe);
      return { ...c, volUnit, fitsPerVehicle, fitsAnyVehicle };
    }),
    [cases, vehiculos]
  );
  const caseById = useMemo(() => Object.fromEntries(casesResolved.map((c) => [c.id, c])), [casesResolved]);
  const vehiculoById = useMemo(() => Object.fromEntries(vehiculos.map((v) => [v.id, v])), [vehiculos]);

  const viajesResolved = useMemo(
    () => viajes.map((viaje) => {
      const vehiculo = vehiculoById[viaje.vehiculoId] || null;
      const detalle = viaje.alloc
        .map((a) => {
          const c = caseById[a.caseId];
          if (!c) return null;
          const cantidad = Number(a.cantidad) || 0;
          return {
            caseId: c.id, nombre: c.nombre || "(sin nombre)", cantidad,
            volumen: c.volUnit * cantidad, peso: (Number(c.peso) || 0) * cantidad,
            cabe: vehiculo ? cabeDimensionalmente(c, vehiculo) : null,
          };
        })
        .filter(Boolean);
      const volumenUsado = detalle.reduce((s, d) => s + d.volumen, 0);
      const pesoUsado = detalle.reduce((s, d) => s + d.peso, 0);
      const volumenInterior = vehiculo ? volumenM3(vehiculo.largoInt, vehiculo.anchoInt, vehiculo.altoInt) : null;
      const capacidadEfectiva = vehiculo ? volumenInterior * ((Number(vehiculo.factorEficiencia) || 0) / 100) : null;
      const capacidadCargaEfectiva = vehiculo ? (Number(vehiculo.capacidadCarga) || 0) * (1 - margenSeguridad / 100) : null;
      const pctVolumen = capacidadEfectiva > 0 ? (volumenUsado / capacidadEfectiva) * 100 : null;
      const pctPeso = capacidadCargaEfectiva > 0 ? (pesoUsado / capacidadCargaEfectiva) * 100 : null;
      const sobrecargado = (pctVolumen !== null && pctVolumen > 100) || (pctPeso !== null && pctPeso > 100);
      const algunCaseNoCabe = detalle.some((d) => d.cabe === false);
      return { ...viaje, vehiculo, detalle, volumenUsado, pesoUsado, volumenInterior, capacidadEfectiva, capacidadCargaEfectiva, pctVolumen, pctPeso, sobrecargado, algunCaseNoCabe };
    }),
    [viajes, caseById, vehiculoById, margenSeguridad]
  );

  const casesEnViajeFor = (viaje) => {
    const seen = new Set();
    const list = [];
    viaje.alloc.forEach((a) => {
      if (a.cantidad > 0 && !seen.has(a.caseId) && caseById[a.caseId]) {
        seen.add(a.caseId);
        list.push(caseById[a.caseId]);
      }
    });
    return list;
  };

  const resumen = useMemo(() => {
    const asignados = new Map();
    viajesResolved.forEach((v) => v.detalle.forEach((d) => asignados.set(d.caseId, (asignados.get(d.caseId) || 0) + d.cantidad)));
    const casesSinAsignar = casesResolved.filter((c) => !asignados.get(c.id));
    const totalVolumen = viajesResolved.reduce((s, v) => s + v.volumenUsado, 0);
    const totalPeso = viajesResolved.reduce((s, v) => s + v.pesoUsado, 0);
    const viajesSobrecargados = viajesResolved.filter((v) => v.sobrecargado).length;
    const casesImposibles = casesResolved.filter((c) => c.fitsAnyVehicle === false);
    const vehiculosFactorEstimado = vehiculos.filter((v) => !v.factorEditado).length;
    // Cases donde la suma de "cantidad" asignada en todos los viajes supera
    // la "cantidad disponible" capturada en el catálogo (0 = sin límite
    // definido, no se evalúa). Es una advertencia informativa, no bloquea.
    const casesSobreasignados = casesResolved
      .filter((c) => Number(c.cantidadDisponible) > 0 && (asignados.get(c.id) || 0) > Number(c.cantidadDisponible))
      .map((c) => ({ ...c, totalAsignado: asignados.get(c.id) || 0 }));
    return { casesSinAsignar, totalVolumen, totalPeso, viajesSobrecargados, casesImposibles, vehiculosFactorEstimado, casesSobreasignados };
  }, [viajesResolved, casesResolved, vehiculos]);

  // ── filas para hojas de Excel / PDF ─────────────────────────────────
  const casesSheetRows = () => {
    const rows = [["Nombre", "Largo (m)", "Ancho (m)", "Alto (m)", "Peso (kg)", "Volumen unit. (m³)", "Cantidad disponible", "Cabe en algún vehículo", "Notas"]];
    casesResolved.forEach((c) =>
      rows.push([c.nombre || "(sin nombre)", c.largo, c.ancho, c.alto, c.peso, Number(fmt(c.volUnit, 3)), c.cantidadDisponible || 0, c.fitsAnyVehicle === null ? "-" : c.fitsAnyVehicle ? "SI" : "NO", c.notasLibres || ""])
    );
    return rows;
  };
  const vehiculosSheetRows = () => {
    const rows = [["Nombre", "Largo int. (m)", "Ancho int. (m)", "Alto int. (m)", "Capacidad carga (kg)", "Factor eficiencia %", "Estimado", "Cantidad disponible"]];
    vehiculos.forEach((v) =>
      rows.push([v.nombre || "(sin nombre)", v.largoInt, v.anchoInt, v.altoInt, v.capacidadCarga, v.factorEficiencia, v.factorEditado ? "NO" : "SI", v.cantidadDisponible])
    );
    return rows;
  };
  const viajeSheetRows = (v) => {
    const rows = [["Viaje", v.nombre], ["Vehículo", v.vehiculo?.nombre || "(sin asignar)"], []];
    rows.push(["Case", "Cantidad", "Volumen (m³)", "Peso (kg)", "Cabe dimensionalmente"]);
    v.detalle.forEach((d) => rows.push([d.nombre, d.cantidad, Number(fmt(d.volumen, 3)), Number(fmt(d.peso, 1)), d.cabe === null ? "-" : d.cabe ? "SI" : "NO"]));
    rows.push([]);
    rows.push(["Volumen usado (m³)", Number(fmt(v.volumenUsado, 3))]);
    rows.push(["Capacidad efectiva (m³)", v.capacidadEfectiva === null ? "-" : Number(fmt(v.capacidadEfectiva, 3))]);
    rows.push(["% volumen usado", v.pctVolumen === null ? "-" : Number(fmt(v.pctVolumen, 1))]);
    rows.push(["Peso usado (kg)", Number(fmt(v.pesoUsado, 1))]);
    rows.push(["Capacidad de carga efectiva (kg)", v.capacidadCargaEfectiva === null ? "-" : Number(fmt(v.capacidadCargaEfectiva, 1))]);
    rows.push(["% peso usado", v.pctPeso === null ? "-" : Number(fmt(v.pctPeso, 1))]);
    rows.push(["Sobrecargado", v.sobrecargado ? "SI" : "NO"]);
    return rows;
  };
  const resumenSheetRows = () => {
    const rows = [
      ["Total de viajes", viajes.length],
      ["Volumen total (m³)", Number(fmt(resumen.totalVolumen, 3))],
      ["Peso total (kg)", Number(fmt(resumen.totalPeso, 1))],
      ["Viajes sobrecargados", resumen.viajesSobrecargados],
      ["Cases sin asignar", resumen.casesSinAsignar.length],
      ["Cases que no caben en ningún vehículo", resumen.casesImposibles.length],
      [], ["Cases sin asignar a ningún viaje"],
    ];
    resumen.casesSinAsignar.forEach((c) => rows.push([c.nombre || "(sin nombre)"]));
    rows.push([], ["Cases que no caben dimensionalmente en ningún vehículo del catálogo"]);
    resumen.casesImposibles.forEach((c) => rows.push([c.nombre || "(sin nombre)"]));
    return rows;
  };
  const notasSheetRows = () => [["Notas del proyecto"], [notas || "(sin notas)"]];

  const exportCases = () => xlsxDownload(`${fileBaseName}_cases.xlsx`, casesSheetRows(), "Cases");
  const exportVehiculos = () => xlsxDownload(`${fileBaseName}_vehiculos.xlsx`, vehiculosSheetRows(), "Vehículos");
  const exportResumen = () => xlsxDownload(`${fileBaseName}_resumen.xlsx`, resumenSheetRows(), "Resumen general");
  const exportAll = () => {
    const sheets = [
      { name: "Cases", rows: casesSheetRows() },
      { name: "Vehículos", rows: vehiculosSheetRows() },
      ...viajesResolved.map((v) => ({ name: v.nombre || "Viaje", rows: viajeSheetRows(v) })),
      { name: "Resumen general", rows: resumenSheetRows() },
      { name: "Notas", rows: notasSheetRows() },
    ];
    xlsxDownloadMulti(`${fileBaseName}.xlsx`, sheets);
  };
  const exportJSON = () => {
    jsonDownload(`${fileBaseName}.json`, { app: "lightXtool Cubicaje", exportedAt: new Date().toISOString(), proyectoInfo, cases, vehiculos, viajes, margenSeguridad, notas });
    flash("Respaldo exportado (.json)");
  };
  const triggerImport = () => fileInputRef.current?.click();
  const onImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        setProyectoInfo(s.proyectoInfo || { nombre: "", fecha: "", responsable: "" });
        setCases(s.cases || []);
        setVehiculos(s.vehiculos || []);
        setViajes(sanitizeViajes(s.viajes || []));
        setMargenSeguridad(s.margenSeguridad ?? DEFAULT_MARGEN_SEGURIDAD);
        setNotas(s.notas || "");
        flash("Proyecto importado desde archivo.");
      } catch {
        flash("Archivo inválido, no se pudo importar.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const exportPDF = () => {
    const prevTitle = document.title;
    document.title = fileBaseName;
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 600);
  };

  // ── proyectos guardados ──────────────────────────────────────────────
  const guardarProyectoActual = async () => {
    const name = (saveProjectNameInput || "").trim() || proyectoInfo.nombre || `Proyecto ${savedProjects.length + 1}`;
    const id = genId("proy");
    const snapshot = { id, name, proyectoInfo, cases, vehiculos, viajes, margenSeguridad, notas, theme, savedAt: Date.now() };
    const indexEntry = { id, name, savedAt: snapshot.savedAt, numViajes: viajes.length, volumenTotal: resumen.totalVolumen };
    try {
      await window.storage.set(PROJECT_KEY(id), JSON.stringify(snapshot), false);
      const newList = [...savedProjects, indexEntry];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false);
      setSavedProjects(newList);
      setSaveProjectNameInput("");
      setProjectMsg(`Guardado como "${name}".`);
    } catch {
      setProjectMsg("No se pudo guardar. Intenta de nuevo.");
    }
  };
  const cargarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      setProyectoInfo(s.proyectoInfo || { nombre: "", fecha: "", responsable: "" });
      setCases(s.cases || []);
      setVehiculos(s.vehiculos || []);
      setViajes(sanitizeViajes(s.viajes || []));
      setMargenSeguridad(s.margenSeguridad ?? DEFAULT_MARGEN_SEGURIDAD);
      setNotas(s.notas || "");
      setTheme(s.theme || theme);
      setFileBaseEditado(false);
      setProjectMsg(`Cargado "${s.name}".`);
    } catch {
      setProjectMsg("No se pudo cargar ese proyecto.");
    }
  };
  const duplicarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      const newId = genId("proy");
      const copy = { ...s, id: newId, name: `${s.name} (copia)`, savedAt: Date.now() };
      await window.storage.set(PROJECT_KEY(newId), JSON.stringify(copy), false);
      const original = savedProjects.find((p) => p.id === id);
      const indexEntry = { id: newId, name: copy.name, savedAt: copy.savedAt, numViajes: (copy.viajes || []).length, volumenTotal: original ? original.volumenTotal : 0 };
      const newList = [...savedProjects, indexEntry];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false);
      setSavedProjects(newList);
      setProjectMsg(`Duplicado como "${copy.name}".`);
    } catch {
      setProjectMsg("No se pudo duplicar ese proyecto.");
    }
  };

  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; color: #000 !important; background: #fff !important; padding: 20px; font-family: ${FONT}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-only * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-only table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .print-only th, .print-only td { border: 1px solid #999; padding: 4px 7px; font-size: 11px; text-align: left; }
          .print-only h1 { font-size: 18px; margin: 0 0 4px; }
          .print-only h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
          .print-only p { font-size: 11px; line-height: 1.5; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print" style={{ padding: "16px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Boxes size={18} style={{ color: C.cyan }} />
                <h1 style={{ fontSize: "18px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}, 0 0 28px rgba(0,160,250,.35)`) }}>
                  CUBICAJE DE TRANSPORTE
                </h1>
              </div>
              <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
                Catálogo de Cases → catálogo de vehículos → viajes → volumen/peso y manifiesto de carga.
              </p>
              {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={btnStyle()} title="Cambiar tema (solo afecta esta herramienta)">
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? "Modo claro" : "Modo oscuro"}
              </button>
              <button onClick={() => setShowHelp(true)} style={btnStyle()} title="Cómo funciona la herramienta">
                <HelpCircle size={14} /> Ayuda
              </button>
            </div>
          </div>

          <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

          {/* Advertencias consolidadas */}
          {(resumen.viajesSobrecargados > 0 || resumen.casesImposibles.length > 0 || resumen.casesSobreasignados.length > 0) && (
            <div style={{ ...panelStyle, padding: "10px 12px", border: `1px solid ${C.red}`, background: C.redBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={14} style={{ color: C.red }} />
                <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>Antes de confirmar el transporte, revisa:</span>
              </div>
              <ul style={{ margin: "6px 0 0 22px", padding: 0, fontSize: "11px", color: C.red }}>
                {resumen.viajesSobrecargados > 0 && <li>{resumen.viajesSobrecargados} viaje(s) sobrepasan el 100% de volumen o peso.</li>}
                {resumen.casesImposibles.length > 0 && <li>{resumen.casesImposibles.length} case(s) no caben dimensionalmente en ningún vehículo del catálogo.</li>}
                {resumen.casesSobreasignados.length > 0 && <li>{resumen.casesSobreasignados.length} case(s) tienen más unidades asignadas en viajes que la cantidad disponible capturada en el catálogo.</li>}
              </ul>
            </div>
          )}

          {/* Datos del proyecto */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FileText} title="Datos del documento" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "8px", marginTop: "8px" }}>
              <div>
                <div style={labelStyle}>Nombre del proyecto</div>
                <input style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={proyectoInfo.nombre}
                  onChange={(e) => setProyectoInfo((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej. Montaje Festival XYZ" />
              </div>
              <div>
                <div style={labelStyle}>Fecha</div>
                <input type="date" style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={proyectoInfo.fecha}
                  onChange={(e) => setProyectoInfo((p) => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div>
                <div style={labelStyle}>Responsable</div>
                <input style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={proyectoInfo.responsable}
                  onChange={(e) => setProyectoInfo((p) => ({ ...p, responsable: e.target.value }))} placeholder="Nombre" />
              </div>
              <div>
                <div style={labelStyle}>Margen de seguridad de peso (%)</div>
                <NumberField decimals={0} min={0} max={90} style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={margenSeguridad}
                  onCommit={(n) => setMargenSeguridad(n)} />
                <div style={{ fontSize: "9px", color: C.textFaint, marginTop: "2px" }}>Referencia común: 10%. Reduce la capacidad de carga usada en el cálculo, no es norma legal.</div>
              </div>
            </div>
          </div>

          {/* Guardar / exportar / importar */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Save} title="Guardar, exportar e importar" />
            <div style={{ marginTop: "8px" }}>
              <div style={labelStyle}>Nombre base de archivo (sugerencia, editable)</div>
              <input style={{ ...inputStyle, width: "100%", maxWidth: "360px", marginTop: "4px" }} value={fileBaseName}
                onChange={(e) => { setFileBaseName(e.target.value); setFileBaseEditado(true); }} />
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
              <button style={btnStyle("primary")} onClick={exportAll} disabled={viajes.length === 0} title="Un solo Excel con Cases, vehículos, cada viaje y resumen">
                <FileSpreadsheet size={14} /> Exportar todo (Excel)
              </button>
              <button style={btnStyle()} onClick={exportPDF} title="Abre el diálogo de impresión del navegador — ahí eliges 'Guardar como PDF' (manifiesto de carga)">
                <Printer size={14} /> Exportar manifiesto (PDF)
              </button>
              <button style={btnStyle()} onClick={exportJSON} title="Respaldo completo del proyecto">
                <Download size={14} /> Respaldo (.json)
              </button>
              <button style={btnStyle()} onClick={triggerImport} title="Carga un respaldo .json exportado antes">
                <Upload size={14} /> Importar (.json)
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} style={{ display: "none" }} />
            </div>
            <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
              El PDF depende de que tu navegador permita imprimir desde esta ventana. Si no aparece el diálogo, usa "Exportar todo (Excel)" y desde ahí guarda como PDF.
            </p>
          </div>

          {/* Proyectos guardados */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FolderOpen} title="Proyectos guardados" subtitle={`${savedProjects.length} proyecto(s)`} />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "4px" }}>
              Se guarda solo en tu sesión (no es compartido). El proyecto actual se autoguarda.
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              <input style={{ ...inputStyle, flex: 1, minWidth: "180px" }} value={saveProjectNameInput}
                onChange={(e) => setSaveProjectNameInput(e.target.value)} placeholder="Nombre para guardar el proyecto actual" />
              <button style={btnStyle("primary")} onClick={guardarProyectoActual}><Save size={13} /> Guardar como nuevo</button>
            </div>
            {projectMsg && <p style={{ fontSize: "10px", color: C.cyan, marginTop: "6px" }}>{projectMsg}</p>}
            {savedProjects.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Nombre", "Viajes", "Volumen total", ""].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {savedProjects.map((p) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{p.name}</td>
                        <td style={tdStyle}>{p.numViajes}</td>
                        <td style={tdStyle}>{fmt(p.volumenTotal, 2)} m³</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                            <button onClick={() => cargarProyecto(p.id)} title="Cargar" style={{ background: "none", border: "none", color: C.cyan, cursor: "pointer" }}><FolderOpen size={15} /></button>
                            <button onClick={() => duplicarProyecto(p.id)} title="Duplicar" style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}><Copy size={15} /></button>
                            <button onClick={() => requestDelete("proyecto", p.id, p.name)} title="Eliminar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Catálogo de Cases */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Package} title="Catálogo de Cases" subtitle={`${cases.length} tipo(s)`}
              right={
                <div style={{ display: "flex", gap: "6px" }}>
                  <button style={btnStyle()} onClick={exportCases}><Download size={13} /> Excel</button>
                  <button style={btnStyle("primary")} onClick={addCase}><Plus size={14} /> Agregar Case</button>
                  <button style={btnStyle()} onClick={() => setInvCollapsed((v) => !v)} title={invCollapsed ? "Expandir" : "Colapsar"}>
                    {invCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              }
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Da de alta cada tipo de Case una vez (dimensiones en metros, peso en kg — puedes escribir en
              cm, ej. 25cm, y el campo lo convierte solo). La cantidad real se define después al asignarlo a
              un viaje. El volumen unitario se calcula solo, no es editable. El color/patrón al final de cada
              renglón es el que identifica a ese Case en el diagrama de distribución de todos los viajes.
            </p>

            {!invCollapsed && (
              cases.length === 0 ? (
                <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin Cases. Agrega equipo para empezar.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Nombre", "Largo (m)", "Ancho (m)", "Alto (m)", "Peso (kg)", "Vol. unit. (m³)", "Cant. disponible", "Cabe en algún vehículo", "Notas", "Color / patrón", ""].map((h) => (
                          <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {casesResolved.map((c) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                          <td style={tdStyle}>
                            <input style={{ ...inputStyle, width: "120px" }} value={c.nombre}
                              onChange={(e) => updateCase(c.id, { nombre: e.target.value })} placeholder="Nombre/modelo" />
                          </td>
                          <td style={tdStyle}>
                            <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={c.largo}
                              onCommit={(n) => updateCase(c.id, { largo: n })} title='En metros; puedes escribir "25cm"' />
                          </td>
                          <td style={tdStyle}>
                            <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={c.ancho}
                              onCommit={(n) => updateCase(c.id, { ancho: n })} title='En metros; puedes escribir "25cm"' />
                          </td>
                          <td style={tdStyle}>
                            <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={c.alto}
                              onCommit={(n) => updateCase(c.id, { alto: n })} title='En metros; puedes escribir "25cm"' />
                          </td>
                          <td style={tdStyle}>
                            <NumberField decimals={1} min={0} style={{ ...inputStyle, width: "70px" }} value={c.peso}
                              onCommit={(n) => updateCase(c.id, { peso: n })} />
                          </td>
                          <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700 }}>{fmt(c.volUnit, 3)}</td>
                          <td style={tdStyle}>
                            <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "60px" }} value={c.cantidadDisponible || 0}
                              onCommit={(n) => updateCase(c.id, { cantidadDisponible: n })} />
                            <div style={{ fontSize: "8px", color: C.textFaint, marginTop: "2px" }}>0 = sin límite</div>
                          </td>
                          <td style={tdStyle}>
                            {c.fitsAnyVehicle === null ? (
                              <span style={{ color: C.textFaint }}>sin vehículos</span>
                            ) : c.fitsAnyVehicle ? (
                              <span style={{ color: C.cyan }}>SI</span>
                            ) : (
                              <span title="No cabe dimensionalmente en ningún vehículo del catálogo" style={{ color: C.red, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <AlertTriangle size={12} /> NO
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <input style={{ ...inputStyle, width: "110px" }} value={c.notasLibres || ""}
                              onChange={(e) => updateCase(c.id, { notasLibres: e.target.value })} placeholder="Ej. frágil" />
                          </td>
                          <td style={tdStyle}>
                            <CaseStylePicker caseItem={c} onChange={(patch) => updateCase(c.id, patch)} C={C} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button onClick={() => duplicateCase(c.id)} title="Duplicar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Copy size={14} /></button>
                              <button onClick={() => requestDelete("case", c.id, c.nombre || "este case")} title="Eliminar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Catálogo de vehículos */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Truck} title="Catálogo de vehículos" subtitle={`${vehiculos.length} tipo(s)`}
              right={
                <div style={{ display: "flex", gap: "6px" }}>
                  <button style={btnStyle()} onClick={exportVehiculos}><Download size={13} /> Excel</button>
                  <button style={btnStyle("primary")} onClick={addVehiculo}><Plus size={14} /> Agregar vehículo</button>
                  <button style={btnStyle()} onClick={() => setVehCollapsed((v) => !v)} title={vehCollapsed ? "Expandir" : "Colapsar"}>
                    {vehCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              }
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Sin valores precargados por marca/modelo — captura las dimensiones interiores reales del vehículo que
              vas a usar, en metros (puedes escribir en cm, ej. 25cm, y el campo lo convierte solo). El factor de
              eficiencia (⚠ si sigue en el valor por defecto) es un estimado de referencia de cuánto del volumen
              nominal se aprovecha en la práctica, no una norma técnica.
            </p>
            <button style={{ ...btnStyle(), marginTop: "8px" }} onClick={() => setShowReferencia((v) => !v)}>
              <BookOpen size={13} /> {showReferencia ? "Ocultar" : "Ver"} tabla de referencia de tamaños típicos
            </button>
            {showReferencia && (
              <div style={{ marginTop: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Tipo", "Interior aprox.", "Carga aprox."].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {REFERENCIA_VEHICULOS.map((r) => (
                      <tr key={r.tipo} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                        <td style={tdStyle}>{r.tipo}</td>
                        <td style={{ ...tdStyle, color: C.textDim }}>{r.interior}</td>
                        <td style={{ ...tdStyle, color: C.textDim }}>{r.carga}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
                  Rangos aproximados de mercado (no ficha técnica de un fabricante específico). Confirma siempre
                  contra la ficha real del vehículo que vas a usar antes de capturarlo en el catálogo.
                </p>
              </div>
            )}

            {!vehCollapsed && (
              vehiculos.length === 0 ? (
                <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin vehículos. Agrega al menos uno.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Nombre", "Largo int. (m)", "Ancho int. (m)", "Alto int. (m)", "Vol. interior (m³)", "Capacidad carga (kg)", "Factor efic. %", "Cant. disponible", ""].map((h) => (
                          <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vehiculos.map((v) => {
                        const volInt = volumenM3(v.largoInt, v.anchoInt, v.altoInt);
                        return (
                          <tr key={v.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                            <td style={tdStyle}>
                              <input style={{ ...inputStyle, width: "130px" }} value={v.nombre}
                                onChange={(e) => updateVehiculo(v.id, { nombre: e.target.value })} placeholder="Nombre/alias" />
                            </td>
                            <td style={tdStyle}>
                              <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={v.largoInt}
                                onCommit={(n) => updateVehiculo(v.id, { largoInt: n })} title='En metros; puedes escribir "25cm"' />
                            </td>
                            <td style={tdStyle}>
                              <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={v.anchoInt}
                                onCommit={(n) => updateVehiculo(v.id, { anchoInt: n })} title='En metros; puedes escribir "25cm"' />
                            </td>
                            <td style={tdStyle}>
                              <NumberField decimals={2} min={0} unitConvert style={{ ...inputStyle, width: "68px" }} value={v.altoInt}
                                onCommit={(n) => updateVehiculo(v.id, { altoInt: n })} title='En metros; puedes escribir "25cm"' />
                            </td>
                            <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700 }}>{fmt(volInt, 2)}</td>
                            <td style={tdStyle}>
                              <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "80px" }} value={v.capacidadCarga}
                                onCommit={(n) => updateVehiculo(v.id, { capacidadCarga: n })} />
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <NumberField decimals={0} min={1} max={100} style={{ ...inputStyle, width: "56px", borderColor: !v.factorEditado ? "rgba(255,29,29,.5)" : C.border }}
                                  value={v.factorEficiencia} onCommit={(n) => onFactorChange(v.id, n)} />
                                {!v.factorEditado && <span title="Factor estimado, no confirmado a mano"><AlertTriangle size={13} style={{ color: C.red }} /></span>}
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "56px" }} value={v.cantidadDisponible}
                                onCommit={(n) => updateVehiculo(v.id, { cantidadDisponible: n })} />
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button onClick={() => duplicateVehiculo(v.id)} title="Duplicar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Copy size={14} /></button>
                                <button onClick={() => requestDelete("vehiculo", v.id, v.nombre || "este vehículo")} title="Eliminar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Viajes */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Layers} title="Viajes" subtitle={`${viajes.length} viaje(s)`}
              right={<button style={btnStyle("primary")} onClick={addViaje} disabled={cases.length === 0}><Plus size={14} /> Agregar viaje</button>}
            />
            {cases.length === 0 && <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Da de alta al menos un Case en el catálogo primero.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
              {viajesResolved.map((v) => {
                const casesEnViaje = casesEnViajeFor(v);
                return (
                  <div key={v.id} style={{
                    background: theme === "dark" ? "rgba(255,255,255,.02)" : C.panelAlt,
                    border: `1px solid ${v.sobrecargado || v.algunCaseNoCabe ? C.red : C.border}`,
                    borderRadius: "5px", padding: "10px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button onClick={() => patchViaje(v.id, { colapsado: !v.colapsado })}
                          style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex" }}
                          title={v.colapsado ? "Expandir viaje" : "Colapsar viaje"}>
                          {v.colapsado ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                        <input style={{ ...inputStyle, width: "180px", fontWeight: 700, color: C.cyan }} value={v.nombre}
                          onChange={(e) => patchViaje(v.id, { nombre: e.target.value })} placeholder="Nombre del viaje" />
                        <select style={{ ...selectStyle, width: "160px" }} value={v.vehiculoId}
                          onChange={(e) => patchViaje(v.id, { vehiculoId: e.target.value })}>
                          <option value="">(sin vehículo)</option>
                          {vehiculos.map((veh) => <option key={veh.id} value={veh.id}>{veh.nombre || "(sin nombre)"}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {!v.colapsado && <button style={btnStyle()} onClick={() => addAllocation(v.id)}><Plus size={12} /> Case</button>}
                        <button style={btnStyle("danger")} onClick={() => requestDelete("viaje", v.id, v.nombre || "este viaje")}><Trash2 size={12} /></button>
                      </div>
                    </div>

                    {!v.colapsado && (v.alloc.length === 0 ? (
                      <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "8px" }}>Sin Cases asignados a este viaje.</p>
                    ) : (
                      <div style={{ marginTop: "8px", overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                              {["Case", "Cant.", "Volumen (m³)", "Peso (kg)", "Cabe", ""].map((h) => (
                                <th key={h} style={{ ...thStyle, ...labelStyle, padding: "4px 8px" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {v.alloc.map((a, idx) => {
                              const d = v.detalle[idx];
                              return (
                                <tr key={idx}>
                                  <td style={{ ...tdStyle, padding: "4px 8px" }}>
                                    <select style={{ ...selectStyle, width: "170px" }} value={a.caseId}
                                      onChange={(e) => updateAllocation(v.id, idx, { caseId: e.target.value })}>
                                      {cases.map((c) => <option key={c.id} value={c.id}>{c.nombre || "(sin nombre)"}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ ...tdStyle, padding: "4px 8px" }}>
                                    <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "56px" }} value={a.cantidad}
                                      onCommit={(n) => updateAllocation(v.id, idx, { cantidad: n })} />
                                  </td>
                                  <td style={{ ...tdStyle, padding: "4px 8px" }}>{d ? fmt(d.volumen, 3) : "-"}</td>
                                  <td style={{ ...tdStyle, padding: "4px 8px" }}>{d ? fmt(d.peso, 1) : "-"}</td>
                                  <td style={{ ...tdStyle, padding: "4px 8px" }}>
                                    {!d || d.cabe === null ? "-" : d.cabe ? (
                                      <span style={{ color: C.cyan }}>SI</span>
                                    ) : (
                                      <span style={{ color: C.red, display: "inline-flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={12} /> NO</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "4px 8px" }}>
                                    <button onClick={() => removeAllocation(v.id, idx)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}

                    {/* Distribución interactiva de carga */}
                    {!v.colapsado && v.vehiculo && casesEnViaje.length > 0 && (
                      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${C.panelAlt}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                          <Move size={13} style={{ color: C.cyan }} />
                          <span style={{ fontSize: "10px", color: C.cyan, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700 }}>
                            Distribución interactiva de carga
                          </span>
                        </div>
                        <DistribucionViaje
                          viaje={v} casesEnViaje={casesEnViaje} C={C} btnStyle={btnStyle} labelStyle={labelStyle}
                          onAddPieza={addPieza} onUpdatePieza={updatePieza} onRemovePieza={removePieza}
                          onPopTop={popTopFromStack} onMergeIntoStack={mergeIntoStack}
                          onRequestClearAll={(viajeId, nombre) => requestDelete("diagrama", viajeId, `la distribución de ${nombre || "este viaje"}`)}
                        />
                      </div>
                    )}
                    {!v.colapsado && v.vehiculo && casesEnViaje.length === 0 && (
                      <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "10px" }}>
                        Asigna al menos un Case a este viaje para habilitar la distribución interactiva.
                      </p>
                    )}
                    {!v.colapsado && !v.vehiculo && (
                      <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "10px" }}>
                        Asigna un vehículo a este viaje para habilitar la distribución interactiva.
                      </p>
                    )}

                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${C.panelAlt}`, fontSize: "11px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
                      <span>Volumen: <b style={{ color: C.text }}>{fmt(v.volumenUsado, 3)} m³</b>
                        {v.capacidadEfectiva !== null && <span style={{ color: v.pctVolumen > 100 ? C.red : C.textFaint }}> / {fmt(v.capacidadEfectiva, 3)} m³ ({fmt(v.pctVolumen, 0)}%)</span>}
                      </span>
                      <span>Peso: <b style={{ color: C.text }}>{fmt(v.pesoUsado, 1)} kg</b>
                        {v.capacidadCargaEfectiva !== null && <span style={{ color: v.pctPeso > 100 ? C.red : C.textFaint }}> / {fmt(v.capacidadCargaEfectiva, 1)} kg ({fmt(v.pctPeso, 0)}%)</span>}
                      </span>
                      {v.sobrecargado && <span style={{ color: C.red, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={13} /> viaje sobrecargado</span>}
                      {v.algunCaseNoCabe && <span style={{ color: C.red, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={13} /> hay Case(s) que no caben en este vehículo</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resumen general */}
          <div style={{ ...panelStyle, padding: "12px", border: `1px solid ${C.cyanLight}`, ...glowBox("rgba(0,160,250,.15)") }}>
            <SectionHeader icon={Info} title="Resumen general" subtitle="suma de todos los viajes"
              right={<button style={btnStyle()} onClick={exportResumen}><Download size={13} /> Excel</button>} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px", fontSize: "12px" }}>
              <span>Viajes: <b style={{ color: C.text }}>{viajes.length}</b></span>
              <span>Volumen total: <b style={{ color: C.text }}>{fmt(resumen.totalVolumen, 3)} m³</b></span>
              <span>Peso total: <b style={{ color: C.text }}>{fmt(resumen.totalPeso, 1)} kg</b></span>
              <span>Viajes sobrecargados: <b style={{ color: resumen.viajesSobrecargados > 0 ? C.red : C.text }}>{resumen.viajesSobrecargados}</b></span>
            </div>

            {resumen.casesSinAsignar.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <div style={labelStyle}>Cases sin asignar a ningún viaje ({resumen.casesSinAsignar.length})</div>
                <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
                  {resumen.casesSinAsignar.map((c) => c.nombre || "(sin nombre)").join(" · ")}
                </p>
              </div>
            )}

            {resumen.casesImposibles.length > 0 && (
              <div style={{ marginTop: "10px", padding: "8px 10px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertTriangle size={13} style={{ color: C.red }} />
                  <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>
                    Cases que no caben dimensionalmente en ningún vehículo del catálogo ({resumen.casesImposibles.length})
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: C.red, marginTop: "4px" }}>
                  {resumen.casesImposibles.map((c) => c.nombre || "(sin nombre)").join(" · ")}
                </p>
              </div>
            )}

            {resumen.casesSobreasignados.length > 0 && (
              <div style={{ marginTop: "10px", padding: "8px 10px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertTriangle size={13} style={{ color: C.red }} />
                  <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>
                    Cases asignados por encima de la cantidad disponible ({resumen.casesSobreasignados.length})
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: C.red, marginTop: "4px" }}>
                  {resumen.casesSobreasignados.map((c) => `${c.nombre || "(sin nombre)"} (asignado ${c.totalAsignado} / disponible ${c.cantidadDisponible})`).join(" · ")}
                </p>
              </div>
            )}

            {resumen.vehiculosFactorEstimado > 0 && (
              <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                <AlertTriangle size={12} style={{ color: C.red }} />
                {resumen.vehiculosFactorEstimado} vehículo(s) siguen con el factor de eficiencia por defecto (sin confirmar a mano).
              </p>
            )}
          </div>

          {/* Notas del proyecto */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={StickyNote} title="Notas del proyecto" subtitle="opcional, libre" />
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4}
              placeholder="Notas libres: restricciones de carga, acuerdos con el transportista, pendientes, etc."
              style={{ ...inputStyle, width: "100%", marginTop: "8px", resize: "vertical", fontFamily: FONT }} />
          </div>

          {/* Nota de alcance (fija) */}
          <div style={{ ...panelStyle, padding: "12px", background: C.panelAlt }}>
            <p style={{ fontSize: "10px", color: C.textFaint, lineHeight: 1.6 }}>
              Esta herramienta no resuelve el acomodo físico real (empaquetado 3D) — es una estimación agregada de
              volumen/peso, una verificación dimensional individual por Case, y una distribución interactiva que es
              solo una guía visual de acomodo (piezas sólidas que no se traslapan y respetan el piso del vehículo,
              con apilado por snap opcional; no valida altura real, peso por nivel ni estabilidad de la carga). No
              sugiere automáticamente la combinación óptima de vehículos; la asignación a viajes es manual. No
              verifica límites legales de peso por eje (solo peso bruto total) ni normativa de transporte de carga —
              confírmalo con el proveedor de transporte o la normativa vial aplicable antes de contratar. No
              considera orientación fija ("no acostar") ni el peso real que soporta cada caja debajo de una pila.
            </p>
          </div>

          {/* Simbología */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={BookOpen} title="Simbología y nomenclatura" />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "8px" }}>
              <tbody>
                {SIMBOLOGIA.map(([sym, meaning]) => (
                  <tr key={sym} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                    <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700, width: "140px" }}>{sym}</td>
                    <td style={tdStyle}>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ayuda / instructivo — se abre sola la primera vez, y bajo demanda con el botón "Ayuda" del header */}
      {showHelp && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 998, padding: "16px" }}
          onClick={() => setShowHelp(false)}>
          <div style={{ ...panelStyle, maxWidth: "480px", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "16px", boxShadow: "0 8px 40px rgba(0,0,0,.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
              <h2 style={{ fontSize: "14px", color: C.cyan, letterSpacing: "1.5px", margin: 0, fontWeight: 700, ...glowText(`${C.cyan}`) }}>
                CÓMO FUNCIONA
              </h2>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {[
              { icon: Package, title: "Cases", body: "Da de alta cada tipo de case en el catálogo (dimensiones en metros — puedes escribir en cm, ej. 25cm, y se convierte solo — y peso en kg). El volumen se calcula solo. La cantidad real no vive aquí — se define después, al asignar el case a un viaje. El color/patrón al final del renglón es su identidad visual en el diagrama de distribución." },
              { icon: Truck, title: "Vehículos", body: "Da de alta los vehículos disponibles con sus dimensiones interiores reales y capacidad de carga. El factor de eficiencia (⚠ si no lo confirmas a mano) reduce el volumen nominal a uno realista — no es una norma técnica." },
              { icon: Layers, title: "Viajes", body: "Cada viaje es un vehículo con los Cases que le asignas y su cantidad. La tabla te dice si algún case no cabe dimensionalmente en ese vehículo y qué % de volumen/peso vas usando." },
              { icon: Move, title: "Distribución interactiva", body: "Dentro de un viaje expandido (con vehículo y Cases asignados), arrastra cada case desde la lista hacia el diagrama de piso del vehículo (vista de planta — no se ve la altura ahí). Si sueltas sobre un hueco ocupado, se acomoda solo en el espacio libre más cercano. Suelta un case sobre otro igual o más grande para apilarlo por snap — se ve el contorno de cada caja estibada y \"N× · altura\" junto al nombre. El alto del vehículo se indica arriba del diagrama; una pila que lo excede se marca en rojo con ⚠. Para girar un case o una pila, selecciónalo y usa el botón \"Rotar\". El contador de la paleta se bloquea al llegar a la cantidad asignada en la tabla del viaje. El botón \"Borrar todo y empezar de nuevo\" vacía el diagrama sin tocar las cantidades asignadas." },
              { icon: Printer, title: "Exportar", body: "\"Exportar todo (Excel)\" genera catálogo, vehículos, cada viaje y resumen en un solo archivo. \"Exportar manifiesto (PDF)\" abre el diálogo de impresión del navegador — ahí eliges \"Guardar como PDF\"." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} style={{ display: "flex", gap: "10px", padding: "9px 0", borderTop: `1px solid ${C.panelAlt}` }}>
                <Icon size={16} style={{ color: C.cyan, flexShrink: 0, marginTop: "1px" }} />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: C.text, marginBottom: "2px" }}>{title}</div>
                  <div style={{ fontSize: "11px", color: C.textDim, lineHeight: 1.55 }}>{body}</div>
                </div>
              </div>
            ))}

            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "10px", paddingTop: "9px", borderTop: `1px solid ${C.panelAlt}` }}>
              Puedes volver a abrir esta ayuda cuando quieras con el botón "Ayuda" del encabezado.
            </p>
          </div>
        </div>
      )}

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div className="no-print" style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999,
          background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px",
          display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px", color: C.text }}>¿Eliminar "{pendingDelete.label}"? No se puede deshacer.</span>
          <button onClick={confirmPendingDelete} style={btnStyle("danger")}>Eliminar</button>
          <button onClick={cancelDelete} style={btnStyle()}><X size={13} /> Cancelar</button>
        </div>
      )}

      {/* Vista de impresión (manifiesto de carga) */}
      <div className="print-only">
        <h1>{proyectoInfo.nombre || "Manifiesto de carga"}</h1>
        <p>
          {proyectoInfo.fecha ? `Fecha: ${proyectoInfo.fecha}` : ""}{proyectoInfo.fecha && proyectoInfo.responsable ? " · " : ""}
          {proyectoInfo.responsable ? `Responsable: ${proyectoInfo.responsable}` : ""}
        </p>
        <p>Generado: {new Date().toLocaleString("es")}</p>

        <h2>Cases</h2>
        <table>
          <thead><tr><th>Nombre</th><th>Dimensiones (m)</th><th>Peso (kg)</th><th>Vol. (m³)</th><th>Notas</th></tr></thead>
          <tbody>
            {casesResolved.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre || "(sin nombre)"}</td>
                <td>{fmt(c.largo, 2)} × {fmt(c.ancho, 2)} × {fmt(c.alto, 2)}</td>
                <td>{c.peso}</td>
                <td>{fmt(c.volUnit, 3)}</td>
                <td>{c.notasLibres || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {viajesResolved.map((v) => {
          const casesEnViajeThis = casesEnViajeFor(v);
          const caseByIdThis = Object.fromEntries(casesEnViajeThis.map((c) => [c.id, c]));
          const styleForThis = (caseId) => patternStyle(caseByIdThis[caseId]);
          const piezasV = v.distribucion?.piezas || [];
          const largoV = v.vehiculo ? Number(v.vehiculo.largoInt) || 1 : 0;
          const anchoV = v.vehiculo ? Number(v.vehiculo.anchoInt) || 1 : 0;
          const alturaV = v.vehiculo ? Number(v.vehiculo.altoInt) || 0 : 0;
          const scaleV = v.vehiculo ? Math.max(0.01, Math.min(230 / largoV, 150 / anchoV)) : 0;
          return (
          <div key={v.id}>
            <h2>Viaje: {v.nombre} {v.vehiculo ? `— ${v.vehiculo.nombre}` : "(sin vehículo asignado)"}</h2>
            <table>
              <thead><tr><th>Case</th><th>Cant.</th><th>Volumen (m³)</th><th>Peso (kg)</th><th>Cabe</th></tr></thead>
              <tbody>
                {v.detalle.map((d, i) => (
                  <tr key={i}>
                    <td>{d.nombre}</td><td>{d.cantidad}</td><td>{fmt(d.volumen, 3)}</td><td>{fmt(d.peso, 1)}</td>
                    <td>{d.cabe === null ? "-" : d.cabe ? "SI" : "NO"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Volumen: {fmt(v.volumenUsado, 3)} m³{v.capacidadEfectiva !== null ? ` / ${fmt(v.capacidadEfectiva, 3)} m³ (${fmt(v.pctVolumen, 0)}%)` : ""} ·
              Peso: {fmt(v.pesoUsado, 1)} kg{v.capacidadCargaEfectiva !== null ? ` / ${fmt(v.capacidadCargaEfectiva, 1)} kg (${fmt(v.pctPeso, 0)}%)` : ""}
              {v.sobrecargado ? " · VIAJE SOBRECARGADO" : ""}
            </p>
            {v.vehiculo && piezasV.length > 0 && (
              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "10px", marginBottom: "3px" }}>Planta (vista superior)</div>
                  <VistaPlantaEstatica piezas={piezasV} caseByIdLocal={caseByIdThis} styleFor={styleForThis} largo={largoV} ancho={anchoV} scale={scaleV} C={null} />
                </div>
                <div>
                  <div style={{ fontSize: "10px", marginBottom: "3px" }}>Frente (largo × alto)</div>
                  <VistaElevacion piezas={piezasV} caseByIdLocal={caseByIdThis} styleFor={styleForThis} axis="x" dimHorizontal={largoV} alturaVehiculo={alturaV} scale={scaleV} C={null} forPrint />
                </div>
                <div>
                  <div style={{ fontSize: "10px", marginBottom: "3px" }}>Lateral (ancho × alto)</div>
                  <VistaElevacion piezas={piezasV} caseByIdLocal={caseByIdThis} styleFor={styleForThis} axis="y" dimHorizontal={anchoV} alturaVehiculo={alturaV} scale={scaleV} C={null} forPrint />
                </div>
              </div>
            )}
          </div>
          );
        })}

        <h2>Resumen general</h2>
        <p>
          Viajes: {viajes.length} · Volumen total: {fmt(resumen.totalVolumen, 3)} m³ · Peso total: {fmt(resumen.totalPeso, 1)} kg ·
          Viajes sobrecargados: {resumen.viajesSobrecargados}
        </p>
        {resumen.casesSinAsignar.length > 0 && <p>Cases sin asignar: {resumen.casesSinAsignar.map((c) => c.nombre || "(sin nombre)").join(", ")}</p>}
        {resumen.casesImposibles.length > 0 && <p>Cases que no caben en ningún vehículo: {resumen.casesImposibles.map((c) => c.nombre || "(sin nombre)").join(", ")}</p>}

        {notas && (<><h2>Notas del proyecto</h2><p>{notas}</p></>)}

        <h2>Nota</h2>
        <p>
          Documento preliminar de planeación de carga. No resuelve el acomodo físico real (empaquetado 3D) ni
          verifica límites legales de peso por eje o normativa de transporte — confírmalo con el proveedor de
          transporte antes de contratar.
        </p>

        <h2>Simbología y nomenclatura</h2>
        <table>
          <tbody>
            {SIMBOLOGIA.map(([sym, meaning]) => (<tr key={sym}><td>{sym}</td><td>{meaning}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
