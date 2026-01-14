import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const glOwner = (searchParams.get("glOwner") || "").trim();

    const where: any = { active: true };
    if (glOwner && glOwner !== "all") {
      // Guardamos glOwner como texto (normalmente en minúsculas o como lo escribió Frida).
      // Para evitar problemas por mayúsculas, lo comparamos en lower.
      where.glOwner = glOwner;
    }

    const files = await prisma.pMUploadedFile.findMany({
      where,
      include: {
        template: {
          include: {
            executions: {
              orderBy: { finishedAt: "desc" },
              take: 1, // 👈 solo la última ejecución (para el PDF más reciente)
            },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => {
      const lastExec = f.template?.executions?.[0] ?? null;

      return {
        // ✅ ID de selección: el uploadedFileId (PMUploadedFile.id)
        uploadedFileId: f.id,

        fileName: f.fileName,
        blobUrl: f.blobUrl,

        glOwner: f.glOwner,
        pmType: f.pmType,
        pmStatus: f.pmStatus,
        uploadedAt: f.uploadedAt,

        // template
        hasTemplate: !!f.template,
        templateId: f.template?.id ?? null,
        pmNumber: f.template?.pmNumber ?? null,
        pmName: f.template?.name ?? null,
        assetCode: f.template?.assetCode ?? null,
        location: f.template?.location ?? null,

        // ✅ ÚLTIMA EJECUCIÓN (PDF CIERRE)
        lastExecutionId: lastExec?.id ?? null,
        lastExecutionPdfUrl: lastExec?.executionPdfUrl ?? null,
        lastFinishedAt: lastExec?.finishedAt ?? null,
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
