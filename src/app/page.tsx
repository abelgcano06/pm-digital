"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a1628 0%, #1a2e50 50%, #0d1f3c 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Logo / Header */}
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "14px",
              background: "linear-gradient(135deg, #eb0a1e, #ff4d5e)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(235,10,30,0.4)",
              fontSize: 26,
            }}
          >
            🔧
          </div>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.5px",
            }}
          >
            PM Digital
          </span>
        </div>
        <p style={{ color: "#8ba4c8", fontSize: "15px", margin: 0 }}>
          Sistema de Mantenimiento Preventivo · Toyota
        </p>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.25rem",
          width: "100%",
          maxWidth: "820px",
        }}
      >
        {/* Asociado */}
        <Link href="/pm" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(91,141,239,0.3)",
              borderRadius: "20px",
              padding: "2rem 1.5rem",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              boxShadow: "0 4px 24px rgba(91,141,239,0.15)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 12px 36px rgba(91,141,239,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 4px 24px rgba(91,141,239,0.15)";
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "14px",
                background: "linear-gradient(135deg, #5b8def, #88b3ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                marginBottom: "1rem",
                boxShadow: "0 6px 18px rgba(91,141,239,0.35)",
              }}
            >
              👷‍♂️
            </div>
            <h2
              style={{
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: 700,
                margin: "0 0 6px",
              }}
            >
              Asociado
            </h2>
            <p style={{ color: "#8ba4c8", fontSize: "13px", margin: "0 0 1.25rem" }}>
              Ejecuta PMs paso a paso, captura evidencias y genera reportes.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "13px",
                fontWeight: 600,
                color: "#88b3ff",
              }}
            >
              Iniciar PM →
            </span>
          </div>
        </Link>

        {/* Admin (Frida) */}
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(235,10,30,0.3)",
              borderRadius: "20px",
              padding: "2rem 1.5rem",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              boxShadow: "0 4px 24px rgba(235,10,30,0.12)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 12px 36px rgba(235,10,30,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 4px 24px rgba(235,10,30,0.12)";
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "14px",
                background: "linear-gradient(135deg, #eb0a1e, #ff6b78)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                marginBottom: "1rem",
                boxShadow: "0 6px 18px rgba(235,10,30,0.35)",
              }}
            >
              📋
            </div>
            <h2
              style={{
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: 700,
                margin: "0 0 6px",
              }}
            >
              Administrador
            </h2>
            <p style={{ color: "#8ba4c8", fontSize: "13px", margin: "0 0 1.25rem" }}>
              Sube PDFs de PM, gestiona el inventario y revisa ejecuciones.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "13px",
                fontWeight: 600,
                color: "#ff8f97",
              }}
            >
              Panel Admin →
            </span>
          </div>
        </Link>

        {/* GL */}
        <Link href="/gl" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "20px",
              padding: "2rem 1.5rem",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              boxShadow: "0 4px 24px rgba(16,185,129,0.12)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 12px 36px rgba(16,185,129,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 4px 24px rgba(16,185,129,0.12)";
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "14px",
                background: "linear-gradient(135deg, #10b981, #34d399)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                marginBottom: "1rem",
                boxShadow: "0 6px 18px rgba(16,185,129,0.35)",
              }}
            >
              🏭
            </div>
            <h2
              style={{
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: 700,
                margin: "0 0 6px",
              }}
            >
              Group Leader
            </h2>
            <p style={{ color: "#8ba4c8", fontSize: "13px", margin: "0 0 1.25rem" }}>
              Supervisa el estado de PMs de tu equipo y valida ejecuciones.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "13px",
                fontWeight: 600,
                color: "#6ee7b7",
              }}
            >
              Dashboard GL →
            </span>
          </div>
        </Link>
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop: "3rem",
          color: "#4a6080",
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        Toyota Motor North America · PM Digital v1.0
      </p>
    </main>
  );
}
