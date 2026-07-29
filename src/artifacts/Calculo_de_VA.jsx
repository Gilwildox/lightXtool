import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Trash2, AlertTriangle, Zap, Download, Layers, Gauge, FileText,
  ChevronDown, ChevronUp, ChevronRight, Sun, Moon, FileSpreadsheet,
  Copy, Save, FolderOpen, Upload, X, Printer, StickyNote, BookOpen, PackageCheck, FilePlus,
} from "lucide-react";

// ── id generation (robusto: no depende de un contador en memoria) ──────
const genId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const sanitizeFileName = (s) =>
  (s || "").trim().replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "proyecto";

const FONT = "ui-monospace, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
const CURRENT_KEY = "voltGen:project:v3";
const PROJECTS_INDEX_KEY = "voltGen:proyectos:index";
const PROJECT_KEY = (id) => `voltGen:proyecto:${id}`;
const SQRT3 = Math.sqrt(3);

// ── lightXtool identity: dos paletas completas, contraste AA revisado ──
const PALETTES = {
  dark: {
    page: "#000000", panel: "#0A0A0A", panelAlt: "#050505",
    border: "rgba(0,160,250,0.22)", borderStrong: "rgba(0,160,250,0.45)",
    text: "#FFFFFF", textDim: "rgba(255,255,255,0.6)", textFaint: "rgba(255,255,255,0.5)",
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

// FP + voltaje "de fábrica" por tipo — estándar típico de trabajo (220V
// iluminación/motores/humo, 110V audio/pantallas/efectos), no una regla
// técnica: siempre editable por ítem y siempre confirmable con ficha técnica.
const SOURCE_TYPES = {
  led: { label: "LED con driver", fp: 0.9, voltage: 220 },
  balastro: { label: "Balastro (descarga / HID)", fp: 0.9, voltage: 220 },
  motor: { label: "Motor (winch / turntable)", fp: 0.8, voltage: 220 },
  resistivo: { label: "Resistivo (incandescente / halógeno)", fp: 1.0, voltage: 220 },
  maquina_humo: { label: "Máquina de humo / haze", fp: 0.95, voltage: 220 },
  amplificador: { label: "Amplificador", fp: 0.85, voltage: 110 },
  bocina_autoamplificada: { label: "Bocina autoamplificada", fp: 0.9, voltage: 110 },
  modulo_pantalla: { label: "Módulo de pantalla LED", fp: 0.9, voltage: 110 },
  disparador_efecto: { label: "Efecto / disparador", fp: 0.9, voltage: 110 },
};
const INRUSH_TYPES = new Set(["motor", "balastro"]);

const SIMBOLOGIA = [
  ["V", "Voltios (voltaje)"],
  ["W", "Watts — potencia real consumida"],
  ["VA", "Volt-Amperios — potencia aparente (la que dimensiona cables/breakers)"],
  ["A", "Amperios — corriente"],
  ["FP", "Factor de potencia (relación entre W y VA)"],
  ["kVA", "Kilo-Volt-Amperios (VA ÷ 1000) — unidad típica para tamaño de generador"],
  ["⚠", "Valor estimado, no confirmado con ficha técnica real"],
  ["1φ", "Monofásico"],
  ["3φ", "Trifásico"],
  ["125%", "Margen de referencia para cargas continuas (breaker/conductor)"],
  ["HID", "High Intensity Discharge — lámpara de descarga de alta intensidad"],
];

function fmt(n, d = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toFixed(d);
}

// Input numérico "de texto controlado": mientras se escribe, no se fuerza
// ningún valor (se puede borrar todo, no antepone ceros). El número real
// solo se confirma (onCommit) cuando el texto ya es un número válido, y
// los límites (min/max) solo se aplican al salir del campo (blur).
function NumberField({ value, onCommit, decimals = 2, min, max, style, ...rest }) {
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
      type="text"
      inputMode="decimal"
      value={text}
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

// Resuelve W/VA/A de UNA unidad de un ítem del catálogo.
function resolveItem(it) {
  const V = Number(it.voltage) || 0;
  const fp = Number(it.fp) || 0.01;
  const isTri = it.phase === "trifasico";
  let W, VA, A;
  if (it.consumoTipo === "W") {
    W = Number(it.consumoValor) || 0;
    VA = fp > 0 ? W / fp : 0;
    A = isTri ? VA / (V * SQRT3) : VA / V;
  } else {
    A = Number(it.consumoValor) || 0;
    VA = isTri ? A * V * SQRT3 : A * V;
    W = VA * fp;
  }
  return { W: W || 0, VA: VA || 0, A: A || 0 };
}
function vfKey(v, phase) {
  return `${v}V ${phase === "trifasico" ? "3φ" : "1φ"}`;
}
function aggregate(entries) {
  let W = 0, VA = 0;
  const byVF = {};
  entries.forEach((e) => {
    W += e.W; VA += e.VA;
    const k = vfKey(e.voltage, e.phase);
    if (!byVF[k]) byVF[k] = { key: k, voltage: e.voltage, phase: e.phase, A: 0 };
    byVF[k].A += e.A;
  });
  return { W, VA, breakdown: Object.values(byVF).sort((a, b) => a.voltage - b.voltage) };
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

export default function VoltageGeneratorCalculator() {
  const [theme, setTheme] = useState("dark");
  const C = PALETTES[theme];

  const [eventInfo, setEventInfo] = useState({ nombre: "", fecha: "", responsable: "" });
  const [items, setItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [simultaneidad, setSimultaneidad] = useState(100);
  const [margenReserva, setMargenReserva] = useState(20);
  const [notas, setNotas] = useState("");
  const [invCollapsed, setInvCollapsed] = useState(false);
  const [exportCollapsed, setExportCollapsed] = useState(true);
  const [projectsCollapsed, setProjectsCollapsed] = useState(true);
  const [glosarioCollapsed, setGlosarioCollapsed] = useState(true);
  const [msg, setMsg] = useState("");
  const loaded = useRef(false);

  // nombre base de archivo: sugerencia editable
  const [fileBaseName, setFileBaseName] = useState("");
  const [fileBaseEditado, setFileBaseEditado] = useState(false);
  useEffect(() => {
    if (!fileBaseEditado) setFileBaseName(sanitizeFileName(`LXT-VoltGen_${eventInfo.nombre || "Proyecto"}`));
  }, [eventInfo.nombre, fileBaseEditado]);

  // confirmación de borrado (sin window.confirm — puede estar bloqueado en el sandbox)
  const [pendingDelete, setPendingDelete] = useState(null); // { type, id, label }
  const requestDelete = (type, id, label) => setPendingDelete({ type, id, label });
  const cancelDelete = () => setPendingDelete(null);

  // "Nuevo documento": vacía catálogo, grupos, datos del evento y notas (no
  // toca proyectos guardados ni el tema). Si hay algo sin guardar como
  // proyecto con nombre, pide confirmación Sí/No antes de perderlo.
  const clearDocument = () => {
    setEventInfo({ nombre: "", fecha: "", responsable: "" });
    setItems([]);
    setGroups([]);
    setSimultaneidad(100);
    setMargenReserva(20);
    setNotas("");
    setFileBaseEditado(false);
    setProjectMsg("Documento nuevo iniciado.");
  };
  const startNewDocument = () => {
    const hasData = items.length > 0 || groups.length > 0 || (eventInfo.nombre || "").trim() || (notas || "").trim();
    if (hasData) setPendingDelete({ type: "nuevo", id: null, label: "documento actual" });
    else clearDocument();
  };

  // proyectos guardados (multi-evento)
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
          setEventInfo(s.eventInfo || { nombre: "", fecha: "", responsable: "" });
          setItems(s.items || []);
          setGroups(s.groups || []);
          setSimultaneidad(s.simultaneidad ?? 100);
          setMargenReserva(s.margenReserva ?? 20);
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
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      window.storage
        .set(CURRENT_KEY, JSON.stringify({ eventInfo, items, groups, simultaneidad, margenReserva, notas, theme }), false)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [eventInfo, items, groups, simultaneidad, margenReserva, notas, theme]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  // ── estilos derivados del tema ─────────────────────────────
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
    return { ...base, background: theme === "dark" ? "rgba(255,255,255,.04)" : "#EFEFEF", border: `1px solid ${C.border}`, color: C.textDim, fontWeight: 700 };
  }

  const SectionHeader = ({ icon: Icon, title, subtitle, right, step, help }) => {
    const [showHelp, setShowHelp] = useState(false);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {step && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px",
                borderRadius: "50%", background: theme === "dark" ? "rgba(0,160,250,.18)" : "#E5F5FF",
                border: `1px solid ${C.cyan}`, color: C.cyan, fontFamily: FONT, fontSize: "9px", fontWeight: 700, flexShrink: 0,
              }}>{step}</span>
            )}
            <Icon size={14} style={{ color: C.cyan }} />
            <span style={{ fontFamily: FONT, fontSize: "12px", color: C.cyan, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, ...glowText("rgba(0,160,250,.4)") }}>
              {title}
            </span>
            {subtitle && <span style={{ fontFamily: FONT, fontSize: "10px", color: C.textFaint }}>· {subtitle}</span>}
            {help && (
              <button onClick={() => setShowHelp((v) => !v)} title="Ayuda de esta sección"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px",
                  borderRadius: "50%", background: "none", border: `1px solid ${C.textFaint}`, color: C.textFaint,
                  fontFamily: FONT, fontSize: "9px", fontWeight: 700, cursor: "pointer", padding: 0, lineHeight: 1,
                }}>?</button>
            )}
          </div>
          {right}
        </div>
        {help && showHelp && (
          <div style={{
            marginTop: "8px", padding: "8px 10px", borderRadius: "4px", fontSize: "10px", lineHeight: 1.5,
            color: C.textDim, background: theme === "dark" ? "rgba(0,160,250,.06)" : "#E5F5FF", border: `1px solid ${C.border}`,
          }}>{help}</div>
        )}
      </div>
    );
  };

  // ── ítems del catálogo ──────────────────────────────────────
  const addItem = () => {
    setItems((p) => [
      ...p,
      {
        id: genId("item"), nombre: "", tipo: "led", voltage: SOURCE_TYPES.led.voltage, voltageEditado: false,
        phase: "monofasico", consumoTipo: "W", consumoValor: 0,
        fp: SOURCE_TYPES.led.fp, fpEditado: false,
      },
    ]);
    setInvCollapsed(false);
  };
  const duplicateItem = (id) => {
    setItems((p) => {
      const idx = p.findIndex((it) => it.id === id);
      if (idx === -1) return p;
      const copy = { ...p[idx], id: genId("item"), nombre: `${p[idx].nombre || "Ítem"} (copia)` };
      const next = [...p];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const updateItem = (id, patch) => setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const onVoltageChange = (id, n) => setItems((p) => p.map((it) => (it.id === id ? { ...it, voltage: n, voltageEditado: true } : it)));
  const onTipoChange = (id, tipo) =>
    setItems((p) =>
      p.map((it) =>
        it.id === id
          ? { ...it, tipo, fp: it.fpEditado ? it.fp : SOURCE_TYPES[tipo].fp, voltage: it.voltageEditado ? it.voltage : SOURCE_TYPES[tipo].voltage }
          : it
      )
    );
  const onFpChange = (id, val) =>
    setItems((p) => p.map((it) => (it.id === id ? { ...it, fp: Math.min(1, Math.max(0.1, Number(val) || 0.1)), fpEditado: true } : it)));

  // ── grupos ──────────────────────────────────────────────────
  const addGroup = () => setGroups((p) => [...p, { id: genId("grp"), nombre: `Grupo ${p.length + 1}`, colapsado: false, alloc: [] }]);
  const patchGroup = (id, patch) => setGroups((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const addAllocation = (groupId) =>
    setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, alloc: [...g.alloc, { itemId: items[0]?.id || "", cantidad: 1 }] } : g)));
  const updateAllocation = (groupId, idx, patch) =>
    setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, alloc: g.alloc.map((a, i) => (i === idx ? { ...a, ...patch } : a)) } : g)));
  const removeAllocation = (groupId, idx) =>
    setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, alloc: g.alloc.filter((_, i) => i !== idx) } : g)));

  // ── borrado con confirmación (ítem / grupo / proyecto guardado) ──
  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === "item") {
      setItems((p) => p.filter((it) => it.id !== id));
      setGroups((p) => p.map((g) => ({ ...g, alloc: g.alloc.filter((a) => a.itemId !== id) })));
    } else if (type === "group") {
      setGroups((p) => p.filter((g) => g.id !== id));
    } else if (type === "proyecto") {
      (async () => {
        try { await window.storage.delete(PROJECT_KEY(id), false); } catch {}
        const newList = savedProjects.filter((p) => p.id !== id);
        try { await window.storage.set(PROJECTS_INDEX_KEY, JSON.stringify(newList), false); } catch {}
        setSavedProjects(newList);
        setProjectMsg("Proyecto eliminado.");
      })();
    } else if (type === "nuevo") {
      clearDocument();
    }
    setPendingDelete(null);
  };

  // ── resolución eléctrica ────────────────────────────────────
  const itemsResolved = useMemo(() => items.map((it) => ({ ...it, unit: resolveItem(it), isEstimated: !it.fpEditado })), [items]);
  const itemById = useMemo(() => Object.fromEntries(itemsResolved.map((i) => [i.id, i])), [itemsResolved]);

  const groupsResolved = useMemo(
    () =>
      groups.map((g) => {
        const detalle = g.alloc
          .map((a) => {
            const it = itemById[a.itemId];
            if (!it) return null;
            const qty = Number(a.cantidad) || 0;
            return {
              itemId: it.id, nombre: it.nombre || "(sin nombre)", voltage: it.voltage, phase: it.phase,
              tipo: it.tipo, fp: it.fp, isEstimated: it.isEstimated, cantidad: qty,
              W: it.unit.W * qty, VA: it.unit.VA * qty, A: it.unit.A * qty,
            };
          })
          .filter(Boolean);
        const agg = aggregate(detalle);
        return { ...g, detalle, ...agg };
      }),
    [groups, itemById]
  );

  const totalGeneral = useMemo(() => aggregate(groupsResolved.flatMap((g) => g.detalle)), [groupsResolved]);
  const totalQtyAssigned = useMemo(() => groupsResolved.reduce((sum, g) => sum + g.detalle.reduce((s, d) => s + d.cantidad, 0), 0), [groupsResolved]);
  const hasInrush = groupsResolved.some((g) => g.detalle.some((d) => INRUSH_TYPES.has(d.tipo) && d.cantidad > 0));
  const estimatedInUseCount = useMemo(() => {
    const ids = new Set();
    groupsResolved.forEach((g) => g.detalle.forEach((d) => { if (d.isEstimated) ids.add(d.itemId); }));
    return ids.size;
  }, [groupsResolved]);

  const kvaSugerido = useMemo(() => {
    const raw = (totalGeneral.VA * (simultaneidad / 100) * (1 + margenReserva / 100)) / 1000;
    return raw > 0 ? Math.ceil(raw * 10) / 10 : 0;
  }, [totalGeneral.VA, simultaneidad, margenReserva]);

  // ── filas para hojas de Excel / PDF ─────────────────────────
  const itemsSheetRows = () => {
    const rows = [["Nombre", "Tipo de fuente", "V", "Consumo", "FP", "FP estimado", "Fase", "A unit."]];
    itemsResolved.forEach((it) =>
      rows.push([
        it.nombre || "(sin nombre)", SOURCE_TYPES[it.tipo].label, it.voltage,
        `${it.consumoValor} ${it.consumoTipo}`, it.fp, it.isEstimated ? "SI" : "NO",
        it.phase === "trifasico" ? "Trifásico" : "Monofásico", Number(fmt(it.unit.A, 2)),
      ])
    );
    return rows;
  };
  const groupSheetRows = (g) => {
    const rows = [["Grupo", g.nombre], []];
    rows.push(["Ítem", "V", "Fase", "FP", "FP estimado", "Cantidad", "W total", "A total"]);
    g.detalle.forEach((d) =>
      rows.push([d.nombre, d.voltage, d.phase === "trifasico" ? "Trifásico" : "Monofásico", d.fp, d.isEstimated ? "SI" : "NO", d.cantidad, Number(fmt(d.W, 1)), Number(fmt(d.A, 2))])
    );
    rows.push([]);
    rows.push(["W total grupo", Number(fmt(g.W, 1))]);
    rows.push(["VA total grupo", Number(fmt(g.VA, 1))]);
    g.breakdown.forEach((b) => rows.push([`A ${b.key}`, Number(fmt(b.A, 1)), `A con margen 125% ${b.key}`, Number(fmt(b.A * 1.25, 1))]));
    return rows;
  };
  const totalSheetRows = () => {
    const rows = [["Inventario total (piezas)", totalQtyAssigned, "Potencia total (W)", Number(fmt(totalGeneral.W, 1))], []];
    rows.push(["W total", "VA total", "V/Fase", "A", "A con margen 125%"]);
    if (totalGeneral.breakdown.length === 0) rows.push([Number(fmt(totalGeneral.W, 1)), Number(fmt(totalGeneral.VA, 1)), "-", "-", "-"]);
    totalGeneral.breakdown.forEach((b, i) =>
      rows.push([i === 0 ? Number(fmt(totalGeneral.W, 1)) : "", i === 0 ? Number(fmt(totalGeneral.VA, 1)) : "", b.key, Number(fmt(b.A, 1)), Number(fmt(b.A * 1.25, 1))])
    );
    rows.push([]);
    rows.push(["Desglose por grupo"]);
    rows.push(["Grupo", "W", "VA", "V/Fase", "A", "A con margen 125%"]);
    groupsResolved.forEach((g) => {
      if (g.breakdown.length === 0) {
        rows.push([g.nombre, Number(fmt(g.W, 1)), Number(fmt(g.VA, 1)), "-", "-", "-"]);
      } else {
        g.breakdown.forEach((b, i) =>
          rows.push([i === 0 ? g.nombre : "", i === 0 ? Number(fmt(g.W, 1)) : "", i === 0 ? Number(fmt(g.VA, 1)) : "", b.key, Number(fmt(b.A, 1)), Number(fmt(b.A * 1.25, 1))])
        );
      }
    });
    return rows;
  };
  const generadorSheetRows = () => [
    ["VA total", "Simultaneidad %", "Margen reserva %", "kVA sugerido", "Advertencia de arranque"],
    [Number(fmt(totalGeneral.VA, 1)), simultaneidad, margenReserva, Number(fmt(kvaSugerido, 1)), hasInrush ? "SI — hay motores/HID, consultar al proveedor de planta" : "NO"],
  ];
  const notasSheetRows = () => [["Notas del proyecto"], [notas || "(sin notas)"]];

  const exportItems = () => xlsxDownload(`${fileBaseName}_catalogo.xlsx`, itemsSheetRows(), "Catálogo");
  const exportTotal = () => xlsxDownload(`${fileBaseName}_resumen.xlsx`, totalSheetRows(), "Resumen general");
  const exportGenerador = () => xlsxDownload(`${fileBaseName}_generador.xlsx`, generadorSheetRows(), "Generador");
  const exportAll = () => {
    const sheets = [
      { name: "Catálogo", rows: itemsSheetRows() },
      ...groupsResolved.map((g) => ({ name: g.nombre || "Grupo", rows: groupSheetRows(g) })),
      { name: "Resumen general", rows: totalSheetRows() },
      { name: "Generador", rows: generadorSheetRows() },
      { name: "Notas", rows: notasSheetRows() },
    ];
    xlsxDownloadMulti(`${fileBaseName}.xlsx`, sheets);
  };
  const exportJSON = () => {
    jsonDownload(`${fileBaseName}.json`, { app: "lightXtool VoltGen", exportedAt: new Date().toISOString(), eventInfo, items, groups, simultaneidad, margenReserva, notas });
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
        setEventInfo(s.eventInfo || { nombre: "", fecha: "", responsable: "" });
        setItems(s.items || []);
        setGroups(s.groups || []);
        setSimultaneidad(s.simultaneidad ?? 100);
        setMargenReserva(s.margenReserva ?? 20);
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

  // ── proyectos guardados ──────────────────────────────────────
  const guardarProyectoActual = async () => {
    const name = (saveProjectNameInput || "").trim() || eventInfo.nombre || `Proyecto ${savedProjects.length + 1}`;
    const id = genId("proy");
    const snapshot = { id, name, eventInfo, items, groups, simultaneidad, margenReserva, notas, theme, savedAt: Date.now() };
    const indexEntry = { id, name, savedAt: snapshot.savedAt, numGrupos: groups.length, wTotal: totalGeneral.W };
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
      setEventInfo(s.eventInfo || { nombre: "", fecha: "", responsable: "" });
      setItems(s.items || []);
      setGroups(s.groups || []);
      setSimultaneidad(s.simultaneidad ?? 100);
      setMargenReserva(s.margenReserva ?? 20);
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
      const indexEntry = { id: newId, name: copy.name, savedAt: copy.savedAt, numGrupos: (copy.groups || []).length, wTotal: original ? original.wTotal : 0 };
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
          .print-only { display: block !important; color: #000 !important; background: #fff !important; padding: 20px; font-family: ${FONT}; }
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
                <Zap size={18} style={{ color: C.cyan }} />
                <h1 style={{ fontSize: "18px", letterSpacing: "3px", color: C.cyan, fontWeight: 700, margin: 0, ...glowText(`${C.cyan}, 0 0 28px rgba(0,160,250,.35)`) }}>
                  CALCULADORA DE VOLTAJES Y GENERADOR
                </h1>
              </div>
              <p style={{ fontSize: "11px", color: C.textDim, marginTop: "4px" }}>
                Catálogo de equipo → grupos (puentes, piso, pantalla, audio) → consumo por grupo → generador sugerido.
              </p>
              {msg && <p style={{ fontSize: "10px", color: C.cyan, fontStyle: "italic", marginTop: "2px" }}>{msg}</p>}
            </div>
            <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={{ ...btnStyle(), flexShrink: 0 }} title="Cambiar tema (solo afecta esta herramienta)">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </button>
          </div>

          <div style={{ height: "1px", background: `linear-gradient(90deg,transparent,${C.cyan},transparent)`, ...glowBox("rgba(0,160,250,.5)") }} />

          {/* Advertencias consolidadas */}
          {(estimatedInUseCount > 0 || hasInrush) && (
            <div style={{ ...panelStyle, padding: "10px 12px", border: `1px solid ${C.red}`, background: C.redBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={14} style={{ color: C.red }} />
                <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>Antes de entregar este documento, revisa:</span>
              </div>
              <ul style={{ margin: "6px 0 0 22px", padding: 0, fontSize: "11px", color: C.red }}>
                {estimatedInUseCount > 0 && <li>{estimatedInUseCount} tipo(s) de ítem en uso con FP estimado (no confirmado con ficha técnica).</li>}
                {hasInrush && <li>Hay motores o balastros (HID) asignados — su corriente de arranque no está incluida en el cálculo.</li>}
              </ul>
            </div>
          )}

          {/* Datos del evento */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FileText} title="Datos del documento"
              help="Nombre, fecha y responsable del evento — identifican el documento en los reportes exportados. No afectan ningún cálculo." />
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
                <div style={labelStyle}>Responsable</div>
                <input style={{ ...inputStyle, width: "100%", marginTop: "4px" }} value={eventInfo.responsable}
                  onChange={(e) => setEventInfo((p) => ({ ...p, responsable: e.target.value }))} placeholder="Nombre" />
              </div>
            </div>
          </div>

          {/* Guardar / exportar / importar */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Save} title="Guardar, exportar e importar"
              help="Genera los archivos finales (Excel, PDF, respaldo .json). Úsalo una vez que ya tengas al menos un grupo con ítems asignados en la sección Grupos."
              right={
                <button style={btnStyle()} onClick={() => setExportCollapsed((v) => !v)} title={exportCollapsed ? "Expandir" : "Colapsar"}>
                  {exportCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              } />
            {!exportCollapsed && (
              <>
                <div style={{ marginTop: "8px" }}>
                  <div style={labelStyle}>Nombre base de archivo (sugerencia, editable)</div>
                  <input style={{ ...inputStyle, width: "100%", maxWidth: "360px", marginTop: "4px" }} value={fileBaseName}
                    onChange={(e) => { setFileBaseName(e.target.value); setFileBaseEditado(true); }} />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                  <button style={btnStyle("primary")} onClick={exportAll} disabled={groups.length === 0} title="Un solo Excel con una pestaña por catálogo, cada grupo, resumen y generador">
                    <FileSpreadsheet size={14} /> Exportar todo (Excel)
                  </button>
                  <button style={btnStyle()} onClick={exportPDF} title="Abre el diálogo de impresión del navegador — ahí eliges 'Guardar como PDF'">
                    <Printer size={14} /> Exportar PDF
                  </button>
                  <button style={btnStyle()} onClick={exportJSON} title="Respaldo completo del proyecto, para mover o compartir">
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
              </>
            )}
          </div>

          {/* Proyectos guardados */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={FolderOpen} title="Proyectos guardados" subtitle={`${savedProjects.length} proyecto(s)`}
              help="Guarda una copia con nombre del documento actual para manejar varios eventos por separado. 'Nuevo' vacía el documento actual (avisa antes si hay algo sin guardar)."
              right={
                <div style={{ display: "flex", gap: "6px" }}>
                  <button style={btnStyle()} onClick={startNewDocument} title="Vaciar el documento actual y empezar desde cero">
                    <FilePlus size={13} /> Nuevo
                  </button>
                  <button style={btnStyle()} onClick={() => setProjectsCollapsed((v) => !v)} title={projectsCollapsed ? "Expandir" : "Colapsar"}>
                    {projectsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              } />
            {projectMsg && <p style={{ fontSize: "10px", color: C.cyan, marginTop: "6px" }}>{projectMsg}</p>}
            {!projectsCollapsed && (
              <>
                <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "4px" }}>
                  Se guarda solo en tu sesión (no es compartido). El proyecto actual se autoguarda; usa esto para tener
                  varios eventos por separado y poder volver a ellos.
                </p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  <input style={{ ...inputStyle, flex: 1, minWidth: "180px" }} value={saveProjectNameInput}
                    onChange={(e) => setSaveProjectNameInput(e.target.value)} placeholder="Nombre para guardar el proyecto actual" />
                  <button style={btnStyle("primary")} onClick={guardarProyectoActual}><Save size={13} /> Guardar como nuevo</button>
                </div>
                {savedProjects.length > 0 && (
                  <div style={{ overflowX: "auto", marginTop: "8px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Nombre", "Grupos", "W total", ""].map((h) => <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {savedProjects.map((p) => (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{p.name}</td>
                            <td style={tdStyle}>{p.numGrupos}</td>
                            <td style={tdStyle}>{fmt(p.wTotal, 1)} W</td>
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
              </>
            )}
          </div>

          {/* Catálogo */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Layers} title="Catálogo de equipo" subtitle={`${items.length} tipo(s) de ítem`}
              step={1}
              help="Da de alta cada tipo de equipo una sola vez (nombre, voltaje, consumo). Aquí no defines cantidades — eso se hace en 'Grupos', el siguiente paso."
              right={
                <div style={{ display: "flex", gap: "6px" }}>
                  <button style={btnStyle()} onClick={exportItems}><Download size={13} /> Excel</button>
                  <button style={btnStyle("primary")} onClick={addItem}><Plus size={14} /> Agregar ítem</button>
                  <button style={btnStyle()} onClick={() => setInvCollapsed((v) => !v)} title={invCollapsed ? "Expandir" : "Colapsar"}>
                    {invCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              }
            />
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "6px" }}>
              Para resultados confiables se necesita el mayor detalle posible de datos de la ficha técnica (V, W o A y, si
              es posible, FP). El ⚠ junto al FP indica que ese valor es un estimado de referencia, no un dato
              confirmado — corrígelo si tienes la ficha técnica real. Motores y balastros (HID) tienen un pico de
              arranque (inrush) que este cálculo no incluye; considéralo aparte al pedir capacidad de generador.
            </p>

            {!invCollapsed && (
              items.length === 0 ? (
                <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Sin ítems. Agrega equipo para empezar.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Nombre", "Voltaje", "Consumo (W o A)", "Tipo de fuente", "FP", "Fase", "A unit.", ""].map((h) => (
                          <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itemsResolved.map((it) => (
                        <tr key={it.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                          <td style={tdStyle}>
                            <input style={{ ...inputStyle, width: "130px" }} value={it.nombre}
                              onChange={(e) => updateItem(it.id, { nombre: e.target.value })} placeholder="Nombre/modelo" />
                          </td>
                          <td style={tdStyle}>
                            <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "64px" }} value={it.voltage}
                              onCommit={(n) => onVoltageChange(it.id, n)} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <NumberField decimals={2} min={0} style={{ ...inputStyle, width: "72px" }} value={it.consumoValor}
                                onCommit={(n) => updateItem(it.id, { consumoValor: n })} />
                              <select style={{ ...selectStyle, width: "58px" }} value={it.consumoTipo}
                                onChange={(e) => updateItem(it.id, { consumoTipo: e.target.value })}>
                                <option value="W">W</option>
                                <option value="A">A</option>
                              </select>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <select style={{ ...selectStyle, width: "190px" }} value={it.tipo} onChange={(e) => onTipoChange(it.id, e.target.value)}>
                              {Object.entries(SOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <NumberField decimals={2} min={0.1} max={1} style={{ ...inputStyle, width: "56px", borderColor: it.isEstimated ? "rgba(255,29,29,.5)" : C.border }}
                                value={it.fp} onCommit={(n) => onFpChange(it.id, n)} />
                              {it.isEstimated && <span title="FP estimado, no confirmado con ficha técnica"><AlertTriangle size={13} style={{ color: C.red }} /></span>}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <select style={{ ...selectStyle, width: "88px" }} value={it.phase}
                              onChange={(e) => updateItem(it.id, { phase: e.target.value })}>
                              <option value="monofasico">Mono</option>
                              <option value="trifasico">Trifásico</option>
                            </select>
                          </td>
                          <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700 }}>{fmt(it.unit.A, 2)} A</td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button onClick={() => duplicateItem(it.id)} title="Duplicar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Copy size={14} /></button>
                              <button onClick={() => requestDelete("item", it.id, it.nombre || "este ítem")} title="Eliminar" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
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

          {/* Grupos */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader
              icon={Gauge} title="Grupos" subtitle={`${groups.length} grupo(s)`}
              step={2}
              help="Crea un grupo por cada punto de conexión física (ej. puente, piso, pantalla) y asigna ahí los ítems del catálogo con su cantidad real. De aquí sale todo el cálculo de W, VA y A."
              right={<button style={btnStyle("primary")} onClick={addGroup} disabled={items.length === 0}><Plus size={14} /> Agregar grupo</button>}
            />
            {items.length === 0 && <p style={{ fontSize: "12px", color: C.textFaint, marginTop: "10px" }}>Da de alta al menos un ítem en el catálogo primero.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
              {groupsResolved.map((g) => (
                <div key={g.id} style={{ background: theme === "dark" ? "rgba(255,255,255,.02)" : C.panelAlt, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button onClick={() => patchGroup(g.id, { colapsado: !g.colapsado })}
                        style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex" }}
                        title={g.colapsado ? "Expandir grupo" : "Colapsar grupo"}>
                        {g.colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <input style={{ ...inputStyle, width: "220px", fontWeight: 700, color: C.cyan }} value={g.nombre}
                        onChange={(e) => patchGroup(g.id, { nombre: e.target.value })} placeholder="Título del grupo (ej. Puente centro, Piso atrás)" />
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {!g.colapsado && <button style={btnStyle()} onClick={() => addAllocation(g.id)}><Plus size={12} /> Ítem</button>}
                      <button style={btnStyle("danger")} onClick={() => requestDelete("group", g.id, g.nombre || "este grupo")}><Trash2 size={12} /></button>
                    </div>
                  </div>

                  {!g.colapsado && (g.alloc.length === 0 ? (
                    <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "8px" }}>Sin ítems asignados a este grupo.</p>
                  ) : (
                    <div style={{ marginTop: "8px", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                            {["Ítem", "Cant.", "W total", "A total", ""].map((h) => (
                              <th key={h} style={{ ...thStyle, ...labelStyle, padding: "4px 8px" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.alloc.map((a, idx) => {
                            const d = g.detalle[idx];
                            return (
                              <tr key={idx}>
                                <td style={{ ...tdStyle, padding: "4px 8px" }}>
                                  <select style={{ ...selectStyle, width: "180px" }} value={a.itemId}
                                    onChange={(e) => updateAllocation(g.id, idx, { itemId: e.target.value })}>
                                    {items.map((it) => <option key={it.id} value={it.id}>{it.nombre || "(sin nombre)"}</option>)}
                                  </select>
                                </td>
                                <td style={{ ...tdStyle, padding: "4px 8px" }}>
                                  <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "56px" }} value={a.cantidad}
                                    onCommit={(n) => updateAllocation(g.id, idx, { cantidad: n })} />
                                </td>
                                <td style={{ ...tdStyle, padding: "4px 8px" }}>{d ? fmt(d.W, 1) : "-"}</td>
                                <td style={{ ...tdStyle, padding: "4px 8px", color: C.cyan, fontWeight: 700 }}>{d ? fmt(d.A, 2) : "-"}</td>
                                <td style={{ padding: "4px 8px" }}>
                                  <button onClick={() => removeAllocation(g.id, idx)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
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

                  <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${C.panelAlt}`, fontSize: "11px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
                    <span>W total: <b style={{ color: C.text }}>{fmt(g.W, 1)} W</b></span>
                    <span>VA total: <b style={{ color: C.text }}>{fmt(g.VA, 1)} VA</b></span>
                    {g.breakdown.map((b) => (
                      <span key={b.key}>
                        {b.key}: <b style={{ color: C.cyan }}>{fmt(b.A, 1)} A</b>
                        <span style={{ color: C.textFaint }}> (125%: {fmt(b.A * 1.25, 1)} A)</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen general */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={Gauge} title="Resumen general" subtitle="suma de todos los grupos"
              step={3}
              help="Suma automática de todos los grupos — no necesitas llenar nada aquí, solo revisar los totales y el desglose por voltaje/fase."
              right={<button style={btnStyle()} onClick={exportTotal}><Download size={13} /> Excel</button>} />

            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", fontSize: "11px", color: C.textDim }}>
              <PackageCheck size={13} style={{ color: C.cyan }} />
              Inventario total asignado: <b style={{ color: C.text }}>{totalQtyAssigned} pieza(s)</b> · <b style={{ color: C.text }}>{fmt(totalGeneral.W, 1)} W</b>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "8px", fontSize: "12px" }}>
              <span>W total: <b style={{ color: C.text }}>{fmt(totalGeneral.W, 1)} W</b></span>
              <span>VA total: <b style={{ color: C.text }}>{fmt(totalGeneral.VA, 1)} VA</b></span>
            </div>
            {totalGeneral.breakdown.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ ...thStyle, ...labelStyle }}>V / Fase</th>
                    <th style={{ ...thStyle, ...labelStyle }}>A</th>
                    <th style={{ ...thStyle, ...labelStyle }}>A con margen 125%</th>
                  </tr>
                </thead>
                <tbody>
                  {totalGeneral.breakdown.map((b) => (
                    <tr key={b.key} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                      <td style={tdStyle}>{b.key}</td>
                      <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700 }}>{fmt(b.A, 1)} A</td>
                      <td style={tdStyle}>{fmt(b.A * 1.25, 1)} A</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: "10px", color: C.textFaint, marginTop: "8px" }}>
              Margen 125% = convención de referencia para cargas continuas (breaker/conductor). Confirmar con electricista/normativa aplicable.
            </p>

            {groupsResolved.length > 0 && (
              <>
                <div style={{ ...labelStyle, marginTop: "14px", marginBottom: "6px" }}>Desglose por grupo</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Grupo", "W", "VA", "A por V/Fase (con margen 125%)"].map((h) => (
                          <th key={h} style={{ ...thStyle, ...labelStyle }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupsResolved.map((g) => (
                        <tr key={g.id} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: C.cyan }}>{g.nombre}</td>
                          <td style={tdStyle}>{fmt(g.W, 1)} W</td>
                          <td style={tdStyle}>{fmt(g.VA, 1)} VA</td>
                          <td style={tdStyle}>
                            {g.breakdown.length === 0 ? "-" : g.breakdown.map((b) => `${b.key}: ${fmt(b.A, 1)}A (${fmt(b.A * 1.25, 1)}A)`).join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Generador */}
          <div style={{ ...panelStyle, padding: "12px", border: `1px solid ${C.cyanLight}`, ...glowBox("rgba(0,160,250,.15)") }}>
            <SectionHeader icon={Zap} title="Generador sugerido"
              step={4}
              help="Ajusta simultaneidad y margen de reserva para obtener el kVA sugerido, calculado sobre el total de 'Resumen general'."
              right={<button style={btnStyle()} onClick={exportGenerador}><Download size={13} /> Excel</button>} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px", marginTop: "10px" }}>
              <div>
                <div style={labelStyle}>Factor de simultaneidad (%)</div>
                <input type="range" min="10" max="100" value={simultaneidad} style={{ width: "100%", accentColor: C.cyan }}
                  onChange={(e) => setSimultaneidad(Number(e.target.value))} />
                <div style={{ fontSize: "12px", color: C.cyan }}>{simultaneidad}%</div>
              </div>
              <div>
                <div style={labelStyle}>Margen de reserva (%)</div>
                <NumberField decimals={0} min={0} style={{ ...inputStyle, width: "100%" }} value={margenReserva}
                  onCommit={(n) => setMargenReserva(n)} />
                <div style={{ fontSize: "9px", color: C.textFaint, marginTop: "2px" }}>Referencia común: 20–25%. Editable.</div>
              </div>
            </div>

            <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={labelStyle}>kVA sugerido</span>
              <span style={{ fontSize: "26px", fontWeight: 700, color: C.cyan, ...glowText("rgba(0,160,250,.5)") }}>{fmt(kvaSugerido, 1)}</span>
              <span style={{ fontSize: "11px", color: C.textFaint }}>kVA (mínimo teórico a pedir)</span>
            </div>

            {hasInrush && (
              <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "flex-start", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: "4px", padding: "8px 10px" }}>
                <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0, marginTop: "1px" }} />
                <span style={{ fontSize: "11px", color: C.red }}>
                  Hay motores o balastros (HID) asignados: el inrush no está incluido en este cálculo — consulta al
                  proveedor de planta.
                </span>
              </div>
            )}
          </div>

          {/* Notas del proyecto */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={StickyNote} title="Notas del proyecto" subtitle="opcional, libre"
              help="Texto libre para contexto que los números no explican (ej. circuitos dedicados, acuerdos con el cliente). Se incluye en el PDF y en el Excel." />
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4}
              placeholder="Notas libres: circuitos dedicados, pendientes, acuerdos con el cliente, etc."
              style={{ ...inputStyle, width: "100%", marginTop: "8px", resize: "vertical", fontFamily: FONT }} />
          </div>

          {/* Nota legal fija */}
          <div style={{ ...panelStyle, padding: "12px", background: C.panelAlt }}>
            <p style={{ fontSize: "10px", color: C.textFaint, lineHeight: 1.6 }}>
              Documento preliminar de cálculo de cargas, para revisión. Los valores de factor de potencia no confirmados con
              ficha técnica están marcados como estimados. El reparto por fase es un estimado de planeación y no sustituye
              la verificación física en campo. La normativa eléctrica aplicable y el margen de seguridad final deben ser
              confirmados por un electricista o autoridad certificada antes de la instalación.
            </p>
          </div>

          {/* Simbología y nomenclatura */}
          <div style={{ ...panelStyle, padding: "12px" }}>
            <SectionHeader icon={BookOpen} title="Simbología y nomenclatura"
              help="Glosario de referencia para quien reciba el documento — no requiere ninguna acción tuya."
              right={
                <button style={btnStyle()} onClick={() => setGlosarioCollapsed((v) => !v)} title={glosarioCollapsed ? "Expandir" : "Colapsar"}>
                  {glosarioCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              } />
            {!glosarioCollapsed && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "8px" }}>
                <tbody>
                  {SIMBOLOGIA.map(([sym, meaning]) => (
                    <tr key={sym} style={{ borderBottom: `1px solid ${C.panelAlt}` }}>
                      <td style={{ ...tdStyle, color: C.cyan, fontWeight: 700, width: "70px" }}>{sym}</td>
                      <td style={tdStyle}>{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Confirmación de borrado */}
      {pendingDelete && (
        <div className="no-print" style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 999,
          background: C.panel, border: `1px solid ${C.red}`, borderRadius: "6px", padding: "10px 14px",
          display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 20px rgba(0,0,0,.5)", maxWidth: "92vw" }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ fontSize: "11px", color: C.text }}>
            {pendingDelete.type === "nuevo"
              ? "¿Empezar un documento nuevo? Se perderá el catálogo, grupos y notas actuales que no hayas guardado como proyecto. No se puede deshacer."
              : `¿Eliminar "${pendingDelete.label}"? No se puede deshacer.`}
          </span>
          <button onClick={confirmPendingDelete} style={btnStyle("danger")}>
            {pendingDelete.type === "nuevo" ? "Sí, empezar nuevo" : "Eliminar"}
          </button>
          <button onClick={cancelDelete} style={btnStyle()}><X size={13} /> Cancelar</button>
        </div>
      )}

      {/* Vista de impresión (PDF) */}
      <div className="print-only">
        <h1>{eventInfo.nombre || "Documento de cargas eléctricas"}</h1>
        <p>
          {eventInfo.fecha ? `Fecha del evento: ${eventInfo.fecha}` : ""}{eventInfo.fecha && eventInfo.responsable ? " · " : ""}
          {eventInfo.responsable ? `Responsable: ${eventInfo.responsable}` : ""}
        </p>
        <p>Generado: {new Date().toLocaleString("es")}</p>

        <h2>Catálogo</h2>
        <table>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>V</th><th>Consumo</th><th>FP</th><th>Estimado</th><th>Fase</th><th>A unit.</th></tr></thead>
          <tbody>
            {itemsResolved.map((it) => (
              <tr key={it.id}>
                <td>{it.nombre || "(sin nombre)"}</td>
                <td>{SOURCE_TYPES[it.tipo].label}</td>
                <td>{it.voltage}</td>
                <td>{it.consumoValor} {it.consumoTipo}</td>
                <td>{it.fp}</td>
                <td>{it.isEstimated ? "SI" : "NO"}</td>
                <td>{it.phase === "trifasico" ? "Trifásico" : "Monofásico"}</td>
                <td>{fmt(it.unit.A, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {groupsResolved.map((g) => (
          <div key={g.id}>
            <h2>Grupo: {g.nombre}</h2>
            <table>
              <thead><tr><th>Ítem</th><th>V</th><th>Fase</th><th>Cant.</th><th>W total</th><th>A total</th></tr></thead>
              <tbody>
                {g.detalle.map((d, i) => (
                  <tr key={i}>
                    <td>{d.nombre}</td><td>{d.voltage}</td>
                    <td>{d.phase === "trifasico" ? "Trifásico" : "Monofásico"}</td>
                    <td>{d.cantidad}</td><td>{fmt(d.W, 1)}</td><td>{fmt(d.A, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>W total: {fmt(g.W, 1)} W · VA total: {fmt(g.VA, 1)} VA · {g.breakdown.map((b) => `${b.key}: ${fmt(b.A, 1)}A (125%: ${fmt(b.A * 1.25, 1)}A)`).join(" · ")}</p>
          </div>
        ))}

        <h2>Resumen general</h2>
        <p>Inventario total: {totalQtyAssigned} pieza(s) · {fmt(totalGeneral.W, 1)} W · {fmt(totalGeneral.VA, 1)} VA</p>
        <table>
          <thead><tr><th>V/Fase</th><th>A</th><th>A con margen 125%</th></tr></thead>
          <tbody>
            {totalGeneral.breakdown.map((b) => (
              <tr key={b.key}><td>{b.key}</td><td>{fmt(b.A, 1)}</td><td>{fmt(b.A * 1.25, 1)}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>Generador sugerido</h2>
        <p>
          VA total: {fmt(totalGeneral.VA, 1)} · Simultaneidad: {simultaneidad}% · Margen de reserva: {margenReserva}% ·
          kVA sugerido: <b>{fmt(kvaSugerido, 1)}</b>
          {hasInrush ? " · Advertencia: hay motores/HID, consultar capacidad de arranque con el proveedor de planta." : ""}
        </p>

        {notas && (<><h2>Notas del proyecto</h2><p>{notas}</p></>)}

        <h2>Nota</h2>
        <p>
          Documento preliminar de cálculo de cargas, para revisión. Los valores de factor de potencia no confirmados con
          ficha técnica están marcados como estimados. El reparto por fase es un estimado de planeación y no sustituye la
          verificación física en campo. La normativa eléctrica aplicable y el margen de seguridad final deben ser
          confirmados por un electricista o autoridad certificada antes de la instalación.
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
