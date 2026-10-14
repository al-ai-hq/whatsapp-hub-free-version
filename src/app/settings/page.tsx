import SidebarLayout from "@/components/SidebarLayout";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import WhatsAppSetup from "@/components/WhatsAppSetup";
import RedirectsManager from "@/components/RedirectsManager";
import AuditLogViewer from "@/components/AuditLogViewer";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <SidebarLayout>
      <h1>Settings</h1>

      <h2 style={{ marginTop: 32 }}>WhatsApp connection</h2>
      <WhatsAppSetup />

      <h2 id="my-account" className="anchor-target" style={{ marginTop: 32 }}>My account</h2>
      <div className="grid-forms">
        <ChangePasswordForm />
      </div>

      <RedirectsManager />
      <AuditLogViewer />
    </SidebarLayout>
  );
}
