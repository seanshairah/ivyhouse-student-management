"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { NotificationChannel } from "@prisma/client";
import { sendMessage } from "@/services/messaging";
import { audit } from "@/services/audit";
import type { ActionResult } from "@/types";

/**
 * Broadcast from the caretaker to every current student in their house —
 * water's off this afternoon, rent due Friday, gate locks at ten. Email and
 * SMS both go through the platform's logged senders, so every attempt is
 * visible to the owner afterwards, delivered or not.
 */
export async function caretakerNotifyHouse(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireRole(["CARETAKER", "OWNER"]);
    const caretaker = await prisma.caretaker.findFirst({
      where: { OR: [{ userId: session.userId }, { email: session.email }] },
      select: { houseId: true },
    });

    const body = String(formData.get("body") || "").trim();
    const subject =
      String(formData.get("subject") || "").trim() ||
      "A notice from your caretaker";
    const viaEmail = String(formData.get("viaEmail") || "") === "on";
    const viaSms = String(formData.get("viaSms") || "") === "on";
    const onlyOwing = String(formData.get("onlyOwing") || "") === "on";

    if (!body) return { success: false, error: "Write a message first." };
    if (!viaEmail && !viaSms) {
      return { success: false, error: "Pick at least one channel." };
    }

    const students = await prisma.studentProfile.findMany({
      where: {
        ...(caretaker?.houseId ? { houseId: caretaker.houseId } : {}),
        status: { notIn: ["ARCHIVED", "MOVED_OUT"] },
      },
      include: {
        charges: {
          where: { status: "OUTSTANDING" },
          select: { amount: true, allocations: { select: { amount: true } } },
        },
      },
    });

    const recipients = students
      .filter((s) => {
        if (!onlyOwing) return true;
        const owing = s.charges.reduce((sum, c) => {
          const alloc = c.allocations.reduce((a, x) => a + Number(x.amount), 0);
          return sum + Math.max(0, Number(c.amount) - alloc);
        }, 0);
        return owing > 0;
      })
      .map((s) => ({ name: s.fullName, email: s.email, phone: s.phone }));

    if (!recipients.length) {
      return { success: false, error: "Nobody matches that selection." };
    }

    const channels: NotificationChannel[] = [];
    if (viaEmail) channels.push(NotificationChannel.EMAIL);
    if (viaSms) channels.push(NotificationChannel.SMS);

    const res = await sendMessage({ channels, recipients, subject, body });

    await audit({
      action: "caretaker.house_notified",
      userId: session.userId,
      metadata: {
        subject,
        recipients: recipients.length,
        onlyOwing,
        emailSent: res.emailSent,
        smsSent: res.smsSent,
        failed: res.failed,
      },
    });

    return {
      success: true,
      message:
        `Sent to ${recipients.length} student${recipients.length === 1 ? "" : "s"} — ` +
        `${res.emailSent} email${res.emailSent === 1 ? "" : "s"}, ${res.smsSent} SMS delivered` +
        (res.failed ? `, ${res.failed} failed (logged for the owner)` : "") +
        ".",
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
