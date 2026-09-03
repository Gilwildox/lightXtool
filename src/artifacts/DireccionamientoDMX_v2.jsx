import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Trash2, AlertTriangle, Radio, Download, Layers, FileText,
  ChevronDown, ChevronUp, Sun, Moon, FileSpreadsheet, Save, FolderOpen,
  Upload, X, Printer, BookOpen, Info, HelpCircle, ArrowUp, ArrowDown, Wand2,
  CheckCircle2,
} from "lucide-react";

// ── id / nombre de archivo ──────────────────────────────────────────────
const genId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};
const sanitizeFileName = (s) =>
  (s || "").trim().replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "proyecto";

const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
const CURRENT_KEY = "dmx:actual:v1";
const PROJECTS_INDEX_KEY = "dmx:proyectos:index:v1";
const PROJECT_KEY = (id) => `dmx:proyecto:v1:${id}`;

const UNIVERSE_SIZE = 512; // constante fija DMX512, no editable

// ── identidad lightXtool: dos paletas completas, contraste AA revisado ──
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

// ── NumberField: texto libre mientras se escribe, límites al salir ─────
function NumberField({ value, onCommit, min, max, style, disabled, ...rest }) {
  const format = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(Math.round(v)));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="text" inputMode="numeric" value={text} style={style} disabled={disabled}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*$/.test(raw)) return;
        setText(raw);
        if (raw !== "" && raw !== "-" && !Number.isNaN(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        let n = Number(text);
        if (text === "" || text === "-" || Number.isNaN(n)) n = min ?? 0;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        setText(format(n));
        onCommit(n);
      }}
      {...rest}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── lógica de direccionamiento ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// Expande UN bloque a sus fixtures individuales. Es una función pura: solo
// depende de los datos del propio bloque + su fixture. Cuando el fixture
// #i no cabe en el universo actual (se saldría de 512), salta de forma
// automática al SIGUIENTE universo (universo+1, canal 1) y continúa desde
// ahí — así un bloque grande se reparte solo entre 1, 2 o más universos
// sin necesidad de dividirlo a mano. Como ningún fixture individual puede
// tener más de 512 canales (límite del catálogo), un universo nuevo y
// vacío siempre tiene espacio para el primero, así que esto nunca se
// atora en un ciclo infinito.
function expandBloque(bloque, fixture) {
  const canalesFx = Number(fixture?.canales) || 0;
  const cant = Math.max(0, Number(bloque.cantidad) || 0);
  if (canalesFx <= 0) return [];
  let universo = Number(bloque.universo) || 1;
  let canal = Math.max(1, Number(bloque.canalInicial) || 1);
  const out = [];
  for (let i = 0; i < cant; i++) {
    if (canal + canalesFx - 1 > UNIVERSE_SIZE) {
      universo += 1;
      canal = 1;
    }
    out.push({ universo, canalInicio: canal, canalFin: canal + canalesFx - 1, index: i });
    canal += canalesFx;
  }
  return out;
}

// Mapa de ocupación por universo, construido a partir de TODOS los bloques
// menos el excluido (para sugerir ubicación sin chocar con lo ya colocado).
function occupancyMap(bloques, fixturesById, excludeId) {
  const map = {};
  bloques.forEach((b) => {
    if (b.id === excludeId) return;
    const fx = fixturesById[b.fixtureId];
    expandBloque(b, fx).forEach((ind) => {
      if (!map[ind.universo]) map[ind.universo] = [];
      map[ind.universo].push({ start: ind.canalInicio, end: Math.min(UNIVERSE_SIZE, ind.canalFin) });
    });
  });
  return map;
}
function firstGapInUniverse(universo, footprint, occMap) {
  if (footprint <= 0 || footprint > UNIVERSE_SIZE) return null;
  const ocupados = (occMap[universo] || []).slice().sort((a, b) => a.start - b.start);
  let cursor = 1;
  for (const r of ocupados) {
    if (r.start - cursor >= footprint) return cursor;
    cursor = Math.max(cursor, r.end + 1);
  }
  if (UNIVERSE_SIZE - cursor + 1 >= footprint) return cursor;
  return null;
}

// Sugerencia de ubicación (universo, canal) para un bloque completo, sin
// chocar con nada ya colocado:
// - Si cabe en un solo universo (cantidad×canales <= 512): busca, en orden
//   ascendente entre universos ya usados por OTROS bloques, el primer
//   hueco que le quepa; si ninguno sirve, propone un universo nuevo desde
//   el canal 1.
// - Si necesita más de un universo: busca el primer tramo de N universos
//   CONSECUTIVOS que estén completamente libres (N = ceil(footprint/512))
//   y sugiere empezar ahí desde el canal 1 — así el bloque completo, ya
//   autodividido por expandBloque, queda garantizado sin traslapes.
function sugerirUbicacion(cantidad, canalesFx, bloques, fixturesById, excludeId) {
  const footprintTotal = (Number(cantidad) || 0) * (Number(canalesFx) || 0);
  if (footprintTotal <= 0) return null;
  const occMap = occupancyMap(bloques, fixturesById, excludeId);

  if (footprintTotal <= UNIVERSE_SIZE) {
    const universosExistentes = Object.keys(occMap).map(Number).sort((a, b) => a - b);
    for (const u of universosExistentes) {
      const ch = firstGapInUniverse(u, footprintTotal, occMap);
      if (ch !== null) return { universo: u, canalInicial: ch };
    }
    const maxU = universosExistentes.length ? Math.max(...universosExistentes) : 0;
    return { universo: maxU + 1, canalInicial: 1 };
  }

  const N = Math.ceil(footprintTotal / UNIVERSE_SIZE);
  const universosOcupados = new Set(Object.keys(occMap).map(Number));
  let u = 1;
  while (u < 100000) {
    let libre = true;
    for (let k = 0; k < N; k++) { if (universosOcupados.has(u + k)) { libre = false; break; } }
    if (libre) return { universo: u, canalInicial: 1 };
    u++;
  }
  return { universo: 1, canalInicial: 1 };
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

export default function DireccionamientoDMX() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  const [proyectoNombre, setProyectoNombre] = useState("");
  const [fixtures, setFixtures] = useState([]); // { id, modelo, modo, canales }
  const [bloques, setBloques] = useState([]); // { id, fixtureId, etiqueta, cantidad, universo, canalInicial }
  const [invCollapsed, setInvCollapsed] = useState(false);
  const [filterModelos, setFilterModelos] = useState([]);
  const [filterUniversos, setFilterUniversos] = useState([]);
  const [msg, setMsg] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const loaded = useRef(false);
  const catalogRef = useRef(null);

  const [fileBaseName, setFileBaseName] = useState("");
  const [fileBaseEditado, setFileBaseEditado] = useState(false);
  useEffect(() => {
    if (!fileBaseEditado) setFileBaseName(sanitizeFileName(`LXT-DMX_${proyectoNombre || "Proyecto"}`));
  }, [proyectoNombre, fileBaseEditado]);

  const [savedProjects, setSavedProjects] = useState([]);
  const [saveProjectNameInput, setSaveProjectNameInput] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const fileInputRef = useRef(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3200); };

  // ── carga inicial ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(CURRENT_KEY, false);
        if (res) {
          const s = JSON.parse(res.value);
          setProyectoNombre(s.proyectoNombre || "");
          setFixtures(s.fixtures || []);
          setBloques(s.bloques || []);
          setTheme(s.theme || "dark");
        }
      } catch { /* sin proyecto guardado aún */ }
      finally { loaded.current = true; }
    })();
    (async () => {
      try {
        const res = await window.storage.get(PROJECTS_INDEX_KEY, false);
        setSavedProjects(res ? JSON.parse(res.value) : []);
      } catch { setSavedProjects([]); }
    })();
  }, []);

  // ── autoguardado ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage.set(CURRENT_KEY, JSON.stringify({ proyectoNombre, fixtures, bloques, theme }), false).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [proyectoNombre, fixtures, bloques, theme]);

  // ── estilos derivados ──────────────────────────────────────────────
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
    const base = { fontFamily: FONT, fontSize: "11px", padding: "6px 12px", borderRadius: "3px", cursor: "pointer", letterSpacing: ".4px", display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid transparent" };
    if (variant === "primary") return { ...base, background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700, ...glowBox("rgba(0,160,250,.25)") };
    if (variant === "danger") return { ...base, background: C.redBg, border: `1px solid ${C.red}`, color: C.red };
    return { ...base, background: theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF", border: `1px solid ${C.border}`, color: C.textDim, fontWeight: 700 };
  }
  function btnStyleDisabled(variant) {
    return { ...btnStyle(variant), opacity: 0.4, cursor: "not-allowed" };
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

  // ── CRUD fixtures ────────────────────────────────────────────────────
  const addFixture = () => {
    setFixtures((p) => [...p, { id: genId("fx"), modelo: "", modo: "", canales: 0 }]);
    setInvCollapsed(false);
  };
  const updateFixture = (id, patch) => setFixtures((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const bloquesDeFixture = (fixtureId) => bloques.filter((b) => b.fixtureId === fixtureId).length;
  const requestRemoveFixture = (id, modelo) => {
    const n = bloquesDeFixture(id);
    const label = n > 0
      ? `"${modelo || "este fixture"}" — se eliminarán también sus ${n} bloque(s) asociado(s)`
      : `"${modelo || "este fixture"}"`;
    setPendingDelete({ type: "fixture", id, label });
  };

  const fixturesById = useMemo(() => Object.fromEntries(fixtures.map((f) => [f.id, f])), [fixtures]);

  // ── CRUD bloques ─────────────────────────────────────────────────────
  const updateBloque = (id, patch) => setBloques((p) => p.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBloque = (id) => setBloques((p) => p.filter((b) => b.id !== id));
  const moveBloque = (id, dir) => setBloques((p) => {
    const idx = p.findIndex((b) => b.id === id);
    const to = idx + dir;
    if (idx === -1 || to < 0 || to >= p.length) return p;
    const next = [...p];
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });
  const onFixtureChangeInBloque = (id, fixtureId) => {
    const fx = fixtures.find((f) => f.id === fixtureId);
    setBloques((p) => p.map((b) => (b.id === id ? { ...b, fixtureId, etiqueta: b.etiqueta || fx?.modelo || "" } : b)));
  };
  const aplicarSugerenciaExistente = (bloque, fx) => {
    const s = sugerirUbicacion(bloque.cantidad, fx?.canales, bloques, fixturesById, bloque.id);
    if (!s) return;
    updateBloque(bloque.id, { universo: s.universo, canalInicial: s.canalInicial });
    flash(`Reubicado en Universo ${s.universo}, canal ${s.canalInicial}.`);
  };

  // ── resolución de bloques: expansión, universos que abarca ──────────
  const bloquesResolved = useMemo(() => {
    return bloques.map((b) => {
      const fx = fixturesById[b.fixtureId];
      const individuos = expandBloque(b, fx);
      const universosAbarcados = [...new Set(individuos.map((i) => i.universo))].sort((a, x) => a - x);
      return { ...b, fixture: fx, individuos, universosAbarcados };
    });
  }, [bloques, fixturesById]);

  // ── expansión global a fixtures individuales + numeración continua
  // por etiqueta (no se reinicia entre bloques que comparten etiqueta) ─
  const individuales = useMemo(() => {
    const out = [];
    const contadores = {};
    bloquesResolved.forEach((b) => {
      const key = (b.etiqueta || b.fixture?.modelo || "").trim() || "(sin nombre)";
      b.individuos.forEach((ind) => {
        contadores[key] = (contadores[key] || 0) + 1;
        out.push({
          key: `${b.id}-${ind.index}`, bloqueId: b.id, fixtureId: b.fixtureId,
          nombre: `${key} ${contadores[key]}`,
          modo: b.fixture?.modo || "",
          universo: ind.universo, canalInicio: ind.canalInicio, canalFin: ind.canalFin,
        });
      });
    });
    return out;
  }, [bloquesResolved]);

  // ── traslape a nivel de canal individual (dos fixtures de bloques
  // distintos que comparten universo y se traslapan en canales) ──────
  const individualesConConflicto = useMemo(() => {
    return individuales.map((r) => {
      const conflicto = individuales.some((o) =>
        o.bloqueId !== r.bloqueId && o.universo === r.universo &&
        r.canalInicio <= o.canalFin && o.canalInicio <= r.canalFin
      );
      return { ...r, conflicto };
    });
  }, [individuales]);

  const bloquesConflicto = useMemo(() => {
    const s = new Set();
    individualesConConflicto.forEach((r) => { if (r.conflicto) s.add(r.bloqueId); });
    return s;
  }, [individualesConConflicto]);

  const universosUsados = useMemo(() => [...new Set(individuales.map((r) => r.universo))].sort((a, b) => a - b), [individuales]);

  const individualesFiltrados = useMemo(() => {
    return individualesConConflicto.filter((r) =>
      (filterModelos.length === 0 || filterModelos.includes(r.fixtureId)) &&
      (filterUniversos.length === 0 || filterUniversos.includes(r.universo))
    );
  }, [individualesConConflicto, filterModelos, filterUniversos]);

  const gruposPorUniverso = useMemo(() => {
    const map = new Map();
    individualesFiltrados.forEach((r) => {
      if (!map.has(r.universo)) map.set(r.universo, []);
      map.get(r.universo).push(r);
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([universo, rows]) => {
        const ordenadas = [...rows].sort((a, b) => a.canalInicio - b.canalInicio);
        const ocupado = new Array(UNIVERSE_SIZE + 1).fill(false);
        rows.forEach((r) => {
          const ini = Math.max(1, r.canalInicio), fin = Math.min(UNIVERSE_SIZE, r.canalFin);
          for (let c = ini; c <= fin; c++) ocupado[c] = true;
        });
        const usados = ocupado.filter(Boolean).length;
        return { universo, rows: ordenadas, usados, libres: UNIVERSE_SIZE - usados };
      });
  }, [individualesFiltrados]);

  // ── asistente por pasos para agregar un bloque nuevo ─────────────────
  const ultimoUniverso = bloques.length ? bloques[bloques.length - 1].universo : 1;
  const draftInicial = () => ({ fixtureId: "", cantidad: 1, universo: ultimoUniverso || 1, canalInicial: 1 });
  const [draft, setDraft] = useState(draftInicial);
  useEffect(() => { if (!draft.fixtureId && fixtures.length && bloques.length === 0) { /* nada, se elige a mano */ } }, []); // eslint-disable-line

  const draftFixture = fixturesById[draft.fixtureId];
  const draftFootprint = (Number(draft.cantidad) || 0) * (Number(draftFixture?.canales) || 0);

  const irACatalogoParaNuevoFixture = () => {
    addFixture();
    setInvCollapsed(false);
    flash("Fixture nuevo agregado abajo en el catálogo — complétalo y vuelve a elegirlo aquí.");
    setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const draftAutoCanal = () => {
    if (!draftFixture || draftFootprint <= 0) return;
    const s = sugerirUbicacion(draft.cantidad, draftFixture.canales, bloques, fixturesById, null);
    if (!s) return;
    setDraft((p) => ({ ...p, universo: s.universo, canalInicial: s.canalInicial }));
    flash(`Se ubicará a partir del Universo ${s.universo}, canal ${s.canalInicial} — así lo encuentras en el listado final.`);
  };
  const darDeAltaBloque = () => {
    if (!draft.fixtureId || draftFootprint <= 0) return;
    setBloques((p) => [...p, {
      id: genId("blk"), fixtureId: draft.fixtureId, etiqueta: draftFixture?.modelo || "",
      cantidad: Math.max(1, Number(draft.cantidad) || 1),
      universo: Math.max(1, Number(draft.universo) || 1),
      canalInicial: Math.max(1, Math.min(512, Number(draft.canalInicial) || 1)),
    }]);
    setDraft(draftInicial());
    flash("Bloque agregado.");
  };

  // ── borrado con confirmación ─────────────────────────────────────────
  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === "fixture") {
      setFixtures((p) => p.filter((f) => f.id !== id));
      setBloques((p) => p.filter((b) => b.fixtureId !== id));
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

  // ── proyectos guardados ──────────────────────────────────────────────
  const guardarProyectoActual = async () => {
    const name = (saveProjectNameInput || "").trim() || proyectoNombre || `Proyecto ${savedProjects.length + 1}`;
    const id = genId("proy");
    const snapshot = { id, name, proyectoNombre, fixtures, bloques, theme, savedAt: Date.now() };
    const indexEntry = { id, name, savedAt: snapshot.savedAt, numFixtures: fixtures.length, numBloques: bloques.length };
    try {
      await window.storage.set(PROJECT_KEY(id), JSON.stringify(snapshot), false);
      const newList = [...savedProjects, indexEntry];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false);
      setSavedProjects(newList);
      setSaveProjectNameInput("");
      setProjectMsg(`Guardado como "${name}".`);
    } catch { setProjectMsg("No se pudo guardar. Intenta de nuevo."); }
  };
  const cargarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      setProyectoNombre(s.proyectoNombre || "");
      setFixtures(s.fixtures || []);
      setBloques(s.bloques || []);
      setTheme(s.theme || theme);
      setFileBaseEditado(false);
      setDraft(draftInicial());
      setProjectMsg(`Cargado "${s.name}".`);
    } catch { setProjectMsg("No se pudo cargar ese proyecto."); }
  };
  const duplicarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      const newId = genId("proy");
      const copy = { ...s, id: newId, name: `${s.name} (copia)`, savedAt: Date.now() };
      await window.storage.set(PROJECT_KEY(newId), JSON.stringify(copy), false);
      const newList = [...savedProjects, { id: newId, name: copy.name, savedAt: copy.savedAt, numFixtures: (copy.fixtures || []).length, numBloques: (copy.bloques || []).length }];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false);
      setSavedProjects(newList);
      setProjectMsg(`Duplicado como "${copy.name}".`);
    } catch { setProjectMsg("No se pudo duplicar ese proyecto."); }
  };

  // ── export / import ──────────────────────────────────────────────────
  const exportJSON = () => {
    jsonDownload(`${fileBaseName}.json`, { app: "lightXtool DireccionamientoDMX", exportedAt: new Date().toISOString(), proyectoNombre, fixtures, bloques });
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
        setProyectoNombre(s.proyectoNombre || "");
        setFixtures(s.fixtures || []);
        setBloques(s.bloques || []);
        setDraft(draftInicial());
        flash("Proyecto importado desde archivo.");
      } catch { flash("Archivo inválido, no se pudo importar."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  const exportPDF = () => {
    const prev = document.title;
    document.title = fileBaseName;
    window.print();
    setTimeout(() => { document.title = prev; }, 600);
  };
  const exportExcel = () => {
    const colsUniverso = ["Fixture", "Modo", "Canal inicio", "Canal fin", "Conflicto"];
    const colsTodos = ["Fixture", "Modo", "Universo", "Canal inicio", "Canal fin", "Conflicto"];
    const rowUniverso = (r) => [r.nombre, r.modo, r.canalInicio, r.canalFin, r.conflicto ? "SI" : "NO"];
    const rowTodos = (r) => [r.nombre, r.modo, r.universo, r.canalInicio, r.canalFin, r.conflicto ? "SI" : "NO"];
    const sheets = gruposPorUniverso.map((g) => ({
      name: `Universo ${g.universo}`,
      rows: [colsUniverso, ...g.rows.map(rowUniverso)],
    }));
    sheets.push({ name: "Todos", rows: [colsTodos, ...individualesConConflicto.map(rowTodos)] }); // sin filtrar, por spec
    xlsxDownloadMulti(`${fileBaseName}.xlsx`, sheets);
  };

  const toggleFilterModelo = (fixtureId) =>
    setFilterModelos((p) => (p.includes(fixtureId) ? p.filter((x) => x !== fixtureId) : [...p, fixtureId]));
  const toggleFilterUniverso = (u) =>
    setFilterUniversos((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));

  const hayConflictos = bloquesConflicto.size > 0;

  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; color: #000 !important; background: #fff !important; padding: 20px; font-family: ${FONT}; }
          .print-only table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .print-only th, .print-only td { border: 1px solid #999; padding: 4px 7px; font-size: 11px; text-align: left; }
          .print-only h1 { font-size: 18px; margin: 0 0 10px; }
          .print-only h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
          .print-only tr.conflicto { background: #ffdede !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print" style={{ padding: "16px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Radio size={18} style={{ color: C.cyan }} />
                <h1 style={{ fontSize: "18px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}, 0 0 28px rgba(0,160,250,.35)`) }}>
                  DIRECCIONAMIENTO DMX
                </h1>
              </div>
              <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
                Catálogo de fixtures → bloques de patch → direccionamiento por universo (512 canales).
              </p>
              {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={btnStyle()} title="Cambiar tema (solo afecta esta herramienta)">
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? "Modo claro" : "Modo oscuro"}
              </button>
              <button onClick={() => setShowHelp(true)} style={btnStyle()}><HelpCircle size={14} /> Ayuda</button>
            </div>
          </div>

          <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

          {hayConflictos && (
            <div style={{ ...panelStyle, padding: "10px 12px", border: `1px solid ${C.red}`, background: C.redBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={14} style={{ color: C.red }} />
                <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>
                  Hay bloques con traslape de canales — cada uno trae su sugerencia de reubicación en "Bloques de patch".
                </span>
              </div>
            </div>
          )}

          {/* Datos del proyecto */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FileText} title="Datos del proyecto" />
            <div style={{ marginTop: "8px" }}>
              <div style={labelStyle}>Nombre del proyecto</div>
              <input style={{ ...inputStyle, width: "100%", maxWidth: "360px", marginTop: "4px" }} value={proyectoNombre}
                onChange={(e) => setProyectoNombre(e.target.value)} placeholder="Ej. Festival XYZ" />
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
              <button style={bloques.length === 0 ? btnStyleDisabled("primary") : btnStyle("primary")} onClick={exportExcel} disabled={bloques.length === 0} title="Una hoja por universo + hoja 'Todos' sin filtrar">
                <FileSpreadsheet size={14} /> Exportar Excel
              </button>
              <button style={bloques.length === 0 ? btnStyleDisabled() : btnStyle()} onClick={exportPDF} disabled={bloques.length === 0} title="Abre el diálogo de impresión — respeta el filtro activo en pantalla">
                <Printer size={14} /> Exportar PDF
              </button>
              <button style={btnStyle()} onClick={exportJSON}><Download size={14} /> Respaldo (.json)</button>
              <button style={btnStyle()} onClick={triggerImport}><Upload size={14} /> Importar (.json)</button>
              <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} style={{ display: "none" }} />
            </div>
          </div>

          {/* Proyectos guardados */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FolderOpen} title="Proyectos guardados" subtitle={`${savedProjects.length} proyecto(s)`} />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "4px" }}>Se guarda solo en tu sesión (no es compartido).</p>
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
                      {["Nombre", "Fixtures", "Bloques", ""].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {savedProjects.map((p) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{p.name}</td>
                        <td style={tdStyle}>{p.numFixtures}</td>
                        <td style={tdStyle}>{p.numBloques}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                            <button onClick={() => cargarProyecto(p.id)} title="Cargar" style={{ background: "none", border: "none", color: C.cyan, cursor: "pointer" }}><FolderOpen size={15} /></button>
                            <button onClick={() => duplicarProyecto(p.id)} title="Duplicar" style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer" }}>⧉</button>
                            <button onClick={() => setPendingDelete({ type: "proyecto", id: p.id, label: p.name })} title="Eliminar" style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Catálogo de fixtures */}
          <div ref={catalogRef} style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Layers} title="Catálogo de fixtures" subtitle={`${fixtures.length} tipo(s)`}
              right={
                <div style={{ display: "flex", gap: "6px" }}>
                  <button style={btnStyle("primary")} onClick={addFixture}><Plus size={14} /> Agregar fixture</button>
                  <button style={btnStyle()} onClick={() => setInvCollapsed((v) => !v)} title={invCollapsed ? "Expandir" : "Colapsar"}>
                    {invCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              }
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Modelo (texto), modo (opcional) y número de canales (1–512). Sin valores precargados por marca — todo nace vacío.
            </p>
            {!invCollapsed && (
              fixtures.length === 0 ? (
                <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin fixtures. Agrega el primero para empezar.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Modelo", "Modo (opcional)", "Canales", "Usado en", ""].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {fixtures.map((f) => (
                        <tr key={f.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                          <td style={tdStyle}>
                            <input style={{ ...inputStyle, width: "160px" }} value={f.modelo}
                              onChange={(e) => updateFixture(f.id, { modelo: e.target.value })} placeholder="Ej. PAR LED RGBW" />
                          </td>
                          <td style={tdStyle}>
                            <input style={{ ...inputStyle, width: "130px" }} value={f.modo}
                              onChange={(e) => updateFixture(f.id, { modo: e.target.value })} placeholder="Ej. Modo 8ch" />
                          </td>
                          <td style={tdStyle}>
                            <NumberField min={1} max={512} style={{ ...inputStyle, width: "60px" }} value={f.canales}
                              onCommit={(n) => updateFixture(f.id, { canales: Math.max(1, Math.min(512, n)) })} />
                          </td>
                          <td style={tdStyle}>{bloquesDeFixture(f.id)} bloque(s)</td>
                          <td style={tdStyle}>
                            <button onClick={() => requestRemoveFixture(f.id, f.modelo)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Asistente: agregar bloque por pasos */}
          <div style={{ ...panelStyle, padding: "12px", border: `1px solid ${C.cyanLight}` }}>
            <SectionHeader icon={Wand2} title="Agregar bloque" subtitle="paso a paso" />
            {fixtures.length === 0 ? (
              <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Da de alta al menos un fixture en el catálogo primero.</p>
            ) : (
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Paso 1: fixture */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={labelStyle}>1. Fixture</span>
                  <select style={{ ...selectStyle, width: "200px" }} value={draft.fixtureId}
                    onChange={(e) => setDraft((p) => ({ ...p, fixtureId: e.target.value }))}>
                    <option value="">Elegir fixture…</option>
                    {fixtures.map((f) => <option key={f.id} value={f.id}>{f.modelo || "(sin nombre)"} {f.canales ? `· ${f.canales}ch` : ""}</option>)}
                  </select>
                  <button style={btnStyle()} onClick={irACatalogoParaNuevoFixture}><Plus size={12} /> Nuevo fixture</button>
                </div>

                {/* Paso 2: cantidad / universo / canal */}
                {draft.fixtureId && (
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={labelStyle}>2. Cantidad, universo y canal</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "10px", color: C.textFaint }}>cant.</span>
                      <NumberField min={1} style={{ ...inputStyle, width: "50px" }} value={draft.cantidad} onCommit={(n) => setDraft((p) => ({ ...p, cantidad: Math.max(1, n) }))} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "10px", color: C.textFaint }}>univ.</span>
                      <NumberField min={1} style={{ ...inputStyle, width: "50px" }} value={draft.universo} onCommit={(n) => setDraft((p) => ({ ...p, universo: Math.max(1, n) }))} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "10px", color: C.textFaint }}>canal ini.</span>
                      <NumberField min={1} max={512} style={{ ...inputStyle, width: "56px" }} value={draft.canalInicial} onCommit={(n) => setDraft((p) => ({ ...p, canalInicial: Math.max(1, Math.min(512, n)) }))} />
                    </div>
                    <button style={btnStyle()} onClick={draftAutoCanal} disabled={draftFootprint <= 0} title="Buscar el primer hueco libre para este bloque">
                      <Wand2 size={12} /> Auto canal
                    </button>
                    {draftFootprint > 512 && (
                      <span style={{ fontSize: "10px", color: C.textFaint }}>
                        Ocupa {draftFootprint} canales — se repartirá solo entre {Math.ceil(draftFootprint / 512)} universos.
                      </span>
                    )}
                  </div>
                )}

                {/* Paso 3: dar de alta */}
                {draft.fixtureId && (
                  <div>
                    <button
                      style={draftFootprint > 0 ? btnStyle("primary") : btnStyleDisabled("primary")}
                      onClick={darDeAltaBloque}
                      disabled={draftFootprint <= 0}
                    >
                      <CheckCircle2 size={14} /> Dar de alta este bloque
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bloques ya agregados */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Radio} title="Bloques de patch" subtitle={`${bloques.length} bloque(s)`} />
            {bloques.length === 0 && <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin bloques aún — usa el asistente de arriba.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
              {bloquesResolved.map((b, idx) => {
                const enConflicto = bloquesConflicto.has(b.id);
                const abarcaVarios = b.universosAbarcados.length > 1;
                const sugerencia = enConflicto ? sugerirUbicacion(b.cantidad, b.fixture?.canales, bloques, fixturesById, b.id) : null;
                return (
                  <div key={b.id} style={{
                    background: theme === "dark" ? "rgba(255,255,255,.02)" : C.panelAlt,
                    border: `1px solid ${enConflicto ? C.red : C.border}`,
                    borderRadius: "5px", padding: "10px",
                  }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <button onClick={() => moveBloque(b.id, -1)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? C.textFaint : C.textDim, cursor: idx === 0 ? "default" : "pointer", padding: 0 }}><ArrowUp size={13} /></button>
                        <button onClick={() => moveBloque(b.id, 1)} disabled={idx === bloquesResolved.length - 1} style={{ background: "none", border: "none", color: idx === bloquesResolved.length - 1 ? C.textFaint : C.textDim, cursor: idx === bloquesResolved.length - 1 ? "default" : "pointer", padding: 0 }}><ArrowDown size={13} /></button>
                      </div>
                      <select style={{ ...selectStyle, width: "160px" }} value={b.fixtureId} onChange={(e) => onFixtureChangeInBloque(b.id, e.target.value)}>
                        {fixtures.map((f) => <option key={f.id} value={f.id}>{f.modelo || "(sin nombre)"} {f.canales ? `· ${f.canales}ch` : ""}</option>)}
                      </select>
                      <input style={{ ...inputStyle, width: "130px" }} value={b.etiqueta} placeholder="Etiqueta"
                        onChange={(e) => updateBloque(b.id, { etiqueta: e.target.value })} />
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "10px", color: C.textFaint }}>cant.</span>
                        <NumberField min={1} style={{ ...inputStyle, width: "50px" }} value={b.cantidad} onCommit={(n) => updateBloque(b.id, { cantidad: Math.max(1, n) })} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "10px", color: C.textFaint }}>univ.</span>
                        <NumberField min={1} style={{ ...inputStyle, width: "50px" }} value={b.universo} onCommit={(n) => updateBloque(b.id, { universo: Math.max(1, n) })} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "10px", color: C.textFaint }}>canal ini.</span>
                        <NumberField min={1} max={512} style={{ ...inputStyle, width: "56px" }} value={b.canalInicial} onCommit={(n) => updateBloque(b.id, { canalInicial: Math.max(1, Math.min(512, n)) })} />
                      </div>
                      <button style={btnStyle()} onClick={() => aplicarSugerenciaExistente(b, b.fixture)} title="Reubicar en el primer hueco libre disponible"><Wand2 size={12} /> Auto canal</button>
                      <button onClick={() => removeBloque(b.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", marginLeft: "auto" }}><Trash2 size={14} /></button>
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "10px", color: C.textFaint, display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <span>Ocupa {b.individuos.length ? b.individuos.length * (b.fixture?.canales || 0) : 0} canal(es) en total.</span>
                      {abarcaVarios && (
                        <span style={{ color: C.cyan }}>
                          Se reparte automáticamente en universos {b.universosAbarcados.join(", ")}.
                        </span>
                      )}
                    </div>

                    {enConflicto && sugerencia && (
                      <div style={{ marginTop: "6px", padding: "6px 8px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: "4px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <AlertTriangle size={12} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: "10px", color: C.red }}>
                          Traslape con otro bloque. Sugerencia: Universo {sugerencia.universo}, canal {sugerencia.canalInicial}.
                        </span>
                        <button style={{ ...btnStyle("danger"), padding: "3px 8px", fontSize: "10px" }} onClick={() => updateBloque(b.id, { universo: sugerencia.universo, canalInicial: sugerencia.canalInicial })}>
                          Usar sugerencia
                        </button>
                        <span style={{ fontSize: "9px", color: C.textFaint }}>o edita universo/canal arriba directamente.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Listado / filtros / exportación */}
          <div style={{ ...panelStyle, padding: "12px", border: `1px solid ${C.cyanLight}`, ...glowBox("rgba(0,160,250,.15)") }}>
            <SectionHeader icon={Info} title="Listado por universo" subtitle={`${individuales.length} fixture(s) direccionado(s)`} />

            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "10px" }}>
              {fixtures.length > 0 && (
                <div>
                  <div style={labelStyle}>Filtrar por modelo</div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                    {fixtures.map((f) => {
                      const sel = filterModelos.includes(f.id);
                      return (
                        <button key={f.id} onClick={() => toggleFilterModelo(f.id)} style={{
                          padding: "3px 8px", borderRadius: "12px", cursor: "pointer", fontSize: "10px", fontFamily: FONT,
                          background: sel ? C.cyan : "transparent", color: sel ? "#fff" : C.textDim,
                          border: `1px solid ${sel ? C.cyan : C.border}`, fontWeight: sel ? 700 : 500,
                        }}>{f.modelo || "(sin nombre)"}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {universosUsados.length > 0 && (
                <div>
                  <div style={labelStyle}>Filtrar por universo</div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                    {universosUsados.map((u) => {
                      const sel = filterUniversos.includes(u);
                      return (
                        <button key={u} onClick={() => toggleFilterUniverso(u)} style={{
                          padding: "3px 8px", borderRadius: "12px", cursor: "pointer", fontSize: "10px", fontFamily: FONT,
                          background: sel ? C.cyan : "transparent", color: sel ? "#fff" : C.textDim,
                          border: `1px solid ${sel ? C.cyan : C.border}`, fontWeight: sel ? 700 : 500,
                        }}>Universo {u}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {(filterModelos.length > 0 || filterUniversos.length > 0) && (
                <button style={{ ...btnStyle(), alignSelf: "flex-end" }} onClick={() => { setFilterModelos([]); setFilterUniversos([]); }}>
                  <X size={12} /> Limpiar filtros
                </button>
              )}
            </div>

            {gruposPorUniverso.length === 0 ? (
              <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "12px" }}>Sin fixtures direccionados aún (o el filtro no coincide con nada).</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
                {gruposPorUniverso.map((g) => (
                  <div key={g.universo}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: C.cyan, fontWeight: 700 }}>Universo {g.universo}</span>
                      <span style={{ fontSize: "10px", color: C.textFaint }}>{g.usados}/{UNIVERSE_SIZE} usados · {g.libres} libres</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            {["Fixture", "Modo", "Canal inicio", "Canal fin"].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.key} style={{ borderBottom: `1px solid ${C.panelAlt}`, backgroundColor: r.conflicto ? C.redBg : "transparent" }}>
                              <td style={tdStyle}>{r.conflicto ? "⚠ " : ""}{r.nombre}</td>
                              <td style={tdStyle}>{r.modo || "-"}</td>
                              <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700 }}>{r.canalInicio}</td>
                              <td style={{ ...tdStyle, color: r.canalFin > UNIVERSE_SIZE ? C.red : C.cyan, fontWeight: 700 }}>{r.canalFin}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fuera de alcance */}
          <div style={{ ...panelStyle, padding: "12px", background: C.panelAlt }}>
            <p style={{ fontSize: "10px", color: C.textFaint, lineHeight: 1.6 }}>
              No verifica compatibilidad de protocolo (Art-Net/sACN/DMX físico) ni límites de nodos/splitters —
              solo direccionamiento lógico de canales. No valida que el número de canales capturado corresponda
              realmente al modo del fixture — el usuario es responsable del dato de placa/manual.
            </p>
          </div>

        </div>
      </div>

      {/* Ayuda */}
      {showHelp && (
        <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 998, padding: "16px" }}
          onClick={() => setShowHelp(false)}>
          <div style={{ ...panelStyle, maxWidth: "480px", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "16px", boxShadow: "0 8px 40px rgba(0,0,0,.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
              <h2 style={{ fontSize: "14px", color: C.cyan, letterSpacing: "1.5px", margin: 0, fontWeight: 700, ...glowText(`${C.cyan}`) }}>CÓMO FUNCIONA</h2>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><X size={18} /></button>
            </div>
            {[
              { icon: Layers, title: "Fixtures", body: "Da de alta cada tipo de fixture (modelo, modo opcional, número de canales). Sin valores precargados por marca." },
              { icon: Wand2, title: "Agregar bloque (paso a paso)", body: "1) Elige el fixture (o crea uno nuevo desde el mismo paso). 2) Indica cantidad, universo y canal — \"Auto canal\" busca el primer hueco libre y te avisa en qué universo/canal quedará. 3) \"Dar de alta\" crea el bloque." },
              { icon: AlertTriangle, title: "Traslape", body: "Si un bloque choca con otro, aparece la sugerencia de reubicación directo en su fila, con un botón para aplicarla. También puedes editar universo/canal a mano; si sigue en conflicto, la advertencia se actualiza sola." },
              { icon: Radio, title: "Bloques grandes (>512 canales)", body: "Si un bloque no cabe en un solo universo, se reparte automáticamente entre el siguiente universo (y el que siga) sin que tengas que dividirlo a mano." },
              { icon: BookOpen, title: "Listado y exportación", body: "Agrupado por universo (ascendente) y canal. Filtra por modelo o universo antes de exportar a Excel (una hoja por universo + hoja \"Todos\" sin filtrar) o PDF (respeta el filtro en pantalla)." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} style={{ display: "flex", gap: "10px", padding: "9px 0", borderTop: `1px solid ${C.panelAlt}` }}>
                <Icon size={16} style={{ color: C.cyan, flexShrink: 0, marginTop: "1px" }} />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: C.text, marginBottom: "2px" }}>{title}</div>
                  <div style={{ fontSize: "11px", color: C.textDim, lineHeight: 1.55 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div className="no-print" style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999, background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw", flexWrap: "wrap" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px", color: C.text }}>¿Eliminar {pendingDelete.label}? No se puede deshacer.</span>
          <button onClick={confirmPendingDelete} style={btnStyle("danger")}>Eliminar</button>
          <button onClick={() => setPendingDelete(null)} style={btnStyle()}><X size={13} /> Cancelar</button>
        </div>
      )}

      {/* Vista de impresión (PDF): solo título del proyecto + tablas */}
      <div className="print-only">
        <h1>{proyectoNombre || "Direccionamiento DMX"}</h1>
        {gruposPorUniverso.map((g) => (
          <div key={g.universo}>
            <h2>Universo {g.universo} — {g.usados}/{UNIVERSE_SIZE} usados, {g.libres} libres</h2>
            <table>
              <thead><tr><th>Fixture</th><th>Modo</th><th>Canal inicio</th><th>Canal fin</th></tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.key} className={r.conflicto ? "conflicto" : ""}>
                    <td>{r.conflicto ? "⚠ " : ""}{r.nombre}</td>
                    <td>{r.modo || "-"}</td>
                    <td>{r.canalInicio}</td>
                    <td>{r.canalFin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
