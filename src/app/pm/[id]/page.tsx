"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import "./pm-execution.css";

type PMTaskTemplate = {
  id: string;
  taskIdNumber: number;
  majorStep: string;
  keyPoints: string;
  reason: string;
  order: number;
  hasImage?: boolean;
};

type PMTemplate = {
  id: string;
  pmNumber: string;
  name: string;
  assetCode: string | null;
  location: string | null;
  pdfFileName?: string | null;
  basePdfUrl?: string | null;
  tasks: PMTaskTemplate[];
};

type TaskStatus = "pending" | "ok" | "nok";

type TaskExecution = {
  taskId: string;
  status: TaskStatus;
  comment: string;
  flagged: boolean;
  measureValue?: string;
  photoUrls: string[];
};

export default function PMExecutionPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const asociado1 = searchParams.get("op1") || searchParams.get("a1") || "";
  const asociado2 = searchParams.get("op2") || searchParams.get("a2") || "";
  const asociado3 = searchParams.get("op3") || "";
  const glNombre = searchParams.get("gl") || "";

  const [loading, setLoading] = useState(true);
  const [pmTemplate, setPmTemplate] = useState<PMTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [tasksExec, setTasksExec] = useState<TaskExecution[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // ✅ Confirmación visual cuando el PDF se generó bien
  const [finishOk, setFinishOk] = useState(false);
  const [finishPdfUrl, setFinishPdfUrl] = useState<string | null>(null);
  const [finishExecutionId, setFinishExecutionId] = useState<string | null>(null);

  // Fotos
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/pm-templates/${params.id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Error al cargar el PM");

        const data: PMTemplate = await res.json();
        const tasks = data.tasks ?? [];

        setPmTemplate({ ...data, tasks });

        setTasksExec(
          tasks.map((t) => ({
            taskId: t.id,
            status: "pending",
            comment: "",
            flagged: false,
            photoUrls: [],
          }))
        );

        setStartedAt(new Date().toISOString());
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar el PM. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [params.id]);

  const totalTasks = pmTemplate?.tasks?.length ?? 0;
  const tasksArray = pmTemplate?.tasks ?? [];

  const currentTaskTemplate =
    pmTemplate && totalTasks > 0
      ? tasksArray[Math.min(currentIndex, totalTasks - 1)]
      : null;

  const currentTaskExec =
    currentTaskTemplate && tasksExec.find((t) => t.taskId === currentTaskTemplate.id);

  const counts = useMemo(() => {
    const c = { total: tasksExec.length, ok: 0, nok: 0, pending: 0, flagged: 0 };
    for (const t of tasksExec) {
      if (t.status === "ok") c.ok++;
      else if (t.status === "nok") c.nok++;
      else c.pending++;
      if (t.flagged) c.flagged++;
    }
    return c;
  }, [tasksExec]);

  const isMeasurementTask = (task: PMTaskTemplate | null): boolean => {
    if (!task) return false;
    const text = `${task.majorStep} ${task.keyPoints} ${task.reason}`.toLowerCase();
    const keywords = [
      "mm",
      "milimetro",
      "milímetro",
      "temperatura",
      "°c",
      "porcentaje",
      "%",
      "distancia",
      "espesor",
      "espesores",
      "gap",
      "altura",
      "velocidad",
      "rpm",
      "presión",
      "pressure",
      "voltage",
      "voltaje",
      "amp",
      "amper",
      "amperaje",
    ];
    return keywords.some((k) => text.includes(k));
  };

  const requiresMeasure = isMeasurementTask(currentTaskTemplate);

  const updateCurrentExec = (partial: Partial<TaskExecution>) => {
    if (!currentTaskTemplate) return;
    setTasksExec((prev) =>
      prev.map((t) => (t.taskId === currentTaskTemplate.id ? { ...t, ...partial } : t))
    );
  };

  const handleSetStatus = (status: TaskStatus) => {
    updateCurrentExec({ status });
    // Auto-avance al siguiente punto cuando se marca OK (sin medición ni flag pendiente)
    if (
      status === "ok" &&
      !requiresMeasure &&
      !currentTaskExec?.flagged &&
      currentIndex < tasksArray.length - 1
    ) {
      setTimeout(() => setCurrentIndex((i) => i + 1), 350);
    }
  };

  const toggleFlag = () => {
    if (!currentTaskExec) return;
    updateCurrentExec({ flagged: !currentTaskExec.flagged });
  };

  const canGoNext = (): boolean => {
    if (!currentTaskTemplate || !currentTaskExec) return false;
    if (currentTaskExec.status === "pending") return false;

    if (currentTaskExec.flagged && !currentTaskExec.comment.trim()) return false;
    if (currentTaskExec.status === "nok" && !currentTaskExec.comment.trim()) return false;

    if (requiresMeasure) {
      if (!currentTaskExec.measureValue || !currentTaskExec.measureValue.trim()) return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!canGoNext()) return;
    if (!pmTemplate) return;
    if (currentIndex < tasksArray.length - 1) setCurrentIndex((i) => i + 1);
  };

  const handlePrev = () => {
    if (!pmTemplate) return;
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  // ✅ SUBIR FOTO(S) PARA LA TAREA ACTUAL
  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!currentTaskTemplate || !currentTaskExec) return;

    setPhotoError(null);
    setUploadingPhoto(true);

    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/pm-photo", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({} as any));

        if (!res.ok || !data?.ok || !data?.url) {
          const msg = data?.error || "No se pudo subir la foto";
          const details = data?.details ? `\n${data.details}` : "";
          throw new Error(msg + details);
        }

        // 👇 Importante: usar el valor más nuevo (prev) para evitar race conditions
        setTasksExec((prev) =>
          prev.map((t) =>
            t.taskId === currentTaskTemplate.id
              ? { ...t, photoUrls: [...(t.photoUrls || []), data.url] }
              : t
          )
        );
      }
    } catch (e: any) {
      console.error(e);
      setPhotoError(e?.message || "Error subiendo foto");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(url: string) {
    if (!currentTaskTemplate) return;
    setTasksExec((prev) =>
      prev.map((t) =>
        t.taskId === currentTaskTemplate.id
          ? { ...t, photoUrls: (t.photoUrls || []).filter((u) => u !== url) }
          : t
      )
    );
  }

  const canFinish = useMemo(() => {
    if (!pmTemplate || tasksExec.length === 0) return false;
    if (counts.pending > 0) return false;

    for (const t of tasksExec) {
      if (t.status === "nok" && !t.comment.trim()) return false;
    }

    for (const t of tasksExec) {
      const templateTask = (pmTemplate.tasks ?? []).find((x) => x.id === t.taskId);
      if (!templateTask) continue;
      const needsMeasure = isMeasurementTask(templateTask);
      if (needsMeasure && (!t.measureValue || !t.measureValue.trim())) return false;
    }

    for (const t of tasksExec) {
      if (t.flagged && !t.comment.trim()) return false;
    }

    return true;
  }, [pmTemplate, tasksExec, counts.pending]);

  const handleFinish = async () => {
    if (!pmTemplate) return;
    if (!canFinish) return;

    try {
      setFinishing(true);
      setError(null);

      const now = new Date().toISOString();
      setFinishedAt(now);

      const body = {
        pmTemplateId: pmTemplate.id,
        pmNumber: pmTemplate.pmNumber,
        pmName: pmTemplate.name,
        asociado1: asociado1 || "SIN NOMBRE",
        asociado2: asociado2 || "",
        asociado3: asociado3 || "",
        glNombre: glNombre || "SIN GL",
        startedAt: startedAt || now,
        finishedAt: now,
        tasks: tasksExec, // incluye photoUrls
      };

      const res = await fetch("/api/pm-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        const msg = data?.error || "Error al generar el PDF.";
        const details = data?.details ? `\n${data.details}` : "";
        throw new Error(msg + details);
      }

      if (!data?.url) throw new Error("La respuesta no incluye la URL del PDF.");

      // ✅ Confirmación visible (independiente de que iOS abra la pestaña)
      setFinishOk(true);
      setFinishPdfUrl(data.url);
      setFinishExecutionId(data.executionId ?? null);

      // En desktop puede abrir, pero en iOS a veces se bloquea.
      // Lo dejamos opcional: si abre, bien; si no, el usuario tiene el link.
      try {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } catch {
        // iOS puede bloquearlo; no pasa nada.
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setFinishing(false);
    }
  };

  if (loading || !pmTemplate) {
    return (
      <div className="pm-page pm-page--loading">
        <div className="pm-loading-card">Cargando PM...</div>
      </div>
    );
  }

  const pdfUrl: string | null = pmTemplate.basePdfUrl ?? null;

  return (
    <div className="pm-page">
      {/* Modal: PM finalizado */}
      {finishOk && (
        <div className="pm-modal-overlay">
          <div className="pm-modal-sheet">
            <div className="pm-modal-stripe">
              <div className="pm-modal-stripe-r" />
              <div className="pm-modal-stripe-o" />
              <div className="pm-modal-stripe-y" />
            </div>
            <h2 className="pm-modal-title">PM finalizado correctamente</h2>
            <p className="pm-modal-body">
              Tu ejecución se guardó y el PDF de cierre se generó sin errores.
              Gracias por hacer tu trabajo con seguridad y calidad.
            </p>
            {finishExecutionId && (
              <p className="pm-modal-folio">
                Folio: <strong>{finishExecutionId}</strong>
              </p>
            )}
            <div className="pm-modal-actions">
              {finishPdfUrl && (
                <a
                  href={finishPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pm-btn pm-btn--finish"
                  style={{ textDecoration: "none" }}
                >
                  Abrir PDF de cierre
                </a>
              )}
              <button
                type="button"
                className="pm-btn pm-btn--ghost"
                onClick={() => router.push("/pm")}
              >
                Volver a lista
              </button>
              <button
                type="button"
                className="pm-btn pm-btn--ghost"
                onClick={() => setFinishOk(false)}
              >
                Cerrar
              </button>
            </div>
            <p className="pm-modal-note">
              En iPhone/iPad el PDF puede no abrirse automáticamente — usa el botón de arriba.
            </p>
          </div>
        </div>
      )}

      {/* Bloque sticky: stripe + header + barra de progreso */}
      <div className="pm-sticky-top">
        <div className="pm-stripe">
          <div className="pm-stripe-r" />
          <div className="pm-stripe-o" />
          <div className="pm-stripe-y" />
        </div>

        <header className="pm-header">
          <div className="pm-header-inner">
            <div className="pm-header-left">
              <div className="pm-header-icon">
                <span>{pmTemplate.pmNumber || "PM"}</span>
              </div>
              <div className="pm-header-info">
                <h1 className="pm-header-title">{pmTemplate.name}</h1>
                <p className="pm-header-subtitle">
                  {pmTemplate.assetCode && pmTemplate.location
                    ? `${pmTemplate.assetCode} · ${pmTemplate.location}`
                    : pmTemplate.assetCode || pmTemplate.location || "Mantenimiento preventivo"}
                </p>
                <div className="pm-badges-row">
                  <span className="pm-badge">A1: {asociado1 || "—"}</span>
                  {asociado2 && <span className="pm-badge">A2: {asociado2}</span>}
                  {asociado3 && <span className="pm-badge">A3: {asociado3}</span>}
                  <span className="pm-badge">GL: {glNombre || "—"}</span>
                </div>
              </div>
            </div>
            {/* Badge de estado visible en mobile (sticky) */}
            {currentTaskExec && (
              <div className="pm-header-status">
                <span className={`pm-task-status-badge pm-task-status-badge--${currentTaskExec.status}`}>
                  {currentTaskExec.status === "ok" ? "OK" : currentTaskExec.status === "nok" ? "No ok" : "Pendiente"}
                </span>
                {currentTaskExec.flagged && <span className="pm-task-flag">Flag</span>}
              </div>
            )}
          </div>
        </header>

        {/* Barra de progreso segmentada */}
        {totalTasks > 0 && (
          <div className="pm-progress-wrap">
            <div className="pm-progress-segs" role="group" aria-label="Progreso">
              {tasksArray.map((task, idx) => {
                const exec = tasksExec.find((t) => t.taskId === task.id);
                let seg = "pm-seg";
                if (idx === currentIndex) seg += " pm-seg--current";
                else if (exec?.flagged) seg += " pm-seg--flag";
                else if (exec?.status === "ok") seg += " pm-seg--ok";
                else if (exec?.status === "nok") seg += " pm-seg--nok";
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={seg}
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Punto ${idx + 1}`}
                  />
                );
              })}
            </div>
            <span className="pm-progress-counter">{currentIndex + 1} / {totalTasks}</span>
          </div>
        )}
      </div>

      <main className="pm-main">
        <div className="pm-main-inner">
          <section className="pm-card pm-card-main">
            {error && <div className="pm-error-banner">{error}</div>}

            {currentTaskTemplate && currentTaskExec && (
              <div className="pm-task-panel">
                {/* Encabezado */}
                <div className="pm-task-header">
                  <div className="pm-task-title-block">
                    <span className="pm-task-index">{currentIndex + 1}</span>
                    <div>
                      <p className="pm-task-id">Task ID {currentTaskTemplate.taskIdNumber}</p>
                      <h2 className="pm-task-title">{currentTaskTemplate.majorStep}</h2>
                    </div>
                  </div>
                  <div className="pm-task-status-block pm-card-status">
                    <span className={`pm-task-status-badge pm-task-status-badge--${currentTaskExec.status}`}>
                      {currentTaskExec.status === "ok" ? "OK" : currentTaskExec.status === "nok" ? "No ok" : "Pendiente"}
                    </span>
                    {currentTaskExec.flagged && <span className="pm-task-flag">Flag</span>}
                  </div>
                </div>

                {/* Info: Key Points / Razón */}
                <div className="pm-info-box">
                  <div className="pm-info-section pm-info-section--kp">
                    <span className="pm-info-label pm-info-label--kp">KEY POINTS</span>
                    <p className="pm-info-text">{currentTaskTemplate.keyPoints || "—"}</p>
                  </div>
                  <div className="pm-info-section pm-info-section--reason">
                    <span className="pm-info-label pm-info-label--reason">RAZÓN</span>
                    <p className="pm-info-text">{currentTaskTemplate.reason || "—"}</p>
                  </div>
                </div>

                {/* Controls */}
                <div className="pm-controls-box">
                  <div className="pm-control-row">
                    <span className="pm-control-label">RESULTADO</span>
                    <div className="pm-control-buttons">
                      <button
                        type="button"
                        className={`pm-btn-result${currentTaskExec.status === "ok" ? " pm-btn-result--ok" : ""}`}
                        onClick={() => handleSetStatus("ok")}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        className={`pm-btn-result${currentTaskExec.status === "nok" ? " pm-btn-result--nok" : ""}`}
                        onClick={() => handleSetStatus("nok")}
                      >
                        No ok
                      </button>
                      <button
                        type="button"
                        className={`pm-btn-result${currentTaskExec.flagged ? " pm-btn-result--flag" : ""}`}
                        onClick={toggleFlag}
                      >
                        Flag
                      </button>
                    </div>
                  </div>

                  {requiresMeasure && (
                    <div className="pm-measure-block">
                      <span className="pm-measure-label">Medición / Valor registrado</span>
                      <input
                        type="text"
                        className="pm-input pm-input--measure"
                        placeholder="Ej: 4.8 mm, 3.2%, 85 °C..."
                        value={currentTaskExec.measureValue || ""}
                        onChange={(e) => updateCurrentExec({ measureValue: e.target.value })}
                      />
                    </div>
                  )}

                  {/* ✅ BLOQUE FOTOS */}
<div className="pm-comments-block">
  <span className="pm-comments-label">Evidencia (fotos)</span>

  <div
    className="pm-evidence-row"
    style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
  >
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png"
      capture="environment"
      multiple
      onChange={(e) => uploadPhotos(e.target.files)}
      disabled={uploadingPhoto}
      style={{ display: "none" }}
    />

    <button
      type="button"
      className={`pm-btn ${uploadingPhoto ? "pm-btn--disabled" : "pm-btn--secondary"}`}
      onClick={() => fileInputRef.current?.click()}
      disabled={uploadingPhoto}
    >
      {uploadingPhoto ? "Subiendo..." : "Tomar / Subir foto"}
    </button>

    {/* ✅ NUEVO: botón ver PDF original aquí */}
    {pdfUrl && (
      <button
        type="button"
        className="pm-btn pm-btn--secondary"
        onClick={() => window.open(pdfUrl, "_blank")}
      >
        Ver PDF original
      </button>
    )}
  </div>

  {photoError && (
    <div className="pm-error-banner" style={{ marginTop: 8 }}>
      {photoError}
    </div>
  )}

  {(currentTaskExec.photoUrls || []).length > 0 && (
    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
      {currentTaskExec.photoUrls.map((url) => (
        <div key={url} style={{ width: 120 }}>
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt="Evidencia"
              style={{
                width: "120px",
                height: "90px",
                objectFit: "cover",
                borderRadius: 10,
              }}
            />
          </a>
          <button
            type="button"
            className="pm-btn pm-btn--ghost"
            style={{ width: "100%", marginTop: 6 }}
            onClick={() => removePhoto(url)}
          >
            Quitar
          </button>
        </div>
      ))}
    </div>
  )}
</div>


                  {/* Comentarios */}
                  <div className="pm-comments-block">
                    <span className="pm-comments-label">
                      {currentTaskExec.flagged
                        ? "Detalle del FLAG / criterio:"
                        : currentTaskExec.status === "nok"
                        ? "Comentarios (obligatorio para NO OK):"
                        : "Comentarios / Observaciones:"}
                    </span>
                    <textarea
                      className="pm-textarea"
                      placeholder={
                        currentTaskExec.flagged
                          ? "Explica por qué marcaste este punto con FLAG..."
                          : currentTaskExec.status === "nok"
                          ? "Describe qué está mal o qué se encontró..."
                          : "Opcional. Usa este espacio para detalles, mediciones extra, etc."
                      }
                      value={currentTaskExec.comment}
                      onChange={(e) => updateCurrentExec({ comment: e.target.value })}
                    />
                    {(currentTaskExec.flagged || currentTaskExec.status === "nok" || requiresMeasure) && (
                      <p className="pm-help-error">
                        * Si el punto es NO OK, tiene FLAG o requiere medición, el comentario y/o la medición son obligatorios para continuar.
                      </p>
                    )}
                  </div>
                </div>

                {/* Nav */}
                <footer className="pm-footer-nav">
                  <div className="pm-footer-left">
                    <button
                      type="button"
                      className="pm-btn pm-btn--secondary"
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                    >
                      Anterior
                    </button>
                  </div>
                  <div className="pm-footer-right-nav">
                    <button
                      type="button"
                      className={`pm-btn ${canGoNext() ? "pm-btn--primary" : "pm-btn--disabled"}`}
                      onClick={handleNext}
                      disabled={!canGoNext()}
                    >
                      Siguiente
                    </button>
                  </div>
                </footer>

                {/* Progress */}
                <div className="pm-progress-block">
                  <div className="pm-progress-row">
                    <span className="pm-progress-label">PROGRESO</span>
                    <span className="pm-progress-value">
                      {counts.total > 0 ? `${counts.ok + counts.nok}/${counts.total}` : "0/0"} puntos
                    </span>
                  </div>
                  <div className="pm-progress-row">
                    <span className="pm-progress-label">FLAGS</span>
                    <span className="pm-progress-value">{counts.flagged}</span>
                  </div>
                </div>

                {/* Finish */}
                <div className="pm-finish-block">
                  <div className="pm-legend">
                    <span>OK: punto correcto</span>
                    <span>NO OK: punto con desviación</span>
                    <span>FLAG: requiere revisión del GL / Mtto</span>
                  </div>
                  <button
                    type="button"
                    className={`pm-btn pm-btn--primary pm-btn--finish ${!canFinish || finishing ? "pm-btn--disabled" : ""}`}
                    onClick={handleFinish}
                    disabled={!canFinish || finishing}
                  >
                    {finishing ? "Generando PDF..." : "Finalizar y generar PDF"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Lado derecho */}
          <aside className="pm-card pm-card-side">
            <div className="pm-side-section">
              <h3 className="pm-side-title">Resumen del PM</h3>
              <div className="pm-side-stats">
                <div className="pm-side-stat">
                  <span className="pm-side-stat-label">Total puntos</span>
                  <span className="pm-side-stat-value">{counts.total}</span>
                </div>
                <div className="pm-side-stat">
                  <span className="pm-side-stat-label">OK</span>
                  <span className="pm-side-stat-value pm-side-stat-ok">{counts.ok}</span>
                </div>
                <div className="pm-side-stat">
                  <span className="pm-side-stat-label">NO OK</span>
                  <span className="pm-side-stat-value pm-side-stat-nok">{counts.nok}</span>
                </div>
                <div className="pm-side-stat">
                  <span className="pm-side-stat-label">Pendientes</span>
                  <span className="pm-side-stat-value pm-side-stat-pending">{counts.pending}</span>
                </div>
                <div className="pm-side-stat">
                  <span className="pm-side-stat-label">FLAGS</span>
                  <span className="pm-side-stat-value pm-side-stat-flag">{counts.flagged}</span>
                </div>
              </div>
            </div>

            <div className="pm-side-section">
              <p className="pm-side-section-title">Navegación por puntos</p>
              <div className="pm-steps-grid">
                {tasksArray.map((task, idx) => {
                  const exec = tasksExec.find((t) => t.taskId === task.id);
                  let statusClass = "pm-step--pending";
                  if (exec?.status === "ok") statusClass = "pm-step--ok";
                  else if (exec?.status === "nok") statusClass = "pm-step--nok";
                  if (exec?.flagged) statusClass = "pm-step--flag";

                  const isCurrent = idx === currentIndex;

                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={`pm-step ${statusClass} ${isCurrent ? "pm-step--current" : ""}`}
                      onClick={() => setCurrentIndex(idx)}
                    >
                      <span className="pm-step-index">{idx + 1}</span>
                      <span className="pm-step-id">{task.taskIdNumber}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pm-side-section">
              <p className="pm-side-section-title">Notas</p>
              <p className="pm-side-text">
                - Marca los puntos con <strong>FLAG</strong> cuando requieran revisión del GL o de Mantenimiento.
                <br />
                - Los puntos con <strong>NO OK</strong> deben tener comentario obligatorio.
                <br />- Si el sistema detecta que el punto requiere <strong>medición</strong>, deberás capturar el valor.
              </p>
            </div>

            <div className="pm-side-footnote">
              Cuando termines todos los puntos y no haya pendientes, el botón de{" "}
              <strong>"Finalizar y generar PDF"</strong> se habilitará automáticamente.
            </div>
          </aside>
        </div>
      </main>

      {/* Bottom bar mobile: Anterior / Siguiente / Finalizar */}
      {currentTaskTemplate && currentTaskExec && (
        <div className="pm-bottom-bar">
          <button
            type="button"
            className="pm-btn-bottom pm-btn-bottom--prev"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            ← Ant.
          </button>
          {currentIndex < tasksArray.length - 1 ? (
            <button
              type="button"
              className="pm-btn-bottom pm-btn-bottom--next"
              onClick={handleNext}
              disabled={!canGoNext()}
            >
              Siguiente →
            </button>
          ) : (
            <button
              type="button"
              className="pm-btn-bottom pm-btn-bottom--finish"
              onClick={handleFinish}
              disabled={!canFinish || finishing}
            >
              {finishing ? "Generando..." : "Finalizar PM"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
