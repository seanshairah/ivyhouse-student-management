"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { settlePayment } from "@/services/payments";
import { requestRenewal } from "@/services/applications";
import { notifyOwners } from "@/services/notifications";
import { generateReference } from "@/lib/utils";
import { serviceRequestSchema } from "@/lib/validators";
import {
  NotificationChannel,
  MessageStatus,
  ServiceRequestCategory,
  ServiceRequestPriority,
} from "@prisma/client";

type ActionResult = { success: boolean; error?: string };

async function getProfile(userId: string) {
  return prisma.studentProfile.findUnique({ where: { userId } });
}

/** Request to renew / extend the stay for the coming term. */
export async function requestRenewalAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  try {
    const profile = await getProfile(session.userId);
    if (!profile) throw new Error("Student profile not found");
    if (!profile.roomId) {
      throw new Error("You don't have an active room to renew yet.");
    }
    const roomId = String(formData.get("roomId") || profile.roomId);
    const requestedTerm = String(formData.get("requestedTerm") || "").trim();
    if (!requestedTerm) throw new Error("Please enter the term you're renewing for.");
    const notes = String(formData.get("notes") || "").trim() || undefined;

    await requestRenewal({
      studentProfileId: profile.id,
      roomId,
      requestedTerm,
      notes,
    });
    revalidatePath("/student/room");
    revalidatePath("/student");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Mock "Pay now" — settle the payment immediately (idempotent). */
export async function payNowAction(reference: string): Promise<ActionResult> {
  await requireRole("STUDENT");
  if (!reference) return { success: false, error: "Missing payment reference" };
  try {
    await settlePayment(reference);
    revalidatePath("/student/payments");
    revalidatePath("/student");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Verify/settle the payment on the return page. Idempotent. */
export async function confirmPaymentReturn(
  reference: string,
): Promise<ActionResult> {
  await requireRole("STUDENT");
  if (!reference) return { success: false, error: "Missing payment reference" };
  try {
    await settlePayment(reference);
    revalidatePath("/student/payments");
    revalidatePath("/student");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Update editable contact + next-of-kin fields only. */
export async function updateProfileAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  try {
    const profile = await getProfile(session.userId);
    if (!profile) return { success: false, error: "Profile not found" };

    const str = (k: string) => {
      const v = formData.get(k);
      return typeof v === "string" ? v.trim() : "";
    };

    const phone = str("phone");
    const email = str("email");
    if (phone.length < 7) return { success: false, error: "Enter a valid phone number" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return { success: false, error: "Enter a valid email" };

    await prisma.studentProfile.update({
      where: { id: profile.id },
      data: {
        phone,
        email,
        nextOfKinName: str("nextOfKinName") || null,
        nextOfKinPhone: str("nextOfKinPhone") || null,
        nextOfKinRelation: str("nextOfKinRelation") || null,
        guardianName: str("guardianName") || null,
        guardianPhone: str("guardianPhone") || null,
      },
    });

    revalidatePath("/student/profile");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Submit a maintenance / service request for the student's house. */
export async function submitServiceRequestAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  try {
    const profile = await getProfile(session.userId);
    if (!profile) return { success: false, error: "Profile not found" };

    const parsed = serviceRequestSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description"),
      category: formData.get("category"),
      priority: formData.get("priority"),
      houseId: formData.get("houseId") || profile.houseId || "",
    });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const reference = generateReference("SRV");
    const request = await prisma.serviceRequest.create({
      data: {
        reference,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category as ServiceRequestCategory,
        priority: parsed.data.priority as ServiceRequestPriority,
        houseId: parsed.data.houseId || profile.houseId || null,
        studentProfileId: profile.id,
      },
    });

    await notifyOwners({
      title: "New service request",
      body: `${profile.fullName} submitted "${parsed.data.title}".`,
      type: "service_request",
      link: "/owner/services",
      relatedType: "ServiceRequest",
      relatedId: request.id,
    }).catch(() => undefined);

    revalidatePath("/student/profile");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Send a message to the owner (logged + notification). */
export async function messageOwnerAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  try {
    const profile = await getProfile(session.userId);
    const subject =
      (formData.get("subject") as string | null)?.trim() || "Message from student";
    const body = (formData.get("body") as string | null)?.trim() || "";
    if (body.length < 2)
      return { success: false, error: "Please write a short message" };

    await prisma.messageLog.create({
      data: {
        channel: NotificationChannel.DASHBOARD,
        recipient: "owner",
        recipientName: "House Owner",
        subject,
        body,
        status: MessageStatus.SENT,
        senderId: session.userId,
        relatedType: "StudentProfile",
        relatedId: profile?.id,
      },
    });

    await notifyOwners({
      title: `Message from ${session.name}`,
      body: `${subject}: ${body.slice(0, 140)}`,
      type: "message",
      link: "/owner/messages",
      relatedType: "StudentProfile",
      relatedId: profile?.id,
    }).catch(() => undefined);

    revalidatePath("/student/messages");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
