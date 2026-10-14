import { NextRequest, NextResponse } from "next/server";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login", "/api/auth", "/api/webhooks", "/api/health", "/go",
];
const PUBLIC_EXACT = new Set(["/", "/contacts-template.csv"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
