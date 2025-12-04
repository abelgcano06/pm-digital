// src/app/api/pm-photo/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { Buffer } from "buffer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // El front debe mandar el archivo de la cámara como "file"
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No se recibió ningún archivo" },
        { status: 400 }
      );
    }

    // Convertimos el File a Buffer para subirlo al blob
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^\w.-]+/g, "_") || "foto_pm.jpg";

    const blobName = `pm-photos/${timestamp}-${safeName}`;

    const blob = await put(blobName, buffer, {
      access: "public",
      contentType: file.type || "image/jpeg",
    });

    // Por ahora solo devolvemos la URL. Más adelante podemos guardar en Prisma.
    return NextResponse.json({
      ok: true,
      url: blob.url,
    });
  } catch (err) {
    console.error("Error en /api/pm-photo:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo subir la foto" },
      { status: 500 }
    );
  }
}
