import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { uploadMedia, sendMedia, WhatsAppError } from "@/lib/whatsapp";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BYTES = 90 * 1024 * 1024;

function mediaType(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const convo = await prisma.conversation.findFirst({ where: { id }, select: { id: true, phone: true } });
  if (!convo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const caption = (form?.get("caption") as string | null)?.trim() || undefined;
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 400 });

  const type = mediaType(file.type || "application/octet-stream");
  const filename = file.name || "file";

  let wamid: string;
  let mediaId: string;
  try {
    mediaId = await uploadMedia(await file.arrayBuffer(), file.type || "application/octet-stream", filename);
    wamid = await sendMedia({ to: convo.phone, type, mediaId, caption, filename });
  } catch (e) {
    const message = e instanceof Error ? e.message : "send failed";
    const code = e instanceof WhatsAppError ? e.status : 502;
    return NextResponse.json({ error: message }, { status: code });
  }

  const created = await prisma.message.create({
    data: {
      conversationId: id, direction: "OUT", type,
      text: caption ?? null, mediaId, mediaMime: file.type || null,
      mediaFilename: type === "document" ? filename : null, wamid, status: "SENT",
    },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: created.createdAt, lastPreview: caption || `📎 ${filename}`, unread: 0 },
  });

  void audit(claims.sub, "conversation.media_sent", id, { type });

  return NextResponse.json({
    message: {
      id: created.id, direction: "OUT", type, text: created.text,
      mediaMime: created.mediaMime, mediaFilename: created.mediaFilename, status: "SENT", createdAt: created.createdAt,
    },
  }, { status: 201 });
}
