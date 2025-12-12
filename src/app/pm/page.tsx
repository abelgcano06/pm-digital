// src/app/pm/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./pm-selection.css";

type PMFile = {
  // 🔹 ESTE id ES SIEMPRE PMTemplate.id (viene de /api/pm-files)
  id: string;

  uploadedFileId: string;
  fileName: string;
  blobUrl: string;

  pmNumber: string;
  pmName: string;
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

        const res = await fetch("/api/pm-files");
        if (!res.ok) {
          throw new Error("No se pudo cargar la lista de PMs");
        }

        const json = await res.json();

        let arr: any[] = [];
        // Soportar tanto array directo como { items: [...] }
        if (Array.isArray(json)) {
          arr = json;
        } else if (Array.isArray(json?.items)) {
          arr = json.items;
        }

        // Pequeño log de depuración (lo puedes quitar si quieres)
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
      pm.fileName.toLowerCase().includes(searchTerm.toLowerCase())
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

  // ---- Iniciar PM (YA SIN /api/pm-import) ----
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

    const selected = pmFiles.find((pm) => pm.id === selectedPmId);
    if (!selected) {
      setStartError("No se encontró la información del PM seleccionado.");
      return;
    }

    // 🔴 YA NO LLAMAMOS /api/pm-import
    // Directo abrimos el PMTemplate con ese id
    setIsStarting(true);
    try {
      router.push(
        `/pm/${selected.id}?op1=${encodeURIComponent(
          operator1
        )}&op2=${encodeURIComponent(
          operator2
        )}&gl=${encodeURIComponent(groupLeader)}`
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
                  Para activar la lista de PMs, captura al menos Asociado 1 y
                  GL.
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
                  Busca por nombre o selecciona de la lista. Solo se muestran
                  los PMs que Frida subió este periodo.
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

            {/* Mensajes de error / vacío */}
            {loadingError && (
              <div className="baja-pm-alert baja-pm-alert-error">
                {loadingError}
              </div>
            )}

            {!loading && filteredPmFiles.length === 0 && !loadingError && (
              <div className="baja-pm-alert baja-pm-alert-warning">
                No hay PMs que coincidan con la búsqueda o Frida aún no ha
                cargado los PDFs de este periodo.
              </div>
            )}

            {/* Lista de PMs */}
            {!loading && filteredPmFiles.length > 0 && (
              <div className="baja-pm-list-header">
                <span className="baja-pm-list-col-sel">Sel.</span>
                <span className="baja-pm-list-col-name">Nombre de PM</span>
                <span className="baja-pm-list-col-origin">Origen</span>
              </div>
            )}

            {!loading && filteredPmFiles.length > 0 && (
              <div className="baja-pm-list">
                {filteredPmFiles.map((pm) => (
                  <label
                    key={pm.id}
                    className={`baja-pm-list-row ${
                      selectedPmId === pm.id ? "baja-pm-list-row-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="pmSelected"
                      className="baja-pm-radio"
                      checked={selectedPmId === pm.id}
                      onChange={() => setSelectedPmId(pm.id)}
                    />
                    <div className="baja-pm-list-main">
                      <div className="baja-pm-list-name">{pm.fileName}</div>
                      <div className="baja-pm-list-id">
                        ID: <span>{pm.id}</span>
                      </div>
                    </div>
                    <div className="baja-pm-list-origin">Nube Frida</div>
                  </label>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
