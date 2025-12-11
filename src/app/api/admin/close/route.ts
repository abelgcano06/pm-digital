// src/app/api/admin/close/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body || {};

    if (!id) {
      return NextResponse.json(
        { error: "Falta el id del PM a cerrar" },
        { status: 400 }
      );
    }

    // Opcional: podríamos validar que tenga al menos una ejecución
    // pero por simplicidad solo cambiamos el estado a CLOSED.
    const updated = await prisma.pMUploadedFile.update({
      where: { id },
      data: {
        pmStatus: "CLOSED",
      } as any, // 👈 cast para no pelear con TypeScript
    });

    return NextResponse.json({
      ok: true,
      pmStatus: (updated as any).pmStatus ?? "CLOSED",
    });
  } catch (err) {
    console.error("Error en /api/admin/close:", err);
    return NextResponse.json(
      { error: "No se pudo cerrar el PM" },
      { status: 500 }
    );
  }
}
