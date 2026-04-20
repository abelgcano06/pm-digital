// Migración: extrae pdfPage + corrige reason/hasImage para templates ya importados
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropic, extractJson } from "@/lib/anthropic";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
Eres un experto en interpretar PMs de Toyota.

El PDF tiene una tabla con estas columnas exactas:
  "Task ID" | "Major Steps" | "Key Points" | "Reason / Conditions" | "Measurement Point" | "Value"

A partir del TEXTO PLANO extraido del PDF, devuelve UNICAMENTE un JSON valido:
{
  "tasks": [
    {
      "taskIdNumber": number,
      "reason": "string",
      "hasImage": boolean,
      "pdfPage": number
    }
  ]
}

MAPEO:
- "taskIdNumber" <- columna "Task ID"
- "reason"       <- columna "Reason / Conditions". SIEMPRE extrae este texto; nunca vacio.
- "hasImage"     <- true si esa fila tenia fotografia o ilustracion de referencia.
- "pdfPage"      <- numero de pagina donde aparece la tarea. Marcas en el texto: "3:07 PM 2 / 7" = pagina 2. Si no puedes determinarlo usa 1.

Responde SOLO con el JSON, sin texto ni markdown adicional.
`.trim();

export async function POST(req: Request) {
  try {
    const { templateId, uploadedFileId } = await req.json() as { templateId?: string; uploadedFileId?: string };

    const where = templateId
      ? { id: templateId }
      : uploadedFileId
      ? { uploadedFileId }
      : {};

    const templates = await prisma.pMTemplate.findMany({
      where,
      include: { tasks: true, uploadedFile: true },
    });

    if (templates.length === 0) {
      return NextResponse.json({ error: "No se encontraron templates" }, { status: 404 });
    }

    const results: { templateId: string; updated: number; error?: string }[] = [];

    for (const template of templates) {
      try {
        const blobUrl = template.uploadedFile?.blobUrl;
        if (!blobUrl) {
          results.push({ templateId: template.id, updated: 0, error: "Sin blobUrl" });
          continue;
        }

        const res = await fetch(blobUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const pdfData = await pdfParse(buffer);

        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{
            role: "user",
            content: `Texto plano del PM:\n\n---------------\n${pdfData.text}\n---------------`,
          }],
        });

        const block = message.content[0];
        if (block.type !== "text") throw new Error("Respuesta inesperada de Claude");

        type ReparseTask = { taskIdNumber: number; reason?: string; hasImage?: boolean; pdfPage?: number };
        const parsed = JSON.parse(extractJson(block.text)) as { tasks: ReparseTask[] };

        let updated = 0;
        for (const item of parsed.tasks) {
          const task = template.tasks.find((t) => t.taskIdNumber === item.taskIdNumber);
          if (!task) continue;

          await prisma.pMTaskTemplate.update({
            where: { id: task.id },
            data: {
              ...(item.reason ? { reason: item.reason } : {}),
              ...(typeof item.hasImage === "boolean" ? { hasImage: item.hasImage } : {}),
              ...(item.pdfPage && item.pdfPage > 0 ? { pdfPage: item.pdfPage } : {}),
            },
          });
          updated++;
        }

        results.push({ templateId: template.id, updated });
      } catch (err: any) {
        results.push({ templateId: template.id, updated: 0, error: err?.message });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
