"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  ChargeCategory,
  PaymentMethod,
  RoomStatus,
  StudentStatus,
  NotificationChannel,
} from "@prisma/client";
import { recordOfficePayment } from "@/core/billing/office-payment";
import { createStudentAccount, sendStudentCredentials } from "@/services/credentials";
import { sendMessage } from "@/services/messaging";
import { audit } from "@/services/audit";
import type { ActionResult } from "@/types";

/**
 * Which students this caretaker is allowed to touch.
 *
 * A caretaker assigned to a house manages that house only. One with no house
 * assignment manages everything — small operations run exactly like that, one
 * caretaker across the whole portfolio, and scoping them to nothing would make
 * the entire dashboard read-only for the person it was built for.
 */
async function caretakerScope() {
  const session = await requireRole(["CARETAKER", "OWNER"]);
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { id: true, name: true, houseId: true },
  });
  return {
    session,
    caretaker,
    houseFilter: caretaker?.houseId ? { houseId: caretaker.houseId } : {},
  };
}

async function assertInScope(studentProfileId: string) {
  const { houseFilter, session, caretaker } = await caretakerScope();
  const student = await prisma.studentProfile.findFirst({
    where: { id: studentProfileId, ...houseFilter },
    include: { room: true, user: { select: { id: true } } },
  });
  if (!student) throw new Error("That student is not in your house.");
  return { student, session, caretaker };
}

/** Record cash (or transfer/EcoCash) handed to the caretaker, with a receipt. */
export async function caretakerRecordPayment(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profileId = String(formData.get("studentProfileId") || "");
    const amount = Number(formData.get("amount") || 0);
    const category =
      String(formData.get("category") || "RENT") === "TRANSPORT"
        ? ChargeCategory.TRANSPORT
        : ChargeCategory.RENT;
    const methodRaw = String(formData.get("method") || "CASH");
    const method =
      methodRaw === "BANK_TRANSFER"
        ? PaymentMethod.BANK_TRANSFER
        : methodRaw === "MANUAL"
          ? PaymentMethod.MANUAL
          : PaymentMethod.CASH;
    if (!profileId) return { success: false, error: "Missing student." };
    if (!(amount > 0) || amount > 10000) {
      return { success: false, error: "Enter an amount between $1 and $10,000." };
    }

    const { student, session } = await assertInScope(profileId);
    const result = await recordOfficePayment({
      studentProfileId: profileId,
      amount,
      category,
      method,
    });

    await audit({
      action: "caretaker.payment_recorded",
      entityType: "Payment",
      entityId: result.paymentId,
      userId: session.userId,
      metadata: {
        student: student.fullName,
        amount,
        category,
        method: methodRaw,
        receipt: result.receiptNumber,
        credit: result.credit,
      },
    });

    revalidatePath("/caretaker/students");
    revalidatePath("/owner/payments");
    return {
      success: true,
      message:
        `Recorded $${amount.toFixed(2)} for ${student.fullName} — receipt ${result.receiptNumber}.` +
        (result.credit > 0
          ? ` $${result.credit.toFixed(2)} is credit beyond what was outstanding.`
          : ""),
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Add a student: account + optional room + optional deposit, credentials sent. */
export async function caretakerAddStudent(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { caretaker, session } = await caretakerScope();
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const roomId = String(formData.get("roomId") || "") || null;
    const deposit = Number(formData.get("deposit") || 0);
    const sendCreds = String(formData.get("sendCredentials") || "") === "on";

    if (!fullName) return { success: false, error: "Full name is required." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, error: "Enter a valid email address." };
    }

    let room = null;
    if (roomId) {
      room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return { success: false, error: "That room no longer exists." };
      if (caretaker?.houseId && room.houseId !== caretaker.houseId) {
        return { success: false, error: "That room is not in your house." };
      }
      if (room.occupied >= room.capacity) {
        return { success: false, error: `Room ${room.number} is already full.` };
      }
    }

    // The rest of the student's file, captured at creation so the office
    // never has to chase it later.
    const details = {
      nationalId: String(formData.get("nationalId") || "").trim() || null,
      institution: String(formData.get("institution") || "").trim() || null,
      program: String(formData.get("program") || "").trim() || null,
      yearOfStudy: String(formData.get("yearOfStudy") || "").trim() || null,
      nextOfKinName: String(formData.get("nextOfKinName") || "").trim() || null,
      nextOfKinPhone: String(formData.get("nextOfKinPhone") || "").trim() || null,
      nextOfKinRelation: String(formData.get("nextOfKinRelation") || "").trim() || null,
    };

    // This platform's account routine places the student in the (single)
    // house itself; the room placement is ours to do afterwards.
    const created = await createStudentAccount({
      fullName,
      email,
      phone: phone || null,
      deposit: deposit > 0 ? deposit : undefined,
    });

    await prisma.$transaction(async (tx) => {
      await tx.studentProfile.update({
        where: { id: created.studentProfileId },
        data: {
          status: StudentStatus.ACTIVE,
          ...details,
          ...(room ? { roomId: room.id, houseId: room.houseId } : {}),
        },
      });
      if (room) {
        const updated = await tx.room.update({
          where: { id: room.id },
          data: { occupied: { increment: 1 } },
        });
        await tx.room.update({
          where: { id: room.id },
          data: {
            status:
              updated.occupied >= updated.capacity
                ? RoomStatus.OCCUPIED
                : RoomStatus.RESERVED,
          },
        });
      }
    });

    let sent = "";
    if (sendCreds) {
      const r = await sendStudentCredentials(created.studentProfileId);
      sent = r.email || r.sms
        ? ` Login details sent${r.email ? " by email" : ""}${r.sms ? " and SMS" : ""}.`
        : " Login details could NOT be delivered — send them again from the owner dashboard once email/SMS is fixed.";
    }

    await audit({
      action: "caretaker.student_added",
      entityType: "StudentProfile",
      entityId: created.studentProfileId,
      userId: session.userId,
      metadata: { fullName, email, roomId, deposit },
    });

    revalidatePath("/caretaker/students");
    revalidatePath("/owner/students");
    return { success: true, message: `${fullName} added.${sent}` };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Remove a student from the system: free their room, mark them moved out and
 * disable their login. Deliberately NOT a delete — their payment history and
 * receipts must survive them leaving, both for the owner's books and for any
 * later dispute about money.
 */
export async function caretakerRemoveStudent(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profileId = String(formData.get("studentProfileId") || "");
    if (!profileId) return { success: false, error: "Missing student." };
    const { student, session } = await assertInScope(profileId);

    await prisma.$transaction(async (tx) => {
      if (student.roomId) {
        const room = await tx.room.update({
          where: { id: student.roomId },
          data: { occupied: { decrement: 1 } },
        });
        await tx.room.update({
          where: { id: student.roomId },
          data: {
            occupied: Math.max(0, room.occupied),
            status:
              Math.max(0, room.occupied) === 0
                ? RoomStatus.AVAILABLE
                : RoomStatus.RESERVED,
          },
        });
      }
      await tx.studentProfile.update({
        where: { id: profileId },
        data: { status: StudentStatus.MOVED_OUT, roomId: null },
      });
      await tx.user.update({
        where: { id: student.user.id },
        data: { isActive: false },
      });
    });

    await audit({
      action: "caretaker.student_removed",
      entityType: "StudentProfile",
      entityId: profileId,
      userId: session.userId,
      metadata: { fullName: student.fullName, room: student.room?.number },
    });

    revalidatePath("/caretaker/students");
    revalidatePath("/owner/students");
    return {
      success: true,
      message: `${student.fullName} moved out — room freed, login disabled. Payment history kept.`,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Send an email and/or SMS to one student. */
export async function caretakerNotifyStudent(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profileId = String(formData.get("studentProfileId") || "");
    const body = String(formData.get("body") || "").trim();
    const subject =
      String(formData.get("subject") || "").trim() || "Message from your caretaker";
    const viaEmail = String(formData.get("viaEmail") || "") === "on";
    const viaSms = String(formData.get("viaSms") || "") === "on";
    if (!body) return { success: false, error: "Write a message first." };
    if (!viaEmail && !viaSms) {
      return { success: false, error: "Pick at least one channel." };
    }

    const { student, session } = await assertInScope(profileId);
    const channels: NotificationChannel[] = [];
    if (viaEmail) channels.push(NotificationChannel.EMAIL);
    if (viaSms) channels.push(NotificationChannel.SMS);

    const res = await sendMessage({
      channels,
      recipients: [
        { name: student.fullName, email: student.email, phone: student.phone },
      ],
      subject,
      body,
    });

    await audit({
      action: "caretaker.student_notified",
      entityType: "StudentProfile",
      entityId: profileId,
      userId: session.userId,
      metadata: { subject, emailSent: res.emailSent, smsSent: res.smsSent },
    });

    const delivered = [
      res.emailSent ? "email" : null,
      res.smsSent ? "SMS" : null,
    ].filter(Boolean);
    return delivered.length
      ? { success: true, message: `Sent by ${delivered.join(" + ")}.` }
      : {
          success: false,
          error:
            "Neither channel delivered — email/SMS provider needs attention. The attempt was logged.",
        };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
