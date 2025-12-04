// src/app/api/pm-templates/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/pm-templates/:id
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const template = await prisma.pMTemplate.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { order: "asc" },
        },
        uploadedFile: true,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "PMTemplate no encontrado" },
        { status: 404 }
      );
    }

    const responseBody = {
      id: template.id,
      pmNumber: template.pmNumber,
      name: template.name,
      assetCode: template.assetCode,
      location: template.location,
      pdfFileName: template.pdfFileName,
      basePdfUrl: template.uploadedFile?.blobUrl ?? null,
      tasks: template.tasks.map((t) => ({
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
  } catch (err) {
    console.error("Error en /api/pm-templates/[id]:", err);
    return NextResponse.json(
      { error: "Error al obtener el PMTemplate" },
      { status: 500 }
    );
  }
}
