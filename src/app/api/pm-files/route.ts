// src/app/api/pm-files/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope"); // "associate" o null

    const where: any = { active: true };

    // ✅ Para asociados: solo OPEN
    if (scope === "associate") {
      where.pmStatus = "OPEN";
    }

    const files = await prisma.pMUploadedFile.findMany({
      where,
      include: { template: true },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => ({
      uploadedFileId: f.id,
      fileName: f.fileName,
      blobUrl: f.blobUrl,

      glOwner: f.glOwner,
      pmType: f.pmType,
      pmStatus: f.pmStatus,
      uploadedAt: f.uploadedAt,

      hasTemplate: !!f.template,
      templateId: f.template?.id ?? null,

      pmNumber: f.template?.pmNumber ?? null,
      pmName: f.template?.name ?? null,
      assetCode: f.template?.assetCode ?? null,
      location: f.template?.location ?? null,

      // ✅ Para UI del asociado
      pmTemplateId: f.template?.id ?? null,
      id: f.id, // para que tu UI siga usando pm.id
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
