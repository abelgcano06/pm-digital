import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { Buffer } from "buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ solo aceptamos JPG/PNG para asegurar compatibilidad con pdf-lib
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No se recibió ningún archivo" },
        { status: 400 }
      );
    }

    console.log("📸 Foto recibida:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (!ALLOWED_TYPES.includes((file.type || "").toLowerCase())) {
      return NextResponse.json(
        {
          ok: false,
          error: "Formato de imagen no soportado",
          details: "Sube JPG o PNG (si viene de iPhone en HEIC, el front debe convertir a JPG).",
          receivedType: file.type,
        },
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
      contentType: file.type,
    });

    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err: any) {
    console.error("💥 Error en /api/pm-photo:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo subir la foto", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
