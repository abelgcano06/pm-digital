// src/app/api/admin/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const files = await prisma.pMUploadedFile.findMany({
      include: {
        template: {
          include: {
            executions: {
              orderBy: { finishedAt: "desc" },
            },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const items = files.map((f) => {
      const template = f.template;
      const executions = template?.executions ?? [];
      const hasExecution = executions.length > 0;
      const lastExecution = hasExecution ? executions[0] : null;

      let pmStatus = (f as any).pmStatus as
        | "OPEN"
        | "COMPLETED"
        | "CLOSED"
        | undefined;

      if (!pmStatus) {
        pmStatus = hasExecution ? "COMPLETED" : "OPEN";
      }

      let status: "open" | "closed" | "deleted";
      if (!f.active) {
        status = "deleted";
      } else {
        if (pmStatus === "OPEN") status = "open";
        else if (pmStatus === "COMPLETED" || pmStatus === "CLOSED")
          status = "closed";
        else status = hasExecution ? "closed" : "open";
      }

      return {
        id: f.id,
        fileName: f.fileName,
        blobUrl: f.blobUrl,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedBy,
        active: f.active,
        glOwner: (f as any).glOwner ?? null,
        pmType: (f as any).pmType ?? null,
        pmStatus,
        status,
        pmTemplateId: template?.id ?? null,
        pmNumber: template?.pmNumber ?? null,
        pmName: template?.name ?? null,
        assetCode: template?.assetCode ?? null,
        location: template?.location ?? null,
        lastExecutionAt: lastExecution?.finishedAt ?? null,
        lastExecutionPdfUrl: lastExecution?.executionPdfUrl ?? null,
      };
    });

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (err) {
    console.error("Error en /api/admin/list:", err);
    return NextResponse.json(
      { error: "No se pudo obtener la lista de PMs" },
      { status: 500 }
    );
  }
}
