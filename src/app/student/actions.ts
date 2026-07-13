"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createSelfPayment, pollAndSettle } from "@/services/payments";
import type { PaymentPurpose } from "@/constants";
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

/**
 * Verify a payment reference belongs to the signed-in student before we act on
 * it. Without this, a student could poll/settle another student's payment by
 * reference. Settlement always credits the payment's own owner, but this keeps
 * one student from touching another's payment at all.
 */
async function assertOwnsPayment(
  userId: string,
  reference: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { studentProfile: { select: { userId: true } } },
  });
  if (!payment) return { ok: false, error: "Payment not found" };
  if (payment.studentProfile.userId !== userId) {
    return { ok: false, error: "This payment isn't on your account." };
  }
  return { ok: true };
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

/**
 * "Pay now" from the checkout page. Verifies the payment against Paynow
 * (poll URL) before settling — in development this auto-approves the mock;
 * in live it only settles once Paynow reports the payment as paid.
 */
export async function payNowAction(reference: string): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  if (!reference) return { success: false, error: "Missing payment reference" };
  try {
    const owns = await assertOwnsPayment(session.userId, reference);
    if (!owns.ok) return { success: false, error: owns.error };
    const r = await pollAndSettle(reference);
    revalidatePath("/student/payments");
    revalidatePath("/student");
    if (r.status === "paid") return { success: true };
    return {
      success: false,
      error:
        r.status === "failed"
          ? r.message || "The payment failed or was cancelled."
          : "We're still confirming this payment. Please wait a moment and refresh.",
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export interface InitiatePaymentResult {
  success: boolean;
  error?: string;
  reference?: string;
  redirectUrl?: string;
  instructions?: string;
  amount?: number;
}

/**
 * Student-initiated payment for rent (month/semester) or transport, via
 * EcoCash Express (phone prompt) or a web redirect. Amount is computed
 * server-side from the purpose.
 */
export async function initiateSelfPaymentAction(input: {
  purpose: PaymentPurpose;
  method: "ecocash" | "web";
  phone?: string;
}): Promise<InitiatePaymentResult> {
  const session = await requireRole("STUDENT");
  try {
    const profile = await getProfile(session.userId);
    if (!profile) return { success: false, error: "Profile not found" };
    if (!["RENT_MONTH", "RENT_SEMESTER", "TRANSPORT"].includes(input.purpose)) {
      return { success: false, error: "Invalid payment type" };
    }
    const r = await createSelfPayment({
      profileId: profile.id,
      purpose: input.purpose,
      method: input.method,
      phone: input.phone,
    });
    if (!r.ok) return { success: false, error: r.error, reference: r.reference };
    revalidatePath("/student/payments");
    return {
      success: true,
      reference: r.reference,
      redirectUrl: r.redirectUrl,
      instructions: r.instructions,
      amount: r.amount,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Poll an in-flight payment (EcoCash Express) and settle it once paid. */
export async function pollPaymentAction(
  reference: string,
): Promise<{ status: "paid" | "pending" | "failed"; message?: string }> {
  const session = await requireRole("STUDENT");
  if (!reference) return { status: "failed", message: "Missing reference" };
  try {
    const owns = await assertOwnsPayment(session.userId, reference);
    if (!owns.ok) return { status: "failed", message: owns.error };
    const r = await pollAndSettle(reference);
    if (r.status === "paid") {
      revalidatePath("/student/payments");
      revalidatePath("/student");
    }
    return r;
  } catch (e) {
    return { status: "pending", message: (e as Error).message };
  }
}

/** Verify/settle the payment on the return page. Idempotent. */
export async function confirmPaymentReturn(
  reference: string,
): Promise<ActionResult> {
  const session = await requireRole("STUDENT");
  if (!reference) return { success: false, error: "Missing payment reference" };
  try {
    const owns = await assertOwnsPayment(session.userId, reference);
    if (!owns.ok) return { success: false, error: owns.error };
    // Verify with Paynow before settling — a browser landing on the return URL
    // is not proof of payment. pollAndSettle checks the provider poll URL.
    const r = await pollAndSettle(reference);
    revalidatePath("/student/payments");
    revalidatePath("/student");
    return { success: r.status === "paid", error: r.status === "paid" ? undefined : r.message };
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
