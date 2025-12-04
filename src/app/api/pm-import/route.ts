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

    const { fileName, blobUrl } = body as {
      fileName: string;
      blobUrl?: string;
    };

    if (!fileName) {
      console.error("Falta fileName en /api/pm-import");
      return NextResponse.json(
        { error: "fileName requerido" },
        { status: 400 }
      );
    }

    // 1) Buscar el PMUploadedFile correspondiente
    const uploadedFile = await prisma.pMUploadedFile.findFirst({
      where: { fileName },
      include: { template: { include: { tasks: true } } },
    });

    if (!uploadedFile) {
      console.error(
        "No se encontró PMUploadedFile para fileName:",
        fileName
      );
      return NextResponse.json(
        { error: "No se encontró el PDF en PMUploadedFile" },
        { status: 404 }
      );
    }

    // 2) Si ya existe plantilla con tareas, devolverla
    if (uploadedFile.template && uploadedFile.template.tasks.length > 0) {
      const existing = uploadedFile.template;
      const responseBody = {
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
      };

      return NextResponse.json(responseBody);
    }

    // 3) Descargar PDF (desde blobUrl o desde PMUploadedFile.blobUrl)
    let arrayBuffer: ArrayBuffer;

    const effectiveBlobUrl = blobUrl ?? uploadedFile.blobUrl;

    if (effectiveBlobUrl) {
      const res = await fetch(effectiveBlobUrl);
      if (!res.ok) {
        console.error(
          "Fallo al descargar PDF desde Blob:",
          effectiveBlobUrl,
          res.status,
          await res.text().catch(() => "")
        );
        throw new Error("No se pudo descargar el PDF desde Blob");
      }
      arrayBuffer = await res.arrayBuffer();
    } else {
      // Fallback de desarrollo: leer de carpeta local pm-files
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "pm-files", fileName);
      const buffer = fs.readFileSync(filePath);
      arrayBuffer = buffer.buffer;
    }

    const buffer = Buffer.from(arrayBuffer);
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    // 4) Llamar a OpenAI para parsear el PM
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
- "hasImage":
   - Debe ser true SÓLO si ese renglón/tarea corresponde a un punto que tenía una ilustración/foto/dibujo en la última columna del PM original.
   - Si no estás seguro, déjalo en false.
   - No marques todas las tareas como true; sé conservador.

- NO inventes tareas ni mezcles tasks de diferentes PMs.
- Solo devuelve el JSON, sin ningún texto adicional.
`.trim();

    const userPrompt = `
Texto plano extraído del PM (incluye encabezados, tablas, y tareas):

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
    if (!content) {
      console.error("OpenAI devolvió contenido vacío en /api/pm-import");
      throw new Error("Respuesta vacía de OpenAI");
    }

    let parsed: OpenAIParsed;
    try {
      parsed = JSON.parse(content) as OpenAIParsed;
    } catch (err) {
      console.error("Error al parsear JSON de OpenAI:", err, content);
      throw new Error("No se pudo interpretar la respuesta de OpenAI");
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("OpenAI no devolvió tasks válidos");
    }

    // Limpiar tasks: asegurar números y contenido mínimo
    const tasksClean = parsed.tasks
      .filter((t) => typeof t.taskIdNumber === "number")
      .map((t, index) => ({
        taskIdNumber: t.taskIdNumber,
        majorStep: (t.majorStep || "").trim(),
        keyPoints: (t.keyPoints || "").trim(),
        reason: (t.reason || "").trim(),
        order: index + 1,
        hasImage: t.hasImage === true, // default false si viene undefined
      }));

    if (tasksClean.length === 0) {
      throw new Error("No se pudieron extraer tareas del PM");
    }

    // 5) Crear PMTemplate + PMTaskTemplate[] en la BD
    const pmTemplate = await prisma.pMTemplate.create({
      data: {
        pmNumber: parsed.pmNumber || fileName,
        name: parsed.name || fileName,
        assetCode: parsed.assetCode ?? null,
        location: parsed.location ?? null,
        pdfFileName: fileName,
        uploadedFileId: uploadedFile.id,
        tasks: {
          create: tasksClean.map((t) => ({
            taskIdNumber: t.taskIdNumber,
            majorStep: t.majorStep,
            keyPoints: t.keyPoints,
            reason: t.reason,
            order: t.order,
             hasImage: (t as any).hasImage ?? false,

          })),
        },
      },
      include: {
        tasks: true,
        uploadedFile: true,
      },
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
  } catch (err) {
    console.error("Error en /api/pm-import:", err);
    return NextResponse.json(
      { error: "Error al importar el PM" },
      { status: 500 }
    );
  }
}
