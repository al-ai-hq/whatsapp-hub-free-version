import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { upsertSchedule, removeSchedule } from "@/lib/recurring";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const PatchSchema = z.object({ active: z.boolean() });

/** PATCH /api/recurring/:id — pause / resume. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const owned = await prisma.recurringCampaign.findFirst({ where: { id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const campaign = await prisma.recurringCampaign.update({
    where: { id },
    data: { active: parsed.data.active },
  });

  if (campaign.active) await upsertSchedule(campaign.id, campaign.cron);
  else await removeSchedule(campaign.id);

  void audit(claims.sub, campaign.active ? "campaign.resumed" : "campaign.paused", campaign.name);
  return NextResponse.json({ ok: true, active: campaign.active });
}

/** DELETE /api/recurring/:id */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const campaign = await prisma.recurringCampaign.findFirst({ where: { id }, select: { name: true } });
  const r = await prisma.recurringCampaign.delete({ where: { id } }).catch(() => null);
  if (r) {
    await removeSchedule(id);
    void audit(claims.sub, "campaign.deleted", campaign?.name ?? id);
  }
  return NextResponse.json({ ok: true });
}
