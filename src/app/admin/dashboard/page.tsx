// src/app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PMStatusEnum = "OPEN" | "COMPLETED" | "CLOSED";

type PMRow = {
  id: string;
  fileName: string;
  blobUrl: string;
  uploadedAt: string;
  uploadedBy?: string | null;
  pmNumber?: string | null;
  pmName?: string | null;
  glOwner?: string | null;
  pmType?: string | null;
  status?: "open" | "closed" | "deleted";
  pmStatus?: PMStatusEnum | null;
  active?: boolean;
  lastExecutionAt?: string | null;
  lastExecutionPdfUrl?: string | null;
};

type UploadItem = {
  file: File;
  glOwner: string;
  pmType: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
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

type StatusFilter = "open" | "completed" | "closed" | "all";

export default function AdminDashboardPage() {
  const [uploadedBy] = useState("Frida");
  const [defaultGl, setDefaultGl] = useState<string>(GL_OPTIONS[0]);
  const [defaultType, setDefaultType] = useState<string>("online");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PMRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [glFilter, setGlFilter] = useState<string>("all");

  // ── Cargar lista ──────────────────────────────────────────────
  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/list", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error al cargar lista: ${await res.text()}`);
      const data = await res.json();
      const arr: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.files)
        ? data.files
        : [];
      setItems(arr as PMRow[]);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la lista de PMs.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  // ── Selección de archivos ─────────────────────────────────────
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadItems((prev) => [
      ...prev,
      ...files.map((f) => ({
        file: f,
        glOwner: defaultGl,
        pmType: defaultType,
        status: "pending" as const,
      })),
    ]);
    // reset input para poder volver a seleccionar los mismos archivos
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateItem = (idx: number, patch: Partial<UploadItem>) =>
    setUploadItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeItem = (idx: number) =>
    setUploadItems((prev) => prev.filter((_, i) => i !== idx));

  const applyDefaultToAll = () =>
    setUploadItems((prev) =>
      prev
        .filter((it) => it.status !== "done")
        .map((it) =>
          it.status === "pending" ? { ...it, glOwner: defaultGl, pmType: defaultType } : it
        )
    );

  // ── Subir todos ───────────────────────────────────────────────
  const handleUploadAll = async () => {
    const pending = uploadItems.filter((it) => it.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);
    for (let i = 0; i < uploadItems.length; i++) {
      const item = uploadItems[i];
      if (item.status !== "pending") continue;

      updateItem(i, { status: "uploading" });
      try {
        const formData = new FormData();
        formData.append("uploadedBy", uploadedBy);
        formData.append("glOwner", item.glOwner);
        formData.append("pmType", item.pmType);
        formData.append("files", item.file);

        const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok || data.ok === false) throw new Error(data.error || "Error al subir");
        updateItem(i, { status: "done" });
      } catch (e: any) {
        updateItem(i, { status: "error", error: e?.message || "Error desconocido" });
      }
    }
    setUploading(false);
    await fetchItems();
  };

  const clearDone = () =>
    setUploadItems((prev) => prev.filter((it) => it.status !== "done"));

  const pendingCount = uploadItems.filter((it) => it.status === "pending").length;
  const doneCount = uploadItems.filter((it) => it.status === "done").length;
  const errorCount = uploadItems.filter((it) => it.status === "error").length;

  // ── Eliminar (soft delete) ────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este PM? (Se ocultará de los filtros normales)")) return;
    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchItems();
    } catch (e: any) {
      alert(e?.message || "No se pudo eliminar el PM.");
    }
  };

  // ── Cerrar PM ─────────────────────────────────────────────────
  const handleClosePm = async (id: string, pmStatus: PMStatusEnum) => {
    if (pmStatus !== "COMPLETED") {
      alert("Solo puedes cerrar PMs en estado COMPLETADO.");
      return;
    }
    if (!confirm("¿Marcar este PM como CERRADO?")) return;
    try {
      const res = await fetch("/api/admin/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo cerrar");
      await fetchItems();
    } catch (e: any) {
      alert(e?.message || "No se pudo cerrar el PM.");
    }
  };

  // ── Filtros ───────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isDeleted = item.status === "deleted" || item.active === false;
      if (isDeleted && statusFilter !== "all") return false;
      const pmStatus: PMStatusEnum = (item.pmStatus as PMStatusEnum) ?? "OPEN";
      if (statusFilter === "open" && pmStatus !== "OPEN") return false;
      if (statusFilter === "completed" && pmStatus !== "COMPLETED") return false;
      if (statusFilter === "closed" && pmStatus !== "CLOSED") return false;
      if (glFilter !== "all") {
        if ((item.glOwner || "").toLowerCase() !== glFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [items, statusFilter, glFilter]);

  const getStatusLabel = (pmStatus?: PMStatusEnum | null) => {
    if (pmStatus === "OPEN") return "Abierto";
    if (pmStatus === "COMPLETED") return "Completado";
    if (pmStatus === "CLOSED") return "Cerrado";
    return "Abierto";
  };

  const getStatusPillClass = (pmStatus?: PMStatusEnum | null) => {
    if (pmStatus === "CLOSED") return "status-pill status-pill-closed";
    if (pmStatus === "COMPLETED") return "status-pill status-pill-completed";
    return "status-pill status-pill-open";
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const statusIcon = (s: UploadItem["status"]) => {
    if (s === "uploading") return "⏳";
    if (s === "done") return "✅";
    if (s === "error") return "❌";
    return "📄";
  };

  return (
    <div className="admin-page">
      <div className="admin-shell">

        {/* HEADER */}
        <header className="admin-header">
          <div>
            <h1 className="admin-title">FRIDA · PMs Digitales</h1>
            <p className="admin-subtitle">
              Panel de control · Carga por lotes · Asignación por GL · Historial
            </p>
          </div>
        </header>

        {/* ── UPLOAD POR LOTES ── */}
        <section className="card upload-card">
          <div className="upload-header">
            <div>
              <h2 className="card-title">Subir PMs por lote</h2>
              <p className="card-subtitle">
                Selecciona varios PDFs. Asigna GL y Tipo a cada uno individualmente o usa "Aplicar a todos".
              </p>
            </div>
          </div>

          {/* Defaults + file picker */}
          <div className="defaults-row">
            <div className="field">
              <label>GL predeterminado</label>
              <select value={defaultGl} onChange={(e) => setDefaultGl(e.target.value)}>
                {GL_OPTIONS.map((gl) => (
                  <option key={gl} value={gl}>{gl}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tipo predeterminado</label>
              <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)}>
                {PM_TYPES.map((t) => (
                  <option key={t} value={t}>{t.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <label style={{ visibility: "hidden" }}>_</label>
              <button type="button" className="btn btn-soft" onClick={applyDefaultToAll}>
                Aplicar a todos los pendientes
              </button>
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <label style={{ visibility: "hidden" }}>_</label>
              <label className="btn btn-soft btn-pick" htmlFor="file-input">
                + Agregar PDFs
              </label>
              <input
                id="file-input"
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf"
                onChange={handleFilesSelected}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {/* Lista de archivos pendientes */}
          {uploadItems.length > 0 && (
            <div className="upload-list">
              <div className="upload-list-header">
                <span style={{ flex: 1 }}>Archivo</span>
                <span style={{ width: 180 }}>GL</span>
                <span style={{ width: 130 }}>Tipo</span>
                <span style={{ width: 60, textAlign: "center" }}>Estado</span>
                <span style={{ width: 32 }}></span>
              </div>

              {uploadItems.map((item, i) => (
                <div
                  key={i}
                  className={`upload-list-row ${item.status === "done" ? "row-done" : item.status === "error" ? "row-error" : ""}`}
                >
                  <span className="upload-file-name" style={{ flex: 1 }}>
                    {statusIcon(item.status)} {item.file.name}
                    {item.error && (
                      <span className="upload-error-msg">{item.error}</span>
                    )}
                  </span>

                  <select
                    style={{ width: 180 }}
                    value={item.glOwner}
                    disabled={item.status !== "pending"}
                    onChange={(e) => updateItem(i, { glOwner: e.target.value })}
                    className="inline-select"
                  >
                    {GL_OPTIONS.map((gl) => (
                      <option key={gl} value={gl}>{gl}</option>
                    ))}
                  </select>

                  <select
                    style={{ width: 130 }}
                    value={item.pmType}
                    disabled={item.status !== "pending"}
                    onChange={(e) => updateItem(i, { pmType: e.target.value })}
                    className="inline-select"
                  >
                    {PM_TYPES.map((t) => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>

                  <span style={{ width: 60, textAlign: "center", fontSize: 13, color: item.status === "done" ? "#197a4b" : item.status === "error" ? "#b3134d" : "#7b6a85" }}>
                    {item.status === "done" ? "Listo" : item.status === "error" ? "Error" : item.status === "uploading" ? "..." : "Pendiente"}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    disabled={item.status === "uploading"}
                    style={{ width: 32, background: "none", border: "none", cursor: "pointer", color: "#c04", fontSize: 16 }}
                    title="Quitar"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Resumen y acciones */}
              <div className="upload-summary">
                <span style={{ fontSize: 13, color: "#7b6a85" }}>
                  {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
                  {doneCount > 0 && ` · ${doneCount} subido${doneCount !== 1 ? "s" : ""}`}
                  {errorCount > 0 && ` · ${errorCount} con error`}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {doneCount > 0 && (
                    <button type="button" className="btn btn-soft btn-xs" onClick={clearDone}>
                      Limpiar completados
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={uploading || pendingCount === 0}
                    onClick={handleUploadAll}
                  >
                    {uploading ? "Subiendo..." : `Subir ${pendingCount} PDF${pendingCount !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {uploadItems.length === 0 && (
            <div className="upload-empty">
              <label htmlFor="file-input" className="upload-drop-zone">
                <span style={{ fontSize: 32 }}>📂</span>
                <span style={{ fontWeight: 600, color: "#ff4e9a" }}>Seleccionar PDFs</span>
                <span style={{ fontSize: 12, color: "#9b7aa5" }}>Puedes seleccionar varios a la vez</span>
              </label>
            </div>
          )}
        </section>

        {/* FILTERS */}
        <section className="card filter-card">
          <div className="filters-row">
            <div className="field">
              <label>Estado</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="open">Solo abiertos</option>
                <option value="completed">Solo completados</option>
                <option value="closed">Solo cerrados</option>
                <option value="all">Todos (histórico)</option>
              </select>
            </div>
            <div className="field">
              <label>GL</label>
              <select value={glFilter} onChange={(e) => setGlFilter(e.target.value)}>
                <option value="all">Todos</option>
                {GL_OPTIONS.map((gl) => (
                  <option key={gl} value={gl}>{gl}</option>
                ))}
              </select>
            </div>
            <div className="filters-right">
              <button type="button" className="btn btn-soft" onClick={fetchItems} disabled={loading}>
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>
        </section>

        {/* TABLA */}
        <section className="card">
          <div className="table-header-row">
            <h2 className="card-title">Listado de PMs</h2>
            <span className="badge">{items.length} PM{items.length === 1 ? "" : "s"}</span>
          </div>

          <div className="table-wrapper">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>PM</th>
                  <th>GL</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Última ejecución</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {loading ? "Cargando PMs..." : "No hay PMs que coincidan con el filtro seleccionado."}
                    </td>
                  </tr>
                )}
                {filteredItems.map((item) => {
                  const pmStatus: PMStatusEnum = (item.pmStatus as PMStatusEnum) ?? "OPEN";
                  const canClose = pmStatus === "COMPLETED";
                  const isDeleted = item.status === "deleted" || item.active === false;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="pm-main-cell">
                          <span className="pm-file-name">{item.fileName}</span>
                          <span className="pm-upload-info">
                            Subido: {formatDate(item.uploadedAt)} · {item.uploadedBy || "Sin nombre"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.pmNumber ? (
                          <div className="pm-number-block">
                            <span className="pm-number">{item.pmNumber}</span>
                            <span className="pm-name">{item.pmName || "—"}</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>{item.glOwner || "—"}</td>
                      <td>{item.pmType ? item.pmType.toUpperCase() : "—"}</td>
                      <td>
                        {isDeleted ? (
                          <span className="status-pill status-pill-deleted">Eliminado</span>
                        ) : (
                          <span className={getStatusPillClass(pmStatus)}>
                            {getStatusLabel(pmStatus)}
                          </span>
                        )}
                      </td>
                      <td>{formatDate(item.lastExecutionAt)}</td>
                      <td className="actions-cell">
                        <div className="actions-row">
                          <button type="button" className="btn btn-soft btn-xs" onClick={() => window.open(item.blobUrl, "_blank")}>
                            Ver PDF
                          </button>
                          <button type="button" className="btn btn-soft btn-xs" disabled={!item.lastExecutionPdfUrl} onClick={() => item.lastExecutionPdfUrl && window.open(item.lastExecutionPdfUrl, "_blank")}>
                            Ver cierre
                          </button>
                          <button type="button" className="btn btn-soft btn-xs" disabled={!canClose || isDeleted} onClick={() => canClose && !isDeleted && handleClosePm(item.id, pmStatus)}>
                            Cerrar PM
                          </button>
                          <button type="button" className="btn btn-danger btn-xs" disabled={isDeleted} onClick={() => handleDelete(item.id)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {error && (
          <div className="error-banner">⚠️ {error}</div>
        )}
      </div>

      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          background: radial-gradient(circle at top left, #ffe5f0 0, #fef5ff 40%, #ffffff 100%);
          padding: 32px 16px;
          display: flex;
          justify-content: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #2b2432;
        }
        .admin-shell { width: 100%; max-width: 1200px; }
        .admin-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 12px; }
        .admin-title { font-size: 26px; font-weight: 800; letter-spacing: 0.04em; color: #ff4e9a; text-shadow: 0 6px 20px rgba(255,111,166,0.5); }
        .admin-subtitle { margin-top: 4px; font-size: 14px; color: #7b6a85; }

        .card { background: #ffffff; border-radius: 18px; padding: 16px 18px; box-shadow: 0 14px 40px rgba(255,111,166,0.18); border: 1px solid rgba(255,143,193,0.45); margin-bottom: 16px; }
        .upload-card { margin-bottom: 18px; }
        .card-title { font-size: 16px; font-weight: 700; color: #ff4e9a; }
        .card-subtitle { font-size: 13px; color: #8a7a93; margin-top: 4px; }
        .upload-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }

        .defaults-row { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 12px 16px; align-items: end; margin-bottom: 14px; }
        .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
        .field label { font-weight: 600; color: #5a4a66; font-size: 12px; }
        .field input, .field select { border-radius: 999px; border: 1px solid #e9d5ff; padding: 8px 12px; font-size: 13px; outline: none; background: #fdf7ff; }
        .field input:focus, .field select:focus { border-color: #ff8ec5; box-shadow: 0 0 0 1px rgba(255,142,197,0.5); }

        /* Lista de archivos */
        .upload-list { border: 1px solid #f0d5e8; border-radius: 14px; overflow: hidden; margin-top: 4px; }
        .upload-list-header { display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: #fff6fb; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #a07496; border-bottom: 1px solid #f0d5e8; }
        .upload-list-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #fae8f3; background: #fff; transition: background 0.1s; }
        .upload-list-row:last-of-type { border-bottom: none; }
        .upload-list-row:hover { background: #fff9fd; }
        .row-done { background: #f0fff7 !important; }
        .row-error { background: #fff0f3 !important; }
        .upload-file-name { flex: 1; font-size: 13px; color: #4b3246; font-weight: 500; display: flex; flex-direction: column; gap: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .upload-error-msg { font-size: 11px; color: #b3134d; white-space: normal; }
        .inline-select { border-radius: 8px; border: 1px solid #e9d5ff; padding: 5px 8px; font-size: 12px; outline: none; background: #fdf7ff; }
        .inline-select:disabled { opacity: 0.5; }
        .upload-summary { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff6fb; border-top: 1px solid #f0d5e8; }

        /* Drop zone vacía */
        .upload-empty { margin-top: 8px; }
        .upload-drop-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 2px dashed #f0b3d4; border-radius: 14px; padding: 32px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .upload-drop-zone:hover { border-color: #ff4e9a; background: #fff5fb; }

        /* Botón pick de archivo */
        .btn-pick { cursor: pointer; }

        /* Botones */
        .btn { border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-xs { padding: 5px 10px; font-size: 12px; }
        .btn-primary { background: linear-gradient(135deg, #ff4e9a, #ff8ac3); color: white; box-shadow: 0 12px 24px rgba(255,111,166,0.55); }
        .btn-primary:disabled { opacity: 0.6; cursor: default; box-shadow: none; }
        .btn-soft { background: #fff0f7; color: #ff4e9a; border: 1px solid #ffb6da; }
        .btn-soft:disabled { opacity: 0.5; cursor: default; }
        .btn-danger { background: #ffe3ec; color: #b3134d; border: 1px solid #ffb3cd; }

        /* Filtros */
        .filter-card { margin-bottom: 18px; }
        .filters-row { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: flex-end; }
        .filters-right { margin-left: auto; }

        /* Tabla */
        .table-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .badge { border-radius: 999px; background: #fff2fb; padding: 4px 10px; font-size: 12px; color: #9b3478; border: 1px solid rgba(255,143,193,0.6); }
        .table-wrapper { overflow-x: auto; margin-top: 4px; }
        .pm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .pm-table thead tr { background: #fff6fb; }
        .pm-table thead th { text-align: left; padding: 8px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #a07496; }
        .pm-table tbody td { padding: 8px 6px; border-top: 1px solid #f5d7e8; vertical-align: middle; }
        .pm-main-cell { display: flex; flex-direction: column; gap: 2px; }
        .pm-file-name { font-weight: 600; color: #4b3246; }
        .pm-upload-info { font-size: 11px; color: #9c879e; }
        .pm-number-block { display: flex; flex-direction: column; gap: 2px; }
        .pm-number { font-weight: 600; color: #4b3246; }
        .pm-name { font-size: 12px; color: #8a7a93; }
        .status-pill { display: inline-flex; align-items: center; justify-content: center; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .status-pill-open { background: #e6fff4; color: #197a4b; }
        .status-pill-completed { background: #fff4e0; color: #b46a1c; }
        .status-pill-closed { background: #ffe5ef; color: #b0305b; }
        .status-pill-deleted { background: #f5f5f5; color: #777; border: 1px dashed #bbb; }
        .actions-cell { text-align: right; }
        .actions-row { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .empty-cell { text-align: center; padding: 18px 8px; font-size: 13px; color: #8a7a93; }
        .error-banner { margin-top: 8px; padding: 8px 12px; border-radius: 10px; background: #ffe1e8; color: #b3134d; font-size: 13px; }

        @media (max-width: 900px) {
          .defaults-row { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          .defaults-row { grid-template-columns: 1fr; }
          .upload-list-header { display: none; }
          .upload-list-row { flex-wrap: wrap; }
          .inline-select { width: 100% !important; }
          .filters-row { flex-direction: column; align-items: stretch; }
          .filters-right { margin-left: 0; }
          .actions-row { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
}
