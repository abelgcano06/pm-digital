// src/app/pm/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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

  const asociado1 = searchParams.get("op1") || searchParams.get("a1") || "";
  const asociado2 = searchParams.get("op2") || searchParams.get("a2") || "";
  const glNombre = searchParams.get("gl") || "";

  const [loading, setLoading] = useState(true);
  const [pmTemplate, setPmTemplate] = useState<PMTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [tasksExec, setTasksExec] = useState<TaskExecution[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Fotos
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/pm-templates/${params.id}`);
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
    currentTaskTemplate &&
    tasksExec.find((t) => t.taskId === currentTaskTemplate.id);

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
      prev.map((t) =>
        t.taskId === currentTaskTemplate.id ? { ...t, ...partial } : t
      )
    );
  };

  const handleSetStatus = (status: TaskStatus) => updateCurrentExec({ status });

  const toggleFlag = () => {
    if (!currentTaskExec) return;
    updateCurrentExec({ flagged: !currentTaskExec.flagged });
  };

  const canGoNext = (): boolean => {
    if (!currentTaskTemplate || !currentTaskExec) return false;
    if (currentTaskExec.status === "pending") return false;

    if (currentTaskExec.flagged && !currentTaskExec.comment.trim()) return false;
    if (currentTaskExec.status === "nok" && !currentTaskExec.comment.trim())
      return false;

    if (requiresMeasure) {
      if (!currentTaskExec.measureValue || !currentTaskExec.measureValue.trim()) {
        return false;
      }
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

        const res = await fetch("/api/pm-photo", {
          method: "POST",
          body: fd,
        });

        const data = await res.json().catch(() => ({} as any));

        if (!res.ok || !data?.ok || !data?.url) {
          const msg = data?.error || "No se pudo subir la foto";
          const details = data?.details ? `\n${data.details}` : "";
          throw new Error(msg + details);
        }

        // importante: usa el estado actual “real”
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

  // ✅ FIX iOS: abrir pestaña en blanco EN EL MISMO CLICK
  const handleFinish = async () => {
    if (!pmTemplate) return;
    if (!canFinish) return;

    // ✅ abre “about:blank” en el gesto del click (evita popup blocker de iOS)
    const pdfWindow = window.open("about:blank", "_blank");

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
        glNombre: glNombre || "SIN GL",
        startedAt: startedAt || now,
        finishedAt: now,
        tasks: tasksExec, // ✅ incluye photoUrls
      };

      const res = await fetch("/api/pm-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const raw = await res.text();
        let msg = "Error al generar el PDF.";
        try {
          const j = JSON.parse(raw);
          msg =
            (j?.error ? j.error : msg) +
            (j?.details ? `\n${j.details}` : "") +
            (j?.rawSample ? `\nrawSample: ${j.rawSample}` : "");
        } catch {
          msg = msg + `\n${raw.slice(0, 800)}`;
        }
        // si ya abrimos ventana, la cerramos
        if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
        throw new Error(msg);
      }

      const data = await res.json();
      if (!data?.url) {
        if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
        throw new Error("La respuesta no incluye la URL del PDF.");
      }

      // ✅ redirige la pestaña que abrimos en blanco
      if (pdfWindow && !pdfWindow.closed) {
        pdfWindow.location.href = data.url;
        pdfWindow.focus();
      } else {
        // fallback si iOS la bloqueó
        window.location.href = data.url;
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
                  : pmTemplate.assetCode
                  ? pmTemplate.assetCode
                  : pmTemplate.location
                  ? pmTemplate.location
                  : "Ejecución de mantenimiento preventivo"}
              </p>
              <div className="pm-badges-row">
                <span className="pm-badge pm-badge-chip">
                  Asociado 1: {asociado1 || "SIN NOMBRE"}
                </span>
                {asociado2 && (
                  <span className="pm-badge pm-badge-chip">
                    Asociado 2: {asociado2}
                  </span>
                )}
                <span className="pm-badge pm-badge-chip">
                  GL: {glNombre || "SIN GL"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="pm-main">
  <div className="pm-main-inner">
    {/* COLUMNA IZQUIERDA */}
    <section className="pm-card pm-card-main">
      {error && <div className="pm-error-banner">{error}</div>}

      {currentTaskTemplate && currentTaskExec && (
        <div className="pm-task-panel">
          {/* ... TODO tu panel actual de tarea se queda igual ... */}
        </div>
      )}
    </section>

    {/* ✅ COLUMNA DERECHA (la que te faltó) */}
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
                className={`pm-step ${statusClass} ${
                  isCurrent ? "pm-step--current" : ""
                }`}
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
          - Marca los puntos con <strong>FLAG</strong> cuando requieran revisión del GL o de
          Mantenimiento.
          <br />
          - Los puntos con <strong>NO OK</strong> deben tener comentario obligatorio.
          <br />
          - Si el sistema detecta que el punto requiere <strong>medición</strong>, deberás capturar el valor.
        </p>
      </div>
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

      <div className="pm-side-footnote">
        Cuando termines todos los puntos y no haya pendientes, el botón de{" "}
        <strong>“Finalizar y generar PDF”</strong> se habilitará automáticamente.
      </div>
    </aside>
  </div>
</main>

    </div>
  );
}
