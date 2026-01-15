import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista de PMs para ASOCIADOS
 * - Solo muestra OPEN (no completados ni cerrados)
 * - Incluye glOwner y pmType para que lo puedas mostrar en UI
 * - El ID de selección que usas debe ser uploadedFileId
 */
export async function GET() {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      where: { active: true, pmStatus: "OPEN" },
      include: { template: true },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => ({
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
    }));

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("💥 Error en /api/pm-files:", err);
    return NextResponse.json(
      { error: "No se pudo obtener la lista de PMs", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
