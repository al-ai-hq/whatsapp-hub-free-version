import { prisma } from "./db";

/**
 * Capture the current membership of a contact list as a restorable snapshot.
 * For automatic "pre-import" snapshots an empty list is skipped (nothing to
 * back up); a manual snapshot of an empty list is allowed.
 */
export async function snapshotList(
  listId: string,
  reason: "manual" | "pre-import",
): Promise<{ id: string; memberCount: number } | null> {
  const list = await prisma.contactList.findUnique({
    where: { id: listId },
    include: { memberships: { select: { contactId: true } } },
  });
  if (!list) return null;

  const memberIds = list.memberships.map((m) => m.contactId);
  if (memberIds.length === 0 && reason === "pre-import") return null;

  const snap = await prisma.contactListSnapshot.create({
    data: { listId, listName: list.name, memberIds, memberCount: memberIds.length, reason },
  });
  return { id: snap.id, memberCount: memberIds.length };
}

export interface RestoreResult { ok: boolean; restored: number; missing: number; error?: string }

/**
 * Restore a list's membership to a snapshot: replace the current members with
 * the snapshot's, skipping any contacts that have since been deleted.
 */
export async function restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
  const snap = await prisma.contactListSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snap) return { ok: false, restored: 0, missing: 0, error: "snapshot not found" };

  const ids = Array.isArray(snap.memberIds)
    ? snap.memberIds.filter((x): x is string => typeof x === "string")
    : [];

  // Only re-add contacts that still exist.
  const existing = await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existingIds = existing.map((c) => c.id);
  const missing = ids.length - existingIds.length;

  await prisma.$transaction([
    prisma.contactListMembership.deleteMany({ where: { listId: snap.listId } }),
    prisma.contactListMembership.createMany({
      data: existingIds.map((contactId) => ({ contactId, listId: snap.listId })),
      skipDuplicates: true,
    }),
  ]);

  return { ok: true, restored: existingIds.length, missing };
}
