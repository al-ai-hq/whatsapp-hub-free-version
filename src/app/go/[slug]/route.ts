import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseSlug, isAllowedDestination } from "@/lib/links";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = parseSlug(raw);
  if (!slug) return new NextResponse("Not found", { status: 404 });

  const link = await prisma.redirectLink.findUnique({ where: { slug }, select: { url: true } });
  if (!link || !isAllowedDestination(link.url)) return new NextResponse("Not found", { status: 404 });
  const dest = link.url;

  const js = JSON.stringify(dest);
  const href = dest.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="robots" content="noindex,nofollow"></head><body>` +
    `<a href="${href}">Continue</a>` +
    `<script>location.replace(${js})</script>` +
    `</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
