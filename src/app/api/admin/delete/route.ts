// src/app/api/admin/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Intentamos leer el body como JSON
    let body: any = null;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "Body inválido o vacío" },
        { status: 400 }
      );
    }

    const id = body?.id as string | undefined;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Falta id en el body" },
        { status: 400 }
      );
    }

    // Verificamos que el PM exista antes de actualizarlo
    const existing = await prisma.pMUploadedFile.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró el PM a eliminar (id inválido o ya no existe)",
        },
        { status: 404 }
      );
    }

    // Soft delete: active = false
    await prisma.pMUploadedFile.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error en /api/admin/delete:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message || "No se pudo eliminar el PM por un error interno",
      },
      { status: 500 }
    );
  }
}
