import SidebarLayout from "@/components/SidebarLayout";
import InboxClient from "@/components/InboxClient";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <SidebarLayout>
      <header className="dash-head reveal" style={{ marginBottom: 18 }}>
        <div>
          <p className="eyebrow">Conversations</p>
          <h1>Inbox</h1>
          <p className="dash-status">
            Reply free-form within 24 hours of a contact&apos;s message — after that, an approved template re-opens the window.
          </p>
        </div>
      </header>
      <InboxClient />
    </SidebarLayout>
  );
}
