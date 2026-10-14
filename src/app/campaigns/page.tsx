import SidebarLayout from "@/components/SidebarLayout";
import CampaignsManager from "@/components/CampaignsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [lists, templates] = await Promise.all([
    prisma.contactList.findMany({ where: { archived: false }, orderBy: { createdAt: "desc" } }),
    prisma.template.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <SidebarLayout>
      <h1>Recurring campaigns</h1>
      <p className="note" style={{ marginBottom: 16 }}>
        Drip/recurring sends. Each tick creates a fresh broadcast from the template + list, honoring opt-outs. Schedules run in UTC.
      </p>
      <CampaignsManager lists={lists} templates={templates} />
    </SidebarLayout>
  );
}
