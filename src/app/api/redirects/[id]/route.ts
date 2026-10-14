import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { UpdateRedirectSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** PATCH /api/redirects/:id — repoint a slug at a new destination. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = UpdateRedirectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.redirectLink.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "link not found" }, { status: 404 });

  const link = await prisma.redirectLink.update({ where: { id }, data: { url: parsed.data.url } });
  void audit(claims.sub, "redirect.updated", existing.slug, { from: existing.url, to: parsed.data.url });
  return NextResponse.json({ link });
}

/** DELETE /api/redirects/:id — remove a destination. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.redirectLink.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "link not found" }, { status: 404 });

  await prisma.redirectLink.delete({ where: { id } });
  void audit(claims.sub, "redirect.deleted", existing.slug, { url: existing.url });
  return NextResponse.json({ ok: true });
}
