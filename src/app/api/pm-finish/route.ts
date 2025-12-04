// src/app/api/pm-finish/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { put } from "@vercel/blob";
import { Buffer } from "buffer";

type TaskStatus = "pending" | "ok" | "nok";

type IncomingTask = {
  taskId: string;
  status: TaskStatus;
  comment: string;
  flagged: boolean;
  measureValue?: string;
};

type FinishBody = {
  pmTemplateId: string;
  pmNumber: string;
  pmName: string;
  asociado1: string;
  asociado2?: string;
  glNombre: string;
  startedAt: string;
  finishedAt: string;
  tasks: IncomingTask[];
};

export const runtime = "nodejs";

// 🔧 Limpia el texto para que WinAnsi (Helvetica estándar) lo pueda dibujar
function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD") // separa letras y acentos
    .replace(/[\u0300-\u036f]/g, "") // quita acentos combinantes
    .replace(/[^\x00-\x7F]/g, ""); // quita caracteres fuera de ASCII básico
}

// 🔧 Limpia texto para usarlo en EL NOMBRE DEL ARCHIVO (sin espacios raros)
function sanitizeForFileName(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^\w.-]+/g, "_"); // solo letras, numeros, _, . y -
}

export async function POST(req: Request) {
  try {
    // ============================================================
    // 1) SOPORTE PARA JSON (actual) Y multipart/form-data (futuro)
    // ============================================================
    const contentType = req.headers.get("content-type") || "";
    let body: FinishBody;
    let formData: FormData | null = null;

    if (contentType.includes("multipart/form-data")) {
      formData = await req.formData();
      const rawPayload = formData.get("payload");
      if (!rawPayload || typeof rawPayload !== "string") {
        return NextResponse.json(
          { error: "Falta payload o formato inválido" },
          { status: 400 }
        );
      }
      body = JSON.parse(rawPayload) as FinishBody;
    } else {
      // 👉 modo actual: el frontend manda JSON
      body = (await req.json()) as FinishBody;
    }

    const {
      pmTemplateId,
      pmNumber,
      pmName,
      asociado1,
      asociado2,
      glNombre,
      startedAt,
      finishedAt,
      tasks,
    } = body;

    // =========================
    // 2) Validaciones básicas
    // =========================
    if (!pmTemplateId) {
      return NextResponse.json(
        { error: "Falta pmTemplateId" },
        { status: 400 }
      );
    }
    if (!asociado1) {
      return NextResponse.json(
        { error: "Falta nombre del Asociado 1" },
        { status: 400 }
      );
    }
    if (!glNombre) {
      return NextResponse.json({ error: "Falta GL" }, { status: 400 });
    }
    if (!startedAt || !finishedAt) {
      return NextResponse.json(
        { error: "Falta startedAt o finishedAt" },
        { status: 400 }
      );
    }
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron tareas" },
        { status: 400 }
      );
    }

    const template = await prisma.pMTemplate.findUnique({
      where: { id: pmTemplateId },
      include: { tasks: true, uploadedFile: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: "PMTemplate no encontrado" },
        { status: 404 }
      );
    }

    // Mapa para encontrar rápido cada task del template
    const taskMap = new Map<string, (typeof template.tasks)[number]>(
      template.tasks.map((t) => [t.id, t])
    );

    // Validar que todas las tasks que vienen del front existan en el template
    for (const t of tasks) {
      if (!taskMap.has(t.taskId)) {
        return NextResponse.json(
          { error: `Tarea inválida: ${t.taskId}` },
          { status: 400 }
        );
      }
    }

    const startedDate = new Date(startedAt);
    const finishedDate = new Date(finishedAt);
    const durationMs = finishedDate.getTime() - startedDate.getTime();

    // =========================
    // 3) Crear ejecución
    // =========================
    const execution = (await prisma.pMExecution.create({
      data: {
        pmTemplateId: template.id,
        associate1: asociado1,
        associate2: asociado2 || "",
        groupLeader: glNombre,
        startedAt: startedDate,
        finishedAt: finishedDate,
        durationMs,
      },
    })) as any; // 👈 cast para que TypeScript no marque unknown

    // Marcar el PM como COMPLETED a nivel PMUploadedFile
    if (template.uploadedFileId) {
      await prisma.pMUploadedFile.update({
        where: { id: template.uploadedFileId },
        data: {
          pmStatus: "COMPLETED",
        } as any,
      });
    }

    // Crear las líneas de ejecución de tareas (PMTaskExecution)
    await prisma.pMTaskExecution.createMany({
      data: tasks.map((t) => {
        const tmplTask = taskMap.get(t.taskId)!;
        return {
          pmExecutionId: execution.id,
          templateTaskId: tmplTask.id,
          status: t.status,
          comment: t.comment || "",
          flagged: t.flagged,
          measureValue: t.measureValue || null,
          // photoUrl se llenará después si hay foto
        };
      }),
    });

    // =========================
    // 4) Si viene multipart/form-data,
    //    subimos fotos y guardamos photoUrl
    // =========================
    if (formData) {
      const executionWithTasks = (await prisma.pMExecution.findUnique({
        where: { id: execution.id },
        include: { taskExecutions: true },
      })) as any;

      if (executionWithTasks && executionWithTasks.taskExecutions) {
        for (const taskExec of executionWithTasks.taskExecutions as any[]) {
          const key = `photo_${taskExec.templateTaskId}`;
          const file = formData.get(key);

          if (!file || typeof file === "string") continue;

          const extFromName =
            (file as File).name?.split(".").pop() || "jpg";

          const blob = await put(
            `pm-photos/${execution.id}-${taskExec.templateTaskId}-${Date.now()}.${extFromName}`,
            file as any,
            { access: "public" }
          );

          await prisma.pMTaskExecution.update({
            where: { id: taskExec.id },
            data: {
              photoUrl: blob.url,
            },
          });
        }
      }
    }

    // ==========================================
    // 5) Generar PDF de ejecución
    // ==========================================

    const pdfDoc = await PDFDocument.create();
    // A4 horizontal aprox: 842 x 595
    const page = pdfDoc.addPage([842, 595]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const margin = 40;
    let y = height - margin;

    const getCurrentPage = () =>
      pdfDoc.getPages()[pdfDoc.getPages().length - 1];

    const ensureSpace = (requiredHeight: number) => {
      if (y < margin + requiredHeight) {
        const newPage = pdfDoc.addPage([842, 595]);
        y = newPage.getSize().height - margin;
      }
    };

    const drawText = (
      rawText: string,
      fontSize = 10,
      color = rgb(0, 0, 0)
    ) => {
      const text = sanitizeForPdf(rawText);
      if (!text) {
        y -= fontSize + 4;
        return;
      }

      ensureSpace(fontSize + 6);
      const pageCurrent = getCurrentPage();
      pageCurrent.drawText(text, {
        x: margin,
        y,
        size: fontSize,
        font,
        color,
      });
      y -= fontSize + 4;
    };

    // -------- Resumen de estados para el encabezado --------
    const total = tasks.length;
    const okCount = tasks.filter((t) => t.status === "ok").length;
    const nokCount = tasks.filter((t) => t.status === "nok").length;
    const flaggedCount = tasks.filter((t) => t.flagged).length;

    // -------- Encabezado general --------
    drawText("TOYOTA - PM EXECUTION REPORT", 16);
    drawText("");

    drawText(
      `PM: ${sanitizeForPdf(template.pmNumber ?? pmNumber)} - ${sanitizeForPdf(
        template.name ?? pmName
      )}`,
      12
    );
    drawText(
      `Equipo: ${sanitizeForPdf(asociado1)}${
        asociado2 ? " y " + sanitizeForPdf(asociado2) : ""
      } | GL: ${sanitizeForPdf(glNombre)}`,
      10
    );
    drawText(
      `Inicio: ${sanitizeForPdf(
        startedDate.toLocaleString()
      )}  ·  Fin: ${sanitizeForPdf(finishedDate.toLocaleString())}`,
      10
    );
    drawText(
      `Duracion (min): ${Math.round(durationMs / 60000).toString()}`,
      10
    );
    drawText("");

    // -------- “Tarjetitas” de resumen --------
    const summaryHeight = 40;
    const boxWidth = (width - 2 * margin - 20) / 3; // 3 cajas + espacios
    const summaryY = y;

    const pageCurrent = getCurrentPage();

    // OK (verde)
    pageCurrent.drawRectangle({
      x: margin,
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(0.82, 1, 0.82),
    });
    pageCurrent.drawText("OK", {
      x: margin + 10,
      y: summaryY - 14,
      size: 10,
      font,
      color: rgb(0, 0.4, 0),
    });
    pageCurrent.drawText(`${okCount}/${total}`, {
      x: margin + 10,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0, 0.4, 0),
    });

    // NO OK (rojo)
    pageCurrent.drawRectangle({
      x: margin + boxWidth + 10,
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(1, 0.8, 0.8),
    });
    pageCurrent.drawText("NO OK", {
      x: margin + boxWidth + 20,
      y: summaryY - 14,
      size: 10,
      font,
      color: rgb(0.5, 0, 0),
    });
    pageCurrent.drawText(`${nokCount}/${total}`, {
      x: margin + boxWidth + 20,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0.5, 0, 0),
    });

    // Revisión (Flag / naranja)
    pageCurrent.drawRectangle({
      x: margin + 2 * (boxWidth + 10),
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(1, 0.9, 0.7),
    });
    pageCurrent.drawText("NECESITA REVISION", {
      x: margin + 2 * (boxWidth + 10) + 10,
      y: summaryY - 14,
      size: 8,
      font,
      color: rgb(0.5, 0.25, 0),
    });
    pageCurrent.drawText(`${flaggedCount}`, {
      x: margin + 2 * (boxWidth + 10) + 10,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0.5, 0.25, 0),
    });

    y = summaryY - summaryHeight - 16;

    drawText(""); // espacio
    drawText("Detalle por punto:", 12);
    drawText("");

    // -------- Función para dibujar el CUADRO completo de un punto --------
    const drawTaskBox = (
      tmplTask: {
        taskIdNumber: number;
        majorStep: string;
        keyPoints: string;
        reason: string;
      },
      exec: IncomingTask
    ) => {
      const headerFontSize = 10;
      const bodyFontSize = 9;
      const lineGap = 4;
      const padding = 6;

      // Contar cuántas líneas vamos a dibujar
      let lines = 1; // encabezado
      if (tmplTask.keyPoints) lines++;
      if (tmplTask.reason) lines++;
      if (exec.measureValue) lines++;
      if (exec.comment) lines++;
      if (exec.flagged) lines++;

      const headerLineHeight = headerFontSize + lineGap;
      const bodyLineHeight = bodyFontSize + lineGap;
      const contentHeight =
        headerLineHeight + (lines - 1) * bodyLineHeight;
      const boxHeight = contentHeight + padding * 2;

      // Aseguramos espacio para TODO el cuadro
      ensureSpace(boxHeight + 8);

      const page = getCurrentPage();

      // Color del borde según estado
      // OK → verde, NO OK → rojo, Flag → naranja
      let borderColor = rgb(0.6, 0.6, 0.6); // gris por defecto
      if (exec.status === "ok") borderColor = rgb(0, 0.6, 0);
      if (exec.status === "nok") borderColor = rgb(0.8, 0, 0);
      if (exec.flagged) borderColor = rgb(0.9, 0.4, 0); // revisión manda

      const boxTopY = y;
      const boxBottomY = y - boxHeight;

      // Dibujar cuadro (fondo blanco, solo borde de color)
      page.drawRectangle({
        x: margin - 4,
        y: boxBottomY,
        width: width - 2 * margin + 8,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor,
        borderWidth: 1.5,
      });

      // “Icono” según estado
      let icon = "[ ]";
      if (exec.flagged) icon = "[!]";
      else if (exec.status === "ok") icon = "[O]";
      else if (exec.status === "nok") icon = "[X]";

      const statusLabel =
        exec.status === "ok"
          ? "OK"
          : exec.status === "nok"
          ? "NO OK"
          : "Pendiente";

      const needsReview = exec.flagged;

      const headerLabel = needsReview
        ? `[${tmplTask.taskIdNumber}] ${icon} ${tmplTask.majorStep}  [${statusLabel} · NECESITA REVISION]`
        : `[${tmplTask.taskIdNumber}] ${icon} ${tmplTask.majorStep}  [${statusLabel}]`;

      // Dibujar texto dentro del cuadro
      let textY = boxTopY - padding - headerFontSize;

      page.drawText(sanitizeForPdf(headerLabel), {
        x: margin,
        y: textY,
        size: headerFontSize,
        font,
        color: rgb(0, 0, 0),
      });

      textY -= bodyLineHeight;

      if (tmplTask.keyPoints) {
        page.drawText(
          sanitizeForPdf(`Key points: ${tmplTask.keyPoints}`),
          {
            x: margin,
            y: textY,
            size: bodyFontSize,
            font,
            color: rgb(0, 0, 0),
          }
        );
        textY -= bodyLineHeight;
      }

      if (tmplTask.reason) {
        page.drawText(
          sanitizeForPdf(`Razon: ${tmplTask.reason}`),
          {
            x: margin,
            y: textY,
            size: bodyFontSize,
            font,
            color: rgb(0, 0, 0),
          }
        );
        textY -= bodyLineHeight;
      }

      if (exec.measureValue) {
        page.drawText(
          sanitizeForPdf(`Medicion: ${exec.measureValue}`),
          {
            x: margin,
            y: textY,
            size: bodyFontSize,
            font,
            color: rgb(0, 0, 0),
          }
        );
        textY -= bodyLineHeight;
      }

      if (exec.comment) {
        page.drawText(
          sanitizeForPdf(`Comentario: ${exec.comment}`),
          {
            x: margin,
            y: textY,
            size: bodyFontSize,
            font,
            color: rgb(0, 0, 0),
          }
        );
        textY -= bodyLineHeight;
      }

      if (exec.flagged) {
        page.drawText(
          sanitizeForPdf(
            "FLAG: Requiere revision del GL / Mtto"
          ),
          {
            x: margin,
            y: textY,
            size: bodyFontSize,
            font,
            color: rgb(0.8, 0.3, 0),
          }
        );
        textY -= bodyLineHeight;
      }

      // Actualizar y global dejando un espacio entre tarjetas
      y = boxBottomY - 8;
    };

    // -------- Lista de tareas (cada una como tarjeta completa) --------
    for (const t of tasks) {
      const tmplTask = taskMap.get(t.taskId) as any;
      drawTaskBox(
        {
          taskIdNumber: tmplTask.taskIdNumber,
          majorStep: tmplTask.majorStep,
          keyPoints: tmplTask.keyPoints,
          reason: tmplTask.reason,
        },
        t
      );
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // ============================
    // NOMBRE DEL ARCHIVO PDF FINAL
    // ============================
    // EXEC_(NOMBRE DEL ARCHIVO ORIGINAL)_GL(GL)_A1(A1)_A2(A2).pdf
    const originalFileName =
      template.uploadedFile?.fileName ??
      template.pmNumber ??
      pmNumber ??
      "PM";

    const originalBase = originalFileName.replace(/\.[^/.]+$/, "");

    const safeOriginal = sanitizeForFileName(originalBase);
    const safeGL = sanitizeForFileName(glNombre);
    const safeA1 = sanitizeForFileName(asociado1);
    const safeA2 = sanitizeForFileName(asociado2 || "");

    const blobName =
      `EXEC_${safeOriginal}_GL(${safeGL})_A1(${safeA1})` +
      (safeA2 ? `_A2(${safeA2})` : "") +
      `.pdf`;

    const { url } = await put(blobName, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
    });

    const exec = await prisma.pMExecution.update({
      where: { id: execution.id },
      data: {
        executionPdfUrl: url,
      },
    });

    return NextResponse.json({ ok: true, url, executionId: exec.id });
  } catch (err) {
    console.error("Error en /api/pm-finish:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF" },
      { status: 400 }
    );
  }
}
