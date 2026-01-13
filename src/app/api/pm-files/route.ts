// src/app/api/pm-files/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      where: { active: true },
      include: { template: true },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => ({
      // ✅ Lo que el front usa para seleccionar
      id: f.id,

      // ✅ Si quieres mantener ambos, que sean iguales
      uploadedFileId: f.id,

      fileName: f.fileName,
      blobUrl: f.blobUrl,

      glOwner: f.glOwner ?? "",
      pmType: f.pmType ?? "",
      pmStatus: f.pmStatus,
      uploadedAt: f.uploadedAt,

      // ✅ el front espera pmTemplateId (no templateId)
      pmTemplateId: f.template?.id ?? null,

      // info opcional del template
      pmNumber: f.template?.pmNumber ?? null,
      pmName: f.template?.name ?? null,
      assetCode: f.template?.assetCode ?? null,
      location: f.template?.location ?? null,
    }));

    const res = NextResponse.json({ items });
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (err: any) {
    console.error("💥 Error en /api/pm-files:", err);
    return NextResponse.json(
      { error: "No se pudo obtener la lista de PMs", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
