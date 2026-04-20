// src/app/api/pm-import/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropic, extractJson } from "@/lib/anthropic";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

type ParsedTask = {
  taskIdNumber: number;
  majorStep: string;
  keyPoints: string;
  reason: string;
  hasImage?: boolean;
  pdfPage?: number;
};

type ParsedPM = {
  pmNumber: string;
  name: string;
  assetCode?: string | null;
  location?: string | null;
  tasks: ParsedTask[];
};

const SYSTEM_PROMPT = `
Eres un experto en interpretar PMs (mantenimiento preventivo) de Toyota.

El PDF tiene una tabla con estas columnas exactas:
  "Task ID" | "Major Steps" | "Key Points" | "Reason / Conditions" | "Measurement Point" | "Value"

A partir del TEXTO PLANO extraído del PDF, devuelve UNICAMENTE un JSON valido:
{
  "pmNumber": "string",
  "name": "string",
  "assetCode": "string | null",
  "location": "string | null",
  "tasks": [
    {
      "taskIdNumber": number,
      "majorStep": "string",
      "keyPoints": "string",
      "reason": "string",
      "hasImage": boolean,
      "pdfPage": number
    }
  ]
}

MAPEO DE COLUMNAS:
- "taskIdNumber" <- columna "Task ID" (numero entero, ej. 10, 20, 30...)
- "majorStep"    <- columna "Major Steps" (que hacer)
- "keyPoints"    <- columna "Key Points" (como hacerlo, pasos detallados)
- "reason"       <- columna "Reason / Conditions" (por que hacerlo / condicion esperada). SIEMPRE extrae este campo; nunca lo dejes vacio si aparece texto en esa columna.
- "hasImage"     <- true si esa fila tenia una fotografia o ilustracion de referencia; false si no.
- "pdfPage"      <- numero de pagina del PDF donde aparece la tarea. El texto tiene marcas como "3:07 PM 2 / 7" (= pagina 2). Si no puedes determinarlo usa 1.

NO inventes tareas. Responde SOLO con el JSON, sin texto ni markdown adicional.
`.trim();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Cuerpo recibido en /api/pm-import:", body);

    const { uploadedFileId, fileName, blobUrl } = body as {
      uploadedFileId?: string;
      fileName?: string;
      blobUrl?: string;
    };

    if (!uploadedFileId && !fileName) {
      return NextResponse.json(
        { error: "uploadedFileId o fileName requerido" },
        { status: 400 }
      );
    }

    // 1) Buscar PMUploadedFile
    const uploadedFile = uploadedFileId
      ? await prisma.pMUploadedFile.findUnique({
          where: { id: uploadedFileId },
          include: { template: { include: { tasks: true } } },
        })
      : await prisma.pMUploadedFile.findFirst({
          where: { fileName: fileName! },
          include: { template: { include: { tasks: true } } },
        });

    if (!uploadedFile) {
      return NextResponse.json(
        {
          error: "No se encontró el PDF en PMUploadedFile",
          details: uploadedFileId
            ? `No existe PMUploadedFile con id=${uploadedFileId}`
            : `No existe PMUploadedFile con fileName=${fileName}`,
        },
        { status: 404 }
      );
    }

    // 2) Si ya existe plantilla con tareas, devolverla
    if (uploadedFile.template && uploadedFile.template.tasks.length > 0) {
      const existing = uploadedFile.template;
      return NextResponse.json({
        id: existing.id,
        pmNumber: existing.pmNumber,
        name: existing.name,
        assetCode: existing.assetCode ?? null,
        location: existing.location ?? null,
        pdfFileName: existing.pdfFileName,
        basePdfUrl: uploadedFile.blobUrl,
        tasks: existing.tasks
          .sort((a, b) => a.order - b.order)
          .map((t) => ({
            id: t.id,
            taskIdNumber: t.taskIdNumber,
            majorStep: t.majorStep,
            keyPoints: t.keyPoints,
            reason: t.reason,
            order: t.order,
            hasImage: (t as any).hasImage ?? false,
            pdfPage: (t as any).pdfPage ?? null,
          })),
      });
    }

    // 3) Descargar PDF
    const effectiveBlobUrl = blobUrl ?? uploadedFile.blobUrl;
    if (!effectiveBlobUrl) throw new Error("No hay blobUrl para descargar el PDF");

    const res = await fetch(effectiveBlobUrl);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `No se pudo descargar el PDF desde Blob. status=${res.status} body=${txt.slice(0, 200)}`
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    // 4) Claude con prompt caching
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Texto plano del PM:\n\n---------------\n${rawText}\n---------------`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") throw new Error("Respuesta inesperada de Claude");

    let parsed: ParsedPM;
    try {
      parsed = JSON.parse(extractJson(block.text)) as ParsedPM;
    } catch {
      throw new Error("Claude devolvió JSON inválido");
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("Claude no devolvió tasks válidos");
    }

    const tasksClean = parsed.tasks
      .filter((t) => typeof t.taskIdNumber === "number")
      .map((t, index) => ({
        taskIdNumber: t.taskIdNumber,
        majorStep: (t.majorStep || "").trim(),
        keyPoints: (t.keyPoints || "").trim(),
        reason: (t.reason || "").trim(),
        order: index + 1,
        hasImage: t.hasImage === true,
        pdfPage: typeof t.pdfPage === "number" && t.pdfPage > 0 ? t.pdfPage : null,
      }));

    if (tasksClean.length === 0) throw new Error("No se pudieron extraer tareas del PM");

    // 5) Crear PMTemplate
    const pmTemplate = await prisma.pMTemplate.create({
      data: {
        pmNumber: parsed.pmNumber || uploadedFile.fileName,
        name: parsed.name || uploadedFile.fileName,
        assetCode: parsed.assetCode ?? null,
        location: parsed.location ?? null,
        pdfFileName: uploadedFile.fileName,
        uploadedFileId: uploadedFile.id,
        tasks: {
          create: tasksClean.map((t) => ({
            taskIdNumber: t.taskIdNumber,
            majorStep: t.majorStep,
            keyPoints: t.keyPoints,
            reason: t.reason,
            order: t.order,
            hasImage: t.hasImage,
            pdfPage: t.pdfPage,
          })),
        },
      },
      include: { tasks: true, uploadedFile: true },
    });

    return NextResponse.json({
      id: pmTemplate.id,
      pmNumber: pmTemplate.pmNumber,
      name: pmTemplate.name,
      assetCode: pmTemplate.assetCode ?? null,
      location: pmTemplate.location ?? null,
      pdfFileName: pmTemplate.pdfFileName,
      basePdfUrl: pmTemplate.uploadedFile?.blobUrl ?? null,
      tasks: pmTemplate.tasks
        .sort((a, b) => a.order - b.order)
        .map((t) => ({
          id: t.id,
          taskIdNumber: t.taskIdNumber,
          majorStep: t.majorStep,
          keyPoints: t.keyPoints,
          reason: t.reason,
          order: t.order,
          hasImage: (t as any).hasImage ?? false,
          pdfPage: (t as any).pdfPage ?? null,
        })),
    });
  } catch (err: any) {
    console.error("Error en /api/pm-import:", err);
    return NextResponse.json(
      { error: "Error al importar el PM", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
