// src/app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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
  status?: "open" | "closed" | "deleted"; // legacy
  pmStatus?: PMStatusEnum | null;
  active?: boolean; // 👈 para saber si está eliminado
  lastExecutionAt?: string | null;
  lastExecutionPdfUrl?: string | null;
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
  const [uploadedBy, setUploadedBy] = useState("Frida");
  const [glOwner, setGlOwner] = useState<string>(GL_OPTIONS[0]);
  const [pmType, setPmType] = useState<string>("online");
  const [filesToUpload, setFilesToUpload] = useState<FileList | null>(null);

  const [items, setItems] = useState<PMRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [glFilter, setGlFilter] = useState<string>("all");

  // =======================
  // Cargar lista inicial
  // =======================
  const fetchItems = async () => {
  try {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/list", {
      cache: "no-store",       // 👈 IMPORTANTE
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Error al cargar lista: ${txt}`);
    }

    const data = await res.json();

    const arr: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.files)
      ? data.files
      : [];

    // 👇 esto ayuda a ver qué está llegando realmente
    console.log("LIST API data:", data, "items length:", arr.length);

    setItems(arr as PMRow[]);
  } catch (e: any) {
    console.error(e);
    setError(
      e?.message || "No se pudo cargar la lista de PMs. Intenta más tarde."
    );
    setItems([]);
  } finally {
    setLoading(false);
  }
};


  // =======================
  // Subir nuevos PDFs
  // =======================
  const handleUpload = async () => {
    if (!filesToUpload || filesToUpload.length === 0) {
      alert("Selecciona al menos un PDF.");
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("uploadedBy", uploadedBy || "Frida");
      formData.append("glOwner", glOwner || "");
      formData.append("pmType", pmType || "");

      Array.from(filesToUpload).forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        console.error("Upload error payload:", data);
        throw new Error(data.error || "Error al subir los PMs");
      }

      await fetchItems();
      setFilesToUpload(null);
      const input = document.getElementById(
        "file-input"
      ) as HTMLInputElement | null;
      if (input) {
        input.value = "";
      }
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message || "No se pudieron subir los PMs. Revisa la consola."
      );
    } finally {
      setUploading(false);
    }
  };

  // =======================
  // Eliminar (soft delete)
  // =======================
  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Eliminar este PM de la lista de Frida? (Soft delete: se oculta de los filtros normales y solo aparece en Historial)"
      )
    )
      return;

    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Error al eliminar: ${txt}`);
      }

      await fetchItems();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo eliminar el PM.");
    }
  };

  // =======================
  // Cerrar PM (Frida)
  // =======================
  const handleClosePm = async (id: string, pmStatus: PMStatusEnum) => {
    if (pmStatus !== "COMPLETED") {
      alert("Solo puedes cerrar PMs que estén en estado COMPLETADO.");
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
      if (!res.ok || data.ok === false) {
        console.error("Close error payload:", data);
        throw new Error(data.error || "No se pudo cerrar el PM");
      }

      await fetchItems();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo cerrar el PM.");
    }
  };

  // =======================
  // Filtros
  // =======================
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isDeleted =
        item.status === "deleted" || item.active === false;

      // 👇 Si está eliminado, solo se muestra en "Todos (histórico)"
      if (isDeleted && statusFilter !== "all") return false;

      const pmStatus: PMStatusEnum =
        (item.pmStatus as PMStatusEnum) ??
        (item.status === "closed" ? "COMPLETED" : "OPEN");

      if (statusFilter === "open" && pmStatus !== "OPEN") return false;
      if (statusFilter === "completed" && pmStatus !== "COMPLETED")
        return false;
      if (statusFilter === "closed" && pmStatus !== "CLOSED") return false;

      if (glFilter !== "all") {
        const gl = (item.glOwner || "").toLowerCase();
        if (gl !== glFilter.toLowerCase()) return false;
      }

      return true;
    });
  }, [items, statusFilter, glFilter]);

  const getStatusLabelFromPmStatus = (pmStatus?: PMStatusEnum | null) => {
    if (pmStatus === "OPEN") return "Abierto";
    if (pmStatus === "COMPLETED") return "Completado";
    if (pmStatus === "CLOSED") return "Cerrado";
    return "Abierto";
  };

  const getStatusPillClassFromPmStatus = (pmStatus?: PMStatusEnum | null) => {
    if (pmStatus === "CLOSED") return "status-pill status-pill-closed";
    if (pmStatus === "COMPLETED") return "status-pill status-pill-completed";
    return "status-pill status-pill-open";
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="admin-page">
      <div className="admin-shell">
        {/* HEADER */}
        <header className="admin-header">
          <div>
            <h1 className="admin-title">FRIDA · PMs Digitales</h1>
            <p className="admin-subtitle">
              Panel de control para PMs · Asignación por GL · Historial de
              ejecuciones
            </p>
          </div>
        </header>

        {/* UPLOAD */}
        <section className="card upload-card">
          <div className="upload-header">
            <div>
              <h2 className="card-title">Subir nuevos PMs</h2>
              <p className="card-subtitle">
                Carga uno o varios PDFs, asigna el GL responsable y el tipo de
                PM.
              </p>
            </div>
          </div>

          <div className="upload-grid">
            <div className="field">
              <label>Nombre de quien sube</label>
              <input
                type="text"
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
              />
            </div>

            <div className="field">
              <label>GL responsable</label>
              <select
                value={glOwner}
                onChange={(e) => setGlOwner(e.target.value)}
              >
                {GL_OPTIONS.map((gl) => (
                  <option key={gl} value={gl}>
                    {gl}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Tipo de PM</label>
              <select
                value={pmType}
                onChange={(e) => setPmType(e.target.value)}
              >
                {PM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="field file-field">
              <label>Archivos PDF</label>
              <input
                id="file-input"
                type="file"
                multiple
                accept="application/pdf"
                onChange={(e) => setFilesToUpload(e.target.files)}
              />
            </div>
          </div>

          <div className="upload-actions">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="btn btn-primary"
            >
              {uploading ? "Subiendo..." : "Subir PMs"}
            </button>
          </div>
        </section>

        {/* FILTERS */}
        <section className="card filter-card">
          <div className="filters-row">
            <div className="field">
              <label>Filtro de estado</label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
              >
                <option value="open">Solo abiertos</option>
                <option value="completed">Solo completados</option>
                <option value="closed">Solo cerrados</option>
                <option value="all">Todos (histórico)</option>
              </select>
            </div>

            <div className="field">
              <label>Filtro por GL</label>
              <select
                value={glFilter}
                onChange={(e) => setGlFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                {GL_OPTIONS.map((gl) => (
                  <option key={gl} value={gl}>
                    {gl}
                  </option>
                ))}
              </select>
            </div>

            <div className="filters-right">
              <button
                type="button"
                className="btn btn-soft"
                onClick={fetchItems}
                disabled={loading}
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>
        </section>

        {/* TABLA */}
        <section className="card">
          <div className="table-header-row">
            <h2 className="card-title">Listado de PMs</h2>
            <span className="badge">
              {items.length} PM{items.length === 1 ? "" : "s"}
            </span>
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
                      {loading
                        ? "Cargando PMs..."
                        : "No hay PMs que coincidan con el filtro seleccionado."}
                    </td>
                  </tr>
                )}

                {filteredItems.map((item) => {
                  const pmStatus: PMStatusEnum =
                    (item.pmStatus as PMStatusEnum) ?? "OPEN";
                  const canClose = pmStatus === "COMPLETED";
                  const isDeleted =
                    item.status === "deleted" || item.active === false;

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="pm-main-cell">
                          <span className="pm-file-name">
                            {item.fileName}
                          </span>
                          <span className="pm-upload-info">
                            Subido: {formatDate(item.uploadedAt)} ·{" "}
                            {item.uploadedBy || "Sin nombre"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.pmNumber ? (
                          <div className="pm-number-block">
                            <span className="pm-number">{item.pmNumber}</span>
                            <span className="pm-name">
                              {item.pmName || "—"}
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{item.glOwner || "—"}</td>
                      <td>
                        {item.pmType ? item.pmType.toUpperCase() : "—"}
                      </td>
                      <td>
                        {isDeleted ? (
                          <span className="status-pill status-pill-deleted">
                            Eliminado
                          </span>
                        ) : (
                          <span
                            className={getStatusPillClassFromPmStatus(
                              pmStatus
                            )}
                          >
                            {getStatusLabelFromPmStatus(pmStatus)}
                          </span>
                        )}
                      </td>
                      <td>{formatDate(item.lastExecutionAt)}</td>
                      <td className="actions-cell">
                        <div className="actions-row">
                          <button
                            type="button"
                            className="btn btn-soft btn-xs"
                            onClick={() =>
                              window.open(item.blobUrl, "_blank")
                            }
                          >
                            Ver PDF
                          </button>
                          <button
                            type="button"
                            className="btn btn-soft btn-xs"
                            disabled={!item.lastExecutionPdfUrl}
                            onClick={() =>
                              item.lastExecutionPdfUrl &&
                              window.open(
                                item.lastExecutionPdfUrl,
                                "_blank"
                              )
                            }
                          >
                            Ver cierre
                          </button>
                          <button
                            type="button"
                            className="btn btn-soft btn-xs"
                            disabled={!canClose || isDeleted}
                            onClick={() =>
                              canClose &&
                              !isDeleted &&
                              handleClosePm(item.id, pmStatus)
                            }
                          >
                            Cerrar PM
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-xs"
                            disabled={isDeleted}
                            onClick={() => handleDelete(item.id)}
                          >
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
          <div className="error-banner">
            <span>⚠️ {error}</span>
          </div>
        )}
      </div>

      {/* ======== ESTILOS ROSITA PARA FRIDA ======== */}
      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          background: radial-gradient(
            circle at top left,
            #ffe5f0 0,
            #fef5ff 40%,
            #ffffff 100%
          );
          padding: 32px 16px;
          display: flex;
          justify-content: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
            sans-serif;
          color: #2b2432;
        }

        .admin-shell {
          width: 100%;
          max-width: 1200px;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
          gap: 12px;
        }

        .admin-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #ff4e9a;
          text-shadow: 0 6px 20px rgba(255, 111, 166, 0.5);
        }

        .admin-subtitle {
          margin-top: 4px;
          font-size: 14px;
          color: #7b6a85;
        }

        .card {
          background: #ffffff;
          border-radius: 18px;
          padding: 16px 18px;
          box-shadow: 0 14px 40px rgba(255, 111, 166, 0.18);
          border: 1px solid rgba(255, 143, 193, 0.45);
          margin-bottom: 16px;
        }

        .upload-card {
          margin-bottom: 18px;
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          color: #ff4e9a;
        }

        .card-subtitle {
          font-size: 13px;
          color: #8a7a93;
          margin-top: 4px;
        }

        .upload-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .upload-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px 16px;
          margin-top: 8px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
        }

        .field label {
          font-weight: 600;
          color: #5a4a66;
        }

        .field input,
        .field select {
          border-radius: 999px;
          border: 1px solid #e9d5ff;
          padding: 8px 12px;
          font-size: 13px;
          outline: none;
          background: #fdf7ff;
        }

        .field input:focus,
        .field select:focus {
          border-color: #ff8ec5;
          box-shadow: 0 0 0 1px rgba(255, 142, 197, 0.5);
        }

        .file-field input {
          border-radius: 999px;
          background: #fff9fd;
        }

        .upload-actions {
          margin-top: 14px;
          display: flex;
          justify-content: flex-end;
        }

        .filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          align-items: flex-end;
        }

        .filters-right {
          margin-left: auto;
        }

        .btn {
          border-radius: 999px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .btn-xs {
          padding: 6px 10px;
          font-size: 12px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #ff4e9a, #ff8ac3);
          color: white;
          box-shadow: 0 12px 24px rgba(255, 111, 166, 0.55);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: default;
          box-shadow: none;
        }

        .btn-soft {
          background: #fff0f7;
          color: #ff4e9a;
          border: 1px solid #ffb6da;
        }

        .btn-danger {
          background: #ffe3ec;
          color: #b3134d;
          border: 1px solid #ffb3cd;
        }

        .btn-soft:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .filter-card {
          margin-bottom: 18px;
        }

        .table-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .badge {
          border-radius: 999px;
          background: #fff2fb;
          padding: 4px 10px;
          font-size: 12px;
          color: #9b3478;
          border: 1px solid rgba(255, 143, 193, 0.6);
        }

        .table-wrapper {
          overflow-x: auto;
          margin-top: 4px;
        }

        .pm-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .pm-table thead tr {
          background: #fff6fb;
        }

        .pm-table thead th {
          text-align: left;
          padding: 8px 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #a07496;
        }

        .pm-table tbody td {
          padding: 8px 6px;
          border-top: 1px solid #f5d7e8;
          vertical-align: middle;
        }

        .pm-main-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pm-file-name {
          font-weight: 600;
          color: #4b3246;
        }

        .pm-upload-info {
          font-size: 11px;
          color: #9c879e;
        }

        .pm-number-block {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pm-number {
          font-weight: 600;
          color: #4b3246;
        }

        .pm-name {
          font-size: 12px;
          color: #8a7a93;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }

        .status-pill-open {
          background: #e6fff4;
          color: #197a4b;
        }

        .status-pill-completed {
          background: #fff4e0;
          color: #b46a1c;
        }

        .status-pill-closed {
          background: #ffe5ef;
          color: #b0305b;
        }

        .status-pill-deleted {
          background: #f5f5f5;
          color: #777777;
          border: 1px dashed #bbbbbb;
        }

        .actions-cell {
          text-align: right;
        }

        .actions-row {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .empty-cell {
          text-align: center;
          padding: 18px 8px;
          font-size: 13px;
          color: #8a7a93;
        }

        .error-banner {
          margin-top: 8px;
          padding: 8px 12px;
          border-radius: 10px;
          background: #ffe1e8;
          color: #b3134d;
          font-size: 13px;
        }

        @media (max-width: 900px) {
          .upload-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .admin-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .upload-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .filters-row {
            flex-direction: column;
            align-items: stretch;
          }

          .filters-right {
            margin-left: 0;
          }

          .actions-row {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}
