// src/app/api/admin/upload/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const files = formData.getAll("files") as File[];
    const uploadedBy = (formData.get("uploadedBy") as string) ?? "admin";

    const glOwner = (formData.get("glOwner") as string) ?? "";
    const pmType = (formData.get("pmType") as string) ?? "";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No se recibieron archivos" },
        { status: 400 }
      );
    }

    const results: {
      id: string;
      fileName: string;
      fileUrl: string;
      glOwner: string | null;
      pmType: string | null;
    }[] = [];

    for (const file of files) {
      if (!file || typeof file === "string") continue;

      // 1) Subir a Vercel Blob (evitar conflicto de nombre con addRandomSuffix)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const blob = await put(file.name, buffer, {
        access: "public",
        addRandomSuffix: true,
      });

      // 2) Guardar registro en la base de datos
      const row = await prisma.pMUploadedFile.create({
        data: {
          fileName: file.name,
          blobUrl: blob.url,
          uploadedBy,
          active: true,
          // 👇 estos campos existen en la BD, pero el tipo de Prisma aún no los ve
          glOwner,
          pmType,
        } as any,
      });

      const r: any = row;

      results.push({
        id: row.id,
        fileName: row.fileName,
        fileUrl: row.blobUrl,
        glOwner: r.glOwner ?? "",
        pmType: r.pmType ?? "",
      });
    }

    return NextResponse.json({ ok: true, files: results });
  } catch (error: any) {
    console.error("Error en /api/admin/upload:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Error al subir PMs",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}
