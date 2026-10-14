/** Things that point at a contact list and must be cleared before it can go. */
export interface ListReferences {
  broadcasts: number;
  campaigns: number;
}

/**
 * Why a contact list cannot be deleted, or null when it can.
 *
 * `Broadcast.listId` is FK-restricted in the schema (send history must keep its
 * list name), and `RecurringCampaign.listId` is a plain id with no FK — deleting
 * under either would fail at the database or leave the scheduler firing at a
 * list that no longer exists. Memberships and snapshots cascade, so they never
 * block; the contacts themselves are never touched.
 */
export function listDeleteBlockReason(name: string, refs: ListReferences): string | null {
  const parts: string[] = [];
  if (refs.broadcasts > 0) parts.push(`${refs.broadcasts} broadcast${refs.broadcasts === 1 ? "" : "s"}`);
  if (refs.campaigns > 0) parts.push(`${refs.campaigns} recurring campaign${refs.campaigns === 1 ? "" : "s"}`);
  if (parts.length === 0) return null;
  return `"${name}" is still used by ${parts.join(" and ")}, which keep it in their history. Archive it instead — it disappears from every picker and the list page, and the history stays intact.`;
}
