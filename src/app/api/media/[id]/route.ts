import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { fetchMediaBytes } from "@/lib/whatsapp";

export const runtime = "nodejs";

/**
 * GET /api/media/:id — stream a message's media. `id` is our Message id;
 * we resolve the Meta media id and proxy the bytes so the access token
 * never reaches the browser.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const msg = await prisma.message.findFirst({
    where: { id },
    select: { mediaId: true, mediaMime: true, mediaFilename: true, type: true },
  });
  if (!msg?.mediaId) return new NextResponse("not found", { status: 404 });

  const media = await fetchMediaBytes(msg.mediaId);
  if (!media.ok) {
    return new NextResponse(media.gone ? "media expired" : "media unavailable", { status: media.gone ? 410 : 502 });
  }

  const mime = msg.mediaMime || media.mime;
  const disposition =
    msg.type === "document"
      ? `attachment; filename="${(msg.mediaFilename || "document").replace(/"/g, "")}"`
      : "inline";

  return new NextResponse(media.bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
