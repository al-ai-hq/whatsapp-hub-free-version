import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { CreateRedirectSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** GET /api/redirects — list /go/<slug> destinations. */
export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await prisma.redirectLink.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ links });
}

/** POST /api/redirects — add a destination. */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateRedirectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { slug, url } = parsed.data;

  try {
    const link = await prisma.redirectLink.create({ data: { slug, url } });
    void audit(claims.sub, "redirect.created", slug, { url });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `"${slug}" is already taken.` }, { status: 409 });
    }
    throw err;
  }
}
