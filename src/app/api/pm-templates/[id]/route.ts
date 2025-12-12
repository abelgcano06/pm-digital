// src/app/api/pm-templates/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = {
  params: { id: string };
};

// GET /api/pm-templates/:id
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Falta id de PMTemplate" },
        { status: 400 }
      );
    }

    let template = await prisma.pMTemplate.findUnique({
      where: { id },
      include: {
        tasks: true,
        uploadedFile: true,
      },
    });

    // 🟡 Si NO lo encontró por PMTemplate.id,
    // intentamos interpretarlo como id de PMUploadedFile
    if (!template) {
      // 1) Buscar template por uploadedFileId = id
      const viaUploadedId = await prisma.pMTemplate.findFirst({
        where: { uploadedFileId: id },
        include: {
          tasks: true,
          uploadedFile: true,
        },
      });

      if (viaUploadedId) {
        template = viaUploadedId;
      } else {
        // 2) Buscar el PMUploadedFile y, si tiene template, usar ese
        const uploaded = await prisma.pMUploadedFile.findUnique({
          where: { id },
          include: {
            template: {
              include: { tasks: true, uploadedFile: true },
            },
          },
        });

        if (uploaded?.template) {
          template = uploaded.template as any;
        }
      }
    }

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
      tasks: template.tasks
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
  } catch (err: any) {
    console.error("💥 Error en /api/pm-templates/[id]:", err);
    return NextResponse.json(
      {
        error: "Error al obtener PMTemplate",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
