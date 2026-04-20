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

A partir del TEXTO PLANO extraído de un PDF de PM, devuelve ÚNICAMENTE un JSON válido:
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
      "hasImage": boolean
    }
  ]
}

REGLAS:
- "taskIdNumber" es el número real de tarea (ej. 110, 120, 152...).
- "hasImage": true SÓLO si había ilustración/foto en esa fila; si no estás seguro, false.
- NO inventes tareas. Responde SÓLO con el JSON, sin texto ni markdown adicional.
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
