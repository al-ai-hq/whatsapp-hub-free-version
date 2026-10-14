import { NextRequest, NextResponse } from "next/server";
import { CreateRecurringSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { upsertSchedule } from "@/lib/recurring";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** GET /api/recurring — list campaigns with template/list names. */
export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const campaigns = await prisma.recurringCampaign.findMany({ orderBy: { createdAt: "desc" } });
  const [templates, lists] = await Promise.all([
    prisma.template.findMany({ select: { id: true, name: true } }),
    prisma.contactList.findMany({ where: { archived: false }, select: { id: true, name: true } }),
  ]);
  const tName = new Map(templates.map((t) => [t.id, t.name]));
  const lName = new Map(lists.map((l) => [l.id, l.name]));

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, cron: c.cron, active: c.active,
      templateName: tName.get(c.templateId) ?? "(deleted)",
      listName: lName.get(c.listId) ?? "(deleted)",
      lastRunAt: c.lastRunAt,
    })),
  });
}

/** POST /api/recurring — create a campaign and register its cron schedule. */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateRecurringSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { name, templateId, listId, cron, variableMap } = parsed.data;

  const template = await prisma.template.findFirst({ where: { id: templateId } });
  if (!template || template.status !== "APPROVED") {
    return NextResponse.json({ error: "template not approved" }, { status: 422 });
  }

  const list = await prisma.contactList.findFirst({ where: { id: listId, archived: false }, select: { id: true } });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });

  const campaign = await prisma.recurringCampaign.create({
    data: { name, templateId, listId, cron, variableMap, active: true },
  });
  await upsertSchedule(campaign.id, cron);

  void audit(claims.sub, "campaign.created", name, { cron, templateId, listId });
  return NextResponse.json({ campaign: { id: campaign.id, name: campaign.name } }, { status: 201 });
}
