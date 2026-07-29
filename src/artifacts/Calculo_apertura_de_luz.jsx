import React, { useState, useMemo, useEffect, useRef } from "react";
import { Sun, Moon, Save, FolderOpen, Trash2, AlertTriangle, Ruler, Eye, Table2, Info, BookOpen, Layers, RotateCcw } from "lucide-react";

// ── lightXtool identity: paleta dark/light, contraste AA revisado ──────
const PALETTES = {
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", borderStrong: "rgba(0,160,250,0.45)",
    text: "#FFFFFF", textDim: "rgba(255,255,255,0.62)", textFaint: "rgba(255,255,255,0.34)",
    cyan: "#00A0FA", cyanLight: "#40A2FC", red: "#FF1D1D", redBg: "rgba(255,29,29,0.12)",
    beamFill: "rgba(0,160,250,0.14)", beamStroke: "rgba(0,160,250,0.6)",
    floor: "#111111", glow: true,
  },
  light: {
    page: "#F5F5F5", panel: "#FFFFFF", panelAlt: "#F0F0F0",
    border: "rgba(0,160,250,0.3)", borderStrong: "rgba(0,160,250,0.5)",
    text: "#000000", textDim: "#3A3A3A", textFaint: "#6B6B6B",
    cyan: "#026B96", cyanLight: "#00A0FA", red: "#C81414", redBg: "#FFE5E5",
    beamFill: "rgba(0,160,250,0.10)", beamStroke: "rgba(0,160,250,0.55)",
    floor: "#E4E4E4", glow: false,
  },
};

const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
const D2R = Math.PI / 180;
const STORAGE_KEY = "beamThrow:posiciones";
const STANDARD_ANGLES = [10, 20, 30, 40, 50];
const MAX_THROW = 85; // limite del slider para no acercarse a division por cero de cos(theta)

const DEFAULTS = { height: 6, aperture: 25, throwAngle: 0 };
const HEIGHT_RANGE = { min: 1, max: 30 };
const APERTURE_RANGE = { min: 1, max: 90 };
const THROW_RANGE = { min: 0, max: MAX_THROW };
const MIN_EFFECTIVE_HEIGHT = 0.1; // piso de cálculo: nunca se renderiza con altura real 0, aunque se esté tecleando

function fmt(n, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n) || !Number.isFinite(n)) return "-";
  return n.toFixed(d);
}

// ── Cálculo central ──────────────────────────────────────────────────
// Convención: el tiro se inclina siempre hacia un lado fijo (+Y).
// "delantero" = borde con ángulo (θ+α/2), el que va más lejos en la
// dirección del tiro (siempre el borde más adelantado, nunca cambia).
// "trasero"   = borde con ángulo (θ−α/2). Cuando θ < α/2 este valor es
// negativo: el borde trasero cae del OTRO lado del eje vertical del foco
// (caso normal, no un error — a θ=0 ambos bordes son simétricos).
function computeBeam(h, theta, alpha) {
  const halfA = alpha / 2;
  const angTrasero = theta - halfA;
  const angDelantero = theta + halfA;

  const warnDelantero = angDelantero >= 90; // el borde delantero no toca el piso (converge al horizonte)
  const cruzaEje = angTrasero < 0; // el cono se reparte a ambos lados del eje vertical (normal, informativo)

  const Dcentro = h * Math.tan(theta * D2R);
  const Dtrasero = h * Math.tan(angTrasero * D2R);
  const Ddelantero = warnDelantero ? null : h * Math.tan(angDelantero * D2R);

  const distInclinada = h / Math.cos(theta * D2R);
  const ancho = 2 * distInclinada * Math.tan(halfA * D2R);
  const profundidad = warnDelantero ? null : Ddelantero - Dtrasero;

  return { Dcentro, Dtrasero, Ddelantero, ancho, profundidad, warnDelantero, cruzaEje, distInclinada, angDelantero };
}

// Diámetro recto hacia abajo (θ=0), para la tabla comparativa de ángulos estándar
function straightDiameter(h, alpha) {
  return 2 * h * Math.tan((alpha / 2) * D2R);
}

// ── PAR lens reference (VNSP / NSP / MFL / WFL) ─────────────────────
// Fuente: ControlBooth Wiki "PAR" (ANSI/UK codes, ángulo de haz PAR64
// 1000W) y BulbAmerica (rangos por fabricante). No se encontró una
// fuente confiable que defina "WMFL" como designación estándar de
// industria — ver nota en el propio listado.
const PAR_LENSES = [
  { code: "VNSP", name: "Very Narrow Spot", angle: "6°–12°", note: "ANSI FFN (CP60) · PAR64 1000W" },
  { code: "NSP", name: "Narrow Spot", angle: "7°–15°", note: "ANSI FFP (CP61) · PAR64 1000W" },
  { code: "MFL", name: "Medium Flood", angle: "12°–28° (típ. 23°–25°)", note: "ANSI FFR (CP62) · varía por fabricante" },
  { code: "WFL", name: "Wide Flood", angle: "24°–60°", note: "ANSI FFS (CP95) · varía bastante por fabricante" },
];

// ── Campo con slider + texto editable (texto libre mientras se
// escribe: se puede borrar todo, no antepone ceros; los límites solo
// se aplican al salir del campo). Mientras el valor tecleado está
// fuera de rango, el borde se marca en rojo como aviso — no bloquea
// la escritura, solo indica que se ajustará al salir. ──────────────
function SliderNumberField({ label, value, min, max, step = 1, decimals = 0, unit, hint, onCommit, C }) {
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

  const liveNum = Number(text);
  const isValidNum = text !== "" && text !== "-" && text !== "." && !Number.isNaN(liveNum);
  const outOfRange = isValidNum && (liveNum < min || liveNum > max);

  const labelStyle = { fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 };
  const boxStyle = {
    backgroundColor: "transparent",
    border: `1px solid ${outOfRange ? C.red : C.border}`,
    boxShadow: outOfRange ? `0 0 6px rgba(255,29,29,.35)` : "none",
    color: outOfRange ? C.red : C.text,
    fontFamily: FONT, fontSize: "12px", padding: "4px 6px", borderRadius: "3px", outline: "none", width: "70px",
  };

  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
        <input type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : min}
          onChange={(e) => onCommit(Number(e.target.value))} style={{ flex: 1, accentColor: C.cyan }} />
        <input
          type="text" inputMode="decimal" value={text} style={boxStyle}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => {
            const raw = e.target.value;
            if (!/^-?\d*\.?\d*$/.test(raw)) return; // solo permite formar un número válido
            setText(raw);
            if (raw !== "" && raw !== "-" && raw !== "." && !Number.isNaN(Number(raw))) onCommit(Number(raw));
          }}
          onBlur={() => {
            focused.current = false;
            let n = Number(text);
            if (text === "" || text === "-" || text === "." || Number.isNaN(n)) n = value;
            n = Math.max(min, Math.min(max, n));
            setText(format(n));
            onCommit(n);
          }}
        />
        {unit && <span style={{ fontSize: "11px", color: C.textFaint }}>{unit}</span>}
      </div>
      {outOfRange && (
        <div style={{ fontSize: "9px", color: C.red, marginTop: "3px" }}>
          fuera de rango ({min}–{max}) · se ajusta al salir del campo
        </div>
      )}
      {!outOfRange && hint && <div style={{ fontSize: "9px", color: C.textFaint, marginTop: "3px" }}>{hint}</div>}
    </div>
  );
}

export default function BeamThrowCalculator() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  const [height, setHeight] = useState(DEFAULTS.height);
  const [aperture, setAperture] = useState(DEFAULTS.aperture);
  const [throwAngle, setThrowAngle] = useState(DEFAULTS.throwAngle);
  const [view, setView] = useState("frontal"); // frontal | superior | ambas

  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  // Altura "de cálculo": nunca baja de MIN_EFFECTIVE_HEIGHT, incluso si el
  // usuario está tecleando momentáneamente 0 o un valor vacío/negativo
  // antes de salir del campo. El campo en sí (height) no se toca, para no
  // interrumpir la escritura libre.
  const effHeight = Math.max(MIN_EFFECTIVE_HEIGHT, Number.isFinite(height) ? height : MIN_EFFECTIVE_HEIGHT);

  const beam = useMemo(() => computeBeam(effHeight, throwAngle, aperture), [effHeight, throwAngle, aperture]);

  const tableRows = useMemo(
    () => STANDARD_ANGLES.map((a) => ({ a, d: straightDiameter(effHeight, a) })),
    [effHeight]
  );

  const resetDefaults = () => {
    setHeight(DEFAULTS.height); setAperture(DEFAULTS.aperture); setThrowAngle(DEFAULTS.throwAngle);
    flash("✓ valores restablecidos");
  };

  // ── posiciones guardadas ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        setSaved(res ? JSON.parse(res.value) : []);
      } catch {
        setSaved([]);
      }
    })();
  }, []);

  const savePosition = async () => {
    const name = (saveName || "").trim() || `Posición ${saved.length + 1}`;
    const entry = { id: `pos-${Date.now()}`, name, height, aperture, throwAngle, savedAt: Date.now() };
    const next = [...saved, entry];
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSaved(next);
      setSaveName("");
      flash(`✓ guardada "${name}"`);
    } catch {
      flash("× no se pudo guardar");
    }
  };
  const loadPosition = (p) => {
    setHeight(p.height); setAperture(p.aperture); setThrowAngle(p.throwAngle);
    flash(`Cargada "${p.name}"`);
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const next = saved.filter((s) => s.id !== pendingDelete.id);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSaved(next);
    } catch {}
    setPendingDelete(null);
  };

  // ── estilos derivados ─────────────────────────────────────
  const panelStyle = { backgroundColor: C.panel, border: `1px solid ${C.border}`, borderRadius: "8px" };
  const labelStyle = { fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 };
  const glowText = (color) => (C.glow ? { textShadow: `0 0 10px ${color}` } : {});
  const glowBox = (rgba) => (C.glow ? { boxShadow: `0 0 10px ${rgba}` } : {});
  const inputStyle = {
    backgroundColor: theme === "dark" ? "#050505" : "#FAFAFA",
    border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT, fontSize: "12px",
    padding: "6px 8px", borderRadius: "3px", outline: "none",
  };
  function btnStyle(variant = "default") {
    const base = { fontFamily: FONT, fontSize: "11px", padding: "6px 12px", borderRadius: "3px", cursor: "pointer", letterSpacing: ".4px", display: "inline-flex", alignItems: "center", gap: "6px" };
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

  const isDefault = height === DEFAULTS.height && aperture === DEFAULTS.aperture && throwAngle === DEFAULTS.throwAngle;

  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT, padding: "16px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h1 style={{ fontSize: "17px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}, 0 0 28px rgba(0,160,250,.35)`) }}>
              ⬡ APERTURA Y TIRO DE LUZ
            </h1>
            <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
              Diámetro del haz + simulación 2D de la huella en el piso (vista frontal / superior).
            </p>
            {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
          </div>
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={btnStyle()} title="Cambiar tema claro/oscuro">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
        </div>

        <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

        {/* Controles */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Ruler} title="Controles"
            right={
              <button style={btnStyle()} onClick={resetDefaults} disabled={isDefault} title="Restablecer altura, apertura y tiro a sus valores por defecto"
                aria-disabled={isDefault}>
                <RotateCcw size={13} /> Restablecer valores
              </button>
            } />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "16px", marginTop: "12px" }}>
            <SliderNumberField C={C} label="Altura (m)" value={height} min={HEIGHT_RANGE.min} max={HEIGHT_RANGE.max} step={0.1} decimals={1} unit="m" onCommit={setHeight} />
            <SliderNumberField C={C} label="Ángulo de apertura (°)" value={aperture} min={APERTURE_RANGE.min} max={APERTURE_RANGE.max} step={1} decimals={0} unit="°" onCommit={setAperture} />
            <SliderNumberField C={C} label="Ángulo de tiro (° desde la vertical)" value={throwAngle} min={THROW_RANGE.min} max={THROW_RANGE.max} step={1} decimals={0} unit="°"
              hint={`0° = cenital (recto hacia abajo) · límite ${MAX_THROW}°`} onCommit={setThrowAngle} />
          </div>

          {/* Selector de vista */}
          <div style={{ display: "flex", gap: "6px", marginTop: "14px", flexWrap: "wrap" }}>
            <span style={{ ...labelStyle, alignSelf: "center", marginRight: "4px" }}>Vista</span>
            <button style={btnStyle(view === "frontal" ? "active" : "default")} onClick={() => setView("frontal")}><Eye size={13} /> Frontal (Z–Y)</button>
            <button style={btnStyle(view === "superior" ? "active" : "default")} onClick={() => setView("superior")}><Eye size={13} /> Superior (X–Y)</button>
            <button style={btnStyle(view === "ambas" ? "active" : "default")} onClick={() => setView("ambas")}><Layers size={13} /> Ambas a la vez</button>
          </div>
        </div>

        {/* Advertencias / notas informativas */}
        {beam.warnDelantero && (
          <div style={{ ...panelStyle, padding: "10px 12px", border: `1px solid ${C.red}`, background: C.redBg }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={14} style={{ color: C.red }} />
              <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>
                θ + α/2 = {fmt(beam.angDelantero, 0)}° ≥ 90° — el borde delantero del haz no toca el piso en un punto finito (converge al horizonte). Se muestra como rayo abierto.
              </span>
            </div>
          </div>
        )}
        {/* Visualización */}
        {view !== "ambas" ? (
          <div style={{ ...panelStyle, padding: "14px" }}>
            <SectionHeader icon={Eye} title={view === "frontal" ? "Vista frontal (perfil, plano Z–Y)" : "Vista superior (huella en el piso, plano X–Y)"} />
            <div style={{ marginTop: "10px" }}>
              {view === "frontal"
                ? <FrontView C={C} height={effHeight} beam={beam} throwAngle={throwAngle} aperture={aperture} compact={false} />
                : <TopView C={C} height={effHeight} beam={beam} compact={false} />
              }
            </div>
            <BeamStats C={C} beam={beam} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: "16px" }}>
            <div style={{ ...panelStyle, padding: "14px" }}>
              <SectionHeader icon={Eye} title="Frontal (Z–Y)" />
              <div style={{ marginTop: "10px" }}>
                <FrontView C={C} height={effHeight} beam={beam} throwAngle={throwAngle} aperture={aperture} compact={true} />
              </div>
            </div>
            <div style={{ ...panelStyle, padding: "14px" }}>
              <SectionHeader icon={Eye} title="Superior (X–Y)" />
              <div style={{ marginTop: "10px" }}>
                <TopView C={C} height={effHeight} beam={beam} compact={true} />
              </div>
            </div>
            <div style={{ ...panelStyle, padding: "14px", gridColumn: "1 / -1" }}>
              <BeamStats C={C} beam={beam} />
            </div>
          </div>
        )}

        {!beam.warnDelantero && beam.cruzaEje && (
          <div style={{ ...panelStyle, padding: "10px 12px", border: `1px solid ${C.border}`, background: theme === "dark" ? "rgba(0,160,250,.06)" : "#E5F5FF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Info size={14} style={{ color: C.cyan }} />
              <span style={{ fontSize: "11px", color: C.cyan }}>
                El ángulo de tiro es menor que la mitad de la apertura — el cono se reparte a ambos lados del eje vertical del foco (a θ=0° es el caso simétrico normal). Por eso el borde trasero puede quedar en el lado opuesto al del tiro.
              </span>
            </div>
          </div>
        )}

        {/* Tabla comparativa de ángulos estándar (recto hacia abajo, referencia) */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Table2} title="Tabla comparativa — ángulos estándar" subtitle="recto hacia abajo (θ=0°), referencia de fabricante" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginTop: "10px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Apertura</th>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Diámetro a {fmt(effHeight, 1)} m</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.a} style={{ borderBottom: `1px solid ${C.panelAlt}`, background: r.a === aperture ? (theme === "dark" ? "rgba(0,160,250,.08)" : "#E5F5FF") : "transparent" }}>
                  <td style={{ padding: "6px 10px", color: r.a === aperture ? C.cyan : C.text, fontWeight: r.a === aperture ? 700 : 500 }}>{r.a}°</td>
                  <td style={{ padding: "6px 10px", color: C.textDim }}>{fmt(r.d)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Guardar posición */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Save} title="Guardar posición" subtitle={`${saved.length} guardada(s)`} />
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            <input style={{ ...inputStyle, flex: 1, minWidth: "180px" }} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nombre de la posición" />
            <button style={btnStyle("primary")} onClick={savePosition}><Save size={13} /> Guardar</button>
          </div>
          {saved.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {saved.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: theme === "dark" ? "rgba(255,255,255,.03)" : C.panelAlt, borderRadius: "4px", padding: "7px 10px", flexWrap: "wrap", fontSize: "11px" }}>
                  <span style={{ flex: 1, minWidth: "100px", fontWeight: 700 }}>{p.name}</span>
                  <span style={{ color: C.textFaint }}>h={fmt(p.height, 1)}m · α={p.aperture}° · θ={p.throwAngle}°</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button style={btnStyle()} onClick={() => loadPosition(p)}><FolderOpen size={12} /> usar</button>
                    <button style={btnStyle("danger")} onClick={() => setPendingDelete(p)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Glosario de símbolos y fórmulas */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={BookOpen} title="Símbolos y fórmulas" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "10px" }}>
            <tbody>
              {[
                ["h", "Altura del foco sobre el piso (m)."],
                ["θ", "Ángulo de tiro medido desde la vertical (°). 0° = cenital, recto hacia abajo."],
                ["α", "Ángulo de apertura total del haz (°)."],
                ["α/2", "Semiángulo de apertura."],
                ["D_centro", "D_centro = h · tan(θ) — distancia del punto bajo el foco al centro del haz en el piso."],
                ["D_trasero", "D_trasero = h · tan(θ − α/2) — borde con ángulo menor; puede caer del lado opuesto al tiro si θ < α/2."],
                ["D_delantero", "D_delantero = h · tan(θ + α/2) — borde más adelantado en la dirección del tiro."],
                ["distancia inclinada", "h / cos(θ) — distancia real del foco al centro del haz en el piso."],
                ["Ancho", "2 × (h / cos θ) × tan(α/2) — ancho de la huella (eje X)."],
                ["Profundidad", "D_delantero − D_trasero — extensión de la huella a lo largo del tiro (eje Y); es la cota mostrada en el piso."],
              ].map(([sym, meaning]) => (
                <tr key={sym} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                  <td style={{ padding: "6px 10px", color: C.cyan, fontWeight: 700, width: "150px", verticalAlign: "top" }}>{sym}</td>
                  <td style={{ padding: "6px 10px", color: C.textDim }}>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lentes PAR de referencia */}
        <div style={{ ...panelStyle, padding: "14px" }}>
          <SectionHeader icon={Table2} title="Lentes PAR — ángulo de haz de referencia" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "10px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Código</th>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Nombre</th>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Ángulo de haz (aprox.)</th>
                <th style={{ ...labelStyle, textAlign: "left", padding: "6px 10px" }}>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {PAR_LENSES.map((l) => (
                <tr key={l.code} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                  <td style={{ padding: "6px 10px", color: C.cyan, fontWeight: 700 }}>{l.code}</td>
                  <td style={{ padding: "6px 10px", color: C.text }}>{l.name}</td>
                  <td style={{ padding: "6px 10px", color: C.textDim }}>{l.angle}</td>
                  <td style={{ padding: "6px 10px", color: C.textFaint }}>{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "8px", lineHeight: 1.6 }}>
            Nota: pediste incluir también <b>WMFL</b>. No encontré una fuente confiable que la defina como
            designación estándar de industria (los 4 juegos de lentes intercambiables más documentados, ej.
            ETC Source Four PAR, son VNSP/NSP/MFL/WFL). Es posible que "WMFL" sea nomenclatura propia de un
            fabricante específico de PAR LED — si me dices marca/modelo lo confirmo con esa fuente antes de
            agregarlo.
          </p>
        </div>

        {/* Nota de alcance */}
        <div style={{ ...panelStyle, padding: "12px", background: C.panelAlt }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Info size={13} style={{ color: C.textFaint, flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "10px", color: C.textFaint, lineHeight: 1.6, margin: 0 }}>
              Aproximación práctica de planeación de piso (elipse aproximada), no cálculo exacto de sección
              cónica. No calcula iluminancia (lux) — requeriría datos fotométricos del fixture. El tiro
              siempre se inclina hacia un lado fijo del lienzo (sin rotación libre de 360°). La altura de
              cálculo nunca baja de {MIN_EFFECTIVE_HEIGHT} m aunque el campo se esté editando momentáneamente.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999, background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px" }}>¿Eliminar "{pendingDelete.name}"? No se puede deshacer.</span>
          <button onClick={confirmDelete} style={btnStyle("danger")}>Eliminar</button>
          <button onClick={() => setPendingDelete(null)} style={btnStyle()}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function BeamStats({ C, beam }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "12px", fontSize: "11px" }}>
      <span>D. centro: <b style={{ color: C.cyan }}>{fmt(beam.Dcentro)} m</b></span>
      <span>D. trasero: <b style={{ color: C.cyan }}>{fmt(beam.Dtrasero)} m</b></span>
      <span>D. delantero: <b style={{ color: C.cyan }}>{beam.warnDelantero ? "∞ (no toca el piso)" : `${fmt(beam.Ddelantero)} m`}</b></span>
      <span>Ancho huella: <b style={{ color: C.cyan }}>{fmt(beam.ancho)} m</b></span>
      <span>Profundidad huella: <b style={{ color: C.cyan }}>{beam.profundidad === null ? "—" : `${fmt(beam.profundidad)} m`}</b></span>
    </div>
  );
}

// ── Vista frontal: perfil Z (altura) – Y (profundidad), foco arriba,
// cono/triángulo inclinado según el ángulo de tiro. A θ=0° el cono es
// simétrico bajo el foco (caso base, sin advertencias). `compact`
// reduce el texto por punto (modo "ambas vistas", panel angosto) pero
// conserva la cota principal en tamaño legible. ──────────────────────
function FrontView({ C, height, beam, throwAngle, aperture, compact }) {
  const W = 560, H = 340;
  const padSide = 40, padTop = 40, padBottom = 64; // padBottom reservado para etiquetas + cota bajo el piso
  const floorY = H - padBottom;
  const focusX = W / 2, focusY = padTop;

  // rango Y a graficar: cubrir trasero/centro/delantero con margen,
  // manteniendo la proporción del cono (se ajusta la escala, no la forma)
  const visibleFar = beam.warnDelantero ? Math.abs(beam.Dtrasero) + height * 2.2 : beam.Ddelantero;
  const candidates = [beam.Dtrasero, beam.Dcentro, visibleFar];
  const maxAbsY = Math.max(...candidates.map((v) => Math.abs(v ?? 0)), height * 0.5) * 1.2;
  const scaleX = (W / 2 - padSide) / (maxAbsY || 1);
  const scaleY = (floorY - focusY) / (height || 1);

  const toX = (y) => focusX + y * scaleX;

  const traseroX = toX(beam.Dtrasero);
  const centroX = toX(beam.Dcentro);
  const delanteroX = beam.warnDelantero ? W - padSide : toX(beam.Ddelantero);

  const pointFont = compact ? 8 : 9;
  const cotaFont = compact ? 10 : 10.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* piso */}
      <line x1={0} y1={floorY} x2={W} y2={floorY} stroke={C.borderStrong} strokeWidth="2" />
      <text x={W - padSide} y={floorY + 16} fontSize="9" fill={C.textFaint} fontFamily={FONT} textAnchor="end">piso</text>

      {/* eje vertical bajo el foco (referencia 0) */}
      <line x1={focusX} y1={focusY} x2={focusX} y2={floorY} stroke={C.border} strokeDasharray="3,4" strokeWidth="1" />

      {/* cono de luz: siempre visible, incluso en θ=0 (caso simétrico) */}
      {!beam.warnDelantero ? (
        <polygon points={`${focusX},${focusY} ${traseroX},${floorY} ${delanteroX},${floorY}`} fill={C.beamFill} stroke={C.beamStroke} strokeWidth="1.5" />
      ) : (
        <>
          {/* lado trasero + linea central, ambos cierran en el piso */}
          <polygon points={`${focusX},${focusY} ${traseroX},${floorY} ${centroX},${floorY}`} fill={C.beamFill} stroke={C.beamStroke} strokeWidth="1.5" />
          {/* rayo delantero: no toca el piso, sale como rayo abierto hacia el horizonte */}
          <line x1={focusX} y1={focusY} x2={delanteroX} y2={focusY + 4} stroke={C.beamStroke} strokeWidth="1.5" strokeDasharray="5,4" />
          <polygon points={`${delanteroX - 8},${focusY - 3} ${delanteroX},${focusY + 4} ${delanteroX - 8},${focusY + 11}`} fill={C.beamStroke} />
          <text x={delanteroX - 12} y={focusY - 8} fontSize="10" fill={C.red} fontFamily={FONT} textAnchor="end">∞</text>
        </>
      )}

      {/* linea central del haz */}
      <line x1={focusX} y1={focusY} x2={centroX} y2={floorY} stroke={C.cyan} strokeWidth="1.5" />

      {/* foco */}
      <circle cx={focusX} cy={focusY} r="6" fill={C.cyan} />
      {!compact && <text x={focusX} y={focusY - 10} fontSize="9" fill={C.cyan} fontFamily={FONT} textAnchor="middle">foco</text>}

      {/* regla Z (altura) */}
      <line x1={padSide - 16} y1={focusY} x2={padSide - 16} y2={floorY} stroke={C.textFaint} strokeWidth="1" />
      <text x={padSide - 22} y={(focusY + floorY) / 2} fontSize="9" fill={C.textFaint} fontFamily={FONT} textAnchor="end" transform={`rotate(-90 ${padSide - 22} ${(focusY + floorY) / 2})`}>
        Z: {fmt(height, 1)} m
      </text>

      {/* puntos de referencia en el piso: en modo compacto solo el punto,
          sin la etiqueta larga por punto, para no saturar el panel angosto */}
      <circle cx={traseroX} cy={floorY} r={compact ? 2.5 : 3} fill={C.cyanLight} />
      {!compact && <text x={traseroX} y={floorY + 28} fontSize={pointFont} fill={C.textDim} fontFamily={FONT} textAnchor="middle">trasero {fmt(beam.Dtrasero)}m</text>}

      <circle cx={centroX} cy={floorY} r={compact ? 3.5 : 3} fill={C.cyan} />
      {!compact && <text x={centroX} y={floorY + 16} fontSize={pointFont} fill={C.cyan} fontFamily={FONT} textAnchor="middle">centro {fmt(beam.Dcentro)}m</text>}

      {!beam.warnDelantero && (
        <>
          <circle cx={delanteroX} cy={floorY} r={compact ? 2.5 : 3} fill={C.cyanLight} />
          {!compact && <text x={delanteroX} y={floorY + 28} fontSize={pointFont} fill={C.textDim} fontFamily={FONT} textAnchor="middle">delantero {fmt(beam.Ddelantero)}m</text>}
        </>
      )}

      {/* cota de la huella (profundidad) en el piso — siempre visible y en
          tamaño legible, incluso en modo compacto */}
      {!beam.warnDelantero && (
        <g>
          <line x1={traseroX} y1={floorY + 40} x2={delanteroX} y2={floorY + 40} stroke={C.cyan} strokeWidth="1" />
          <line x1={traseroX} y1={floorY + 35} x2={traseroX} y2={floorY + 45} stroke={C.cyan} strokeWidth="1" />
          <line x1={delanteroX} y1={floorY + 35} x2={delanteroX} y2={floorY + 45} stroke={C.cyan} strokeWidth="1" />
          <text x={(traseroX + delanteroX) / 2} y={floorY + 53} fontSize={cotaFont} fontWeight="bold" fill={C.cyan} fontFamily={FONT} textAnchor="middle">
            {fmt(beam.profundidad)} m
          </text>
        </g>
      )}

      <text x={padSide} y={16} fontSize="9" fill={C.textFaint} fontFamily={FONT}>θ={throwAngle}° · α={aperture}°</text>
    </svg>
  );
}

// ── Vista superior: huella elíptica aproximada en el piso (plano X–Y).
// Escala calculada como PRESUPUESTO DE RADIO (no de diámetro) en ambos
// ejes, reservando espacio fijo en píxeles para las cotas de ancho y
// profundidad — evita que la elipse o las etiquetas se salgan del
// lienzo en huellas muy anchas o muy alargadas. ─────────────────────
function TopView({ C, height, beam, compact }) {
  const W = 560, H = 340;
  const padSide = 40;
  const cx = padSide + 60;

  const cotaFont = compact ? 9.5 : 9.5;

  if (beam.warnDelantero) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <circle cx={cx} cy={40} r="5" fill={C.cyan} />
        <text x={cx} y={30} fontSize="9" fill={C.cyan} fontFamily={FONT} textAnchor="middle">foco</text>
        <text x={W / 2} y={H / 2} fontSize="11" fill={C.red} fontFamily={FONT} textAnchor="middle">
          Huella no representable a este ángulo — el borde delantero no toca el piso.
        </text>
      </svg>
    );
  }

  // espacio reservado (en px) para que las cotas y sus textos siempre quepan
  const topCotaSpace = 34;    // cota de ancho (X), arriba de la elipse
  const bottomCotaSpace = 46; // cota de profundidad (Y), abajo de la elipse
  const rightMargin = 20;

  const plotTop = 40 + topCotaSpace;
  const plotBottom = H - 24 - bottomCotaSpace;
  const ellipseCy = (plotTop + plotBottom) / 2;
  const vertBudget = (plotBottom - plotTop) / 2;       // espacio disponible arriba/abajo del centro
  const rightBudget = W - cx - padSide - rightMargin;  // espacio disponible a la derecha del foco
  const leftBudget = cx - padSide;                     // espacio disponible a la izquierda del foco

  const centerYm = beam.Dcentro; // siempre ≥ 0 (θ ∈ [0°, 85°])
  const halfDepth = beam.profundidad / 2;
  const halfWidth = beam.ancho / 2;

  // Escala por eje: cada dirección (derecha, izquierda, arriba/abajo) se
  // compara contra SU PROPIO presupuesto de espacio, no contra el menor de
  // todos — así se usa el ancho real del panel en vez de recortar la
  // elipse al presupuesto vertical (que suele ser el más chico).
  const rightExtent = centerYm + halfDepth;                // borde delantero, a la derecha del foco
  const leftExtent = Math.max(0, halfDepth - centerYm);    // si el cono cruza el eje, cuánto asoma a la izquierda
  const scaleRight = rightExtent > 0 ? rightBudget / rightExtent : Infinity;
  const scaleLeft = leftExtent > 0 ? leftBudget / leftExtent : Infinity;
  const scaleVert = halfWidth > 0 ? vertBudget / halfWidth : Infinity;
  const scale = Math.min(scaleRight, scaleLeft, scaleVert);

  const ellipseCx = cx + centerYm * scale;
  const rx = Math.max(halfDepth * scale, 1);
  const ry = Math.max(halfWidth * scale, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* eje Y (profundidad) desde el foco */}
      <line x1={cx} y1={ellipseCy} x2={W - padSide} y2={ellipseCy} stroke={C.border} strokeDasharray="3,4" strokeWidth="1" />
      {/* eje X (ancho) en el centro de la huella */}
      <line x1={ellipseCx} y1={plotTop} x2={ellipseCx} y2={plotBottom} stroke={C.border} strokeDasharray="3,4" strokeWidth="1" />

      {/* huella elíptica */}
      <ellipse cx={ellipseCx} cy={ellipseCy} rx={rx} ry={ry} fill={C.beamFill} stroke={C.beamStroke} strokeWidth="1.5" />

      {/* foco (proyectado en el origen del eje Y) */}
      <circle cx={cx} cy={ellipseCy} r="5" fill={C.cyan} />
      {!compact && <text x={cx} y={ellipseCy - 12} fontSize="9" fill={C.cyan} fontFamily={FONT} textAnchor="middle">foco (proyección)</text>}

      {/* cota de ancho (X), arriba de la elipse, dentro del margen reservado */}
      <g>
        <line x1={ellipseCx - ry} y1={plotTop - 2} x2={ellipseCx + ry} y2={plotTop - 2} stroke={C.cyan} strokeWidth="1" />
        <line x1={ellipseCx - ry} y1={plotTop - 6} x2={ellipseCx - ry} y2={plotTop + 2} stroke={C.cyan} strokeWidth="1" />
        <line x1={ellipseCx + ry} y1={plotTop - 6} x2={ellipseCx + ry} y2={plotTop + 2} stroke={C.cyan} strokeWidth="1" />
        <text x={ellipseCx} y={plotTop - 10} fontSize={cotaFont} fontWeight="bold" fill={C.cyan} fontFamily={FONT} textAnchor="middle">
          X: {fmt(beam.ancho)} m
        </text>
      </g>

      {/* cota de profundidad (Y), del foco al final de la huella, dentro del margen reservado */}
      <g>
        <line x1={cx} y1={plotBottom + 18} x2={ellipseCx + rx} y2={plotBottom + 18} stroke={C.cyan} strokeWidth="1" />
        <line x1={cx} y1={plotBottom + 13} x2={cx} y2={plotBottom + 23} stroke={C.cyan} strokeWidth="1" />
        <line x1={ellipseCx + rx} y1={plotBottom + 13} x2={ellipseCx + rx} y2={plotBottom + 23} stroke={C.cyan} strokeWidth="1" />
        <text x={(cx + ellipseCx + rx) / 2} y={plotBottom + 34} fontSize={cotaFont} fontWeight="bold" fill={C.cyan} fontFamily={FONT} textAnchor="middle">
          Y: {fmt(beam.profundidad)} m {!compact && `(centro ${fmt(beam.Dcentro)}m)`}
        </text>
      </g>
    </svg>
  );
}
