import { prisma } from "@/lib/prisma";

export interface AuditInput {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Record an audit log entry. Never throws — auditing must not break flows. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        actorEmail: input.actorEmail ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata as object) ?? undefined,
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
