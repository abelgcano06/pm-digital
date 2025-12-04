import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { prisma } from "../../../lib/prisma";
import { openai } from "../../../lib/openai";

// reutilizamos pdf-parse igual que en /api/pm-import
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse") as (data: Buffer) => Promise<any>;

// Función que importa UN solo PDF (misma lógica que /api/pm-import)
async function importOnePm(fileName: string) {
  // 1. ¿ya existe en BD?
  const existing = await prisma.pMTemplate.findFirst({
    where: { pdfFileName: fileName },
    include: { tasks: true },
  });

  if (existing && existing.tasks.length > 0) {
    return existing;
  }

  // 2. Leer PDF
  const filePath = path.join(process.cwd(), "public","pm-files", fileName);
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;

  // 3. Llamar a OpenAI para extraer estructura
  const prompt = `
Eres un asistente que extrae información estructurada de un PM de mantenimiento.

Del siguiente texto de un PDF de PM de Toyota, genera un JSON con:
{
  "pmNumber": string,
  "name": string,
  "assetCode": string | null,
  "location": string | null,
  "tasks": [
    {
      "taskIdNumber": number,
      "majorStep": string,
      "keyPoints": string,
      "reason": string
    }
  ]
}

Importante:
- "tasks" debe incluir cada fila de tareas (Task ID 10, 20, 30, ...).
- Usa números enteros para taskIdNumber.
- No inventes datos; si algo no está claro, deja null o vacío.

Texto del PDF:
"""${text}"""
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente que extrae información estructurada de un PDF de PM de mantenimiento. Responde SIEMPRE con un JSON válido.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content;

  if (!raw) {
    throw new Error("OpenAI respondió sin contenido");
  }

  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const jsonString =
      firstBrace !== -1 && lastBrace !== -1
        ? raw.slice(firstBrace, lastBrace + 1)
        : raw;
    parsed = JSON.parse(jsonString);
  }

  // 4. Guardar en BD
  const pmTemplate = await prisma.pMTemplate.create({
    data: {
      pmNumber: parsed.pmNumber || fileName.replace(".pdf", ""),
      name: parsed.name || fileName,
      assetCode: parsed.assetCode || null,
      location: parsed.location || null,
      pdfFileName: fileName,
      tasks: {
        create: parsed.tasks.map((t: any, index: number) => ({
          taskIdNumber: t.taskIdNumber ?? (index + 1) * 10,
          majorStep: t.majorStep ?? "",
          keyPoints: t.keyPoints ?? "",
          reason: t.reason ?? "",
          order: index,
        })),
      },
    },
    include: { tasks: true },
  });

  return pmTemplate;
}

// Endpoint que recorre TODOS los PDFs
export async function POST() {
  try {
    const pmFolderPath = path.join(process.cwd(), "public","pm-files");

    const files = fs
      .readdirSync(pmFolderPath)
      .filter((file) => file.toLowerCase().endsWith(".pdf"));

    if (files.length === 0) {
      return NextResponse.json({
        message: "No se encontraron archivos PDF en pm-files",
        imported: [],
        errors: [],
      });
    }

    const imported: any[] = [];
    const errors: any[] = [];

    for (const fileName of files) {
      try {
        console.log(`Importando: ${fileName}`);
        const tpl = await importOnePm(fileName);
        imported.push({
          fileName,
          id: tpl.id,
          pmNumber: tpl.pmNumber,
          name: tpl.name,
        });
      } catch (e) {
        console.error(`Error importando ${fileName}:`, e);
        errors.push({
          fileName,
          error: String(e),
        });
      }
    }

    return NextResponse.json({
      message: "Proceso completado",
      imported,
      errors,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Error procesando todos los PDFs", details: String(error) },
      { status: 500 }
    );
  }
}
