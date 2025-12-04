// src/app/admin/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (user === "admin" && pass === "Toyota123$") {
      setError("");
      router.push("/admin/dashboard");
    } else {
      setError("Usuario o contraseña incorrectos");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.25em] text-emerald-500">
            PM DIGITAL
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Panel Admin
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ingresa para cargar los PDFs de PM del mes.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Usuario
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Toyota123$"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full mt-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold text-white py-2.5 shadow-md shadow-emerald-200 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
