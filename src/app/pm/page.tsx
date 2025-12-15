// src/app/pm/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./pm-selection.css";

type PMFile = {
  // ✅ Este id es el PMUploadedFile.id (NO el template)
  id: string;

  uploadedFileId: string;
  fileName: string;
  blobUrl: string;

  // ✅ Si existe, este es el ID real del PMTemplate
  pmTemplateId: string | null;

  pmNumber: string | null;
  pmName: string | null;
  assetCode?: string | null;
  location?: string | null;

  glOwner?: string | null;
  pmType?: string | null;
  pmStatus?: "OPEN" | "COMPLETED" | "CLOSED";

  uploadedAt: string;
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

export default function PMSelectionPage() {
  const router = useRouter();

  const [pmFiles, setPmFiles] = useState<PMFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [selectedPmId, setSelectedPmId] = useState<string | null>(null);

  const [operator1, setOperator1] = useState("");
  const [operator2, setOperator2] = useState("");
  const [groupLeader, setGroupLeader] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  const [glFilter, setGlFilter] = useState<string>("all");
  const [pmTypeFilter, setPmTypeFilter] = useState<string>("all");

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // ---- Cargar lista de PMs desde /api/pm-files ----
  useEffect(() => {
    async function loadPMs() {
      try {
        setLoading(true);
        setLoadingError(null);

        const res = await fetch("/api/pm-files", { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo cargar la lista de PMs");

        const json = await res.json();

        let arr: any[] = [];
        if (Array.isArray(json)) arr = json;
        else if (Array.isArray(json?.items)) arr = json.items;

        console.log("PMs desde /api/pm-files:", arr);
        setPmFiles(arr as PMFile[]);
      } catch (err: any) {
        console.error("Error cargando /api/pm-files:", err);
        setLoadingError(
          err?.message ?? "Error al cargar la lista de PMs. Intenta de nuevo."
        );
        setPmFiles([]);
      } finally {
        setLoading(false);
      }
    }

    loadPMs();
  }, []);

  // Lista filtrada por texto + GL + tipo de PM
  const filteredPmFiles = pmFiles
    .filter((pm) =>
      (pm.fileName || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((pm) => {
      if (glFilter === "all") return true;
      const gl = (pm.glOwner || "").toLowerCase();
      return gl === glFilter.toLowerCase();
    })
    .filter((pm) => {
      if (pmTypeFilter === "all") return true;
      const t = (pm.pmType || "").toLowerCase();
      return t === pmTypeFilter.toLowerCase();
    });

  // ---- Iniciar PM (AQUÍ se crea template si no existe) ----
  async function handleStartPM(e: React.FormEvent) {
    e.preventDefault();
    setStartError(null);

    if (!selectedPmId) {
      setStartError("Selecciona un PM de la lista.");
      return;
    }
    if (!operator1.trim() || !groupLeader.trim()) {
      setStartError("Debes capturar al menos Asociado 1 y GL.");
      return;
    }

    const selected = pmFiles.find((pm) => (pm.uploadedFileId ?? pm.id) === selectedPmId);

    if (!selected) {
      setStartError("No se encontró la información del PM seleccionado.");
      return;
    }

    setIsStarting(true);

    try {
      let templateId = selected.pmTemplateId;

      // ✅ Si no hay template todavía, correr import/parsing (OpenAI + DB)
      if (!templateId) {
        const res = await fetch("/api/pm-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selected.fileName,
            blobUrl: selected.blobUrl,
          }),
        });

        if (!res.ok) {
          let msg = "Error al importar el PM";
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }

        const created = await res.json();
        templateId = created?.id;

        if (!templateId) {
          throw new Error("El import no devolvió templateId");
        }
      }

      // ✅ Ahora sí, navegar usando PMTemplate.id (no el uploadedFileId)
      router.push(
        `/pm/${templateId}?op1=${encodeURIComponent(
          operator1
        )}&op2=${encodeURIComponent(operator2)}&gl=${encodeURIComponent(
          groupLeader
        )}`
      );
    } catch (err: any) {
      console.error("Error al iniciar PM:", err);
      setStartError(err?.message ?? "Error al iniciar PM, intenta de nuevo.");
    } finally {
      setIsStarting(false);
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

  const startDisabled =
    isStarting || !selectedPmId || !operator1.trim() || !groupLeader.trim();

  return (
    <div className="baja-pm-page">
      <div className="baja-pm-shell">
        {/* HEADER SUPERIOR */}
        <header className="baja-pm-header">
          <div className="baja-pm-header-main">
            <div className="baja-pm-app-chip">BAJA PM APP • Mantenimiento</div>
            <h1 className="baja-pm-title">Selección de PM</h1>
            <p className="baja-pm-subtitle">
              Registra a tu equipo y elige el PM que vas a ejecutar paso a paso.
            </p>
            <div className="baja-pm-meta">
              <span className="baja-pm-meta-time">{nowLabel}</span>
              <span className="baja-pm-meta-status">● Online • Ready</span>
            </div>
          </div>

          <div className="baja-pm-header-badge">
            <span className="baja-pm-badge-title">Turno actual</span>
            <span className="baja-pm-badge-text">
              Completa nombres, elige PM y da iniciar.
            </span>
          </div>
        </header>

        {/* CONTENIDO PRINCIPAL */}
        <main className="baja-pm-grid">
          {/* COLUMNA IZQUIERDA: EQUIPO */}
          <section className="baja-pm-card baja-pm-card-left">
            <div className="baja-pm-card-header">
              <div className="baja-pm-card-icon">👷‍♂️</div>
              <div>
                <h2 className="baja-pm-card-title">Equipo que ejecuta el PM</h2>
                <p className="baja-pm-card-help">
                  Para iniciar, captura al menos Asociado 1 y GL.
                </p>
              </div>
            </div>

            <form onSubmit={handleStartPM} className="baja-pm-team-form">
              <div className="baja-pm-input-group">
                <label className="baja-pm-label">
                  Asociado 1 <span className="baja-pm-label-required">*</span>
                </label>
                <input
                  type="text"
                  value={operator1}
                  onChange={(e) => setOperator1(e.target.value)}
                  placeholder="Nombre del asociado 1"
                  className="baja-pm-input"
                />
              </div>

              <div className="baja-pm-input-group">
                <label className="baja-pm-label">Asociado 2 (opcional)</label>
                <input
                  type="text"
                  value={operator2}
                  onChange={(e) => setOperator2(e.target.value)}
                  placeholder="Nombre del asociado 2"
                  className="baja-pm-input"
                />
              </div>

              <div className="baja-pm-input-group">
                <label className="baja-pm-label">
                  GL / Supervisor{" "}
                  <span className="baja-pm-label-required">*</span>
                </label>
                <input
                  type="text"
                  value={groupLeader}
                  onChange={(e) => setGroupLeader(e.target.value)}
                  placeholder="Nombre de GL / Supervisor"
                  className="baja-pm-input"
                />
              </div>

              {startError && (
                <div className="baja-pm-alert baja-pm-alert-error">
                  {startError}
                </div>
              )}

              <button
                type="submit"
                disabled={startDisabled}
                className={
                  startDisabled
                    ? "baja-pm-button baja-pm-button-disabled"
                    : "baja-pm-button baja-pm-button-primary"
                }
              >
                {isStarting ? "Iniciando PM..." : "Iniciar lista de PM"}
              </button>

              <p className="baja-pm-footnote">
                Debes seleccionar un PM de la lista y tener Asociado 1 y GL para
                poder iniciar.
              </p>
            </form>
          </section>

          {/* COLUMNA DERECHA: LISTA DE PMS */}
          <section className="baja-pm-card baja-pm-card-right">
            <div className="baja-pm-card-header baja-pm-card-header-right">
              <div className="baja-pm-card-icon">📋</div>
              <div>
                <h2 className="baja-pm-card-title">PMs disponibles</h2>
                <p className="baja-pm-card-help">
                  Busca por nombre o selecciona de la lista.
                </p>
              </div>
              {loading && (
                <span className="baja-pm-loading-tag">Cargando PMs...</span>
              )}
            </div>

            {/* Buscador */}
            <div className="baja-pm-search-box">
              <span className="baja-pm-search-icon">🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar PM por nombre..."
                className="baja-pm-search-input"
              />
            </div>

            {/* Filtros por GL y Tipo de PM */}
            <div className="baja-pm-filters-row">
              <div className="baja-pm-input-group">
                <label className="baja-pm-label">Filtrar por GL</label>
                <select
                  className="baja-pm-input"
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

              <div className="baja-pm-input-group">
                <label className="baja-pm-label">Tipo de PM</label>
                <select
                  className="baja-pm-input"
                  value={pmTypeFilter}
                  onChange={(e) => setPmTypeFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {PM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingError && (
              <div className="baja-pm-alert baja-pm-alert-error">
                {loadingError}
              </div>
            )}

            {!loading && filteredPmFiles.length === 0 && !loadingError && (
              <div className="baja-pm-alert baja-pm-alert-warning">
                No hay PMs que coincidan con la búsqueda.
              </div>
            )}

            {!loading && filteredPmFiles.length > 0 && (
              <div className="baja-pm-list-header">
                <span className="baja-pm-list-col-sel">Sel.</span>
                <span className="baja-pm-list-col-name">Nombre de PM</span>
                <span className="baja-pm-list-col-origin">Origen</span>
              </div>
            )}

            {!loading && filteredPmFiles.length > 0 && (
              <div className="baja-pm-list">
                {filteredPmFiles.map((pm) => {
  const rowId = pm.uploadedFileId ?? pm.id; // ✅ usa algo seguro

  return (
    <label
      key={rowId}
      onClick={() => setSelectedPmId(rowId)}
      className={`baja-pm-list-row ${selectedPmId === rowId ? "baja-pm-list-row-active" : ""}`}
      style={{ cursor: "pointer" }}
    >
      <input
        type="radio"
        name="pmSelected"
        className="baja-pm-radio"
        value={rowId}
        checked={selectedPmId === rowId}
        onChange={() => setSelectedPmId(rowId)}
      />
      <div className="baja-pm-list-main">
        <div className="baja-pm-list-name">{pm.fileName}</div>
        <div className="baja-pm-list-id">
          ID: <span>{rowId}</span>
        </div>
      </div>
      <div className="baja-pm-list-origin">Nube Frida</div>
    </label>
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
