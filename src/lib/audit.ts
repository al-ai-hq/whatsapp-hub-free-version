import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Append an audit-log entry. Best-effort: never throws.
 */
export async function audit(
  actor: string,
  action: string,
  target?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor,
        action,
        target: target ?? null,
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record ${action}:`, err instanceof Error ? err.message : err);
  }
}
