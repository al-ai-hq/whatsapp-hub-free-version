import SidebarLayout from "@/components/SidebarLayout";
import ListsManager from "@/components/ListsManager";

export const dynamic = "force-dynamic";

export default function ListsPage() {
  return (
    <SidebarLayout>
      <h1>Contact lists</h1>
      <p className="note" style={{ marginBottom: 16 }}>
        Each list keeps restorable snapshots of its membership. A snapshot is taken automatically before a
        CSV import, and you can take one anytime — then roll back with one click. Deleting a list removes its
        snapshots but keeps every contact in your address book — and once a list has been broadcast to,
        archive it instead: it leaves every picker while its sends keep their history.
      </p>
      <ListsManager />
    </SidebarLayout>
  );
}
