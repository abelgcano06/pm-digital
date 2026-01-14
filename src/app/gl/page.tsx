"use client";

import { useEffect, useMemo, useState } from "react";
import "./gl.css";

type PMItem = {
  uploadedFileId: string;
  fileName: string;
  blobUrl: string;

  glOwner?: string | null;
  pmType?: string | null;
  pmStatus?: "OPEN" | "COMPLETED" | "CLOSED";
  uploadedAt?: string;

  pmNumber?: string | null;
  pmName?: string | null;
  assetCode?: string | null;
  location?: string | null;

  // ✅ NUEVO
  executionPdfUrl?: string | null;
  lastExecutionFinishedAt?: string | null;
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

export default function GLDashboardPage() {
  const [items, setItems] = useState<PMItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [glFilter, setGlFilter] = useState<string>(GL_OPTIONS[0]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "OPEN" | "COMPLETED" | "CLOSED">("all");

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setErr(null);

      const res = await fetch("/api/pm-files", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      const arr: any[] = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json)
        ? json
        : [];

      setItems(arr as PMItem[]);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "No se pudo cargar la lista.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((x) => (x.glOwner || "").toLowerCase() === glFilter.toLowerCase())
      .filter((x) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        const hay = `${x.fileName || ""} ${x.pmName || ""} ${x.pmNumber || ""}`.toLowerCase();
        return hay.includes(s);
      })
      .filter((x) => {
        if (statusFilter === "all") return true;
        return (x.pmStatus || "OPEN") === statusFilter;
      });
  }, [items, glFilter, search, statusFilter]);

  async function setStatus(uploadedFileId: string, status: "CLOSED" | "OPEN") {
    setActionError(null);
    setActionBusyId(uploadedFileId);

    try {
      const res = await fetch("/api/gl/pm-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedFileId, status }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data?.ok) {
        const msg = data?.error || "No se puede actualizar el status";
        const details = data?.details ? `\n${data.details}` : "";
        const current = data?.currentStatus ? `\nStatus actual: ${data.currentStatus}` : "";
        throw new Error(msg + current + details);
      }

      setItems((prev) =>
        prev.map((x) =>
          x.uploadedFileId === uploadedFileId ? { ...x, pmStatus: status } : x
        )
      );
    } catch (e: any) {
      console.error(e);
      setActionError(e?.message || "Error al actualizar.");
    } finally {
      setActionBusyId(null);
    }
  }

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
      <header className="gl-header">
        <div className="gl-header-main">
          <div className="gl-chip">GL DASHBOARD • Revisión</div>
          <h1 className="gl-title">PMs asignados</h1>
          <p className="gl-subtitle">
            Aquí ves los PMs asignados a tu nombre. Puedes ver el PDF original y el PDF de ejecución,
            y cerrar el PM cuando ya lo revisaste.
          </p>
          <div className="gl-meta">
            <span className="gl-meta-time">{nowLabel}</span>
            <span className="gl-meta-status">● Online</span>
          </div>
        </div>

        <div className="gl-header-right">
          <button className="gl-btn gl-btn-secondary" onClick={load} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar lista"}
          </button>
        </div>
      </header>

      <main className="gl-shell">
        <section className="gl-card">
          <div className="gl-card-head">
            <div>
              <h2 className="gl-card-title">Filtros</h2>
              <p className="gl-card-help">
                Solo se muestran PMs donde <strong>GL Owner</strong> coincide exactamente con el GL seleccionado.
              </p>
            </div>
          </div>

          <div className="gl-filters">
            <div className="gl-field">
              <label className="gl-label">GL</label>
              <select className="gl-input" value={glFilter} onChange={(e) => setGlFilter(e.target.value)}>
                {GL_OPTIONS.map((gl) => (
                  <option key={gl} value={gl}>
                    {gl}
                  </option>
                ))}
              </select>
            </div>

            <div className="gl-field">
              <label className="gl-label">Buscar</label>
              <input
                className="gl-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="PM name / número / archivo..."
              />
            </div>

            <div className="gl-field">
              <label className="gl-label">Status</label>
              <select className="gl-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="all">Todos</option>
                <option value="OPEN">OPEN</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          </div>

          {err && <div className="gl-alert gl-alert-error">{err}</div>}
          {actionError && <div className="gl-alert gl-alert-error">{actionError}</div>}

          <div className="gl-divider" />

          {loading ? (
            <div className="gl-empty">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="gl-empty">No hay PMs para este GL con esos filtros.</div>
          ) : (
            <div className="gl-table">
              <div className="gl-row gl-row-head">
                <div className="gl-col-name">PM</div>
                <div className="gl-col-type">Tipo</div>
                <div className="gl-col-status">Status</div>
                <div className="gl-col-date">Fecha</div>
                <div className="gl-col-actions">Acciones</div>
              </div>

              {filtered.map((pm) => {
                const busy = actionBusyId === pm.uploadedFileId;
                const status = pm.pmStatus || "OPEN";

                const statusClass =
                  status === "COMPLETED"
                    ? "tag tag-completed"
                    : status === "CLOSED"
                    ? "tag tag-closed"
                    : "tag tag-open";

                const dateLabel = pm.uploadedAt
                  ? new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "short", day: "2-digit" }).format(
                      new Date(pm.uploadedAt)
                    )
                  : "-";

                return (
                  <div key={pm.uploadedFileId} className="gl-row">
                    <div className="gl-col-name">
                      <div className="gl-name">{pm.pmName || pm.fileName}</div>
                      <div className="gl-sub">
                        {pm.pmNumber ? <span>PM: {pm.pmNumber}</span> : <span>Archivo</span>}
                        {pm.assetCode ? <span> • {pm.assetCode}</span> : null}
                        {pm.location ? <span> • {pm.location}</span> : null}
                      </div>
                    </div>

                    <div className="gl-col-type">
                      <span className="tag tag-type">{(pm.pmType || "-").toUpperCase()}</span>
                    </div>

                    <div className="gl-col-status">
                      <span className={statusClass}>{status}</span>
                    </div>

                    <div className="gl-col-date">{dateLabel}</div>

                    <div className="gl-col-actions">
                      <button className="gl-btn gl-btn-ghost" onClick={() => window.open(pm.blobUrl, "_blank")}>
                        Ver PDF original
                      </button>

                      <button
                        className="gl-btn gl-btn-ghost"
                        disabled={!pm.executionPdfUrl}
                        title={!pm.executionPdfUrl ? "Aún no existe PDF de ejecución" : "Abrir PDF de ejecución"}
                        onClick={() => pm.executionPdfUrl && window.open(pm.executionPdfUrl, "_blank")}
                      >
                        Ver PDF ejecución
                      </button>

                      {status === "COMPLETED" && (
                        <button className="gl-btn gl-btn-primary" disabled={busy} onClick={() => setStatus(pm.uploadedFileId, "CLOSED")}>
                          {busy ? "Cerrando..." : "Cerrar (CLOSED)"}
                        </button>
                      )}

                      {status === "CLOSED" && (
                        <button className="gl-btn gl-btn-secondary" disabled={busy} onClick={() => setStatus(pm.uploadedFileId, "OPEN")}>
                          {busy ? "Reabriendo..." : "Reabrir (OPEN)"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
