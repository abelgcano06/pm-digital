"use client";
import { useState } from "react";

export default function AdminLogin() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: any) => {
    e.preventDefault();

    const res = await fetch("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ user, pass }),
    });

    if (res.ok) {
      window.location.href = "/admin/dashboard";
    } else {
      setError("Usuario o contraseña incorrectos");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Login Admin</h1>
      <form onSubmit={handleLogin}>
        <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} />
        <br />
        <input
          placeholder="Contraseña"
          type="password"
          value={pass}
          onChange={e => setPass(e.target.value)}
        />
        <br /><br />
        <button type="submit">Entrar</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
