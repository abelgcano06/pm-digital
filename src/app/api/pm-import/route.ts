// src/app/api/pm-import/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

type ParsedTask = {
  taskIdNumber: number;
  majorStep: string;
  keyPoints: string;
  reason: string;
  hasImage?: boolean;
};

type OpenAIParsed = {
  pmNumber: string;
  name: string;
  assetCode?: string | null;
  location?: string | null;
  tasks: ParsedTask[];
};

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

    // 1) Buscar el PMUploadedFile (por ID es lo más seguro)
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
    if (!effectiveBlobUrl) {
      throw new Error("No hay blobUrl para descargar el PDF");
    }

    const res = await fetch(effectiveBlobUrl);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `No se pudo descargar el PDF desde Blob. status=${res.status} body=${txt.slice(
          0,
          200
        )}`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    // 4) OpenAI parse
    const systemPrompt = `
Eres un experto en interpretar PMs (mantenimiento preventivo) de Toyota.

A partir del TEXTO PLANO extraído de un PDF de PM, debes devolver un JSON con:
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

REGLAS IMPORTANTES:
- "taskIdNumber" debe ser el número de tarea real (ej. 110, 120, 152...).
- "majorStep" es el título principal de la tarea (columna de major step).
- "keyPoints" son los puntos clave (columna key points).
- "reason" es la razón de la tarea (columna reason).
- "hasImage": true SOLO si había imagen/diagrama en esa fila.
- Solo devuelve el JSON, sin texto adicional.
`.trim();

    const userPrompt = `
Texto plano extraído del PM:

---------------
${rawText}
---------------
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Respuesta vacía de OpenAI");

    let parsed: OpenAIParsed;
    try {
      parsed = JSON.parse(content) as OpenAIParsed;
    } catch {
      throw new Error("OpenAI devolvió JSON inválido");
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("OpenAI no devolvió tasks válidos");
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

    if (tasksClean.length === 0) {
      throw new Error("No se pudieron extraer tareas del PM");
    }

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
      {
        error: "Error al importar el PM",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
