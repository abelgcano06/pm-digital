// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>PM Digital</h1>
      <p>Selecciona cómo quieres entrar:</p>

      <ul style={{ marginTop: "1rem" }}>
        <li>
          <Link href="/pm">Ir al módulo de Asociado (/pm)</Link>
        </li>
        <li>
          <Link href="/admin">Ir al módulo de Frida (/admin)</Link>
        </li>
      </ul>
    </main>
  );
}
