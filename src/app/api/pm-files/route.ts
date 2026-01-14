import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      where: { active: true },
      include: {
        template: {
          include: {
            executions: {
              orderBy: { finishedAt: "desc" },
              take: 1,
              select: { id: true, executionPdfUrl: true, finishedAt: true },
            },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => {
      const lastExec = f.template?.executions?.[0] ?? null;

      return {
        // ✅ el ID de selección es el uploadedFileId
        uploadedFileId: f.id,

        fileName: f.fileName,
        blobUrl: f.blobUrl,

        glOwner: f.glOwner,
        pmType: f.pmType,
        pmStatus: f.pmStatus,
        uploadedAt: f.uploadedAt,

        // Template info
        hasTemplate: !!f.template,
        templateId: f.template?.id ?? null,

        pmNumber: f.template?.pmNumber ?? null,
        pmName: f.template?.name ?? null,
        assetCode: f.template?.assetCode ?? null,
        location: f.template?.location ?? null,

        // ✅ NUEVO: PDF de ejecución (último)
        lastExecutionId: lastExec?.id ?? null,
        executionPdfUrl: lastExec?.executionPdfUrl ?? null,
        lastExecutionFinishedAt: lastExec?.finishedAt ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("💥 Error en /api/pm-files:", err);
    return NextResponse.json(
      { error: "No se pudo obtener la lista de PMs", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
