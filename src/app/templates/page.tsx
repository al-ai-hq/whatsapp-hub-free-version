import SidebarLayout from "@/components/SidebarLayout";
import TemplatesManager from "@/components/TemplatesManager";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  return (
    <SidebarLayout>
      <h1>Templates</h1>
      <p className="note" style={{ marginBottom: 16 }}>
        Create a WhatsApp message template and submit it to Meta for approval. Approved templates become
        available when sending a broadcast. New submissions stay <strong>PENDING</strong> until Meta reviews them.
      </p>
      <TemplatesManager />
    </SidebarLayout>
  );
}
