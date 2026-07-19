import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  Plus,
  Trash2,
  Ruler,
  ArrowDown,
  Info,
  Scale,
  Sun,
  Moon,
  Copy,
  Save,
  FolderOpen,
  Files,
  Diamond,
} from "lucide-react";

// ---------- helpers ----------
let idCounter = 1;
const nextId = (prefix) => `${prefix}-${idCounter++}`;
const STORAGE_PREFIX = "trussProject";

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function roundTo(v, step) {
  return Math.round(v / step) * step;
}

// A controlled number <input> that behaves like a normal text field while
// typing (you CAN clear it completely, type "-", etc.) instead of snapping
// back to a min/fallback on every keystroke. The numeric value only commits
// upstream once it parses to a real number; on blur, if left empty/invalid,
// it reverts to display the last committed value.
function NumberField({ value, onCommit, decimals = 3, ...rest }) {
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

  return (
    <input
      type="number"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw !== "" && raw !== "-" && !Number.isNaN(Number(raw))) {
          onCommit(Number(raw));
        }
      }}
      onBlur={() => {
        focused.current = false;
        const n = Number(text);
        if (text === "" || text === "-" || Number.isNaN(n)) {
          setText(format(value));
        } else {
          onCommit(n);
        }
      }}
      {...rest}
    />
  );
}

// Case A: no loads -> tributary-length (symmetric) distribution based on
// support geometry only. Each support carries the half-span to each of its
// neighbours (clipped to the beam ends).
function computeTributary(sortedSupports, length) {
  return sortedSupports.map((s, i) => {
    const prevBound =
      i === 0 ? -length / 2 : (sortedSupports[i - 1].pos + s.pos) / 2;
    const nextBound =
      i === sortedSupports.length - 1
        ? length / 2
        : (s.pos + sortedSupports[i + 1].pos) / 2;
    const span = Math.max(0, nextBound - prevBound);
    return { ...s, share: length > 0 ? span / length : 0 };
  });
}

// Case B: loads present -> static equilibrium (sum forces = 0, sum moments = 0).
// 2 supports: exact lever-rule solution.
// 3+ supports (statically indeterminate): each load is split by the lever
// rule between the two nearest bracketing supports (proximity approximation).
function computeReactions(sortedSupports, loads) {
  const reactions = sortedSupports.map((s) => ({ ...s, load: 0 }));
  if (reactions.length === 0) return reactions;

  loads.forEach((load) => {
    if (reactions.length === 1) {
      reactions[0].load += load.weight;
      return;
    }
    let leftIdx = -1;
    let rightIdx = -1;
    for (let i = 0; i < sortedSupports.length; i++) {
      if (sortedSupports[i].pos <= load.pos) leftIdx = i;
    }
    for (let i = sortedSupports.length - 1; i >= 0; i--) {
      if (sortedSupports[i].pos >= load.pos) rightIdx = i;
    }
    if (leftIdx === -1) {
      reactions[0].load += load.weight;
    } else if (rightIdx === -1) {
      reactions[reactions.length - 1].load += load.weight;
    } else if (leftIdx === rightIdx) {
      reactions[leftIdx].load += load.weight;
    } else {
      const L = sortedSupports[leftIdx].pos;
      const R = sortedSupports[rightIdx].pos;
      const span = R - L;
      const wLeft = (load.weight * (R - load.pos)) / span;
      const wRight = (load.weight * (load.pos - L)) / span;
      reactions[leftIdx].load += wLeft;
      reactions[rightIdx].load += wRight;
    }
  });
  return reactions;
}

// Self-weight of the structure, modeled as equal-length modular segments
// ("tramos") laid out from the left end of the beam, independent of where
// the supports sit (matches how modular truss sections are actually built
// and sold - always whole modules, never a partial section). Each tramo
// contributes an identical point load at its own centroid. These
// auto-generated loads are merged with user loads and run through the same
// computeReactions() equilibrium solver.
function computeSelfWeightSegments(half, tramoLength, tramoWeight, numTramos) {
  if (!tramoWeight || tramoWeight <= 0 || !numTramos || numTramos <= 0) return [];
  const segments = [];
  for (let i = 0; i < numTramos; i++) {
    const start = -half + tramoLength * i;
    const centroid = start + tramoLength / 2;
    segments.push({
      id: `peso-propio-${i}`,
      pos: centroid,
      weight: tramoWeight,
      isSelfWeight: true,
    });
  }
  return segments;
}

// ---------- color tokens (plain values, applied via inline style so they
// always render regardless of Tailwind JIT availability). Two full palettes,
// each contrast-checked as text-on-background pairs (WCAG AA, >=4.5:1 for
// body text, >=3:1 for large/bold text and UI outlines). ----------
const PALETTES = {
  light: {
    page: "#F5F5F5",
    panel: "#FFFFFF",
    panelAlt: "#F0F0F0",
    border: "rgba(0, 160, 250, 0.25)",
    borderStrong: "rgba(0, 160, 250, 0.45)",
    textStrong: "#000000",
    textBody: "#1A1A1A",
    textPlaceholder: "#6B6B6B",
    blue: "#026B96", // darkened lightXtool cyan (#00A0FA) for AA text contrast on white
    blueLight: "#00A0FA", // full brand cyan for borders/icons/large elements
    amber: "#111111", // "cargas" identity: neutral ink (brand has no 2nd accent hue)
    amberLight: "#555555",
    danger: "#C81414", // darkened brand red (#FF1D1D) for AA text contrast on white
    dangerBg: "#FFE5E5",
    cg: "#026B96",
    cgBg: "rgba(0, 160, 250, 0.10)",
    gridLine: "rgba(0, 160, 250, 0.06)",
    beamChord: "#026B96",
    beamDiagonal: "#8FD0FA",
    ceilingA: "#026B96",
    ceilingB: "#E8E8E8",
    supportChipBg: "#E5F5FF",
    loadChipBg: "#EDEDED",
    addSupportBg: "#E5F5FF",
    addLoadBg: "#EDEDED",
  },
  dark: {
    page: "#000000",
    panel: "#0A0A0A",
    panelAlt: "#050505",
    border: "rgba(0, 160, 250, 0.22)",
    borderStrong: "rgba(0, 160, 250, 0.45)",
    textStrong: "#FFFFFF",
    textBody: "#E5E5E5",
    textPlaceholder: "rgba(255, 255, 255, 0.55)",
    blue: "#00A0FA", // lightXtool cyan principal
    blueLight: "#40A2FC", // lightXtool cyan claro / glow
    amber: "#FFFFFF", // "cargas" identity: white ink (brand has no 2nd accent hue)
    amberLight: "#C7C7C7",
    danger: "#FF1D1D", // lightXtool rojo, only for capacity warnings
    dangerBg: "rgba(255, 29, 29, 0.14)",
    cg: "#40A2FC",
    cgBg: "rgba(0, 160, 250, 0.12)",
    gridLine: "rgba(0, 160, 250, 0.06)",
    beamChord: "#00A0FA",
    beamDiagonal: "#0A4A6B",
    ceilingA: "#00A0FA",
    ceilingB: "#000000",
    supportChipBg: "#0A0A0A",
    loadChipBg: "#0A0A0A",
    addSupportBg: "rgba(0, 160, 250, 0.14)",
    addLoadBg: "rgba(255, 255, 255, 0.10)",
  },
};

export default function TrussLoadCalculator() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  // Geometry comes ONLY from whole modular tramos: length = tramoLength x numTramos.
  const [tramoLength, setTramoLength] = useState(10);
  const [numTramos, setNumTramos] = useState(1);
  const [tramoWeight, setTramoWeight] = useState(0);
  const length = tramoLength * numTramos;
  const half = length / 2;

  const [supports, setSupports] = useState([
    { id: nextId("apoyo"), pos: -4, label: "", capacity: 1000 },
    { id: nextId("apoyo"), pos: 4, label: "", capacity: 1000 },
  ]);
  const [loads, setLoads] = useState([]);
  const [defaultLoadWeight, setDefaultLoadWeight] = useState(100);
  const [bulkLoadCount, setBulkLoadCount] = useState(4);
  const [bulkRange, setBulkRange] = useState(5);

  // ---------- Proyecto: saved structures (personal storage) ----------
  const [projectList, setProjectList] = useState([]);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [projectMsg, setProjectMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(`${STORAGE_PREFIX}:list`, false);
        setProjectList(res ? JSON.parse(res.value) : []);
      } catch {
        setProjectList([]);
      }
    })();
  }, []);

  const trackRef = useRef(null);

  // keep existing supports/loads inside the beam whenever total length shrinks
  useEffect(() => {
    setSupports((prev) => prev.map((s) => ({ ...s, pos: clamp(s.pos, -half, half) })));
    setLoads((prev) => prev.map((l) => ({ ...l, pos: clamp(l.pos, -half, half) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  // ---------- drag handling ----------
  const handlePointerDown = useCallback(
    (e, type, id) => {
      e.preventDefault();
      e.stopPropagation();
      const onMove = (ev) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        let frac = (clientX - rect.left) / rect.width;
        frac = clamp(frac, 0, 1);
        let pos = (frac - 0.5) * length;
        pos = roundTo(pos, 0.05);
        pos = clamp(pos, -length / 2, length / 2);
        if (type === "support") {
          setSupports((prev) => prev.map((s) => (s.id === id ? { ...s, pos } : s)));
        } else {
          setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, pos } : l)));
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [length]
  );

  // ---------- CRUD ----------
  const addSupport = () =>
    setSupports((prev) => [...prev, { id: nextId("apoyo"), pos: 0, label: "", capacity: 1000 }]);
  const addLoad = () =>
    setLoads((prev) => [
      ...prev,
      { id: nextId("carga"), pos: 0, weight: Number(defaultLoadWeight) || 0, label: "" },
    ]);
  // Adds N loads at once, symmetric about the center, bounded by +-bulkRange
  // (clamped to the beam's own half-length) instead of always reaching the
  // physical extremes.
  const addManyLoads = () => {
    const N = Math.max(1, Math.round(Number(bulkLoadCount) || 1));
    const range = clamp(Number(bulkRange) || 0, 0, half);
    const w = Number(defaultLoadWeight) || 0;
    const newLoads = [];
    if (N === 1) {
      newLoads.push({ id: nextId("carga"), pos: 0, weight: w, label: "" });
    } else {
      for (let i = 0; i < N; i++) {
        const pos = -range + (i * (2 * range)) / (N - 1);
        newLoads.push({ id: nextId("carga"), pos: roundTo(pos, 0.05), weight: w, label: "" });
      }
    }
    setLoads((prev) => [...prev, ...newLoads]);
  };
  const removeSupport = (id) => setSupports((prev) => prev.filter((s) => s.id !== id));
  const removeLoad = (id) => setLoads((prev) => prev.filter((l) => l.id !== id));
  const updateSupportPos = (id, val) =>
    setSupports((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pos: clamp(Number(val), -half, half) } : s))
    );
  const updateSupportLabel = (id, val) =>
    setSupports((prev) => prev.map((s) => (s.id === id ? { ...s, label: val } : s)));
  const updateSupportCapacity = (id, val) =>
    setSupports((prev) => prev.map((s) => (s.id === id ? { ...s, capacity: Math.max(0, val) } : s)));
  const updateLoadPos = (id, val) =>
    setLoads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, pos: clamp(Number(val), -half, half) } : l))
    );
  const updateLoadWeight = (id, val) =>
    setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, weight: Math.max(0, val) } : l)));
  const updateLoadLabel = (id, val) =>
    setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, label: val } : l)));

  // Three mutually-linked geometry inputs. numTramos always stays a whole
  // number; tramoLength (and therefore length) absorbs the decimals.
  const handleNumTramosChange = (val) => {
    let n = Math.round(Number(val));
    if (!n || n < 1) n = 1;
    setNumTramos(n);
  };
  const handleTramoLengthChange = (val) => {
    const v = Math.max(0.05, Number(val) || 0.05);
    setTramoLength(v);
  };
  const handleTotalLengthChange = (val) => {
    const L = Math.max(0.05, Number(val) || 0.05);
    setTramoLength(L / numTramos);
  };

  // ---------- results ----------
  const sortedSupports = useMemo(() => [...supports].sort((a, b) => a.pos - b.pos), [supports]);

  const selfWeightSegments = useMemo(
    () => computeSelfWeightSegments(half, tramoLength, tramoWeight, numTramos),
    [half, tramoLength, tramoWeight, numTramos]
  );
  const selfWeightTotal = useMemo(
    () => selfWeightSegments.reduce((sum, s) => sum + s.weight, 0),
    [selfWeightSegments]
  );
  const userLoadsTotal = useMemo(
    () => loads.reduce((sum, l) => sum + (Number(l.weight) || 0), 0),
    [loads]
  );
  const effectiveLoads = useMemo(() => [...loads, ...selfWeightSegments], [loads, selfWeightSegments]);
  const hasLoads = effectiveLoads.length > 0 && (userLoadsTotal + selfWeightTotal) > 0;
  const totalWeight = userLoadsTotal + selfWeightTotal;

  // Center of gravity of everything hanging (user loads + self-weight),
  // independent of where the supports are - useful to sanity-check balance.
  const centroid = useMemo(() => {
    if (totalWeight <= 0) return null;
    const sum = effectiveLoads.reduce((acc, l) => acc + l.pos * l.weight, 0);
    return sum / totalWeight;
  }, [effectiveLoads, totalWeight]);

  const results = useMemo(() => {
    if (sortedSupports.length === 0) return [];
    if (!hasLoads) {
      const trib = computeTributary(sortedSupports, length);
      return trib.map((s) => ({
        id: s.id,
        pos: s.pos,
        label: s.label,
        capacity: s.capacity,
        percentage: s.share * 100,
        weight: null,
      }));
    }
    const reactions = computeReactions(sortedSupports, effectiveLoads);
    return reactions.map((s) => ({
      id: s.id,
      pos: s.pos,
      label: s.label,
      capacity: s.capacity,
      percentage: totalWeight > 0 ? (s.load / totalWeight) * 100 : 0,
      weight: s.load,
    }));
  }, [sortedSupports, effectiveLoads, hasLoads, length, totalWeight]);

  // ---------- export ----------
  const [exportText, setExportText] = useState(null);
  const handleExport = () => {
    const header = "Apoyo,Posicion_m,Porcentaje,Peso_kg,Capacidad_kg";
    const rows = results.map((r, i) => {
      const label = r.label || `Apoyo ${i + 1}`;
      return [
        label,
        r.pos.toFixed(2),
        r.percentage.toFixed(1),
        r.weight === null ? "" : r.weight.toFixed(1),
        r.capacity ?? "",
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    setExportText(csv);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).catch(() => {});
    }
  };

  // ---------- proyecto: save / load / duplicate / delete ----------
  const handleSaveStructure = async () => {
    const name = (saveNameInput || "").trim() || `Estructura ${projectList.length + 1}`;
    const id = nextId("est");
    const snapshot = {
      id,
      name,
      tramoLength,
      numTramos,
      tramoWeight,
      supports,
      loads,
      defaultLoadWeight,
      bulkLoadCount,
      bulkRange,
      savedAt: Date.now(),
    };
    const indexEntry = {
      id,
      name,
      length,
      numSupports: supports.length,
      numLoads: loads.length,
      totalWeight,
      savedAt: snapshot.savedAt,
    };
    try {
      await window.storage.set(`${STORAGE_PREFIX}:structure:${id}`, JSON.stringify(snapshot), false);
      const newList = [...projectList, indexEntry];
      await window.storage.set(`${STORAGE_PREFIX}:list`, JSON.stringify(newList), false);
      setProjectList(newList);
      setSaveNameInput("");
      setProjectMsg(`Guardada "${name}".`);
    } catch (err) {
      setProjectMsg("No se pudo guardar. Intenta de nuevo.");
    }
  };

  const handleLoadStructure = async (id) => {
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}:structure:${id}`, false);
      if (!res) return;
      const s = JSON.parse(res.value);
      setTramoLength(s.tramoLength);
      setNumTramos(s.numTramos);
      setTramoWeight(s.tramoWeight || 0);
      setSupports(s.supports || []);
      setLoads(s.loads || []);
      setDefaultLoadWeight(s.defaultLoadWeight ?? 100);
      setBulkLoadCount(s.bulkLoadCount ?? 4);
      setBulkRange(s.bulkRange ?? (s.tramoLength * s.numTramos) / 2);
      setProjectMsg(`Cargada "${s.name}".`);
    } catch (err) {
      setProjectMsg("No se pudo cargar esa estructura.");
    }
  };

  const handleDuplicateStructure = async (id) => {
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}:structure:${id}`, false);
      if (!res) return;
      const s = JSON.parse(res.value);
      const newId = nextId("est");
      const copy = { ...s, id: newId, name: `${s.name} (copia)`, savedAt: Date.now() };
      await window.storage.set(`${STORAGE_PREFIX}:structure:${newId}`, JSON.stringify(copy), false);
      const original = projectList.find((p) => p.id === id);
      const indexEntry = {
        id: newId,
        name: copy.name,
        length: copy.tramoLength * copy.numTramos,
        numSupports: (copy.supports || []).length,
        numLoads: (copy.loads || []).length,
        totalWeight: original ? original.totalWeight : 0,
        savedAt: copy.savedAt,
      };
      const newList = [...projectList, indexEntry];
      await window.storage.set(`${STORAGE_PREFIX}:list`, JSON.stringify(newList), false);
      setProjectList(newList);
      setProjectMsg(`Duplicada como "${copy.name}".`);
    } catch (err) {
      setProjectMsg("No se pudo duplicar esa estructura.");
    }
  };

  const handleDeleteStructure = async (id) => {
    try {
      await window.storage.delete(`${STORAGE_PREFIX}:structure:${id}`, false);
    } catch (err) {
      // key might already be gone - safe to ignore
    }
    try {
      const newList = projectList.filter((p) => p.id !== id);
      await window.storage.set(`${STORAGE_PREFIX}:list`, JSON.stringify(newList), false);
      setProjectList(newList);
      setProjectMsg("Estructura eliminada.");
    } catch (err) {
      setProjectMsg("No se pudo eliminar esa estructura.");
    }
  };

  const projectTotalWeight = useMemo(
    () => projectList.reduce((sum, p) => sum + (Number(p.totalWeight) || 0), 0),
    [projectList]
  );

  // ---------- ruler ticks: major (labeled) + minor (fine) ----------
  const majorStep = length <= 6 ? 0.5 : length <= 16 ? 1 : length <= 40 ? 2 : 5;
  const minorStep = majorStep / 5;

  const majorTicks = [];
  for (let v = -half; v <= half + 1e-6; v += majorStep) {
    majorTicks.push(Math.round(v * 100) / 100);
  }
  if (majorTicks[majorTicks.length - 1] < half - 1e-6) {
    majorTicks.push(Math.round(half * 100) / 100);
  }
  const minorTicks = [];
  for (let v = -half; v <= half + 1e-6; v += minorStep) {
    const r = Math.round(v * 1000) / 1000;
    if (!majorTicks.some((m) => Math.abs(m - r) < 1e-6)) minorTicks.push(r);
  }

  const toPct = (pos) => ((pos / length) + 0.5) * 100;

  // segment ("tramo") boundaries, purely visual, independent of supports
  const tramoBoundaries = [];
  for (let i = 0; i <= numTramos; i++) {
    tramoBoundaries.push(-half + tramoLength * i);
  }

  // reusable inline style shortcuts
  const panelStyle = { backgroundColor: C.panel, border: `1px solid ${C.border}` };
  const inputStyle = {
    backgroundColor: C.panelAlt,
    border: `1px solid ${C.border}`,
    color: C.textStrong,
    fontWeight: 700,
  };
  const labelStyle = { color: C.textBody, fontWeight: 700 };
  const placeholderStyle = { color: C.textPlaceholder, fontWeight: 500 };

  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%" }} className="font-sans">
      <div
        className="max-w-5xl mx-auto p-5 sm:p-8"
        style={{
          backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest mb-1"
              style={{ color: C.blue, fontWeight: 700 }}
            >
              <Ruler size={14} />
              <span>Analisis estructural &mdash; estructura colgada</span>
            </div>
            <h1
              className="text-2xl sm:text-3xl font-bold font-mono"
              style={{
                color: C.textStrong,
                textShadow: theme === "dark" ? "0 0 12px rgba(0, 160, 250, 0.55)" : "none",
              }}
            >
              Calculadora de Reacciones en Viga Truss
            </h1>
            <p className="text-sm mt-1" style={placeholderStyle}>
              Los apoyos cuelgan desde arriba; las cargas se suspenden debajo de la viga.
            </p>
          </div>
          <button
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs shrink-0"
            style={{
              backgroundColor: C.panel,
              border: `1px solid ${C.border}`,
              color: C.textBody,
              fontWeight: 700,
            }}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
            {theme === "light" ? "Modo oscuro" : "Modo claro"}
          </button>
        </div>

        {/* Proyecto: guardar / cargar / duplicar estructuras */}
        <div className="rounded-lg p-4 mb-6" style={panelStyle}>
          <h3
            className="text-xs uppercase tracking-wider font-mono mb-1 flex items-center gap-1.5"
            style={{ color: C.blue, fontWeight: 700 }}
          >
            <Files size={14} /> Proyecto: estructuras guardadas ({projectList.length})
          </h3>
          <p className="text-xs font-mono mb-3" style={placeholderStyle}>
            Se guarda solo en tu sesion (no es compartido). Cada estructura conserva tramos, apoyos
            y cargas completos.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              placeholder="Nombre de la estructura actual"
              value={saveNameInput}
              onChange={(e) => setSaveNameInput(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
              style={inputStyle}
            />
            <button
              onClick={handleSaveStructure}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm shrink-0"
              style={{
                backgroundColor: C.addSupportBg,
                border: `1px solid ${C.blueLight}`,
                color: C.blue,
                fontWeight: 700,
              }}
            >
              <Save size={15} /> Guardar en el proyecto
            </button>
          </div>

          {projectMsg && (
            <p className="text-xs font-mono mb-2" style={{ color: C.blue, fontWeight: 700 }}>
              {projectMsg}
            </p>
          )}

          {projectList.length === 0 ? (
            <p className="text-sm" style={placeholderStyle}>
              Aun no hay estructuras guardadas en este proyecto.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono uppercase" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th className="px-2 py-1.5" style={labelStyle}>Nombre</th>
                    <th className="px-2 py-1.5" style={labelStyle}>Longitud</th>
                    <th className="px-2 py-1.5" style={labelStyle}>Apoyos</th>
                    <th className="px-2 py-1.5" style={labelStyle}>Cargas</th>
                    <th className="px-2 py-1.5" style={labelStyle}>Peso total</th>
                    <th className="px-2 py-1.5" style={labelStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {projectList.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                      <td className="px-2 py-1.5 font-mono" style={{ color: C.textStrong, fontWeight: 700 }}>
                        {p.name}
                      </td>
                      <td className="px-2 py-1.5 font-mono" style={placeholderStyle}>
                        {p.length.toFixed(2)} m
                      </td>
                      <td className="px-2 py-1.5 font-mono" style={placeholderStyle}>
                        {p.numSupports}
                      </td>
                      <td className="px-2 py-1.5 font-mono" style={placeholderStyle}>
                        {p.numLoads}
                      </td>
                      <td className="px-2 py-1.5 font-mono" style={{ color: C.amber, fontWeight: 700 }}>
                        {Number(p.totalWeight || 0).toFixed(1)} kg
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-2 justify-end">
                          <button
                            title="Cargar"
                            onClick={() => handleLoadStructure(p.id)}
                            style={{ color: C.blue }}
                          >
                            <FolderOpen size={16} />
                          </button>
                          <button
                            title="Duplicar"
                            onClick={() => handleDuplicateStructure(p.id)}
                            style={{ color: C.textBody }}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            title="Eliminar"
                            onClick={() => handleDeleteStructure(p.id)}
                            style={{ color: C.danger }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-2 py-2 font-mono" style={{ color: C.textStrong, fontWeight: 700 }} colSpan={4}>
                      Total del proyecto
                    </td>
                    <td className="px-2 py-2 font-mono" style={{ color: C.amber, fontWeight: 700 }}>
                      {projectTotalWeight.toFixed(1)} kg
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Estructura: geometria (tramos) + peso propio - PRIMERO */}
        <div className="rounded-lg p-4 mb-6" style={panelStyle}>
          <h3 className="text-xs uppercase tracking-wider font-mono mb-1" style={{ color: C.blue, fontWeight: 700 }}>
            Estructura: tramos, longitud y peso propio
          </h3>
          <p className="text-xs font-mono mb-3" style={placeholderStyle}>
            Los 3 campos de geometria se recalculan entre si (no se permiten tramos a medias). El
            peso propio se suma siempre a las reacciones de la tabla.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-mono mb-1" style={labelStyle}>
                Numero de tramos
              </label>
              <NumberField
                min={1}
                step={1}
                decimals={0}
                value={numTramos}
                onCommit={handleNumTramosChange}
                className="w-full rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1" style={labelStyle}>
                Tamano de tramo (m)
              </label>
              <NumberField
                min={0.05}
                step={0.1}
                value={tramoLength}
                onCommit={handleTramoLengthChange}
                className="w-full rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1" style={labelStyle}>
                Longitud total (m)
              </label>
              <NumberField
                min={0.05}
                step={0.5}
                value={length}
                onCommit={handleTotalLengthChange}
                className="w-full rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1" style={labelStyle}>
                Peso por tramo (kg)
              </label>
              <NumberField
                min={0}
                step={0.5}
                value={tramoWeight}
                onCommit={(n) => setTramoWeight(Math.max(0, n))}
                decimals={2}
                className="w-full rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1" style={labelStyle}>
                Peso propio total
              </label>
              <div
                className="w-full rounded px-2 py-1.5 text-sm font-mono"
                style={{ ...inputStyle, backgroundColor: C.panelAlt }}
              >
                {tramoWeight > 0 ? `${selfWeightTotal.toFixed(1)} kg` : "0 kg"}
              </div>
            </div>
          </div>
        </div>

        {/* Controls (cargas / apoyos) - SEGUNDO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg p-3" style={panelStyle}>
            <label className="block text-xs uppercase font-mono mb-1" style={labelStyle}>
              Peso por defecto (kg) al agregar carga
            </label>
            <NumberField
              min={0}
              step={10}
              value={defaultLoadWeight}
              onCommit={(n) => setDefaultLoadWeight(Math.max(0, n))}
              decimals={2}
              className="w-full rounded px-2 py-1.5 text-base font-mono focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addSupport}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: C.addSupportBg,
                border: `1px solid ${C.blueLight}`,
                color: C.blue,
                fontWeight: 700,
              }}
            >
              <Plus size={16} /> Apoyo
            </button>
            <button
              onClick={addLoad}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: C.addLoadBg,
                border: `1px solid ${C.amberLight}`,
                color: C.amber,
                fontWeight: 700,
              }}
            >
              <Plus size={16} /> Carga
            </button>
          </div>
        </div>

        <div className="rounded-lg p-3 mb-6" style={panelStyle}>
          <label className="block text-xs uppercase font-mono mb-2" style={labelStyle}>
            Alta rapida: cargas simetricas (del centro hacia los extremos)
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[10px] font-mono mb-1" style={placeholderStyle}>
                Cantidad
              </label>
              <NumberField
                min={1}
                step={1}
                decimals={0}
                value={bulkLoadCount}
                onCommit={(n) => setBulkLoadCount(Math.max(1, Math.round(n)))}
                className="w-20 rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono mb-1" style={placeholderStyle}>
                Rango maximo &plusmn; (m)
              </label>
              <NumberField
                min={0}
                max={half}
                step={0.5}
                value={Math.min(bulkRange, half)}
                onCommit={(n) => setBulkRange(Math.max(0, n))}
                className="w-28 rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <button
              onClick={addManyLoads}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
              style={{
                backgroundColor: C.addLoadBg,
                border: `1px solid ${C.amberLight}`,
                color: C.amber,
                fontWeight: 700,
              }}
            >
              <Plus size={16} /> Agregar simetricas
            </button>
            <span className="text-xs font-mono" style={placeholderStyle}>
              limite actual: &plusmn;{half.toFixed(2)} m
            </span>
          </div>
        </div>

        {/* Beam visualization (hangers on top, beam, loads hanging below) */}
        <div className="rounded-xl p-5 sm:p-8 mb-6" style={panelStyle}>
          <div className="relative select-none">
            {/* center zero marker spans the whole diagram */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: "50%",
                top: 0,
                bottom: "36px",
                borderLeft: `2px dashed ${C.blueLight}`,
              }}
            />

            {/* ceiling / fixed structure the supports hang from */}
            <div
              className="relative h-3 rounded-sm"
              style={{
                backgroundImage: `repeating-linear-gradient(135deg, ${C.ceilingA} 0, ${C.ceilingA} 3px, ${C.ceilingB} 3px, ${C.ceilingB} 9px)`,
                border: `1px solid ${C.borderStrong}`,
              }}
            />

            {/* supports: hang down from the ceiling to the beam */}
            <div className="relative h-12">
              {supports.map((s, i) => (
                <div
                  key={s.id}
                  onPointerDown={(e) => handlePointerDown(e, "support", s.id)}
                  className="absolute flex flex-col items-center cursor-grab touch-none"
                  style={{ left: `${toPct(s.pos)}%`, top: 0, transform: "translateX(-50%)" }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: C.blueLight, border: `2px solid ${C.blue}`, marginBottom: "-2px", zIndex: 10 }}
                  />
                  <div style={{ width: "3px", height: "34px", backgroundColor: C.blue }} />
                  <span
                    className="text-xs font-mono rounded px-1 whitespace-nowrap"
                    style={{
                      backgroundColor: C.supportChipBg,
                      border: `1px solid ${C.blueLight}`,
                      color: C.blue,
                      fontWeight: 700,
                      marginTop: "-4px",
                    }}
                  >
                    {s.label || `A${i + 1}`}
                  </span>
                </div>
              ))}
            </div>

            {/* truss beam */}
            <div ref={trackRef} className="relative h-14">
              <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="w-full h-full">
                <line x1="0" y1="12" x2="1000" y2="12" stroke={C.beamChord} strokeWidth="4" />
                <line x1="0" y1="68" x2="1000" y2="68" stroke={C.beamChord} strokeWidth="4" />
                {Array.from({ length: 21 }).map((_, i) => {
                  const x = i * 50;
                  const nextX = x + 50;
                  return (
                    <g key={i}>
                      {i % 2 === 0 ? (
                        <line x1={x} y1="12" x2={nextX} y2="68" stroke={C.beamDiagonal} strokeWidth="3" />
                      ) : (
                        <line x1={x} y1="68" x2={nextX} y2="12" stroke={C.beamDiagonal} strokeWidth="3" />
                      )}
                    </g>
                  );
                })}
              </svg>
              {/* tramo grid: fixed-length modular segments, independent of supports */}
              {tramoWeight > 0 &&
                tramoBoundaries.map((t, i) => (
                  <div
                    key={`tramo-${i}`}
                    className="absolute top-0 bottom-0"
                    style={{
                      left: `${toPct(t)}%`,
                      borderLeft: `1px dotted ${C.borderStrong}`,
                    }}
                  />
                ))}
              {/* center of gravity marker */}
              {centroid !== null && (
                <div
                  className="absolute flex flex-col items-center"
                  style={{ left: `${toPct(centroid)}%`, top: "-14px", transform: "translateX(-50%)" }}
                  title={`Centro de gravedad: ${centroid.toFixed(2)} m`}
                >
                  <Diamond size={12} style={{ color: C.cg }} fill={C.cg} />
                </div>
              )}
            </div>
            {tramoWeight > 0 && (
              <p className="text-xs font-mono mt-1" style={placeholderStyle}>
                Cuadricula de tramos: {numTramos} tramo(s) de {tramoLength.toFixed(2)} m
                &mdash; peso propio total: {selfWeightTotal.toFixed(1)} kg
              </p>
            )}

            {/* loads: hang below the beam */}
            <div className="relative h-24">
              {loads.map((l, i) => (
                <div
                  key={l.id}
                  onPointerDown={(e) => handlePointerDown(e, "load", l.id)}
                  className="absolute flex flex-col items-center cursor-grab touch-none"
                  style={{ left: `${toPct(l.pos)}%`, top: 0, transform: "translateX(-50%)" }}
                >
                  <div style={{ width: "2px", height: "18px", backgroundColor: C.amberLight }} />
                  <span
                    className="text-xs font-mono rounded px-1.5 py-0.5 whitespace-nowrap"
                    style={{
                      backgroundColor: C.loadChipBg,
                      border: `2px solid ${C.amberLight}`,
                      color: C.amber,
                      fontWeight: 700,
                    }}
                  >
                    {l.label || `C${i + 1}`}: {l.weight} kg
                  </span>
                  <ArrowDown size={20} strokeWidth={2.75} style={{ color: C.amber, marginTop: "-2px" }} />
                </div>
              ))}
            </div>

            {/* ruler: fine minor ticks + labeled major ticks */}
            <div className="relative h-9 mt-1" style={{ borderTop: `2px solid ${C.borderStrong}` }}>
              {minorTicks.map((t) => (
                <div
                  key={`min-${t}`}
                  className="absolute"
                  style={{
                    left: `${toPct(t)}%`,
                    top: 0,
                    width: "1px",
                    height: "6px",
                    backgroundColor: C.borderStrong,
                    transform: "translateX(-50%)",
                  }}
                />
              ))}
              {majorTicks.map((t) => (
                <div
                  key={`maj-${t}`}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${toPct(t)}%`, top: 0, transform: "translateX(-50%)" }}
                >
                  <div
                    style={{
                      width: "2px",
                      height: "12px",
                      backgroundColor: t === 0 ? C.blueLight : C.textBody,
                    }}
                  />
                  <span
                    className="text-xs font-mono mt-0.5"
                    style={{ color: t === 0 ? C.blue : C.textStrong, fontWeight: 700 }}
                  >
                    {t === 0 ? "0" : t > 0 ? `+${t}` : t}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Editable numeric panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg p-4" style={panelStyle}>
            <h3
              className="text-xs uppercase tracking-wider font-mono mb-3"
              style={{ color: C.blue, fontWeight: 700 }}
            >
              Puntos de apoyo ({supports.length})
            </h3>
            <div className="space-y-2">
              {supports.length === 0 && <p className="text-sm" style={placeholderStyle}>Sin apoyos agregados.</p>}
              {supports.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    placeholder={`Apoyo ${i + 1}`}
                    value={s.label}
                    onChange={(e) => updateSupportLabel(s.id, e.target.value)}
                    className="w-24 rounded px-2 py-1 text-xs font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <NumberField
                    step={0.1}
                    min={-half}
                    max={half}
                    value={s.pos}
                    onCommit={(n) => updateSupportPos(s.id, n)}
                    className="w-16 rounded px-2 py-1 text-sm font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <span className="text-xs" style={placeholderStyle}>m</span>
                  <NumberField
                    step={50}
                    min={0}
                    decimals={0}
                    value={s.capacity}
                    onCommit={(n) => updateSupportCapacity(s.id, n)}
                    className="w-20 rounded px-2 py-1 text-sm font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <span className="text-xs" style={placeholderStyle}>kg cap.</span>
                  <button onClick={() => removeSupport(s.id)} className="ml-auto" style={{ color: C.textPlaceholder }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg p-4" style={panelStyle}>
            <h3
              className="text-xs uppercase tracking-wider font-mono mb-3"
              style={{ color: C.amber, fontWeight: 700 }}
            >
              Cargas ({loads.length})
            </h3>
            <div className="space-y-2">
              {loads.length === 0 && (
                <p className="text-sm" style={placeholderStyle}>
                  Sin cargas puntuales &mdash; si tampoco defines peso por tramo, se calcula el
                  reparto simetrico de peso propio.
                </p>
              )}
              {loads.map((l, i) => (
                <div key={l.id} className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    placeholder={`Carga ${i + 1}`}
                    value={l.label}
                    onChange={(e) => updateLoadLabel(l.id, e.target.value)}
                    className="w-20 rounded px-2 py-1 text-xs font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <NumberField
                    step={0.1}
                    min={-half}
                    max={half}
                    value={l.pos}
                    onCommit={(n) => updateLoadPos(l.id, n)}
                    className="w-16 rounded px-2 py-1 text-sm font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <span className="text-xs" style={placeholderStyle}>m</span>
                  <NumberField
                    step={5}
                    min={0}
                    decimals={2}
                    value={l.weight}
                    onCommit={(n) => updateLoadWeight(l.id, Math.max(0, n))}
                    className="w-16 rounded px-2 py-1 text-sm font-mono focus:outline-none"
                    style={inputStyle}
                  />
                  <span className="text-xs" style={placeholderStyle}>kg</span>
                  <button onClick={() => removeLoad(l.id)} className="ml-auto" style={{ color: C.textPlaceholder }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mode banner */}
        <div className="flex items-center gap-2 text-xs font-mono mb-1 flex-wrap" style={{ color: C.textBody, fontWeight: 600 }}>
          <Info size={14} style={{ color: C.blue }} />
          {hasLoads ? (
            <span>
              Modo <span style={{ color: C.amber, fontWeight: 700 }}>B</span>: equilibrio estatico
              {sortedSupports.length > 2 ? " (aproximacion por proximidad entre apoyos, 3+ apoyos)" : ""}{" "}
              &mdash; total colgado: {totalWeight.toFixed(1)} kg
              {selfWeightTotal > 0 ? ` (incluye ${selfWeightTotal.toFixed(1)} kg de peso propio)` : ""}
            </span>
          ) : (
            <span>
              Modo <span style={{ color: C.blue, fontWeight: 700 }}>A</span>: peso propio simetrico segun
              geometria de apoyos (sin cargas ni peso por tramo definidos)
            </span>
          )}
        </div>
        {centroid !== null && (
          <div className="flex items-center gap-1.5 text-xs font-mono mb-3" style={{ color: C.cg, fontWeight: 700 }}>
            <Diamond size={12} fill={C.cg} />
            Centro de gravedad de la carga: {centroid > 0 ? "+" : ""}
            {centroid.toFixed(2)} m desde el centro
          </div>
        )}

        {/* Results table */}
        <div className="rounded-lg overflow-hidden mb-2" style={panelStyle}>
          <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2">
              <Scale size={16} style={{ color: C.blue }} />
              <h3 className="text-sm font-bold" style={{ color: C.textStrong }}>Resultados de distribucion</h3>
            </div>
            {results.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
                style={{ border: `1px solid ${C.border}`, color: C.textBody, fontWeight: 700 }}
              >
                <Copy size={13} /> Exportar
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <p className="p-4 text-sm" style={placeholderStyle}>
              Agrega al menos un punto de apoyo para calcular resultados.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="px-4 py-2" style={labelStyle}>Punto de apoyo</th>
                  <th className="px-4 py-2" style={labelStyle}>% de carga</th>
                  <th className="px-4 py-2" style={labelStyle}>Peso (kg)</th>
                  <th className="px-4 py-2" style={labelStyle}>Capacidad</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const overCapacity = r.weight !== null && r.capacity > 0 && r.weight > r.capacity;
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: `1px solid ${C.panelAlt}`,
                        backgroundColor: overCapacity ? C.dangerBg : "transparent",
                      }}
                    >
                      <td className="px-4 py-2 font-mono" style={{ color: C.textStrong, fontWeight: 700 }}>
                        {r.label || `Apoyo ${i + 1}`}{" "}
                        <span style={{ color: C.textPlaceholder, fontWeight: 500 }}>
                          ({r.pos > 0 ? "+" : ""}
                          {r.pos.toFixed(2)} m)
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono" style={{ color: C.blue, fontWeight: 700 }}>
                        {r.percentage.toFixed(1)}%
                      </td>
                      <td
                        className="px-4 py-2 font-mono"
                        style={{ color: overCapacity ? C.danger : C.amber, fontWeight: 700 }}
                      >
                        {r.weight === null ? "-" : `${r.weight.toFixed(1)} kg`}
                        {overCapacity ? " \u26A0" : ""}
                      </td>
                      <td className="px-4 py-2 font-mono" style={placeholderStyle}>
                        {r.capacity ? `${r.capacity} kg` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {results.some((r) => r.weight !== null && r.capacity > 0 && r.weight > r.capacity) && (
          <p className="text-xs font-mono mb-4" style={{ color: C.danger, fontWeight: 700 }}>
            &#9888; Uno o mas apoyos superan su capacidad indicada. Redistribuye las cargas o
            aumenta la capacidad de ese punto.
          </p>
        )}

        {exportText && (
          <div className="rounded-lg p-3 mb-6" style={panelStyle}>
            <p className="text-xs font-mono mb-2" style={placeholderStyle}>
              Copiado al portapapeles si tu navegador lo permite. Si no, selecciona y copia el
              texto manualmente:
            </p>
            <textarea
              readOnly
              value={exportText}
              rows={Math.min(8, results.length + 2)}
              className="w-full rounded px-2 py-1.5 text-xs font-mono focus:outline-none"
              style={inputStyle}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}

        <p className="text-xs font-mono mt-2" style={placeholderStyle}>
          Nota: para 3+ apoyos con cargas, el reparto usa una aproximacion de reparto por
          proximidad (regla de palanca entre los apoyos mas cercanos a cada carga), ya que el
          sistema es estaticamente indeterminado y requeriria un analisis de rigidez para una
          solucion exacta. El peso propio se modela como un tramo completo por carga puntual,
          ubicada en su centroide, y se combina con las cargas manuales bajo la misma logica. La
          capacidad por apoyo (1000 kg por defecto) es solo una comparacion contra tu propio dato;
          verifica siempre la carga de trabajo segura real de tu equipo de rigging.
        </p>
      </div>
    </div>
  );
}
