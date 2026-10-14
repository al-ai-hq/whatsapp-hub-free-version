import { NextRequest, NextResponse } from "next/server";
import { CreateBroadcastSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { createAndEnqueueBroadcast } from "@/lib/broadcast";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/broadcasts — create + enqueue (immediate or scheduled). */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateBroadcastSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const { templateId, listId, variableMap, scheduleAt, headerMediaUrl, couponCode, cardMediaUrls, ltoExpiresAt } = parsed.data;

  const result = await createAndEnqueueBroadcast({
    templateId,
    listId,
    variableMap,
    scheduledAt: scheduleAt ? new Date(scheduleAt) : null,
    headerMediaUrl,
    couponCode,
    cardMediaUrls,
    ltoExpiresAt: ltoExpiresAt ? new Date(ltoExpiresAt) : null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code ?? 422 });
  void audit(claims.sub, result.scheduledAt ? "broadcast.scheduled" : "broadcast.sent", result.broadcastId, {
    templateId, listId, queued: result.queued, ...(result.scheduledAt ? { scheduledAt: result.scheduledAt } : {}),
  });
  return NextResponse.json({
    broadcastId: result.broadcastId,
    queued: result.queued,
    scheduledAt: result.scheduledAt,
    // Present only when some recipients could not be queued; they are already
    // marked FAILED and can be re-sent from the broadcast's Retry action.
    ...(result.failed ? { failed: result.failed, warning: result.warning } : {}),
  });
}

/** GET /api/broadcasts — list broadcasts with progress. */
export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const broadcasts = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { template: true, list: true },
  });
  return NextResponse.json({ broadcasts });
}
