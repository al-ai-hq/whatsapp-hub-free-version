import SidebarLayout from "@/components/SidebarLayout";
import ContactsTable from "@/components/ContactsTable";
import AddContactForm from "@/components/AddContactForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const lists = await prisma.contactList.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <SidebarLayout>
      <header className="dash-head reveal">
        <div>
          <p className="eyebrow">Audience</p>
          <h1>Contacts</h1>
          <p className="dash-status">
            Opted-out numbers are excluded from every broadcast, automatically.
          </p>
        </div>
      </header>

      <section className="dash-section reveal d1" style={{ marginTop: 4 }}>
        <p className="eyebrow">Add a contact</p>
        <h2>One number, or import a CSV</h2>
      </section>
      <section className="grid-forms reveal d1" style={{ marginBottom: 20 }}>
        <AddContactForm lists={lists} />
      </section>

      <div className="card reveal d2" style={{ padding: 0, overflow: "hidden" }}>
        <ContactsTable />
      </div>
    </SidebarLayout>
  );
}
