// src/app/api/pm-files/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    // PMs "abiertos" para el asociado:
    // - active = true
    // - SIN ejecuciones:
    //    * o no tienen plantilla aún (template = null)
    //    * o tienen plantilla pero ninguna ejecución
    const rows = await prisma.pMUploadedFile.findMany({
      where: {
        active: true,
        OR: [
          { template: { is: null } },
          { template: { executions: { none: {} } } },
        ],
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    // Usamos `any` para no pelear con TS por glOwner / pmType
    const items = (rows as any[]).map((r: any) => ({
      id: r.id,
      fileName: r.fileName,
      blobUrl: r.blobUrl,
      glOwner: r.glOwner ?? null,
      pmType: r.pmType ?? null,
    }));

    // La app del asociado espera un ARRAY directo
    return NextResponse.json(items);
  } catch (err) {
    console.error("Error en /api/pm-files:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudieron listar los PMs" },
      { status: 500 }
    );
  }
}
