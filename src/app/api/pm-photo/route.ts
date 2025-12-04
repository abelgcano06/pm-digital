// src/app/api/pm-photo/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const executionItemId = formData.get("executionItemId") as string | null;

    if (!file || !executionItemId) {
      return NextResponse.json(
        { ok: false, error: "Falta archivo o executionItemId" },
        { status: 400 }
      );
    }

    // Opcional: validar tipo y tamaño
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Solo se permiten imágenes" },
        { status: 400 }
      );
    }

    // 1) Subir a Vercel Blob
    const blob = await put(`pm-photos/${executionItemId}-${Date.now()}.jpg`, file, {
      access: "public",
    });

    // 2) Guardar URL en la BD
    await prisma.pMExecutionItem.update({
      where: { id: executionItemId },
      data: {
        photoUrl: blob.url,
      },
    });

    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err) {
    console.error("Error en /api/pm-photo:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo subir la foto" },
      { status: 500 }
    );
  }
}
