// Migración: extrae pdfPage para templates ya importados
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropic, extractJson } from "@/lib/anthropic";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
Eres un experto en interpretar PMs de Toyota.

A partir del TEXTO PLANO extraído de un PDF de PM, devuelve ÚNICAMENTE un JSON válido con el número de página de cada tarea:
{
  "tasks": [
    { "taskIdNumber": number, "pdfPage": number }
  ]
}

El texto incluye marcas de página como "3:07 PM 2 / 7" (significa página 2 de 7).
Usa esas marcas para determinar en qué página aparece cada tarea identificada por su taskIdNumber.
Si no puedes determinar la página con certeza, usa 1.
Responde SÓLO con el JSON, sin texto ni markdown adicional.
`.trim();

export async function POST(req: Request) {
  try {
    const { templateId } = await req.json() as { templateId?: string };

    const where = templateId ? { id: templateId } : {};

    const templates = await prisma.pMTemplate.findMany({
      where,
      include: {
        tasks: true,
        uploadedFile: true,
      },
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
          max_tokens: 2048,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{
            role: "user",
            content: `Texto plano del PM:\n\n---------------\n${pdfData.text}\n---------------`,
          }],
        });

        const block = message.content[0];
        if (block.type !== "text") throw new Error("Respuesta inesperada de Claude");

        const parsed = JSON.parse(extractJson(block.text)) as { tasks: { taskIdNumber: number; pdfPage: number }[] };

        let updated = 0;
        for (const item of parsed.tasks) {
          const task = template.tasks.find((t) => t.taskIdNumber === item.taskIdNumber);
          if (!task || !item.pdfPage) continue;
          await prisma.pMTaskTemplate.update({
            where: { id: task.id },
            data: { pdfPage: item.pdfPage },
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
