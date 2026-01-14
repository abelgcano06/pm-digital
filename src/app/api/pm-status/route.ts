import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedStatus = "OPEN" | "COMPLETED" | "CLOSED";

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const uploadedFileId = String(body?.uploadedFileId || "").trim();
    const status = String(body?.status || "").trim().toUpperCase() as AllowedStatus;

    if (!uploadedFileId) {
      return NextResponse.json({ ok: false, error: "Falta uploadedFileId" }, { status: 400 });
    }

    const allowed: AllowedStatus[] = ["OPEN", "COMPLETED", "CLOSED"];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido", details: `Usa: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }

    const row = await prisma.pMUploadedFile.update({
      where: { id: uploadedFileId },
      data: { pmStatus: status } as any,
    });

    return NextResponse.json({ ok: true, pmStatus: row.pmStatus });
  } catch (err: any) {
    console.error("💥 Error en /api/pm-status:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar el status", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
