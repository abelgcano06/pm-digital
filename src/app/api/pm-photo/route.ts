// src/app/api/pm-photo/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { Buffer } from "buffer";

export const runtime = "nodejs";
// (Opcional) evita cache raro en routes
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // El front debe mandar el archivo como "file"
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No se recibió ningún archivo" },
        { status: 400 }
      );
    }

    // Validación básica
    if (!file.type?.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "El archivo debe ser una imagen" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const timestamp = Date.now();
    const safeName = (file.name || "foto_pm.jpg").replace(/[^\w.-]+/g, "_");

    const blobName = `pm-photos/${timestamp}-${safeName}`;

    const blob = await put(blobName, buffer, {
      access: "public",
      contentType: file.type || "image/jpeg",
    });

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
