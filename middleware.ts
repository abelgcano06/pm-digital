// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const USER = "GLs";
const PASS = "T2Deck";

// Protege TODO lo que empiece con /gl
export const config = {
  matcher: ["/gl/:path*"],
};

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (!auth) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="GL Dashboard", charset="UTF-8"',
      },
    });
  }

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return new NextResponse("Invalid auth", { status: 401 });
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const [user, pass] = decoded.split(":");

  if (user !== USER || pass !== PASS) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="GL Dashboard", charset="UTF-8"',
      },
    });
  }

  return NextResponse.next();
}
