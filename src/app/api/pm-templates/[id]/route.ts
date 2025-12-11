// src/app/api/pm-templates/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = {
  params: { id: string };
};

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { error: "Falta id de PMTemplate en la URL" },
      { status: 400 }
    );
  }

  try {
    console.log("🔎 /api/pm-templates/[id] buscando id:", id);

    // 1) INTENTO 1: asumir que el id es directamente el de PMTemplate
    let template = await prisma.pMTemplate.findUnique({
      where: { id },
      include: {
        tasks: true,
        uploadedFile: true,
      },
    });

    // 2) INTENTO 2: si no lo encontró, asumir que el id es de PMUploadedFile
    if (!template) {
      console.warn(
        "⚠️ No se encontró PMTemplate por id directo, probando como uploadedFileId..."
      );

      template = await prisma.pMTemplate.findFirst({
        where: { uploadedFileId: id },
        include: {
          tasks: true,
          uploadedFile: true,
        },
      });
    }

    // 3) Si aún así no hay nada, regresamos error más descriptivo
    if (!template) {
      console.error(
        `❌ PMTemplate no encontrado ni por id ni por uploadedFileId. id = ${id}`
      );
      return NextResponse.json(
        {
          error: "PMTemplate no encontrado",
          details:
            "No existe plantilla ligada a este id. Revisa que el PM haya sido importado correctamente.",
        },
        { status: 404 }
      );
    }

    const tasks = template.tasks
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        taskIdNumber: t.taskIdNumber,
        majorStep: t.majorStep,
        keyPoints: t.keyPoints,
        reason: t.reason,
        order: t.order,
        hasImage: (t as any).hasImage ?? false,
      }));

    const responseBody = {
      id: template.id,
      pmNumber: template.pmNumber,
      name: template.name,
      assetCode: template.assetCode ?? null,
      location: template.location ?? null,
      pdfFileName: template.pdfFileName,
      basePdfUrl: template.uploadedFile?.blobUrl ?? null,
      tasks,
    };

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error("💥 Error en /api/pm-templates/[id]:", err);
    return NextResponse.json(
      { error: "No se pudo cargar el PMTemplate" },
      { status: 500 }
    );
  }
}
