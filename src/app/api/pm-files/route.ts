// src/app/api/pm-files/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      where: { active: true },
      include: { template: true },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => ({
      id: f.id,
      // ✅ el ID de selección SIEMPRE es el uploadedFileId
      uploadedFileId: f.id,

      fileName: f.fileName,
      blobUrl: f.blobUrl,

      glOwner: f.glOwner,
      pmType: f.pmType,
      pmStatus: f.pmStatus,
      uploadedAt: f.uploadedAt,

      // ✅ info opcional
      hasTemplate: !!f.template,
      templateId: f.template?.id ?? null,

      // si existen en template:
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
