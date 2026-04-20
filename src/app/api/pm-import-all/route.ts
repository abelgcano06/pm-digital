import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { prisma } from "../../../lib/prisma";
import { anthropic, extractJson } from "../../../lib/anthropic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse") as (data: Buffer) => Promise<any>;

const SYSTEM_PROMPT = `
Eres un asistente que extrae información estructurada de un PM de mantenimiento de Toyota.

Devuelve ÚNICAMENTE un JSON válido:
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

Reglas: incluye cada fila de tareas, usa enteros para taskIdNumber, no inventes datos. Responde SÓLO con el JSON.
`.trim();

async function importOnePm(fileName: string) {
  const existing = await prisma.pMTemplate.findFirst({
    where: { pdfFileName: fileName },
    include: { tasks: true },
  });

  if (existing && existing.tasks.length > 0) return existing;

  const filePath = path.join(process.cwd(), "public", "pm-files", fileName);
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);

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
        content: `Texto del PDF:\n"""\n${pdfData.text}\n"""`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Respuesta inesperada de Claude");

  const parsed = JSON.parse(extractJson(block.text));

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

export async function POST() {
  try {
    const pmFolderPath = path.join(process.cwd(), "public", "pm-files");
    const files = fs
      .readdirSync(pmFolderPath)
      .filter((f) => f.toLowerCase().endsWith(".pdf"));

    if (files.length === 0) {
      return NextResponse.json({ message: "No hay PDFs en pm-files", imported: [], errors: [] });
    }

    const imported: any[] = [];
    const errors: any[] = [];

    for (const fileName of files) {
      try {
        const tpl = await importOnePm(fileName);
        imported.push({ fileName, id: tpl.id, pmNumber: tpl.pmNumber, name: tpl.name });
      } catch (e) {
        errors.push({ fileName, error: String(e) });
      }
    }

    return NextResponse.json({ message: "Proceso completado", imported, errors });
  } catch (error) {
    return NextResponse.json(
      { error: "Error procesando PDFs", details: String(error) },
      { status: 500 }
    );
  }
}
