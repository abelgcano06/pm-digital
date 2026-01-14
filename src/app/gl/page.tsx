"use client";

import { useEffect, useMemo, useState } from "react";
import "./gl-dashboard.css";

type PMItem = {
  uploadedFileId: string;

  fileName: string;
  blobUrl: string;

  glOwner: string | null;
  pmType: string | null;
  pmStatus: "OPEN" | "COMPLETED" | "CLOSED";
  uploadedAt: string;

  hasTemplate: boolean;
  templateId: string | null;

  pmNumber: string | null;
  pmName: string | null;
  assetCode?: string | null;
  location?: string | null;

  lastExecutionId: string | null;
  lastExecutionPdfUrl: string | null;
  lastFinishedAt: string | null;
};

const GL_OPTIONS = [
  "alicia elizondo",
  "miguel gonzalez",
  "candelario espinoza",
  "jesus gonzalez",
  "adolfo lopez",
  "oscar palacios",
  "jose luis avila",
  "isai bon",
];

const PM_TYPES = ["online", "offline", "pdm", "4s+s"];

export default function GLDashboardPage() {
  const [activeGL, setActiveGL] = useState<string>(GL_OPTIONS[0]);

  const [items, setItems] = useState<PMItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pm-files?glOwner=${encodeURIComponent(activeGL)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar la lista de PMs");

      const arr: PMItem[] = Array.isArray(json?.items) ? json.items : [];
      setItems(arr);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Error cargando datos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGL]);

  const filtered = useMemo(() => {
    return items
      .filter((x) => (x.fileName || "").toLowerCase().includes(search.toLowerCase()))
      .filter((x) => {
        if (typeFilter === "all") return true;
        return (x.pmType || "").toLowerCase() === typeFilter.toLowerCase();
      })
      .filter((x) => {
        if (statusFilter === "all") return true;
        return (x.pmStatus || "").toLowerCase() === statusFilter.toLowerCase();
      });
  }, [items, search, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: items.length, open: 0, completed: 0, closed: 0, withPdf: 0 };
    for (const x of items) {
      if (x.pmStatus === "OPEN") c.open++;
      if (x.pmStatus === "COMPLETED") c.completed++;
      if (x.pmStatus === "CLOSED") c.closed++;
      if (x.lastExecutionPdfUrl) c.withPdf++;
    }
    return c;
  }, [items]);

  const nowLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <div className="gl-page">
      <div className="gl-shell">
        <header className="gl-header">
          <div className="gl-header-main">
            <div className="gl-app-chip">BAJA PM APP • GL DASHBOARD</div>
            <h1 className="gl-title">Panel de GL</h1>
            <p className="gl-subtitle">
              Revisa PMs asignados a tu nombre, estatus y PDFs de cierre.
            </p>
            <div className="gl-meta">
              <span className="gl-meta-time">{nowLabel}</span>
              <span className="gl-meta-status">● Online • Blue Theme</span>
            </div>
          </div>

          <div className="gl-header-badge">
            <span className="gl-badge-title">Resumen</span>
            <span className="gl-badge-text">
              Total: <strong>{counts.total}</strong> · OPEN: <strong>{counts.open}</strong> · COMPLETED:{" "}
              <strong>{counts.completed}</strong> · CLOSED: <strong>{counts.closed}</strong> · PDFs:{" "}
              <strong>{counts.withPdf}</strong>
            </span>
          </div>
        </header>

        {/* Tabs de GL */}
        <div className="gl-tabs">
          {GL_OPTIONS.map((gl) => (
            <button
              key={gl}
              className={`gl-tab ${activeGL === gl ? "gl-tab-active" : ""}`}
              onClick={() => setActiveGL(gl)}
              type="button"
            >
              {gl}
            </button>
          ))}
        </div>

        <main className="gl-grid">
          <section className="gl-card gl-card-left">
            <div className="gl-card-header">
              <div className="gl-card-icon">🔎</div>
              <div>
                <h2 className="gl-card-title">Filtros</h2>
                <p className="gl-card-help">Busca y filtra solo tus PMs.</p>
              </div>
              <button className="gl-btn gl-btn-secondary" onClick={load} type="button">
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>

            <div className="gl-filter-block">
              <label className="gl-label">Buscar por nombre</label>
              <input
                className="gl-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej: motor rollers, conveyor, booth..."
              />
            </div>

            <div className="gl-filter-row">
              <div className="gl-filter-block">
                <label className="gl-label">Tipo</label>
                <select className="gl-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Todos</option>
                  {PM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gl-filter-block">
                <label className="gl-label">Estatus</label>
                <select
                  className="gl-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="OPEN">OPEN</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
            </div>

            {err && <div className="gl-alert gl-alert-error">{err}</div>}
            {!loading && !err && items.length === 0 && (
              <div className="gl-alert gl-alert-warning">
                No hay PMs asignados a <strong>{activeGL}</strong>.
              </div>
            )}

            <div className="gl-note">
              * Nota: Aquí NO se suben PMs. Solo revisión, estatus y PDF de cierre.
            </div>
          </section>

          <section className="gl-card gl-card-right">
            <div className="gl-card-header gl-card-header-right">
              <div className="gl-card-icon">📋</div>
              <div>
                <h2 className="gl-card-title">PMs de: {activeGL}</h2>
                <p className="gl-card-help">
                  Si está COMPLETED y existe PDF, podrás abrir el cierre.
                </p>
              </div>
              {loading && <span className="gl-loading-tag">Cargando...</span>}
            </div>

            {!loading && filtered.length === 0 && !err && (
              <div className="gl-alert gl-alert-warning">No hay resultados con esos filtros.</div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="gl-list">
                {filtered.map((pm) => {
                  const statusClass =
                    pm.pmStatus === "OPEN"
                      ? "gl-status-open"
                      : pm.pmStatus === "COMPLETED"
                      ? "gl-status-completed"
                      : "gl-status-closed";

                  return (
                    <div key={pm.uploadedFileId} className="gl-row">
                      <div className="gl-row-main">
                        <div className="gl-row-title">{pm.fileName}</div>
                        <div className="gl-row-sub">
                          <span className={`gl-status-pill ${statusClass}`}>{pm.pmStatus}</span>
                          <span className="gl-muted">
                            Tipo: <strong>{(pm.pmType || "-").toUpperCase()}</strong>
                          </span>
                          <span className="gl-muted">
                            Template:{" "}
                            <strong>{pm.templateId ? "Sí" : "No (se genera al iniciar en asociados)"}</strong>
                          </span>
                        </div>

                        <div className="gl-row-sub gl-row-sub2">
                          {pm.pmNumber && <span className="gl-muted">PM#: <strong>{pm.pmNumber}</strong></span>}
                          {pm.pmName && <span className="gl-muted">Nombre: <strong>{pm.pmName}</strong></span>}
                          {pm.assetCode && <span className="gl-muted">Asset: <strong>{pm.assetCode}</strong></span>}
                          {pm.location && <span className="gl-muted">Loc: <strong>{pm.location}</strong></span>}
                        </div>
                      </div>

                      <div className="gl-row-actions">
                        <button
                          type="button"
                          className="gl-btn gl-btn-secondary"
                          onClick={() => window.open(pm.blobUrl, "_blank")}
                        >
                          Ver PDF original
                        </button>

                        <button
                          type="button"
                          className={`gl-btn ${pm.lastExecutionPdfUrl ? "gl-btn-primary" : "gl-btn-disabled"}`}
                          onClick={() => pm.lastExecutionPdfUrl && window.open(pm.lastExecutionPdfUrl, "_blank")}
                          disabled={!pm.lastExecutionPdfUrl}
                        >
                          {pm.lastExecutionPdfUrl ? "Ver PDF cierre" : "Sin PDF cierre"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
