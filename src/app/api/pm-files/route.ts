// src/app/api/pm-files/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Devuelve la lista de PMs disponibles para el asociado.
 *
 * - Se basa en PMUploadedFile + (opcional) PMTemplate
 * - Solo muestra PMs activos (active = true)
 * - Los PMs aparecen aunque todavía no tengan template generado
 */
export async function GET() {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      where: {
        active: true,
        // si quieres que el asociado solo vea PMs abiertos, puedes agregar:
        // pmStatus: "OPEN",
      },
      include: {
        template: true, // puede venir null si aún no se ha importado
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    const items = files.map((f) => {
      const t = f.template;

      return {
        // ⚠️ IMPORTANTE:
        // usamos el ID del archivo subido como identificador en la app del asociado
        // (no dependemos de que ya exista template)
        id: f.id,

        // Info del archivo original
        uploadedFileId: f.id,
        fileName: f.fileName,
        blobUrl: f.blobUrl,

        // Info funcional del PM (si ya hay template)
        pmTemplateId: t?.id ?? null,
        pmNumber: t?.pmNumber ?? null,
        pmName: t?.name ?? null,
        assetCode: t?.assetCode ?? null,
        location: t?.location ?? null,

        // Datos que llenó Frida
        glOwner: f.glOwner,
        pmType: f.pmType,
        pmStatus: f.pmStatus, // "OPEN" | "COMPLETED" | "CLOSED"

        uploadedAt: f.uploadedAt,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("💥 Error en /api/pm-files:", err);
    return NextResponse.json(
      {
        error: "No se pudo obtener la lista de PMs",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
