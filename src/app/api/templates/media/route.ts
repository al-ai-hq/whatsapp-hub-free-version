import { NextRequest, NextResponse } from "next/server";
import { uploadTemplateMedia, WhatsAppError } from "@/lib/whatsapp";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

// Node runtime: we read the uploaded file bytes and stream them to Meta's
// Resumable Upload API. Auth is enforced by the access-token check below.
export const runtime = "nodejs";

const MAX_BYTES = 16 * 1024 * 1024; // 16 MB — comfortably above Meta's header sample limits
const ALLOWED = /^(image\/(jpeg|png)|application\/pdf|video\/mp4)$/;

/**
 * POST /api/templates/media — upload a sample media file (image/PDF/video) to
 * Meta and return a `handle` to use as a template header sample.
 */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json({ error: "Use a JPEG/PNG image, a PDF, or an MP4 video" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 16 MB)" }, { status: 400 });
  }
  try {
    const bytes = await file.arrayBuffer();
    const handle = await uploadTemplateMedia(bytes, file.name || "sample", file.type);
    return NextResponse.json({ handle, fileName: file.name });
  } catch (e) {
    if (e instanceof WhatsAppError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
