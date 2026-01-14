import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  uploadedFileId?: string;
  status?: "CLOSED" | "OPEN";
};

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const uploadedFileId = (body.uploadedFileId || "").trim();
    const status = body.status;

    if (!uploadedFileId) {
      return NextResponse.json({ ok: false, error: "Falta uploadedFileId" }, { status: 400 });
    }
    if (!status || !["CLOSED", "OPEN"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido" }, { status: 400 });
    }

    const file = await prisma.pMUploadedFile.findUnique({
      where: { id: uploadedFileId },
      select: { id: true, pmStatus: true },
    });

    if (!file) {
      return NextResponse.json({ ok: false, error: "PM no encontrado" }, { status: 404 });
    }

    // Reglas
    // - Cerrar (CLOSED): solo si está COMPLETED
    // - Reabrir (OPEN): solo si está CLOSED
    if (status === "CLOSED" && file.pmStatus !== "COMPLETED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Solo puedes cerrar PMs que estén COMPLETED",
          currentStatus: file.pmStatus,
        },
        { status: 400 }
      );
    }

    if (status === "OPEN" && file.pmStatus !== "CLOSED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Solo puedes reabrir PMs que estén CLOSED",
          currentStatus: file.pmStatus,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.pMUploadedFile.update({
      where: { id: uploadedFileId },
      data: { pmStatus: status } as any,
      select: { id: true, pmStatus: true },
    });

    return NextResponse.json({ ok: true, uploadedFileId: updated.id, pmStatus: updated.pmStatus });
  } catch (err: any) {
    console.error("💥 Error /api/gl/pm-status:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "No se puede actualizar el status",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
