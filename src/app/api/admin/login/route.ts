import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { user, pass } = await req.json();

  // Credenciales fijas
  const validUser = "admin";
  const validPass = "Toyota123$";

  if (user === validUser && pass === validPass) {
    const response = NextResponse.json({ ok: true });

    // Crear cookie de sesión por 8 horas
    response.cookies.set("admin_session", "true", {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
