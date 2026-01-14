"use client";

import { useEffect, useMemo, useState } from "react";
import "./gl.css";

type GLItem = {
  uploadedFileId: string;
  fileName: string;
  blobUrl: string;

  glOwner: string;
  pmType: string;
  pmStatus: "OPEN" | "COMPLETED" | "CLOSED";
  uploadedAt: string;

  hasTemplate: boolean;
  templateId: string | null;

  pmNumber: string | null;
  pmName: string | null;
  assetCode: string | null;
  location: string | null;

  executionPdfUrl: string | null;
  lastExecutedAt: string | null;
};

const GL_USER = "GLs";
const GL_PASS = "T2Deck";

const GL_OPTIONS = [
  "alicia elizondo",
  "miguel gonzalez",
  "candelario espinoza",
  "jesus gonzalez",
  "adolfo lopez",
  "oscar palacios",
  "jose luis avila",
  "isai bon",
];

export default function GLDashboardPage() {
  const [authed, setAuthed] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);

  const [glSelected, setGlSelected] = useState<string>("all");
  const [items, setItems] = useState<GLItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const ok = sessionStorage.getItem("gl_authed") === "1";
    if (ok) setAuthed(true);
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);

    if (u.trim() === GL_USER && p.trim() === GL_PASS) {
      sessionStorage.setItem("gl_authed", "1");
      setAuthed(true);
      return;
    }
    setAuthErr("Usuario o contraseña incorrectos.");
  }

  async function load() {
    try {
      setLoading(true);
      setErr(null);

      const glParam = glSelected === "all" ? "" : `?gl=${encodeURIComponent(glSelected)}`;
      const res = await fetch(`/api/gl/pm-files${glParam}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar la lista");

      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Error cargando lista");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, glSelected]);

  const filtered = useMemo(() => {
    if (glSelected === "all") return items;
    return items.filter((x) => (x.glOwner || "").toLowerCase() === glSelected.toLowerCase());
  }, [items, glSelected]);

  async function setStatus(uploadedFileId: string, status: "OPEN" | "COMPLETED" | "CLOSED") {
    try {
      setBusyId(uploadedFileId);
      const res = await fetch("/api/pm-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedFileId, status }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo actualizar el status");
      }

      // reflejar local
      setItems((prev) => prev.map((x) => (x.uploadedFileId === uploadedFileId ? { ...x, pmStatus: status } : x)));
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo actualizar el status");
    } finally {
      setBusyId(null);
    }
  }

  if (!authed) {
    return (
      <div className="gl-page">
        <div className="gl-shell gl-shell--login">
          <div className="gl-card">
            <div className="gl-title">Acceso GLs</div>
            <div className="gl-subtitle">Usuario: GLs · Contraseña: T2Deck</div>

            <form onSubmit={login} className="gl-form">
              <label className="gl-label">Usuario</label>
              <input className="gl-input" value={u} onChange={(e) => setU(e.target.value)} />

              <label className="gl-label">Contraseña</label>
              <input className="gl-input" type="password" value={p} onChange={(e) => setP(e.target.value)} />

              {authErr && <div className="gl-alert gl-alert--error">{authErr}</div>}

              <button className="gl-btn gl-btn--primary" type="submit">
                Entrar
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gl-page">
      <div className="gl-shell">
        <header className="gl-header">
          <div>
            <div className="gl-chip">GL DASHBOARD • PM Digital</div>
            <h1 className="gl-h1">PMs asignados a GL</h1>
            <p className="gl-p">Revisa PMs completados, abre el PDF de cierre y cambia status (Cerrar/Reabrir).</p>
          </div>

          <div className="gl-actions">
            <select className="gl-input" value={glSelected} onChange={(e) => setGlSelected(e.target.value)}>
              <option value="all">Todos los GL</option>
              {GL_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <button className="gl-btn gl-btn--secondary" onClick={load} disabled={loading}>
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </header>

        {err && <div className="gl-alert gl-alert--error">{err}</div>}

        <div className="gl-list">
          {filtered.map((x) => (
            <div key={x.uploadedFileId} className="gl-row">
              <div className="gl-row-main">
                <div className="gl-row-title">{x.pmName || x.fileName}</div>
                <div className="gl-row-meta">
                  <span className="gl-badge">GL: {x.glOwner || "-"}</span>
                  <span className="gl-badge">Tipo: {(x.pmType || "-").toUpperCase()}</span>
                  <span className={`gl-badge gl-badge--status gl-badge--${x.pmStatus.toLowerCase()}`}>
                    {x.pmStatus}
                  </span>
                </div>

                <div className="gl-row-links">
                  <a className="gl-link" href={x.blobUrl} target="_blank" rel="noreferrer">
                    Ver PM original (PDF)
                  </a>

                  {x.executionPdfUrl ? (
                    <a className="gl-link gl-link--strong" href={x.executionPdfUrl} target="_blank" rel="noreferrer">
                      Ver PM de cierre (PDF generado)
                    </a>
                  ) : (
                    <span className="gl-link gl-link--muted">Aún no hay PDF de cierre</span>
                  )}
                </div>
              </div>

              <div className="gl-row-cta">
                <button
                  className="gl-btn gl-btn--primary"
                  onClick={() => setStatus(x.uploadedFileId, "CLOSED")}
                  disabled={busyId === x.uploadedFileId}
                >
                  Cerrar PM
                </button>

                <button
                  className="gl-btn gl-btn--ghost"
                  onClick={() => setStatus(x.uploadedFileId, "OPEN")}
                  disabled={busyId === x.uploadedFileId}
                >
                  Reabrir
                </button>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 && (
            <div className="gl-empty">
              No hay PMs para este filtro.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
