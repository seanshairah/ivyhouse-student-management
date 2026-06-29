"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { notifyOwners } from "@/services/notifications";
import {
  NotificationChannel,
  MessageStatus,
  ServiceRequestStatus,
} from "@prisma/client";

type ActionResult = { success: boolean; error?: string };

const VALID_STATUSES = new Set<string>([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
]);

/** Update a service request status (and optional resolution notes). */
export async function updateTaskStatusAction(
  id: string,
  status: string,
  notes?: string,
): Promise<ActionResult> {
  await requireRole("CARETAKER");
  if (!id) return { success: false, error: "Missing request id" };
  if (!VALID_STATUSES.has(status))
    return { success: false, error: "Invalid status" };

  try {
    const isResolved =
      status === "RESOLVED" || status === "CLOSED";
    const request = await prisma.serviceRequest.update({
      where: { id },
      data: {
        status: status as ServiceRequestStatus,
        resolutionNotes: notes?.trim() || undefined,
        resolvedAt: isResolved ? new Date() : null,
      },
      include: { studentProfile: true },
    });

    await notifyOwners({
      title: "Service request updated",
      body: `"${request.title}" is now ${status.replace("_", " ").toLowerCase()}.`,
      type: "service_request",
      link: "/owner/services",
      relatedType: "ServiceRequest",
      relatedId: request.id,
    }).catch(() => undefined);

    // Notify the student who raised it.
    if (request.studentProfile?.userId) {
      await prisma.notification.create({
        data: {
          userId: request.studentProfile.userId,
          title: "Request update",
          body: `Your request "${request.title}" is now ${status
            .replace("_", " ")
            .toLowerCase()}.`,
          channel: NotificationChannel.DASHBOARD,
          type: "service_request",
          link: "/student/profile",
          relatedType: "ServiceRequest",
          relatedId: request.id,
        },
      }).catch(() => undefined);
    }

    revalidatePath("/caretaker/services");
    revalidatePath("/caretaker");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Send a note to the owner from the caretaker. */
export async function noteToOwnerAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("CARETAKER");
  try {
    const subject =
      (formData.get("subject") as string | null)?.trim() || "Note from caretaker";
    const body = (formData.get("body") as string | null)?.trim() || "";
    if (body.length < 2)
      return { success: false, error: "Please write a short note" };

    await prisma.messageLog.create({
      data: {
        channel: NotificationChannel.DASHBOARD,
        recipient: "owner",
        recipientName: "House Owner",
        subject,
        body,
        status: MessageStatus.SENT,
        senderId: session.userId,
      },
    });

    await notifyOwners({
      title: `Note from ${session.name}`,
      body: `${subject}: ${body.slice(0, 140)}`,
      type: "message",
      link: "/owner/messages",
    }).catch(() => undefined);

    revalidatePath("/caretaker/messages");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
