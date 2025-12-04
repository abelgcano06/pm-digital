import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const session = request.cookies.get("admin_session")?.value;

  // Si entra a /admin/login no bloqueamos
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Si entra a cualquier /admin/* sin sesión → login
  if (isAdminRoute && session !== "true") {
    const url = new URL("/admin/login", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
