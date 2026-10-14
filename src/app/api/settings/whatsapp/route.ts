import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWaConfigStatus, saveWaConfig } from "@/lib/waConfig";
import { verifyToken, ACCESS_COOKIE, type AccessClaims } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getWaConfigStatus());
}

const SaveSchema = z.object({
  phoneNumberId: z.string().trim().max(64).optional(),
  businessAccountId: z.string().trim().max(64).optional(),
  appId: z.string().trim().max(64).optional(),
  accessToken: z.string().trim().max(1024).optional(),
  appSecret: z.string().trim().max(256).optional(),
  webhookVerifyToken: z.string().trim().max(256).optional(),
  graphApiVersion: z.string().trim().regex(/^v\d+\.\d+$/, "Use a version like v21.0").optional(),
});

export async function PUT(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  await saveWaConfig(parsed.data);
  void audit(claims.sub, "settings.whatsapp_updated", null, {
    fields: Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== "").map(([k]) => k),
  });
  return NextResponse.json({ ok: true, ...(await getWaConfigStatus()) });
}
