import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Sun, Moon, Save, FolderOpen, Copy, Download, Upload,
  AlertTriangle, GripVertical, Clock, Users, Tag, Palette, Printer,
  FileText, ChevronDown, ChevronUp, CheckSquare, Square, X, Filter,
  ArrowLeft, ArrowUp, ArrowDown, Calendar, User, SlidersHorizontal, HelpCircle,
} from "lucide-react";

// ── identidad lightXtool: paleta dark/light AA, DEFAULT = claro ────────
const PALETTES = {
  light: {
    page: "#F5F5F5", panel: "#FFFFFF", panelAlt: "#F0F0F0",
    border: "rgba(0,160,250,0.28)", borderStrong: "rgba(0,160,250,0.5)",
    text: "#000000", textDim: "#3A3A3A", textFaint: "#6B6B6B",
    cyan: "#026B96", cyanLight: "#00A0FA", red: "#C81414", redBg: "#FFE5E5",
    glow: false,
  },
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", borderStrong: "rgba(0,160,250,0.45)",
    text: "#FFFFFF", textDim: "rgba(255,255,255,0.62)", textFaint: "rgba(255,255,255,0.34)",
    cyan: "#00A0FA", cyanLight: "#40A2FC", red: "#FF1D1D", redBg: "rgba(255,29,29,0.12)",
    glow: true,
  },
};
const FONT = "ui-monospace,'JetBrains Mono','Fira Code','Courier New',monospace";

// ── biblioteca de colores de TARJETAS — independiente del manual de identidad ─
const CARD_COLORS = [
  { hex: "#E53935", name: "Rojo" },
  { hex: "#FB8C00", name: "Naranja" },
  { hex: "#FDD835", name: "Amarillo" },
  { hex: "#43A047", name: "Verde" },
  { hex: "#00897B", name: "Verde azulado" },
  { hex: "#3949AB", name: "Índigo" },
  { hex: "#8E24AA", name: "Violeta" },
  { hex: "#D81B60", name: "Magenta" },
];
const colorName = (hex) =>
  CARD_COLORS.find((c) => c.hex.toLowerCase() === (hex || "").toLowerCase())?.name || null;

// ── densidad de la vista en vivo (3 niveles fijos) ──────────────────────
const DENSITY = {
  compacta: { pad: "7px 10px", stripW: "22px", checkSize: 18, titleSize: "13px", metaSize: "10px", pillSize: "9px", gap: "5px", cardGap: "5px", sectionPad: "6px 0 0", dividerMargin: "6px 0 0" },
  comoda:   { pad: "11px 13px", stripW: "28px", checkSize: 22, titleSize: "15px", metaSize: "11px", pillSize: "10px", gap: "7px", cardGap: "9px", sectionPad: "9px 0 0", dividerMargin: "9px 0 0" },
  amplia:   { pad: "15px 17px", stripW: "34px", checkSize: 27, titleSize: "17px", metaSize: "12.5px", pillSize: "11px", gap: "9px", cardGap: "13px", sectionPad: "12px 0 0", dividerMargin: "12px 0 0" },
};
const DENSITY_LABELS = [["compacta", "Compacta"], ["comoda", "Cómoda"], ["amplia", "Amplia"]];

// ── utilidades ─────────────────────────────────────────────────────────
const genId = (p) =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `${p}-${crypto.randomUUID()}`
    : `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sanitizeFileName = (s) =>
  (s || "").trim().replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "evento";

const CURRENT_KEY = "escaletaTecnica:actual:v1";
const PROJECTS_INDEX_KEY = "escaletaTecnica:proyectos:index:v1";
const PROJECT_KEY = (id) => `escaletaTecnica:proyecto:v1:${id}`;

// ── tiempo ─────────────────────────────────────────────────────────────
function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function minutesToTimeLabel(mins) {
  if (mins === null || mins === undefined || Number.isNaN(mins)) return null;
  const dayOffset = Math.floor(mins / 1440);
  const norm = ((mins % 1440) + 1440) % 1440;
  const h = String(Math.floor(norm / 60)).padStart(2, "0");
  const m = String(Math.floor(norm % 60)).padStart(2, "0");
  return `${h}:${m}${dayOffset > 0 ? ` (+${dayOffset}d)` : ""}`;
}
function fmtDuracion(mins) {
  const n = Math.max(0, Number(mins) || 0);
  const h = Math.floor(n / 60), m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}min`;
}

// ── filtros combinados: AND entre categoría (roster/etiquetas), OR dentro ──
function matchesFilters(m, rosterFilterIds, tagFilterIds) {
  const rOk = rosterFilterIds.length === 0 || (m.rosterIds || []).some((id) => rosterFilterIds.includes(id));
  const tOk = tagFilterIds.length === 0 || (m.tagIds || []).some((id) => tagFilterIds.includes(id));
  return rOk && tOk;
}

// ── NumberField: texto libre mientras se escribe, límites al salir ─────
function NumberField({ value, onCommit, min = 0, style, ...rest }) {
  const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(Math.round(v)));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value)); }, [value]); // eslint-disable-line
  return (
    <input
      type="text" inputMode="numeric" value={text} style={style}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^\d*$/.test(raw)) return;
        setText(raw);
        if (raw !== "" && !Number.isNaN(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        let n = Number(text);
        if (text === "" || Number.isNaN(n)) n = min;
        n = Math.max(min, n);
        setText(fmt(n));
        onCommit(n);
      }}
      {...rest}
    />
  );
}

// ── ColorPicker inline (8 swatches + colorpicker discreto) ────────────
function ColorPicker({ value, onChange, C }) {
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={() => onChange("")}
        title="Sin color"
        style={{
          width: "18px", height: "18px", borderRadius: "3px",
          background: "transparent", cursor: "pointer",
          border: !value ? `2px solid ${C.text}` : `1px dashed ${C.textFaint}`,
        }}
      />
      {CARD_COLORS.map((c) => (
        <button
          key={c.hex}
          onClick={() => onChange(c.hex)}
          title={c.name}
          style={{
            width: "18px", height: "18px", borderRadius: "3px",
            background: c.hex, cursor: "pointer",
            border: value === c.hex ? `2px solid ${C.text}` : "1px solid rgba(0,0,0,.2)",
          }}
        />
      ))}
      <input
        type="color"
        value={value || "#888888"}
        onChange={(e) => onChange(e.target.value)}
        title="Color personalizado"
        style={{
          width: "18px", height: "18px", padding: 0,
          border: "1px solid rgba(0,0,0,.2)", borderRadius: "3px", cursor: "pointer",
        }}
      />
    </div>
  );
}

// ── ItemPicker: selector/creador reutilizable para Involucrados y Etiquetas.
// Muestra primero la opción de crear (si el texto no coincide con nada
// existente) y debajo el listado completo en orden alfabético como toggles.
// El menú flota con position:fixed (no depende del overflow de ningún
// contenedor padre) y su altura máxima siempre deja scroll visible cuando
// hay más elementos de los que caben. Se cierra solo al hacer clic fuera o
// al presionar Escape. La edición/renombrado y el borrado de items viven en
// su sección dedicada, no aquí — esto solo asigna/crea. ──────────────────
function ItemPicker({ items, selectedIds, onToggle, onCreate, C, label, placeholder, variant = "solid" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  // Calcula la posición del menú relativa a la ventana (no al padre) cada
  // vez que se abre, para que ningún overflow:hidden de una tarjeta lo
  // recorte. Se reubica también si la ventana hace scroll o resize mientras
  // está abierto.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuMaxHeight = 260;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < menuMaxHeight && r.top > spaceBelow;
      setMenuPos({
        left: Math.min(r.left, window.innerWidth - 240 - 8),
        top: openUpward ? undefined : r.bottom + 4,
        bottom: openUpward ? window.innerHeight - r.top + 4 : undefined,
        maxHeight: menuMaxHeight,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.label || "").localeCompare(b.label || "", "es", { sensitivity: "base" })),
    [items]
  );
  const filtered = query.trim()
    ? sorted.filter((it) => (it.label || "").toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;
  const exactMatch = sorted.some((it) => (it.label || "").toLowerCase() === query.trim().toLowerCase());

  const handleCreate = () => {
    const val = query.trim();
    if (!val || exactMatch) return;
    onCreate(val);
    setQuery("");
  };

  const selectedItems = items.filter((it) => selectedIds.includes(it.id));
  const chipStyle = variant === "outline"
    ? { background: "transparent", border: `1px solid ${C.cyan}`, color: C.cyan }
    : { background: C.cyan, border: `1px solid ${C.cyan}`, color: "#fff" };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
        {selectedItems.map((it) => (
          <span key={it.id} style={{
            fontSize: "10px", padding: "2px 6px 2px 8px", borderRadius: "10px", fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: "4px", ...chipStyle,
          }}>
            {it.label}
            <X size={10} style={{ cursor: "pointer" }} onClick={() => onToggle(it.id)} />
          </span>
        ))}
        <button ref={triggerRef} onClick={() => setOpen((v) => !v)} style={{
          fontSize: "10px", padding: "2px 8px", borderRadius: "10px", cursor: "pointer",
          background: "transparent", border: `1px dashed ${C.border}`, color: C.textDim,
          display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: FONT,
        }}>
          <Plus size={11} /> {label}
        </button>
      </div>

      {open && menuPos && (
        <div style={{
          position: "fixed", zIndex: 300, left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom,
          width: "230px", maxHeight: menuPos.maxHeight, display: "flex", flexDirection: "column",
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: "6px",
          padding: "8px", boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder={placeholder}
            style={{
              width: "100%", fontSize: "11px", fontFamily: FONT, padding: "5px 7px",
              borderRadius: "3px", border: `1px solid ${C.border}`,
              background: "transparent", color: C.text, outline: "none", boxSizing: "border-box",
              flexShrink: 0,
            }}
          />
          {query.trim() && !exactMatch && (
            <button onClick={handleCreate} style={{
              width: "100%", textAlign: "left", marginTop: "6px", fontSize: "11px", fontFamily: FONT,
              padding: "5px 7px", borderRadius: "3px", cursor: "pointer", flexShrink: 0,
              background: "transparent", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700,
            }}>
              + Crear "{query.trim()}"
            </button>
          )}
          <div style={{ overflowY: "auto", marginTop: "6px", display: "flex", flexDirection: "column", gap: "1px" }}>
            {filtered.length === 0 && (
              <span style={{ fontSize: "10px", color: C.textFaint, padding: "4px" }}>
                {items.length === 0 ? "Sin elementos aún." : "Sin coincidencias."}
              </span>
            )}
            {filtered.map((it) => {
              const sel = selectedIds.includes(it.id);
              return (
                <button key={it.id} onClick={() => onToggle(it.id)} style={{
                  display: "flex", alignItems: "center", gap: "6px", textAlign: "left",
                  fontSize: "11px", fontFamily: FONT, padding: "5px 7px", borderRadius: "3px", cursor: "pointer",
                  background: sel ? `${C.cyan}22` : "transparent", border: "none", color: C.text, flexShrink: 0,
                }}>
                  {sel ? <CheckSquare size={13} style={{ color: C.cyan, flexShrink: 0 }} /> : <Square size={13} style={{ color: C.textFaint, flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label || "(sin nombre)"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FilterGroup: bloque de checkboxes para filtrar por roster o etiquetas,
// reutilizado en el panel de exportación y en el panel de la vista en vivo ─
function FilterGroup({ icon: Icon, title, items, selectedIds, onToggle, C, emptyLabel }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
        <Icon size={12} style={{ color: C.textDim }} />
        <span style={{ fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: FONT, fontWeight: 700 }}>{title}</span>
      </div>
      {items.length === 0
        ? <p style={{ fontSize: "10px", color: C.textFaint, margin: 0 }}>{emptyLabel}</p>
        : items.map((it) => (
          <label key={it.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", marginBottom: "4px" }}>
            <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => onToggle(it.id)} />
            {it.label || "(sin nombre)"}
          </label>
        ))
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function EscaletaTecnica() {
  const [theme, setTheme] = useState("light");
  const C = PALETTES[theme];

  // ── estado principal ───────────────────────────────────────────────
  const [eventInfo, setEventInfo] = useState({ nombre: "", fecha: "", horaInicio: "" });
  const [momentos, setMomentos] = useState([]);
  const [roster, setRoster] = useState([]); // [{id, label}] — involucrados
  const [tags, setTags] = useState([]); // [{id, label}] — etiquetas, solo para filtrar (no se exportan)
  const [legend, setLegend] = useState([]); // [{hex, label}] — significado del color de tarjeta
  const [expandedCards, setExpandedCards] = useState({}); // id -> bool
  const [checklist, setChecklist] = useState({}); // id -> bool (estado en vista en vivo)

  // ── opciones de exportación ────────────────────────────────────────
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeColor, setIncludeColor] = useState(true);
  const [orientation, setOrientation] = useState("vertical");
  const [filterInvolucrados, setFilterInvolucrados] = useState([]); // ids de roster para exportar
  const [filterTags, setFilterTags] = useState([]); // ids de etiquetas para exportar

  // ── vistas ────────────────────────────────────────────────────────
  const [view, setView] = useState("editor"); // "editor" | "live"
  const [liveFilterRoster, setLiveFilterRoster] = useState([]);
  const [liveFilterTags, setLiveFilterTags] = useState([]);
  const [showLiveFilter, setShowLiveFilter] = useState(false);
  const [liveDensity, setLiveDensity] = useState("comoda");

  // ── misc ──────────────────────────────────────────────────────────
  const [msg, setMsg] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [savedProjects, setSavedProjects] = useState([]);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [projectMsg, setProjectMsg] = useState("");
  const [fileBaseName, setFileBaseName] = useState("");
  const [fileBaseEditado, setFileBaseEditado] = useState(false);
  const fileInputRef = useRef(null);
  const loaded = useRef(false);
  const cardRefs = useRef({});
  const dragState = useRef(null);
  const [dragId, setDragId] = useState(null);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  useEffect(() => {
    if (!fileBaseEditado)
      setFileBaseName(sanitizeFileName(`LXT-Escaleta_${eventInfo.nombre || "Evento"}`));
  }, [eventInfo.nombre, fileBaseEditado]);

  // ── carga inicial ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(CURRENT_KEY, false);
        if (res) {
          const s = JSON.parse(res.value);
          setEventInfo(s.eventInfo || { nombre: "", fecha: "", horaInicio: "" });
          setMomentos(s.momentos || []);
          setRoster(s.roster || []);
          setTags(s.tags || []);
          setLegend(s.legend || []);
          setIncludeSchedule(s.includeSchedule ?? true);
          setIncludeColor(s.includeColor ?? true);
          setOrientation(s.orientation || "vertical");
          setTheme(s.theme || "light");
        }
      } catch { /* sin datos previos */ }
      finally { loaded.current = true; }
    })();
    (async () => {
      try {
        const res = await window.storage.get(PROJECTS_INDEX_KEY, false);
        setSavedProjects(res ? JSON.parse(res.value) : []);
      } catch { setSavedProjects([]); }
    })();
    (async () => {
      try {
        const res = await window.storage.get("escaletaTecnica:onboarding:seen:v1", false);
        if (!res) {
          setShowHelp(true);
          await window.storage.set("escaletaTecnica:onboarding:seen:v1", "1", false);
        }
      } catch { /* si falla el storage, no forzamos el modal en el primer uso */ }
    })();
  }, []);

  // ── autoguardado ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage
        .set(CURRENT_KEY, JSON.stringify({
          eventInfo, momentos, roster, tags, legend,
          includeSchedule, includeColor, orientation, theme,
        }), false)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [eventInfo, momentos, roster, tags, legend, includeSchedule, includeColor, orientation, theme]);

  // ── cascada de horarios ────────────────────────────────────────────
  const momentosResolved = useMemo(() => {
    let current = timeToMinutes(eventInfo.horaInicio);
    return momentos.map((mo) => {
      const horaInicioMin = current;
      if (current !== null) current += Math.max(0, Number(mo.duracionMin) || 0);
      return { ...mo, horaInicioMin, horaLabel: minutesToTimeLabel(horaInicioMin) };
    });
  }, [momentos, eventInfo.horaInicio]);

  const totalDuracion = useMemo(
    () => momentos.reduce((s, m) => s + (Number(m.duracionMin) || 0), 0),
    [momentos]
  );

  const legendUsada = useMemo(() => {
    const usedHex = new Set(momentos.map((m) => m.color).filter(Boolean));
    return legend.filter((l) => usedHex.has(l.hex));
  }, [legend, momentos]);

  // ── CRUD momentos ──────────────────────────────────────────────────
  const addMomento = () => {
    const id = genId("mom");
    setMomentos((p) => [...p, {
      id, nombre: "", duracionMin: 15,
      notas: "", rosterIds: [], tagIds: [],
      color: "",
    }]);
    setExpandedCards((p) => ({ ...p, [id]: true }));
  };
  const updateMomento = (id, patch) =>
    setMomentos((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const duplicateMomento = (id) => setMomentos((p) => {
    const idx = p.findIndex((m) => m.id === id);
    if (idx === -1) return p;
    const newId = genId("mom");
    const copy = { ...p[idx], id: newId, nombre: `${p[idx].nombre || "Momento"} (copia)` };
    const next = [...p];
    next.splice(idx + 1, 0, copy);
    return next;
  });
  const removeMomento = (id) => setMomentos((p) => p.filter((m) => m.id !== id));
  const toggleExpanded = (id) =>
    setExpandedCards((p) => ({ ...p, [id]: !p[id] }));
  const collapseAll = () => setExpandedCards({});
  const expandAll = () => setExpandedCards(Object.fromEntries(momentos.map((m) => [m.id, true])));
  const toggleRosterOnMomento = (momentoId, rosterId) =>
    setMomentos((p) => p.map((m) => {
      if (m.id !== momentoId) return m;
      const ids = m.rosterIds || [];
      return { ...m, rosterIds: ids.includes(rosterId) ? ids.filter((r) => r !== rosterId) : [...ids, rosterId] };
    }));
  const toggleTagOnMomento = (momentoId, tagId) =>
    setMomentos((p) => p.map((m) => {
      if (m.id !== momentoId) return m;
      const ids = m.tagIds || [];
      return { ...m, tagIds: ids.includes(tagId) ? ids.filter((t) => t !== tagId) : [...ids, tagId] };
    }));

  // ── CRUD roster (involucrados) ──────────────────────────────────────
  const addRosterEntry = () => setRoster((p) => [...p, { id: genId("rst"), label: "" }]);
  const addRosterEntryWithLabel = (label) => {
    const id = genId("rst");
    setRoster((p) => [...p, { id, label }]);
    return id;
  };
  const updateRosterEntry = (id, label) =>
    setRoster((p) => p.map((r) => (r.id === id ? { ...r, label } : r)));
  const removeRosterEntry = (id) => {
    setRoster((p) => p.filter((r) => r.id !== id));
    setMomentos((p) => p.map((m) => ({ ...m, rosterIds: (m.rosterIds || []).filter((r) => r !== id) })));
    setFilterInvolucrados((p) => p.filter((r) => r !== id));
    setLiveFilterRoster((p) => p.filter((r) => r !== id));
  };

  // ── CRUD etiquetas ───────────────────────────────────────────────────
  const addTagEntry = () => setTags((p) => [...p, { id: genId("tag"), label: "" }]);
  const addTagEntryWithLabel = (label) => {
    const id = genId("tag");
    setTags((p) => [...p, { id, label }]);
    return id;
  };
  const updateTagEntry = (id, label) =>
    setTags((p) => p.map((t) => (t.id === id ? { ...t, label } : t)));
  const removeTagEntry = (id) => {
    setTags((p) => p.filter((t) => t.id !== id));
    setMomentos((p) => p.map((m) => ({ ...m, tagIds: (m.tagIds || []).filter((t) => t !== id) })));
    setFilterTags((p) => p.filter((t) => t !== id));
    setLiveFilterTags((p) => p.filter((t) => t !== id));
  };

  // ── CRUD leyenda de color ───────────────────────────────────────────
  const addLegendRow = () =>
    setLegend((p) => [...p, { hex: CARD_COLORS[p.length % CARD_COLORS.length].hex, label: "" }]);
  const updateLegendRow = (idx, patch) =>
    setLegend((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLegendRow = (idx) =>
    setLegend((p) => p.filter((_, i) => i !== idx));

  // ── arrastre (Pointer Events, mouse + touch) ───────────────────────
  const handleDragStart = useCallback((e, id) => {
    e.preventDefault();
    dragState.current = { id };
    setDragId(id);

    const onMove = (ev) => {
      const y = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (y === undefined) return;

      setMomentos((prev) => {
        const fromIdx = prev.findIndex((m) => m.id === dragState.current?.id);
        if (fromIdx === -1) return prev;
        let toIdx = prev.length - 1;
        for (let i = 0; i < prev.length; i++) {
          const el = cardRefs.current[prev[i].id];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (y < rect.top + rect.height / 2) { toIdx = i; break; }
        }
        if (toIdx === fromIdx) return prev;
        const next = [...prev];
        const [item] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, item);
        return next;
      });
    };

    const onUp = () => {
      dragState.current = null;
      setDragId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // ── borrado con confirmación (momento / involucrado / etiqueta / proyecto) ─
  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "momento") removeMomento(pendingDelete.id);
    if (pendingDelete.type === "rosterEntry") removeRosterEntry(pendingDelete.id);
    if (pendingDelete.type === "tagEntry") removeTagEntry(pendingDelete.id);
    if (pendingDelete.type === "proyecto") {
      (async () => {
        try { await window.storage.delete(PROJECT_KEY(pendingDelete.id), false); } catch {}
        const next = savedProjects.filter((p) => p.id !== pendingDelete.id);
        try { await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(next), false); } catch {}
        setSavedProjects(next);
        setProjectMsg("Evento eliminado.");
      })();
    }
    setPendingDelete(null);
  };

  // ── proyectos guardados ────────────────────────────────────────────
  const guardarProyecto = async () => {
    const name =
      (saveNameInput || "").trim() || eventInfo.nombre || `Evento ${savedProjects.length + 1}`;
    const id = genId("evt");
    const snapshot = {
      id, name, eventInfo, momentos, roster, tags, legend,
      includeSchedule, includeColor, orientation, theme, savedAt: Date.now(),
    };
    const indexEntry = { id, name, savedAt: snapshot.savedAt, numMomentos: momentos.length };
    try {
      await window.storage.set(PROJECT_KEY(id), JSON.stringify(snapshot), false);
      const next = [...savedProjects, indexEntry];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(next), false);
      setSavedProjects(next);
      setSaveNameInput("");
      setProjectMsg(`Guardado como "${name}".`);
    } catch { setProjectMsg("No se pudo guardar. Intenta de nuevo."); }
  };

  const cargarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      setEventInfo(s.eventInfo || { nombre: "", fecha: "", horaInicio: "" });
      setMomentos(s.momentos || []);
      setRoster(s.roster || []);
      setTags(s.tags || []);
      setLegend(s.legend || []);
      setIncludeSchedule(s.includeSchedule ?? true);
      setIncludeColor(s.includeColor ?? true);
      setOrientation(s.orientation || "vertical");
      setTheme(s.theme || "light");
      setFileBaseEditado(false);
      setFilterInvolucrados([]);
      setFilterTags([]);
      setProjectMsg(`Cargado "${s.name}".`);
    } catch { setProjectMsg("No se pudo cargar ese evento."); }
  };

  const duplicarProyecto = async (id) => {
    try {
      const res = await window.storage.get(PROJECT_KEY(id), false);
      if (!res) return;
      const s = JSON.parse(res.value);
      const newId = genId("evt");
      const copy = { ...s, id: newId, name: `${s.name} (copia)`, savedAt: Date.now() };
      await window.storage.set(PROJECT_KEY(newId), JSON.stringify(copy), false);
      const next = [...savedProjects, {
        id: newId, name: copy.name, savedAt: copy.savedAt,
        numMomentos: (copy.momentos || []).length,
      }];
      await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(next), false);
      setSavedProjects(next);
      setProjectMsg(`Duplicado como "${copy.name}".`);
    } catch { setProjectMsg("No se pudo duplicar ese evento."); }
  };

  // ── export / import JSON ───────────────────────────────────────────
  const exportJSON = () => {
    const blob = new Blob(
      [JSON.stringify({ app: "lightXtool EscaletaTecnica", exportedAt: new Date().toISOString(), eventInfo, momentos, roster, tags, legend }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBaseName}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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
        setEventInfo(s.eventInfo || { nombre: "", fecha: "", horaInicio: "" });
        setMomentos(s.momentos || []);
        setRoster(s.roster || []);
        setTags(s.tags || []);
        setLegend(s.legend || []);
        flash("Evento importado desde archivo.");
      } catch { flash("Archivo inválido, no se pudo importar."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── PDF ────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const prev = document.title;
    document.title = fileBaseName;
    window.print();
    setTimeout(() => { document.title = prev; }, 600);
  };

  // ── filtrado para exportación y vista en vivo (roster + etiquetas) ──
  const momentosFiltradosExport = useMemo(
    () => momentosResolved.filter((m) => matchesFilters(m, filterInvolucrados, filterTags)),
    [momentosResolved, filterInvolucrados, filterTags]
  );
  const momentosFiltradosLive = useMemo(
    () => momentosResolved.filter((m) => matchesFilters(m, liveFilterRoster, liveFilterTags)),
    [momentosResolved, liveFilterRoster, liveFilterTags]
  );
  const liveFilterCount = liveFilterRoster.length + liveFilterTags.length;

  // ── helper: label de involucrados de un momento ───────────────────
  const involucradosLabel = (m) => {
    const rosterLabels = (m.rosterIds || [])
      .map((rid) => roster.find((r) => r.id === rid)?.label)
      .filter(Boolean);
    return rosterLabels.join(" · ") || "-";
  };

  // ── estilos derivados ──────────────────────────────────────────────
  const panelStyle = {
    backgroundColor: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: "8px",
  };
  const inputStyle = {
    backgroundColor: theme === "dark" ? "#050505" : "#FAFAFA",
    border: `1px solid ${C.border}`,
    color: C.text,
    fontFamily: FONT,
    fontSize: "12px",
    padding: "6px 8px",
    borderRadius: "3px",
    outline: "none",
  };
  const labelStyle = {
    fontSize: "9px",
    color: C.textDim,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    fontFamily: FONT,
    fontWeight: 700,
  };
  const glowText = (color) => (C.glow ? { textShadow: `0 0 10px ${color}` } : {});
  const glowBox = (rgba) => (C.glow ? { boxShadow: `0 0 10px ${rgba}` } : {});

  function btnStyle(variant = "default") {
    const base = {
      fontFamily: FONT, fontSize: "11px", padding: "6px 12px",
      borderRadius: "3px", cursor: "pointer", letterSpacing: ".4px",
      display: "inline-flex", alignItems: "center", gap: "6px",
      border: "1px solid transparent",
    };
    if (variant === "primary") return {
      ...base,
      background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF",
      border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700,
      ...glowBox("rgba(0,160,250,.25)"),
    };
    if (variant === "danger") return {
      ...base, background: C.redBg,
      border: `1px solid ${C.red}`, color: C.red,
    };
    if (variant === "active") return {
      ...base,
      background: theme === "dark" ? "rgba(0,160,250,.15)" : "#E5F5FF",
      border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700,
    };
    return {
      ...base,
      background: theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF",
      border: `1px solid ${C.border}`, color: C.textDim, fontWeight: 700,
    };
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

  const pageCss = `@page { size: letter ${orientation === "horizontal" ? "landscape" : "portrait"}; margin: 1.5cm; }`;

  // ══════════════════════════════════════════════════════════════════
  // VISTA EN VIVO
  // ══════════════════════════════════════════════════════════════════
  if (view === "live") {
    const D = DENSITY[liveDensity];
    return (
      <div style={{ backgroundColor: C.page, minHeight: "100vh", color: C.text, fontFamily: FONT }}>
        {/* Barra superior fija — únicamente dos botones: volver y filtros */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          backgroundColor: C.panel,
          borderBottom: `1px solid ${C.border}`,
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        }}>
          <button style={btnStyle()} onClick={() => { setView("editor"); setShowLiveFilter(false); }}>
            <ArrowLeft size={14} /> Volver al editor
          </button>
          <span style={{ fontSize: "13px", fontWeight: 700, color: C.cyan, flex: 1 }}>
            {eventInfo.nombre || "Escaleta en vivo"}
          </span>
          <div style={{ position: "relative" }}>
            <button
              style={btnStyle(liveFilterCount > 0 ? "active" : "default")}
              onClick={() => setShowLiveFilter((v) => !v)}
            >
              <Filter size={13} />
              {liveFilterCount > 0 ? `Filtros (${liveFilterCount})` : "Filtros"}
            </button>
            {showLiveFilter && (
              <div style={{
                position: "absolute", right: 0, top: "36px", zIndex: 200,
                background: C.panel, border: `1px solid ${C.border}`,
                borderRadius: "6px", padding: "12px", minWidth: "220px",
                boxShadow: "0 4px 20px rgba(0,0,0,.25)",
              }}>
                {/* Densidad de la vista — vive aquí para no sumar un tercer botón fijo */}
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "7px" }}>
                  <SlidersHorizontal size={12} style={{ color: C.textDim }} />
                  <span style={{ fontSize: "9px", color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700 }}>Tamaño de tarjeta</span>
                </div>
                <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
                  {DENSITY_LABELS.map(([key, lb]) => (
                    <button key={key} onClick={() => setLiveDensity(key)}
                      style={{ ...btnStyle(liveDensity === key ? "active" : "default"), flex: 1, fontSize: "10px", padding: "4px 6px", justifyContent: "center" }}>
                      {lb}
                    </button>
                  ))}
                </div>
                <div style={{ height: "1px", background: C.border, margin: "0 0 10px" }} />

                <FilterGroup icon={Users} title="Involucrados" items={roster} selectedIds={liveFilterRoster} C={C}
                  emptyLabel="Sin involucrados definidos."
                  onToggle={(id) => setLiveFilterRoster((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />

                <div style={{ height: "1px", background: C.border, margin: "10px 0" }} />

                <FilterGroup icon={Tag} title="Etiquetas" items={tags} selectedIds={liveFilterTags} C={C}
                  emptyLabel="Sin etiquetas definidas."
                  onToggle={(id) => setLiveFilterTags((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />

                {liveFilterCount > 0 && (
                  <button style={{ ...btnStyle(), marginTop: "10px", fontSize: "10px", padding: "3px 8px", width: "100%", justifyContent: "center" }}
                    onClick={() => { setLiveFilterRoster([]); setLiveFilterTags([]); }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lista de momentos en vivo */}
        <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: D.cardGap, maxWidth: "700px", margin: "0 auto" }}>
          {momentosFiltradosLive.length === 0 && (
            <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "20px", textAlign: "center" }}>
              Sin momentos que coincidan con el filtro.
            </p>
          )}
          {momentosFiltradosLive.map((m) => {
            const done = !!checklist[m.id];
            const rosterLabels = (m.rosterIds || [])
              .map((rid) => roster.find((r) => r.id === rid)?.label)
              .filter(Boolean);
            const tagLabels = (m.tagIds || [])
              .map((tid) => tags.find((t) => t.id === tid)?.label)
              .filter(Boolean);

            return (
              <div
                key={m.id}
                onClick={() => setChecklist((p) => ({ ...p, [m.id]: !p[m.id] }))}
                style={{
                  display: "flex", alignItems: "stretch", gap: 0,
                  borderRadius: "7px", overflow: "hidden",
                  border: `1px solid ${m.color || C.border}`,
                  borderLeft: m.color ? `4px solid ${m.color}` : `1px solid ${C.border}`,
                  cursor: "pointer",
                  opacity: done ? 0.45 : 1,
                  transition: "opacity .2s",
                  background: done
                    ? (theme === "dark" ? "rgba(255,255,255,.04)" : "#F0F0F0")
                    : m.color
                      ? `${m.color}${theme === "dark" ? "26" : "1A"}` // tiñe toda la tarjeta, no solo la franja
                      : C.panel,
                }}
              >
                {/* franja de color, ahora más gruesa y sólida para que se note de un vistazo */}
                <div style={{ width: D.stripW, background: m.color || "transparent", flexShrink: 0 }} />
                {/* checkbox */}
                <div style={{ display: "flex", alignItems: "flex-start", padding: D.pad, paddingRight: "8px" }}>
                  {done
                    ? <CheckSquare size={D.checkSize} style={{ color: C.cyan }} />
                    : <Square size={D.checkSize} style={{ color: C.textFaint }} />
                  }
                </div>
                {/* contenido dividido en secciones */}
                <div style={{ flex: 1, padding: D.pad, paddingLeft: "4px" }}>
                  {/* sección 1: nombre / hora / duración */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: D.titleSize, fontWeight: 700, textDecoration: done ? "line-through" : "none" }}>
                      {m.nombre || "(sin nombre)"}
                    </span>
                    {m.horaLabel && (
                      <span style={{ fontSize: D.metaSize, color: C.cyan, fontWeight: 700 }}>{m.horaLabel}</span>
                    )}
                    <span style={{ fontSize: D.metaSize, color: C.textFaint }}>{fmtDuracion(m.duracionMin)}</span>
                  </div>

                  {/* sección 2: involucrados */}
                  {rosterLabels.length > 0 && (
                    <>
                      <div style={{ height: "1px", background: C.border, margin: D.dividerMargin }} />
                      <div style={{ ...D && { paddingTop: "6px" }, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <Users size={11} style={{ color: C.textFaint, flexShrink: 0 }} />
                        {rosterLabels.map((lb, i) => (
                          <span key={i} style={{ fontSize: D.pillSize, padding: "2px 7px", borderRadius: "9px", background: C.cyan, color: "#fff", fontWeight: 700 }}>{lb}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* sección 3: etiquetas — estilo distinto (outline) para no confundir con involucrados */}
                  {tagLabels.length > 0 && (
                    <>
                      <div style={{ height: "1px", background: C.border, margin: D.dividerMargin }} />
                      <div style={{ paddingTop: "6px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <Tag size={11} style={{ color: C.textFaint, flexShrink: 0 }} />
                        {tagLabels.map((lb, i) => (
                          <span key={i} style={{ fontSize: D.pillSize, padding: "1px 7px", borderRadius: "9px", background: "transparent", border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700 }}>{lb}</span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* sección 4: notas */}
                  {m.notas && (
                    <>
                      <div style={{ height: "1px", background: C.border, margin: D.dividerMargin }} />
                      <div style={{ paddingTop: "6px", fontSize: D.metaSize, color: C.textFaint, lineHeight: 1.5 }}>
                        {m.notas}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // VISTA EDITOR
  // ══════════════════════════════════════════════════════════════════
  return (
    <div style={{ backgroundColor: C.page, minHeight: "100%", width: "100%", color: C.text, fontFamily: FONT }}>
      <style>{`
        ${pageCss}
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; color: #000 !important; background: #fff !important; padding: 10px; font-family: ${FONT}; }
          .print-only table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .print-only th, .print-only td { border: 1px solid #aaa; padding: 4px 7px; font-size: 11px; text-align: left; vertical-align: top; }
          .print-only h1 { font-size: 17px; margin: 0 0 4px; }
          .print-only h2 { font-size: 12px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: 1px; }
          .print-only p { font-size: 10px; line-height: 1.5; }
          .print-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print" style={{ padding: "16px" }}>
        <div style={{ maxWidth: "980px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h1 style={{ fontSize: "17px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}`) }}>
                ⬡ ESCALETA TÉCNICA
              </h1>
              <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
                Momentos · tiempos en cascada · involucrados · etiquetas · código de color
              </p>
              {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                style={btnStyle("primary")}
                onClick={() => setView("live")}
                disabled={momentos.length === 0}
                title="Vista interactiva en vivo con checklist"
              >
                <CheckSquare size={14} /> Vista en vivo
              </button>
              <button onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} style={btnStyle()}>
                {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
                {theme === "light" ? "Modo oscuro" : "Modo claro"}
              </button>
              <button onClick={() => setShowHelp(true)} style={btnStyle()} title="Cómo funciona la escaleta">
                <HelpCircle size={14} /> Ayuda
              </button>
            </div>
          </div>

          <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

          {/* Datos del evento */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Calendar} title="Datos del evento" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "8px", marginTop: "8px" }}>
              <div>
                <div style={labelStyle}>Nombre del evento</div>
                <input style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={eventInfo.nombre}
                  onChange={(e) => setEventInfo((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej. Festival XYZ" />
              </div>
              <div>
                <div style={labelStyle}>Fecha</div>
                <input type="date" style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={eventInfo.fecha}
                  onChange={(e) => setEventInfo((p) => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div>
                <div style={labelStyle}>Hora de inicio (opcional)</div>
                <input type="time" style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={eventInfo.horaInicio}
                  onChange={(e) => setEventInfo((p) => ({ ...p, horaInicio: e.target.value }))} />
              </div>
            </div>
            <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
              Sin hora de inicio, la escaleta trabaja con duraciones relativas. Con hora de inicio, cada momento
              calcula su hora en cascada sumando las duraciones de los momentos anteriores.
            </p>
          </div>

          {/* Guardar */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Save} title="Guardar / exportar" />
            <div style={{ marginTop: "8px" }}>
              <div style={labelStyle}>Nombre base de archivo</div>
              <input style={{ ...inputStyle, width: "100%", maxWidth: "360px", marginTop: "4px" }} value={fileBaseName}
                onChange={(e) => { setFileBaseName(e.target.value); setFileBaseEditado(true); }} />
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
              <button style={btnStyle()} onClick={exportJSON}><Download size={14} /> Respaldo (.json)</button>
              <button style={btnStyle()} onClick={triggerImport}><Upload size={14} /> Importar (.json)</button>
              <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} style={{ display: "none" }} />
            </div>
          </div>

          {/* Eventos guardados */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FolderOpen} title="Eventos guardados" subtitle={`${savedProjects.length} evento(s)`} />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "4px" }}>Solo en tu sesión (no compartido).</p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              <input style={{ ...inputStyle, flex: 1, minWidth: "180px" }} value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)} placeholder="Nombre para guardar el evento actual" />
              <button style={btnStyle("primary")} onClick={guardarProyecto}><Save size={13} /> Guardar como nuevo</button>
            </div>
            {projectMsg && <p style={{ fontSize: "10px", color: C.cyan, marginTop: "6px" }}>{projectMsg}</p>}
            {savedProjects.length > 0 && (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {savedProjects.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: theme === "dark" ? "rgba(255,255,255,.03)" : C.panelAlt, borderRadius: "4px", padding: "7px 10px", flexWrap: "wrap", fontSize: "11px" }}>
                    <span style={{ flex: 1, minWidth: "100px", fontWeight: 700 }}>{p.name}</span>
                    <span style={{ color: C.textFaint }}>{p.numMomentos} momento(s)</span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button style={btnStyle()} onClick={() => cargarProyecto(p.id)}><FolderOpen size={12} /> usar</button>
                      <button style={btnStyle()} onClick={() => duplicarProyecto(p.id)}><Copy size={12} /></button>
                      <button style={btnStyle("danger")} onClick={() => setPendingDelete({ type: "proyecto", id: p.id, label: p.name })}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Momentos */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Clock}
              title="Momentos"
              subtitle={`${momentos.length} · ${fmtDuracion(totalDuracion)} total`}
              right={
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {momentos.length > 1 && (
                    <>
                      <button style={btnStyle()} onClick={collapseAll}><ChevronUp size={13} /> Colapsar todo</button>
                      <button style={btnStyle()} onClick={expandAll}><ChevronDown size={13} /> Expandir todo</button>
                    </>
                  )}
                  <button style={btnStyle("primary")} onClick={addMomento}><Plus size={14} /> Agregar</button>
                </div>
              }
            />

            {/* Resumen de duración */}
            {momentos.length > 0 && (
              <div style={{
                marginTop: "10px", padding: "8px 10px",
                background: theme === "dark" ? "rgba(0,160,250,.08)" : "#E5F5FF",
                border: `1px solid ${C.border}`, borderRadius: "5px",
                display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "11px",
              }}>
                <span>Total: <b style={{ color: C.cyan }}>{fmtDuracion(totalDuracion)}</b></span>
                {eventInfo.horaInicio && momentosResolved.length > 0 && (() => {
                  const last = momentosResolved[momentosResolved.length - 1];
                  const endMin = last.horaInicioMin !== null
                    ? last.horaInicioMin + (Number(last.duracionMin) || 0)
                    : null;
                  return endMin !== null
                    ? <span>Fin estimado: <b style={{ color: C.cyan }}>{minutesToTimeLabel(endMin)}</b></span>
                    : null;
                })()}
                <span style={{ color: C.textFaint }}>{momentos.length} momento(s)</span>
              </div>
            )}

            {momentos.length === 0 && (
              <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin momentos aún.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
              {momentosResolved.map((m) => {
                const isExpanded = !!expandedCards[m.id];
                const rosterLabels = (m.rosterIds || [])
                  .map((rid) => roster.find((r) => r.id === rid)?.label)
                  .filter(Boolean);

                return (
                  <div
                    key={m.id}
                    ref={(el) => { cardRefs.current[m.id] = el; }}
                    style={{
                      display: "flex", alignItems: "stretch",
                      borderRadius: "6px",
                      border: `1px solid ${m.color || C.border}`,
                      opacity: dragId === m.id ? 0.45 : 1,
                      transition: "opacity .15s",
                      background: C.panel,
                    }}
                  >
                    {/* Franja de color + grip: zona de arrastre completa. El
                        overflow:hidden vive SOLO en este contenedor (para
                        recortar sus propias esquinas redondeadas), no en la
                        tarjeta completa — así los menús flotantes de
                        Involucrados/Etiquetas pueden salirse del borde de la
                        tarjeta sin ser recortados. */}
                    <div
                      onPointerDown={(e) => handleDragStart(e, m.id)}
                      title="Arrastra para reordenar"
                      style={{
                        width: "28px", flexShrink: 0,
                        borderTopLeftRadius: "6px", borderBottomLeftRadius: "6px",
                        overflow: "hidden",
                        background: m.color
                          ? `${m.color}CC`
                          : theme === "dark" ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)",
                        cursor: "grab", touchAction: "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <GripVertical size={14} style={{ color: m.color ? "rgba(255,255,255,.7)" : C.textFaint }} />
                    </div>

                    {/* Contenido de la tarjeta */}
                    <div style={{ flex: 1, padding: "8px 10px", minWidth: 0, borderTopRightRadius: "6px", borderBottomRightRadius: "6px", overflow: "visible" }}>
                      {/* Fila principal (siempre visible) */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <input
                          style={{ ...inputStyle, flex: 1, minWidth: "140px", fontWeight: 700, fontSize: "13px" }}
                          value={m.nombre}
                          placeholder="Nombre del momento"
                          onChange={(e) => updateMomento(m.id, { nombre: e.target.value })}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <NumberField
                            min={0}
                            value={m.duracionMin}
                            onCommit={(n) => updateMomento(m.id, { duracionMin: n })}
                            style={{ ...inputStyle, width: "52px", textAlign: "center" }}
                          />
                          <span style={{ fontSize: "10px", color: C.textFaint }}>min</span>
                        </div>
                        {m.horaLabel && (
                          <span style={{ fontSize: "12px", color: C.cyan, fontWeight: 700 }}>
                            {m.horaLabel}
                          </span>
                        )}
                        <div style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center" }}>
                          <button
                            onClick={() => toggleExpanded(m.id)}
                            style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: "2px" }}
                            title={isExpanded ? "Colapsar" : "Expandir"}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <button onClick={() => duplicateMomento(m.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: "2px" }}>
                            <Copy size={14} />
                          </button>
                          <button onClick={() => setPendingDelete({ type: "momento", id: m.id, label: m.nombre || "este momento" })} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: "2px" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Resumen colapsado: solo lectura, sin controles de edición ni de agregar —
                          antes solo se veía el título, esto da contexto sin tener que expandir */}
                      {!isExpanded && (rosterLabels.length > 0 || m.notas) && (
                        <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px solid ${C.panelAlt}`, display: "flex", flexDirection: "column", gap: "4px" }}>
                          {rosterLabels.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                              <Users size={11} style={{ color: C.textFaint, flexShrink: 0 }} />
                              <span style={{ fontSize: "10px", color: C.textDim }}>{rosterLabels.join(" · ")}</span>
                            </div>
                          )}
                          {m.notas && (
                            <div style={{ fontSize: "10px", color: C.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.notas}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Campos expandidos */}
                      {isExpanded && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
                          {/* Involucrados: listado con creación inline */}
                          <div>
                            <div style={labelStyle}>Involucrados</div>
                            <div style={{ marginTop: "4px" }}>
                              <ItemPicker
                                items={roster}
                                selectedIds={m.rosterIds || []}
                                onToggle={(id) => toggleRosterOnMomento(m.id, id)}
                                onCreate={(label) => { const id = addRosterEntryWithLabel(label); toggleRosterOnMomento(m.id, id); }}
                                C={C} label="Involucrado" placeholder="Buscar o crear involucrado..." variant="solid"
                              />
                            </div>
                          </div>

                          {/* Notas generales */}
                          <div>
                            <div style={labelStyle}>Notas del momento</div>
                            <input
                              style={{ ...inputStyle, width: "100%", marginTop: "3px" }}
                              value={m.notas || ""}
                              placeholder="Descripción o instrucciones de este momento"
                              onChange={(e) => updateMomento(m.id, { notas: e.target.value })}
                            />
                          </div>

                          {/* Color y etiquetas, una al lado de la otra */}
                          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div>
                              <div style={labelStyle}>Color de tarjeta</div>
                              <div style={{ marginTop: "4px" }}>
                                <ColorPicker value={m.color} onChange={(c) => updateMomento(m.id, { color: c })} C={C} />
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: "180px" }}>
                              <div style={labelStyle}>Etiquetas <span style={{ color: C.textFaint, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(solo para filtrar, no se exportan)</span></div>
                              <div style={{ marginTop: "4px" }}>
                                <ItemPicker
                                  items={tags}
                                  selectedIds={m.tagIds || []}
                                  onToggle={(id) => toggleTagOnMomento(m.id, id)}
                                  onCreate={(label) => { const id = addTagEntryWithLabel(label); toggleTagOnMomento(m.id, id); }}
                                  C={C} label="Etiqueta" placeholder="Buscar o crear etiqueta..." variant="outline"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {momentos.length > 0 && (
              <div style={{ marginTop: "10px", display: "flex", justifyContent: "center" }}>
                <button style={btnStyle("primary")} onClick={addMomento}><Plus size={14} /> Agregar momento</button>
              </div>
            )}
          </div>

          {/* Involucrados (listado global) */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Users}
              title="Involucrados"
              subtitle={`${roster.length} definido(s)`}
              right={<button style={btnStyle("primary")} onClick={addRosterEntry}><Plus size={13} /> Agregar</button>}
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Único listado de involucrados — se asignan a cada momento desde la tarjeta (sección Involucrados) y
              sirven como filtro en la vista en vivo y en la exportación. Editar el nombre aquí lo actualiza en
              todos los momentos donde ya esté asignado.
            </p>
            {roster.length === 0
              ? <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "8px" }}>Sin involucrados definidos.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {roster.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <User size={13} style={{ color: C.textFaint, flexShrink: 0 }} />
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={r.label}
                        placeholder="Nombre o departamento"
                        onChange={(e) => updateRosterEntry(r.id, e.target.value)}
                      />
                      <button onClick={() => setPendingDelete({ type: "rosterEntry", id: r.id, label: r.label || "este involucrado" })}
                        style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Etiquetas (listado global) */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Tag}
              title="Etiquetas"
              subtitle={`${tags.length} definida(s)`}
              right={<button style={btnStyle("primary")} onClick={addTagEntry}><Plus size={13} /> Agregar</button>}
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Pueden representar momentos, lugares o acciones (ej. "Crítico", "Backstage", "Cambio de escenario")
              — sirven para agrupar cierto tipo de momentos o localizarlos fácilmente al filtrar en pantalla; no
              se incluyen en el documento exportado. Editar el nombre aquí lo actualiza en todos los momentos
              donde ya esté asignada.
            </p>
            {tags.length === 0
              ? <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "8px" }}>Sin etiquetas definidas.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {tags.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Tag size={13} style={{ color: C.textFaint, flexShrink: 0 }} />
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={t.label}
                        placeholder="Nombre de la etiqueta"
                        onChange={(e) => updateTagEntry(t.id, e.target.value)}
                      />
                      <button onClick={() => setPendingDelete({ type: "tagEntry", id: t.id, label: t.label || "esta etiqueta" })}
                        style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Leyenda de colores */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Palette}
              title="Leyenda de colores"
              subtitle="significado libre, definido por ti"
              right={
                <button style={btnStyle("primary")} onClick={addLegendRow} disabled={legend.length >= CARD_COLORS.length}>
                  <Plus size={13} /> Agregar categoría
                </button>
              }
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Esta paleta (rojo → magenta) es independiente del cian/rojo de marca de lightXtool — solo
              categoriza momentos por color de franja. Se imprime junto al documento solo si "Incluir color" está activo.
            </p>
            {legend.length === 0
              ? <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "8px" }}>Sin categorías aún.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {legend.map((l, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <ColorPicker value={l.hex} onChange={(c) => updateLegendRow(idx, { hex: c })} C={C} />
                      <input
                        style={{ ...inputStyle, flex: 1, minWidth: "140px" }}
                        value={l.label}
                        placeholder="Nombre de la categoría"
                        onChange={(e) => updateLegendRow(idx, { label: e.target.value })}
                      />
                      <button onClick={() => removeLegendRow(idx)}
                        style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Exportar */}
          <div style={{ ...panelStyle, padding: "12px", border: `1px solid ${C.cyanLight}`, ...glowBox("rgba(0,160,250,.15)") }}>
            <SectionHeader icon={Printer} title="Exportar documento (PDF)" />

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "10px", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                  <input type="checkbox" checked={includeSchedule} onChange={(e) => setIncludeSchedule(e.target.checked)} />
                  Incluir horario
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                  <input type="checkbox" checked={includeColor} onChange={(e) => setIncludeColor(e.target.checked)} />
                  Incluir color de tarjetas (y leyenda)
                </label>
              </div>

              <div>
                <div style={labelStyle}>Orientación</div>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <button style={btnStyle(orientation === "vertical" ? "active" : "default")} onClick={() => setOrientation("vertical")}>Vertical</button>
                  <button style={btnStyle(orientation === "horizontal" ? "active" : "default")} onClick={() => setOrientation("horizontal")}>Horizontal</button>
                </div>
              </div>

              {/* Filtro por involucrado — qué momentos entran al documento */}
              <FilterGroup icon={Users} title="Filtrar por involucrado(s)" items={roster} selectedIds={filterInvolucrados} C={C}
                emptyLabel="Sin involucrados definidos."
                onToggle={(id) => setFilterInvolucrados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />

              {/* Filtro por etiqueta — igual, solo decide qué se exporta (la etiqueta en sí no sale en el PDF) */}
              <FilterGroup icon={Tag} title="Filtrar por etiqueta(s)" items={tags} selectedIds={filterTags} C={C}
                emptyLabel="Sin etiquetas definidas."
                onToggle={(id) => setFilterTags((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />
            </div>

            {(filterInvolucrados.length > 0 || filterTags.length > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <p style={{ fontSize: "9px", color: C.textFaint, margin: 0 }}>
                  Se exportarán {momentosFiltradosExport.length} de {momentos.length} momento(s).
                </p>
                <button style={{ ...btnStyle(), fontSize: "10px", padding: "3px 8px" }}
                  onClick={() => { setFilterInvolucrados([]); setFilterTags([]); }}>
                  <X size={11} /> Limpiar filtros
                </button>
              </div>
            )}

            <button style={{ ...btnStyle("primary"), marginTop: "12px" }} onClick={exportPDF} disabled={momentos.length === 0}>
              <Printer size={14} /> Exportar PDF
            </button>
            <p style={{ fontSize: "9px", color: C.textFaint, marginTop: "6px" }}>
              Abre el diálogo de impresión del navegador — ahí eliges "Guardar como PDF". Tamaño carta, márgenes fijos.
            </p>
          </div>

          {/* Nota de alcance */}
          <div style={{ ...panelStyle, padding: "12px", background: C.panelAlt }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <FileText size={13} style={{ color: C.textFaint, flexShrink: 0, marginTop: "2px" }} />
              <p style={{ fontSize: "10px", color: C.textFaint, lineHeight: 1.6, margin: 0 }}>
                No es un cue sheet técnico de consola. No detecta conflictos de involucrados entre momentos simultáneos.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Ayuda / instructivo — se abre sola la primera vez, y bajo demanda
          con el botón "Ayuda" del header. Explica también la vista en vivo
          aquí mismo, para no sumar un tercer botón a esa barra. */}
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
              { icon: Clock, title: "Momentos", body: "Cada tarjeta es un momento del evento. Agrégalos con \"Agregar\" (arriba o al final de la lista). Arrastra desde la franja de color para reordenar — la hora se recalcula sola. Toca una tarjeta para expandirla y editar sus detalles." },
              { icon: Users, title: "Involucrados", body: "Dentro de una tarjeta expandida, usa \"+ Involucrado\": escribe para crear uno nuevo o elige uno ya existente de la lista. El mismo listado se reutiliza en todos los momentos, para no duplicar por accidente." },
              { icon: Tag, title: "Etiquetas", body: "Mismo funcionamiento que Involucrados, pero para agrupar momentos, lugares o acciones (ej. \"Crítico\", \"Backstage\"). Solo sirven para filtrar en pantalla — no se incluyen al exportar el documento." },
              { icon: Palette, title: "Color de tarjeta", body: "Asigna un color a cada momento para identificarlo de un vistazo. Define qué significa cada color en \"Leyenda de colores\", más abajo en el editor." },
              { icon: CheckSquare, title: "Vista en vivo", body: "Botón \"Vista en vivo\" arriba de todo — pantalla simplificada para seguir el evento en tiempo real; toca una tarjeta para marcarla como hecha. Ahí mismo, el botón \"Filtros\" también deja ajustar el tamaño de las tarjetas y filtrar por involucrado o etiqueta." },
              { icon: Printer, title: "Exportar", body: "Filtra qué involucrados o etiquetas quieres incluir y presiona \"Exportar PDF\" — se abre el diálogo de impresión de tu navegador; ahí eliges \"Guardar como PDF\"." },
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

      {/* Navegación rápida: solo con listas largas, para no recorrer toda la
          página al escribir un momento nuevo agregado al final */}
      {momentos.length > 5 && (
        <div className="no-print" style={{ position: "fixed", right: "16px", bottom: "18px", zIndex: 400, display: "flex", flexDirection: "column", gap: "6px" }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Subir al inicio"
            style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.panel, border: `1px solid ${C.border}`, color: C.cyan, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,.2)" }}>
            <ArrowUp size={16} />
          </button>
          <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} title="Bajar al final"
            style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.panel, border: `1px solid ${C.border}`, color: C.cyan, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,.2)" }}>
            <ArrowDown size={16} />
          </button>
        </div>
      )}

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div className="no-print" style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999, background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px" }}>¿Eliminar "{pendingDelete.label}"? No se puede deshacer.</span>
          <button onClick={confirmDelete} style={btnStyle("danger")}>Eliminar</button>
          <button onClick={() => setPendingDelete(null)} style={btnStyle()}><X size={12} /> Cancelar</button>
        </div>
      )}

      {/* Vista de impresión (PDF) */}
      <div className="print-only">
        <h1>{eventInfo.nombre || "Escaleta de evento"}</h1>
        {eventInfo.fecha && <p>Fecha: {eventInfo.fecha}</p>}
        <p>Generado: {new Date().toLocaleString("es")}</p>
        {filterInvolucrados.length > 0 && (
          <p>
            Involucrados: {filterInvolucrados
              .map((id) => roster.find((r) => r.id === id)?.label)
              .filter(Boolean)
              .join(", ")}
          </p>
        )}

        <h2>Escaleta</h2>
        <table>
          <thead>
            <tr>
              {includeSchedule && <th>Hora</th>}
              <th>Momento</th>
              <th>Duración</th>
              <th>Involucrados</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {momentosFiltradosExport.map((m) => {
              const bgStyle = includeColor && m.color ? { backgroundColor: `${m.color}30` } : {};
              const borderStyle = includeColor && m.color ? { borderLeft: `4px solid ${m.color}` } : {};
              return (
                <tr key={m.id} style={{ ...bgStyle, ...borderStyle }}>
                  {includeSchedule && <td>{m.horaLabel || "-"}</td>}
                  <td>
                    {includeColor && m.color && (
                      <span className="print-swatch" style={{ background: m.color }} />
                    )}
                    {m.nombre || "(sin nombre)"}
                  </td>
                  <td>{fmtDuracion(m.duracionMin)}</td>
                  <td>{involucradosLabel(m)}</td>
                  <td>{m.notas || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {includeColor && legendUsada.length > 0 && (
          <>
            <h2>Significado de colores</h2>
            <table>
              <thead><tr><th>Color</th><th>Categoría</th></tr></thead>
              <tbody>
                {legendUsada.map((l, i) => (
                  <tr key={i}>
                    <td><span className="print-swatch" style={{ background: l.hex }} /> {colorName(l.hex) || l.hex}</td>
                    <td>{l.label || colorName(l.hex) || l.hex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
