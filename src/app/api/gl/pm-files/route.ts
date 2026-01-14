import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gl/pm-files?gl=nombre_gl
 * Regresa PMs filtrados por GL (si viene ?gl=...).
 * Incluye:
 * - PM original (PMUploadedFile.blobUrl)
 * - Template (si existe)
 * - Último execution (si existe) para sacar executionPdfUrl
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gl = (searchParams.get("gl") || "").trim().toLowerCase();

    const files = await prisma.pMUploadedFile.findMany({
      where: {
        active: true,
        ...(gl ? { glOwner: { equals: gl, mode: "insensitive" } } : {}),
      },
      include: {
        template: {
          include: {
            executions: {
              orderBy: { createdAt: "desc" },
              take: 1, // 👈 sólo el más reciente
            },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => {
      const lastExec = f.template?.executions?.[0] ?? null;

      return {
        uploadedFileId: f.id,
        fileName: f.fileName,
        blobUrl: f.blobUrl,

        glOwner: f.glOwner ?? "",
        pmType: f.pmType ?? "",
        pmStatus: f.pmStatus,

        uploadedAt: f.uploadedAt,

        hasTemplate: !!f.template,
        templateId: f.template?.id ?? null,

        pmNumber: f.template?.pmNumber ?? null,
        pmName: f.template?.name ?? null,
        assetCode: f.template?.assetCode ?? null,
        location: f.template?.location ?? null,

        // ✅ último PDF de cierre
        lastExecutionId: lastExec?.id ?? null,
        executionPdfUrl: lastExec?.executionPdfUrl ?? null,
        lastExecutedAt: lastExec?.finishedAt ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("💥 Error en /api/gl/pm-files:", err);
    return NextResponse.json(
      { error: "No se pudo obtener la lista de PMs (GL)", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
