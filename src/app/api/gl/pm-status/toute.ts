import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/gl/pm-status
 * body: { uploadedFileId: string, status: "CLOSED" | "OPEN" }
 *
 * Reglas:
 * - Lo normal: COMPLETED -> CLOSED (cuando GL revisa y cierra)
 * - Si quieres permitir "reabrir": CLOSED -> OPEN
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      uploadedFileId?: string;
      status?: "CLOSED" | "OPEN";
    };

    const uploadedFileId = body.uploadedFileId?.trim();
    const status = body.status;

    if (!uploadedFileId) {
      return NextResponse.json({ error: "Falta uploadedFileId" }, { status: 400 });
    }
    if (!status || !["CLOSED", "OPEN"].includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const file = await prisma.pMUploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { id: true, pmStatus: true },
    });

    if (!file) {
      return NextResponse.json({ error: "PM no encontrado" }, { status: 404 });
    }

    // Reglas de transición
    if (status === "CLOSED") {
      if (file.pmStatus !== "COMPLETED") {
        return NextResponse.json(
          { error: "Solo puedes cerrar PMs que estén COMPLETED" },
          { status: 400 }
        );
      }
    }

    // OPEN solo si quieres reabrir (opcional)
    if (status === "OPEN") {
      if (file.pmStatus !== "CLOSED") {
        return NextResponse.json(
          { error: "Solo puedes reabrir PMs que estén CLOSED" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.pMUploadedFile.update({
      where: { id: uploadedFileId },
      data: { pmStatus: status } as any,
    });

    return NextResponse.json({ ok: true, pmStatus: updated.pmStatus });
  } catch (err: any) {
    console.error("💥 Error /api/gl/pm-status:", err);
    return NextResponse.json(
      { error: "No se pudo actualizar el status", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
