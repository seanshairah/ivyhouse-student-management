import { prisma } from "@/lib/prisma";
import { NotificationChannel, UserRole } from "@prisma/client";

export interface DashboardNotificationInput {
  userId?: string;
  audience?: UserRole;
  title: string;
  body: string;
  type?: string;
  link?: string;
  relatedType?: string;
  relatedId?: string;
}

/** Create an in-app dashboard notification. */
export async function notifyDashboard(input: DashboardNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      audience: input.audience,
      title: input.title,
      body: input.body,
      channel: NotificationChannel.DASHBOARD,
      type: input.type,
      link: input.link,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
  });
}

/** Notify all owners (used when a new application arrives, etc.). */
export async function notifyOwners(
  input: Omit<DashboardNotificationInput, "userId" | "audience">,
) {
  const owners = await prisma.user.findMany({
    where: { role: UserRole.OWNER, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    owners.map((o) =>
      notifyDashboard({ ...input, userId: o.id, audience: UserRole.OWNER }),
    ),
  );
}

export async function markNotificationRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}
