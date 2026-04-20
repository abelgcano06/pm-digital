import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

export const runtime = "nodejs";

// ── Fonts (Roboto soporta caracteres latinos / acentos) ───────────────────
Font.register({
  family: "Roboto",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf",
      fontWeight: 700,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

// ── Types ──────────────────────────────────────────────────────────────────
type TaskStatus = "pending" | "ok" | "nok";

type IncomingTask = {
  taskId: string;
  status: TaskStatus;
  comment: string;
  flagged: boolean;
  measureValue?: string;
  photoUrls?: string[];
};

type FinishBody = {
  pmTemplateId: string;
  pmNumber: string;
  pmName: string;
  asociado1: string;
  asociado2?: string;
  asociado3?: string;
  glNombre: string;
  startedAt: string;
  finishedAt: string;
  tasks: IncomingTask[];
};

type ResolvedTask = {
  taskId: string;
  taskIdNumber: number;
  majorStep: string;
  keyPoints: string;
  reason: string;
  status: TaskStatus;
  comment: string;
  flagged: boolean;
  measureValue?: string;
  photoUrls?: string[];
};

type PMReportProps = {
  pmNumber: string;
  pmName: string;
  teamStr: string;
  glNombre: string;
  startedDate: Date;
  finishedDate: Date;
  durationMs: number;
  resolvedTasks: ResolvedTask[];
};

// ── Colors ─────────────────────────────────────────────────────────────────
const C = {
  red: "#eb0a1e",
  dark: "#111827",
  gray: "#6b7280",
  lightGray: "#f3f4f6",
  border: "#e5e7eb",
  green: "#16a34a",
  greenBg: "#dcfce7",
  redText: "#dc2626",
  redBg: "#fee2e2",
  orange: "#d97706",
  orangeBg: "#fef3c7",
  white: "#ffffff",
  body: "#374151",
};

// ── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 9,
    color: C.dark,
    paddingTop: 28,
    paddingBottom: 42,
    paddingLeft: 32,
    paddingRight: 32,
    backgroundColor: C.white,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 3,
    borderBottomColor: C.red,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: C.dark },
  headerSub: { fontSize: 9, color: C.gray, marginTop: 3 },
  headerChip: {
    backgroundColor: C.red,
    color: C.white,
    fontSize: 7,
    fontWeight: 700,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 4,
  },
  // Meta
  metaRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  metaCard: {
    flex: 1,
    backgroundColor: C.lightGray,
    borderRadius: 4,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    marginRight: 5,
  },
  metaCardLast: {
    flex: 1,
    backgroundColor: C.lightGray,
    borderRadius: 4,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
  },
  metaLabel: {
    fontSize: 6,
    fontWeight: 700,
    color: C.gray,
    marginBottom: 2,
  },
  metaValue: { fontSize: 8, color: C.dark },
  // Summary
  summaryRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 5,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderLeftWidth: 4,
    marginRight: 6,
  },
  summaryCardLast: {
    flex: 1,
    borderRadius: 5,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderLeftWidth: 4,
  },
  sOk: { backgroundColor: C.greenBg, borderLeftColor: C.green },
  sNok: { backgroundColor: C.redBg, borderLeftColor: C.redText },
  sFlag: { backgroundColor: C.orangeBg, borderLeftColor: C.orange },
  sTotal: { backgroundColor: C.lightGray, borderLeftColor: C.gray },
  summaryNum: { fontSize: 20, fontWeight: 700, lineHeight: 1 },
  snOk: { color: C.green },
  snNok: { color: C.redText },
  snFlag: { color: C.orange },
  snTotal: { color: C.dark },
  summaryLabel: { fontSize: 7, marginTop: 3, fontWeight: 700 },
  slOk: { color: C.green },
  slNok: { color: C.redText },
  slFlag: { color: C.orange },
  slTotal: { color: C.gray },
  // Section
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: C.dark,
    marginBottom: 6,
    marginTop: 2,
  },
  // Task card
  taskCard: {
    marginBottom: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  taskHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
  },
  thOk: { backgroundColor: "#f0fdf4" },
  thNok: { backgroundColor: "#fef2f2" },
  thFlag: { backgroundColor: "#fffbeb" },
  thPending: { backgroundColor: "#f9fafb" },
  taskNum: { fontSize: 7, fontWeight: 700, color: C.gray, width: 20 },
  taskTitle: { flex: 1, fontSize: 9, fontWeight: 700, color: C.dark },
  badge: {
    fontSize: 6,
    fontWeight: 700,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 3,
  },
  badgeOk: { backgroundColor: "#bbf7d0", color: C.green },
  badgeNok: { backgroundColor: "#fecaca", color: C.redText },
  badgeFlag: { backgroundColor: "#fde68a", color: C.orange },
  badgePending: { backgroundColor: C.border, color: C.gray },
  taskBody: {
    paddingTop: 3,
    paddingBottom: 6,
    paddingLeft: 28,
    paddingRight: 8,
  },
  bodyLine: {
    fontSize: 7.5,
    color: C.body,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  bodyBold: { fontWeight: 700, color: C.gray },
  commentBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 3,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 6,
    paddingRight: 6,
    marginTop: 3,
    fontSize: 7.5,
    color: C.body,
    borderLeftWidth: 2,
    borderLeftColor: "#d1d5db",
  },
  flagAlert: {
    fontSize: 7.5,
    fontWeight: 700,
    color: C.orange,
    marginTop: 3,
  },
  // Photos
  photoSection: {
    paddingTop: 0,
    paddingBottom: 7,
    paddingLeft: 28,
    paddingRight: 8,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  photoWrap: {
    width: "32%",
    marginRight: "1.33%",
    marginBottom: 4,
  },
  photoImg: {
    width: "100%",
    height: 85,
    borderRadius: 3,
  },
  photoCaption: { fontSize: 6, color: C.gray, marginTop: 2 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: C.gray },
});

// ── PDF Component ──────────────────────────────────────────────────────────
function PMReport({
  pmNumber,
  pmName,
  teamStr,
  glNombre,
  startedDate,
  finishedDate,
  durationMs,
  resolvedTasks,
}: PMReportProps) {
  const total = resolvedTasks.length;
  const okCount = resolvedTasks.filter((t) => t.status === "ok").length;
  const nokCount = resolvedTasks.filter((t) => t.status === "nok").length;
  const flaggedCount = resolvedTasks.filter((t) => t.flagged).length;

  const fmt = (d: Date) =>
    d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const durationMin = Math.round(durationMs / 60000);

  return (
    <Document title={`PM Ejecución - ${pmName}`} author="PM Digital · Toyota">
      <Page size="A4" orientation="landscape" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.headerTitle}>Reporte de Ejecución — Mantenimiento Preventivo</Text>
            <Text style={S.headerSub}>
              {pmNumber ? `${pmNumber} · ` : ""}
              {pmName}
            </Text>
          </View>
          <Text style={S.headerChip}>TOYOTA · PM DIGITAL</Text>
        </View>

        {/* Meta */}
        <View style={S.metaRow}>
          <View style={S.metaCard}>
            <Text style={S.metaLabel}>EQUIPO</Text>
            <Text style={S.metaValue}>{teamStr}</Text>
          </View>
          <View style={S.metaCard}>
            <Text style={S.metaLabel}>GL / SUPERVISOR</Text>
            <Text style={S.metaValue}>{glNombre}</Text>
          </View>
          <View style={S.metaCard}>
            <Text style={S.metaLabel}>INICIO</Text>
            <Text style={S.metaValue}>{fmt(startedDate)}</Text>
          </View>
          <View style={S.metaCard}>
            <Text style={S.metaLabel}>FIN</Text>
            <Text style={S.metaValue}>{fmt(finishedDate)}</Text>
          </View>
          <View style={S.metaCardLast}>
            <Text style={S.metaLabel}>DURACIÓN</Text>
            <Text style={S.metaValue}>{durationMin} min</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={S.summaryRow}>
          <View style={[S.summaryCard, S.sOk]}>
            <Text style={[S.summaryNum, S.snOk]}>{okCount}</Text>
            <Text style={[S.summaryLabel, S.slOk]}>
              OK — {total > 0 ? Math.round((okCount / total) * 100) : 0}%
            </Text>
          </View>
          <View style={[S.summaryCard, S.sNok]}>
            <Text style={[S.summaryNum, S.snNok]}>{nokCount}</Text>
            <Text style={[S.summaryLabel, S.slNok]}>NO OK</Text>
          </View>
          <View style={[S.summaryCard, S.sFlag]}>
            <Text style={[S.summaryNum, S.snFlag]}>{flaggedCount}</Text>
            <Text style={[S.summaryLabel, S.slFlag]}>Necesitan revisión</Text>
          </View>
          <View style={[S.summaryCardLast, S.sTotal]}>
            <Text style={[S.summaryNum, S.snTotal]}>{total}</Text>
            <Text style={[S.summaryLabel, S.slTotal]}>Total puntos</Text>
          </View>
        </View>

        {/* Task detail */}
        <Text style={S.sectionTitle}>Detalle por punto</Text>

        {resolvedTasks.map((t) => {
          const isOk = t.status === "ok";
          const isNok = t.status === "nok";
          const thStyle = t.flagged
            ? S.thFlag
            : isOk
            ? S.thOk
            : isNok
            ? S.thNok
            : S.thPending;
          const bStyle = t.flagged
            ? S.badgeFlag
            : isOk
            ? S.badgeOk
            : isNok
            ? S.badgeNok
            : S.badgePending;
          const badgeText = t.flagged
            ? "REVISIÓN"
            : isOk
            ? "OK"
            : isNok
            ? "NO OK"
            : "PENDIENTE";

          return (
            <View key={t.taskId} style={S.taskCard}>
              <View style={[S.taskHeader, thStyle]}>
                <Text style={S.taskNum}>{t.taskIdNumber}.</Text>
                <Text style={S.taskTitle}>{t.majorStep}</Text>
                <Text style={[S.badge, bStyle]}>{badgeText}</Text>
              </View>

              {(!!t.keyPoints || !!t.reason || !!t.measureValue || !!t.comment || t.flagged) && (
                <View style={S.taskBody}>
                  {!!t.keyPoints && (
                    <Text style={S.bodyLine}>
                      <Text style={S.bodyBold}>Key Points: </Text>
                      {t.keyPoints}
                    </Text>
                  )}
                  {!!t.reason && (
                    <Text style={S.bodyLine}>
                      <Text style={S.bodyBold}>Razón: </Text>
                      {t.reason}
                    </Text>
                  )}
                  {!!t.measureValue && (
                    <Text style={S.bodyLine}>
                      <Text style={S.bodyBold}>Medición: </Text>
                      {t.measureValue}
                    </Text>
                  )}
                  {!!t.comment && (
                    <View style={S.commentBox}>
                      <Text>{t.comment}</Text>
                    </View>
                  )}
                  {t.flagged && (
                    <Text style={S.flagAlert}>
                      FLAG: Requiere revisión del GL / Mantenimiento
                    </Text>
                  )}
                </View>
              )}

              {!!t.photoUrls?.length && (
                <View style={S.photoSection}>
                  <View style={S.photoGrid}>
                    {t.photoUrls.map((url, i) => (
                      <View key={i} style={S.photoWrap}>
                        <Image src={url} style={S.photoImg} />
                        <Text style={S.photoCaption}>
                          Foto {i + 1} · Punto {t.taskIdNumber}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>Toyota Motor North America · PM Digital · {pmNumber}</Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Pág. ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────
function sanitizeForFileName(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_");
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let body: FinishBody;
    try {
      body = JSON.parse(rawBody) as FinishBody;
    } catch (parseErr: any) {
      console.error("pm-finish: body NO es JSON válido:", rawBody);
      return NextResponse.json(
        {
          error: "El cuerpo recibido no es JSON válido",
          details: parseErr?.message || String(parseErr),
          rawSample: rawBody.slice(0, 300),
        },
        { status: 400 }
      );
    }

    const {
      pmTemplateId,
      pmNumber,
      pmName,
      asociado1,
      asociado2,
      asociado3,
      glNombre,
      startedAt,
      finishedAt,
      tasks,
    } = body;

    console.log("🧾 pm-finish payload:", {
      pmTemplateId,
      tasksCount: Array.isArray(tasks) ? tasks.length : null,
    });

    if (!pmTemplateId)
      return NextResponse.json({ error: "Falta pmTemplateId" }, { status: 400 });
    if (!asociado1)
      return NextResponse.json({ error: "Falta nombre del Asociado 1" }, { status: 400 });
    if (!glNombre)
      return NextResponse.json({ error: "Falta GL" }, { status: 400 });
    if (!startedAt || !finishedAt)
      return NextResponse.json({ error: "Falta startedAt o finishedAt" }, { status: 400 });
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0)
      return NextResponse.json({ error: "No se recibieron tareas" }, { status: 400 });

    const template = await prisma.pMTemplate.findUnique({
      where: { id: pmTemplateId },
      include: { tasks: true, uploadedFile: true },
    });
    if (!template)
      return NextResponse.json({ error: "PMTemplate no encontrado" }, { status: 404 });

    const taskMap = new Map<string, any>(template.tasks.map((t) => [t.id, t as any]));
    for (const t of tasks) {
      if (!taskMap.has(t.taskId))
        return NextResponse.json({ error: `Tarea inválida: ${t.taskId}` }, { status: 400 });
    }

    const startedDate = new Date(startedAt);
    const finishedDate = new Date(finishedAt);
    const durationMs = finishedDate.getTime() - startedDate.getTime();

    const execution = (await prisma.pMExecution.create({
      data: {
        pmTemplateId: template.id,
        associate1: asociado1,
        associate2: asociado2 || "",
        groupLeader: glNombre,
        startedAt: startedDate,
        finishedAt: finishedDate,
        durationMs,
      },
    })) as any;

    if (template.uploadedFileId) {
      await prisma.pMUploadedFile.update({
        where: { id: template.uploadedFileId },
        data: { pmStatus: "COMPLETED" } as any,
      });
    }

    await prisma.pMTaskExecution.createMany({
      data: tasks.map((t) => {
        const tmplTask = taskMap.get(t.taskId) as any;
        return {
          pmExecutionId: execution.id,
          templateTaskId: tmplTask.id,
          status: t.status,
          comment: t.comment || "",
          flagged: t.flagged,
          measureValue: t.measureValue || null,
          photoUrls: t.photoUrls ?? [],
        };
      }),
    });

    // Prepare PDF data
    const teamStr = [asociado1, asociado2, asociado3].filter(Boolean).join(", ");

    const resolvedTasks: ResolvedTask[] = tasks.map((t) => {
      const tmpl = taskMap.get(t.taskId) as any;
      return {
        taskId: t.taskId,
        taskIdNumber: tmpl.taskIdNumber ?? 0,
        majorStep: tmpl.majorStep || "",
        keyPoints: tmpl.keyPoints || "",
        reason: tmpl.reason || "",
        status: t.status,
        comment: t.comment || "",
        flagged: t.flagged,
        measureValue: t.measureValue,
        photoUrls: t.photoUrls,
      };
    });

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      <PMReport
        pmNumber={template.pmNumber ?? pmNumber ?? ""}
        pmName={template.name ?? pmName ?? ""}
        teamStr={teamStr}
        glNombre={glNombre}
        startedDate={startedDate}
        finishedDate={finishedDate}
        durationMs={durationMs}
        resolvedTasks={resolvedTasks}
      />
    );

    // Upload to Blob
    const originalFileName =
      template.uploadedFile?.fileName ?? template.pmNumber ?? pmNumber ?? "PM";
    const originalBase = originalFileName.replace(/\.[^/.]+$/, "");
    const safeOriginal = sanitizeForFileName(originalBase);
    const safeGL = sanitizeForFileName(glNombre);
    const safeA1 = sanitizeForFileName(asociado1);
    const safeA2 = sanitizeForFileName(asociado2 || "");
    const blobName =
      `EXEC_${safeOriginal}_GL(${safeGL})_A1(${safeA1})` +
      (safeA2 ? `_A2(${safeA2})` : "") +
      `.pdf`;

    let url: string;
    try {
      const { url: blobUrl } = await put(blobName, pdfBuffer, {
        access: "public",
        contentType: "application/pdf",
        addRandomSuffix: true,
      });
      url = blobUrl;
    } catch (blobErr: any) {
      console.error("Error subiendo PDF a Blob:", blobErr);
      return NextResponse.json(
        {
          error: "Se creó la ejecución pero falló al subir el PDF al Blob.",
          details: blobErr?.message || String(blobErr),
        },
        { status: 500 }
      );
    }

    const execUpdated = (await prisma.pMExecution.update({
      where: { id: execution.id },
      data: { executionPdfUrl: url },
    })) as any;

    return NextResponse.json({ ok: true, url, executionId: execUpdated.id });
  } catch (err: any) {
    console.error("Error en /api/pm-finish:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
