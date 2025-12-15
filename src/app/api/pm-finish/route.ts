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
  photoUrls?: string[]; // ✅ fotos por tarea
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

// 🔧 Limpia el texto para que Helvetica estándar lo pueda dibujar
function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");
}

// 🔧 Limpia texto para usarlo en EL NOMBRE DEL ARCHIVO
function sanitizeForFileName(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_");
}

function isPng(bytes: Uint8Array) {
  // 89 50 4E 47 0D 0A 1A 0A
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpg(bytes: Uint8Array) {
  // FF D8
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar imagen: ${url} (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    let body: FinishBody;
    try {
      body = JSON.parse(rawBody) as FinishBody;
    } catch (parseErr: any) {
      console.error("pm-finish: body NO es JSON válido:", rawBody);
      return NextResponse.json(
        {
          error: "El cuerpo recibido no es JSON válido",
          details: parseErr?.message || String(parseErr),
          rawSample: rawBody.slice(0, 300),
        },
        { status: 400 }
      );
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

    // ==========================
    // Validaciones básicas
    // ==========================
    if (!pmTemplateId) {
      return NextResponse.json({ error: "Falta pmTemplateId" }, { status: 400 });
    }
    if (!asociado1) {
      return NextResponse.json({ error: "Falta nombre del Asociado 1" }, { status: 400 });
    }
    if (!glNombre) {
      return NextResponse.json({ error: "Falta GL" }, { status: 400 });
    }
    if (!startedAt || !finishedAt) {
      return NextResponse.json({ error: "Falta startedAt o finishedAt" }, { status: 400 });
    }
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: "No se recibieron tareas" }, { status: 400 });
    }

    // ==========================
    // Cargar plantilla desde Prisma
    // ==========================
    const template = await prisma.pMTemplate.findUnique({
      where: { id: pmTemplateId },
      include: { tasks: true, uploadedFile: true },
    });

    if (!template) {
      return NextResponse.json({ error: "PMTemplate no encontrado" }, { status: 404 });
    }

    const taskMap = new Map<string, any>(template.tasks.map((t) => [t.id, t as any]));

    for (const t of tasks) {
      if (!taskMap.has(t.taskId)) {
        return NextResponse.json({ error: `Tarea inválida: ${t.taskId}` }, { status: 400 });
      }
    }

    const startedDate = new Date(startedAt);
    const finishedDate = new Date(finishedAt);
    const durationMs = finishedDate.getTime() - startedDate.getTime();

    // ==========================
    // Crear ejecución (PMExecution)
    // ==========================
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
    })) as any;

    // Marcar PMUploadedFile como COMPLETED
    if (template.uploadedFileId) {
      await prisma.pMUploadedFile.update({
        where: { id: template.uploadedFileId },
        data: { pmStatus: "COMPLETED" } as any,
      });
    }

    // ==========================
    // Crear ejecuciones por tarea + guardar photoUrls
    // ==========================
    await prisma.pMTaskExecution.createMany({
      data: tasks.map((t) => {
        const tmplTask = taskMap.get(t.taskId) as any;
        return {
          pmExecutionId: execution.id,
          templateTaskId: tmplTask.id,
          status: t.status,
          comment: t.comment || "",
          flagged: t.flagged,
          measureValue: t.measureValue || null,
          // ✅ requiere schema: photoUrls String[] @default([])
          photoUrls: t.photoUrls ?? [],
        };
      }),
    });

    // ==========================
    // GENERAR PDF
    // ==========================
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([842, 595]); // A4 horizontal
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const margin = 40;
    let y = pdfDoc.getPages()[0].getSize().height - margin;

    const getCurrentPage = () => pdfDoc.getPages()[pdfDoc.getPages().length - 1];
    const getSize = () => getCurrentPage().getSize();
    const ensureSpace = (requiredHeight: number) => {
      const { height } = getSize();
      if (y < margin + requiredHeight) {
        const newPage = pdfDoc.addPage([842, 595]);
        y = newPage.getSize().height - margin;
      }
    };

    const drawText = (rawText: string, fontSize = 10, color = rgb(0, 0, 0)) => {
      const text = sanitizeForPdf(rawText);
      if (!text) {
        y -= fontSize + 4;
        return;
      }
      ensureSpace(fontSize + 6);
      const page = getCurrentPage();
      page.drawText(text, { x: margin, y, size: fontSize, font, color });
      y -= fontSize + 4;
    };

    // Resumen
    const total = tasks.length;
    const okCount = tasks.filter((t) => t.status === "ok").length;
    const nokCount = tasks.filter((t) => t.status === "nok").length;
    const flaggedCount = tasks.filter((t) => t.flagged).length;

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
      `Inicio: ${sanitizeForPdf(startedDate.toLocaleString())}  ·  Fin: ${sanitizeForPdf(
        finishedDate.toLocaleString()
      )}`,
      10
    );
    drawText(`Duracion (min): ${Math.round(durationMs / 60000).toString()}`, 10);
    drawText("");

    // Tarjetas resumen
    const page0 = getCurrentPage();
    const { width } = getSize();
    const summaryHeight = 40;
    const boxWidth = (width - 2 * margin - 20) / 3;
    const summaryY = y;

    // OK
    page0.drawRectangle({
      x: margin,
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(0.82, 1, 0.82),
    });
    page0.drawText("OK", { x: margin + 10, y: summaryY - 14, size: 10, font, color: rgb(0, 0.4, 0) });
    page0.drawText(`${okCount}/${total}`, {
      x: margin + 10,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0, 0.4, 0),
    });

    // NO OK
    page0.drawRectangle({
      x: margin + boxWidth + 10,
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(1, 0.8, 0.8),
    });
    page0.drawText("NO OK", {
      x: margin + boxWidth + 20,
      y: summaryY - 14,
      size: 10,
      font,
      color: rgb(0.5, 0, 0),
    });
    page0.drawText(`${nokCount}/${total}`, {
      x: margin + boxWidth + 20,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0.5, 0, 0),
    });

    // FLAGS
    page0.drawRectangle({
      x: margin + 2 * (boxWidth + 10),
      y: summaryY - summaryHeight,
      width: boxWidth,
      height: summaryHeight,
      color: rgb(1, 0.9, 0.7),
    });
    page0.drawText("NECESITA REVISION", {
      x: margin + 2 * (boxWidth + 10) + 10,
      y: summaryY - 14,
      size: 8,
      font,
      color: rgb(0.5, 0.25, 0),
    });
    page0.drawText(`${flaggedCount}`, {
      x: margin + 2 * (boxWidth + 10) + 10,
      y: summaryY - 28,
      size: 12,
      font,
      color: rgb(0.5, 0.25, 0),
    });

    y = summaryY - summaryHeight - 16;
    drawText("");
    drawText("Detalle por punto:", 12);
    drawText("");

    // ---- helper: dibujar fotos como miniaturas (2 por fila)
    const drawPhotoGrid = async (urls: string[]) => {
      if (!urls || urls.length === 0) return;

      const thumbW = 170;
      const thumbH = 110;
      const gap = 12;
      const rowH = thumbH + 18;

      for (let i = 0; i < urls.length; i += 2) {
        ensureSpace(rowH + 8);
        const page = getCurrentPage();

        const leftUrl = urls[i];
        const rightUrl = urls[i + 1];

        // Descarga + embed left
        try {
          const b1 = await fetchImageBytes(leftUrl);
          let img1: any;
          if (isPng(b1)) img1 = await pdfDoc.embedPng(b1);
          else if (isJpg(b1)) img1 = await pdfDoc.embedJpg(b1);
          else throw new Error("Formato no soportado (solo PNG/JPG)");

          page.drawText("Evidencia:", { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });

          // y para imagen
          const imgY = y - 14 - thumbH;
          page.drawImage(img1, {
            x: margin,
            y: imgY,
            width: thumbW,
            height: thumbH,
          });

          // URL (recortada)
          page.drawText(sanitizeForPdf(leftUrl.slice(0, 60)), {
            x: margin,
            y: imgY - 12,
            size: 7,
            font,
            color: rgb(0.3, 0.3, 0.3),
          });

          // right
          if (rightUrl) {
            const b2 = await fetchImageBytes(rightUrl);
            let img2: any;
            if (isPng(b2)) img2 = await pdfDoc.embedPng(b2);
            else if (isJpg(b2)) img2 = await pdfDoc.embedJpg(b2);
            else throw new Error("Formato no soportado (solo PNG/JPG)");

            page.drawImage(img2, {
              x: margin + thumbW + gap,
              y: imgY,
              width: thumbW,
              height: thumbH,
            });

            page.drawText(sanitizeForPdf(rightUrl.slice(0, 60)), {
              x: margin + thumbW + gap,
              y: imgY - 12,
              size: 7,
              font,
              color: rgb(0.3, 0.3, 0.3),
            });
          }

          y = imgY - 20; // baja después de la fila
        } catch (e: any) {
          // Si falla la imagen, no rompemos todo el PDF
          drawText(`(No se pudo incrustar foto: ${e?.message || "error"})`, 9, rgb(0.6, 0, 0));
        }
      }

      drawText("");
    };

    // Función: tarjeta de punto + fotos
    const drawTaskBox = async (
      tmplTask: { taskIdNumber: number; majorStep: string; keyPoints: string; reason: string },
      exec: IncomingTask
    ) => {
      const headerFontSize = 10;
      const bodyFontSize = 9;
      const lineGap = 4;
      const padding = 6;

      let lines = 1;
      if (tmplTask.keyPoints) lines++;
      if (tmplTask.reason) lines++;
      if (exec.measureValue) lines++;
      if (exec.comment) lines++;
      if (exec.flagged) lines++;

      // espacio extra si hay fotos (solo reservamos una fila aproximada)
      const hasPhotos = (exec.photoUrls?.length ?? 0) > 0;
      const extraPhotoHeight = hasPhotos ? 150 : 0;

      const headerLineHeight = headerFontSize + lineGap;
      const bodyLineHeight = bodyFontSize + lineGap;
      const contentHeight = headerLineHeight + (lines - 1) * bodyLineHeight;
      const boxHeight = contentHeight + padding * 2;

      ensureSpace(boxHeight + extraPhotoHeight + 16);

      const page = getCurrentPage();
      const { width } = getSize();

      const boxTopY = y;
      const boxBottomY = y - boxHeight;

      let borderColor = rgb(0.6, 0.6, 0.6);
      if (exec.status === "ok") borderColor = rgb(0, 0.6, 0);
      if (exec.status === "nok") borderColor = rgb(0.8, 0, 0);
      if (exec.flagged) borderColor = rgb(0.9, 0.4, 0);

      page.drawRectangle({
        x: margin - 4,
        y: boxBottomY,
        width: width - 2 * margin + 8,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor,
        borderWidth: 1.5,
      });

      let icon = "[ ]";
      if (exec.flagged) icon = "[!]";
      else if (exec.status === "ok") icon = "[O]";
      else if (exec.status === "nok") icon = "[X]";

      const statusLabel =
        exec.status === "ok" ? "OK" : exec.status === "nok" ? "NO OK" : "Pendiente";

      const headerLabel = exec.flagged
        ? `[${tmplTask.taskIdNumber}] ${icon} ${tmplTask.majorStep}  [${statusLabel} · NECESITA REVISION]`
        : `[${tmplTask.taskIdNumber}] ${icon} ${tmplTask.majorStep}  [${statusLabel}]`;

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
        page.drawText(sanitizeForPdf(`Key points: ${tmplTask.keyPoints}`), {
          x: margin,
          y: textY,
          size: bodyFontSize,
          font,
          color: rgb(0, 0, 0),
        });
        textY -= bodyLineHeight;
      }

      if (tmplTask.reason) {
        page.drawText(sanitizeForPdf(`Razon: ${tmplTask.reason}`), {
          x: margin,
          y: textY,
          size: bodyFontSize,
          font,
          color: rgb(0, 0, 0),
        });
        textY -= bodyLineHeight;
      }

      if (exec.measureValue) {
        page.drawText(sanitizeForPdf(`Medicion: ${exec.measureValue}`), {
          x: margin,
          y: textY,
          size: bodyFontSize,
          font,
          color: rgb(0, 0, 0),
        });
        textY -= bodyLineHeight;
      }

      if (exec.comment) {
        page.drawText(sanitizeForPdf(`Comentario: ${exec.comment}`), {
          x: margin,
          y: textY,
          size: bodyFontSize,
          font,
          color: rgb(0, 0, 0),
        });
        textY -= bodyLineHeight;
      }

      if (exec.flagged) {
        page.drawText(sanitizeForPdf("FLAG: Requiere revision del GL / Mtto"), {
          x: margin,
          y: textY,
          size: bodyFontSize,
          font,
          color: rgb(0.8, 0.3, 0),
        });
        textY -= bodyLineHeight;
      }

      // Baja fuera de la caja
      y = boxBottomY - 10;

      // ✅ Fotos debajo
      if (exec.photoUrls && exec.photoUrls.length > 0) {
        await drawPhotoGrid(exec.photoUrls);
      }
    };

    // Dibujar tareas (secuencial, con await por fotos)
    for (const t of tasks) {
      const tmplTask = taskMap.get(t.taskId) as any;
      await drawTaskBox(
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

    // ==========================
    // NOMBRE DEL ARCHIVO
    // ==========================
    const originalFileName =
      template.uploadedFile?.fileName ?? template.pmNumber ?? pmNumber ?? "PM";

    const originalBase = originalFileName.replace(/\.[^/.]+$/, "");
    const safeOriginal = sanitizeForFileName(originalBase);
    const safeGL = sanitizeForFileName(glNombre);
    const safeA1 = sanitizeForFileName(asociado1);
    const safeA2 = sanitizeForFileName(asociado2 || "");

    const blobName =
      `EXEC_${safeOriginal}_GL(${safeGL})_A1(${safeA1})` + (safeA2 ? `_A2(${safeA2})` : "") + `.pdf`;

    // ==========================
    // SUBIR PDF A BLOB
    // ==========================
    let url: string;
    try {
      const { url: blobUrl } = await put(blobName, pdfBuffer, {
        access: "public",
        contentType: "application/pdf",
      });
      url = blobUrl;
    } catch (blobErr: any) {
      console.error("Error subiendo PDF a Blob:", blobErr);
      return NextResponse.json(
        {
          error: "Se creó la ejecución pero falló al subir el PDF al Blob. Revisa BLOB_READ_WRITE_TOKEN.",
          details: blobErr?.message || String(blobErr),
        },
        { status: 500 }
      );
    }

    // Guardar URL en la ejecución
    const execUpdated = (await prisma.pMExecution.update({
      where: { id: execution.id },
      data: { executionPdfUrl: url },
    })) as any;

    return NextResponse.json({ ok: true, url, executionId: execUpdated.id });
  } catch (err: any) {
    console.error("Error en /api/pm-finish:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
