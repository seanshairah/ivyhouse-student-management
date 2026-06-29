"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/services/audit";
import {
  approveApplication,
  rejectApplication,
  confirmMoveIn,
} from "@/services/applications";
import { settlePayment, generatePaymentLink } from "@/services/payments";
import { createInvoice } from "@/services/invoices";
import {
  resolveRecipients,
  sendMessage,
  type RecipientGroup,
} from "@/services/messaging";
import { roomSchema } from "@/lib/validators";
import {
  NotificationChannel,
  RoomStatus,
  StudentStatus,
  ServiceRequestStatus,
  ServiceRequestCategory,
  ServiceRequestPriority,
} from "@prisma/client";
import { generateReference } from "@/lib/utils";

type ActionResult = { success: boolean; error?: string };

function toList(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  return String(value)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─────────────────────────── Houses ───────────────────────────

export async function updateHouse(formData: FormData): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing house id");
    const imageUrl = String(formData.get("imageUrl") || "").trim();
    const images = toList(formData.get("images"));
    const house = await prisma.house.update({
      where: { id },
      data: {
        tagline: String(formData.get("tagline") || "") || null,
        description: String(formData.get("description") || ""),
        location: String(formData.get("location") || ""),
        imageUrl: imageUrl || images[0] || null,
        images,
        amenities: toList(formData.get("amenities")),
        services: toList(formData.get("services")),
        rules: toList(formData.get("rules")),
        safetyInfo: toList(formData.get("safetyInfo")),
      },
    });
    await audit({ action: "house.updated", entityType: "House", entityId: id });
    revalidatePath("/owner/houses");
    revalidatePath("/houses");
    revalidatePath(`/houses/${house.slug}`);
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ─────────────────────────── Rooms ────────────────────────────

export async function createRoom(formData: FormData): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const parsed = roomSchema.parse({
      houseId: formData.get("houseId"),
      number: formData.get("number"),
      name: formData.get("name") || "",
      type: formData.get("type"),
      capacity: formData.get("capacity"),
      price: formData.get("price"),
      status: formData.get("status"),
      floor: formData.get("floor") || "",
      description: formData.get("description") || "",
    });
    const room = await prisma.room.create({
      data: {
        houseId: parsed.houseId,
        number: parsed.number,
        name: parsed.name || null,
        type: parsed.type,
        capacity: parsed.capacity,
        price: parsed.price,
        status: parsed.status,
        floor: parsed.floor || null,
        description: parsed.description || null,
        images: toList(formData.get("images")),
      },
    });
    await audit({ action: "room.created", entityType: "Room", entityId: room.id });
    revalidatePath("/owner/rooms");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function updateRoom(formData: FormData): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing room id");
    const parsed = roomSchema.parse({
      houseId: formData.get("houseId"),
      number: formData.get("number"),
      name: formData.get("name") || "",
      type: formData.get("type"),
      capacity: formData.get("capacity"),
      price: formData.get("price"),
      status: formData.get("status"),
      floor: formData.get("floor") || "",
      description: formData.get("description") || "",
    });
    await prisma.room.update({
      where: { id },
      data: {
        houseId: parsed.houseId,
        number: parsed.number,
        name: parsed.name || null,
        type: parsed.type,
        capacity: parsed.capacity,
        price: parsed.price,
        status: parsed.status,
        floor: parsed.floor || null,
        description: parsed.description || null,
        images: toList(formData.get("images")),
      },
    });
    await audit({ action: "room.updated", entityType: "Room", entityId: id });
    revalidatePath("/owner/rooms");
    revalidatePath("/houses");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function changeRoomStatus(formData: FormData): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    const status = String(formData.get("status") || "") as RoomStatus;
    if (!id || !status) throw new Error("Missing fields");
    await prisma.room.update({ where: { id }, data: { status } });
    await audit({
      action: "room.status_changed",
      entityType: "Room",
      entityId: id,
      metadata: { status },
    });
    revalidatePath("/owner/rooms");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function archiveRoom(formData: FormData): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing room id");
    await prisma.room.update({
      where: { id },
      data: { status: RoomStatus.UNAVAILABLE },
    });
    await audit({ action: "room.archived", entityType: "Room", entityId: id });
    revalidatePath("/owner/rooms");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ─────────────────────── Applications ─────────────────────────

export async function approveApp(formData: FormData): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing application id");
    const roomId = String(formData.get("roomId") || "") || undefined;
    const amountRaw = String(formData.get("amount") || "");
    const amount = amountRaw ? Number(amountRaw) : undefined;
    await approveApplication(id, {
      actorId: session.userId,
      actorEmail: session.email,
      roomId,
      amount: Number.isFinite(amount as number) ? amount : undefined,
    });
    revalidatePath("/owner/applications");
    revalidatePath(`/owner/applications/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rejectApp(formData: FormData): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing application id");
    const reason = String(formData.get("reason") || "") || undefined;
    await rejectApplication(id, {
      actorId: session.userId,
      actorEmail: session.email,
      reason,
    });
    revalidatePath("/owner/applications");
    revalidatePath(`/owner/applications/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function confirmMoveInAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing application id");
    await confirmMoveIn(id);
    await audit({
      userId: session.userId,
      actorEmail: session.email,
      action: "application.moved_in",
      entityType: "Application",
      entityId: id,
    });
    revalidatePath("/owner/applications");
    revalidatePath(`/owner/applications/${id}`);
    revalidatePath("/owner/rooms");
    revalidatePath("/owner");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function requestInfo(formData: FormData): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    const message = String(formData.get("message") || "");
    if (!id || !message) throw new Error("Missing fields");
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new Error("Application not found");
    await sendMessage({
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      recipients: [{ name: app.fullName, email: app.email, phone: app.phone }],
      subject: "More information needed for your application",
      body: message,
      senderId: session.userId,
      relatedType: "Application",
      relatedId: id,
    });
    // Only nudge undecided applications back to "awaiting review"; never rewind
    // an already-decided one. Append the note rather than overwriting history.
    const isUndecided = app.status === "NEW" || app.status === "AWAITING_REVIEW";
    await prisma.application.update({
      where: { id },
      data: {
        status: isUndecided ? "AWAITING_REVIEW" : app.status,
        reviewNotes: [app.reviewNotes, message].filter(Boolean).join("\n—\n"),
      },
    });
    await audit({
      userId: session.userId,
      actorEmail: session.email,
      action: "application.info_requested",
      entityType: "Application",
      entityId: id,
    });
    revalidatePath(`/owner/applications/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function sendApplicantMessage(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    const subject = String(formData.get("subject") || "Message from Ivy House");
    const body = String(formData.get("body") || "");
    if (!id || !body) throw new Error("Message body is required");
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new Error("Application not found");
    await sendMessage({
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      recipients: [{ name: app.fullName, email: app.email, phone: app.phone }],
      subject,
      body,
      senderId: session.userId,
      relatedType: "Application",
      relatedId: id,
    });
    revalidatePath(`/owner/applications/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ───────────────────────── Students ───────────────────────────

export async function createStudentInvoice(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const studentProfileId = String(formData.get("studentProfileId") || "");
    const description = String(formData.get("description") || "");
    const amount = Number(formData.get("amount") || 0);
    const generateLink = String(formData.get("generateLink") || "") === "on";
    if (!studentProfileId || !description || !amount) {
      throw new Error("All invoice fields are required");
    }
    const settings = await prisma.settings.findUnique({
      where: { id: "singleton" },
    });
    const invoice = await createInvoice({
      studentProfileId,
      description,
      amount,
      dueInDays: settings?.paymentTermsDays ?? 7,
    });
    if (generateLink) {
      await generatePaymentLink(invoice.id);
    }
    await audit({
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { amount, generateLink },
    });
    revalidatePath(`/owner/students/${studentProfileId}`);
    revalidatePath("/owner/invoices");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function moveStudentRoom(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const studentProfileId = String(formData.get("studentProfileId") || "");
    const roomId = String(formData.get("roomId") || "");
    if (!studentProfileId || !roomId) throw new Error("Missing fields");
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error("Room not found");
    await prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { roomId, houseId: room.houseId },
    });
    await audit({
      action: "student.room_moved",
      entityType: "StudentProfile",
      entityId: studentProfileId,
      metadata: { roomId },
    });
    revalidatePath(`/owner/students/${studentProfileId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function archiveStudent(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const studentProfileId = String(formData.get("studentProfileId") || "");
    if (!studentProfileId) throw new Error("Missing student id");
    await prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { status: StudentStatus.ARCHIVED },
    });
    await audit({
      action: "student.archived",
      entityType: "StudentProfile",
      entityId: studentProfileId,
    });
    revalidatePath("/owner/students");
    revalidatePath(`/owner/students/${studentProfileId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function changeStudentStatus(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const studentProfileId = String(formData.get("studentProfileId") || "");
    const status = String(formData.get("status") || "") as StudentStatus;
    if (!studentProfileId || !status) throw new Error("Missing fields");
    await prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { status },
    });
    await audit({
      action: "student.status_changed",
      entityType: "StudentProfile",
      entityId: studentProfileId,
      metadata: { status },
    });
    revalidatePath("/owner/students");
    revalidatePath(`/owner/students/${studentProfileId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function contactStudent(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const studentProfileId = String(formData.get("studentProfileId") || "");
    const target = String(formData.get("target") || "student"); // student | nextOfKin
    const subject = String(formData.get("subject") || "Message from Ivy House");
    const body = String(formData.get("body") || "");
    const channelsRaw = String(formData.get("channels") || "EMAIL,SMS");
    if (!studentProfileId || !body) throw new Error("Message body is required");
    const profile = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    if (!profile) throw new Error("Student not found");

    const channels = channelsRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean) as NotificationChannel[];

    const recipient =
      target === "nextOfKin"
        ? {
            name: profile.nextOfKinName ?? "Next of kin",
            phone: profile.nextOfKinPhone ?? undefined,
          }
        : { name: profile.fullName, email: profile.email, phone: profile.phone };

    if (!recipient.email && !recipient.phone) {
      throw new Error("No contact details available for this recipient");
    }

    await sendMessage({
      channels,
      recipients: [recipient],
      subject,
      body,
      senderId: session.userId,
      relatedType: "StudentProfile",
      relatedId: studentProfileId,
    });
    revalidatePath(`/owner/students/${studentProfileId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ───────────────────────── Payments ───────────────────────────

export async function markPaymentPaid(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const reference = String(formData.get("reference") || "");
    if (!reference) throw new Error("Missing payment reference");
    await settlePayment(reference);
    revalidatePath("/owner/payments");
    revalidatePath("/owner/invoices");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function generateInvoiceLink(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const invoiceId = String(formData.get("invoiceId") || "");
    if (!invoiceId) throw new Error("Missing invoice id");
    await generatePaymentLink(invoiceId);
    revalidatePath("/owner/invoices");
    revalidatePath("/owner/payments");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ──────────────────── Service requests ────────────────────────

export async function updateServiceRequest(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    if (!id) throw new Error("Missing service request id");
    const status = String(formData.get("status") || "") as ServiceRequestStatus;
    const caretakerId = String(formData.get("caretakerId") || "") || null;
    const resolutionNotes = String(formData.get("resolutionNotes") || "") || null;
    const data: {
      status?: ServiceRequestStatus;
      caretakerId?: string | null;
      resolutionNotes?: string | null;
      resolvedAt?: Date | null;
    } = {
      caretakerId,
      resolutionNotes,
    };
    if (status) {
      data.status = status;
      if (status === "RESOLVED" || status === "CLOSED") {
        data.resolvedAt = new Date();
      }
    }
    await prisma.serviceRequest.update({ where: { id }, data });
    await audit({
      action: "service_request.updated",
      entityType: "ServiceRequest",
      entityId: id,
      metadata: { status },
    });
    revalidatePath("/owner/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function createServiceRequestOwner(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    if (!title || !description) throw new Error("Title and description required");
    const category = (String(formData.get("category") || "MAINTENANCE") ||
      "MAINTENANCE") as ServiceRequestCategory;
    const priority = (String(formData.get("priority") || "MEDIUM") ||
      "MEDIUM") as ServiceRequestPriority;
    const houseId = String(formData.get("houseId") || "") || null;
    const caretakerId = String(formData.get("caretakerId") || "") || null;
    await prisma.serviceRequest.create({
      data: {
        reference: generateReference("SRV"),
        title,
        description,
        category,
        priority,
        houseId,
        caretakerId,
        status: ServiceRequestStatus.OPEN,
      },
    });
    await audit({ action: "service_request.created", entityType: "ServiceRequest" });
    revalidatePath("/owner/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ───────────────────────── Caretakers ─────────────────────────

export async function upsertCaretaker(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "");
    const phone = String(formData.get("phone") || "");
    const email = String(formData.get("email") || "");
    if (!name || !phone || !email) throw new Error("Name, phone and email required");
    const data = {
      name,
      phone,
      email,
      role: String(formData.get("role") || "Caretaker") || "Caretaker",
      houseId: String(formData.get("houseId") || "") || null,
      notes: String(formData.get("notes") || "") || null,
    };
    if (id) {
      await prisma.caretaker.update({ where: { id }, data });
    } else {
      await prisma.caretaker.create({ data });
    }
    await audit({ action: id ? "caretaker.updated" : "caretaker.created", entityType: "Caretaker", entityId: id || undefined });
    revalidatePath("/owner/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function sendCaretakerUpdate(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const subject = String(formData.get("subject") || "Update from Owner");
    const body = String(formData.get("body") || "");
    if (!body) throw new Error("Message body is required");
    const recipients = await resolveRecipients("CARETAKERS");
    if (!recipients.length) throw new Error("No active caretakers to notify");
    await sendMessage({
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      recipients,
      subject,
      body,
      senderId: session.userId,
    });
    revalidatePath("/owner/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ───────────────────── Communication center ───────────────────

export async function sendOwnerMessage(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole("OWNER");
  try {
    const group = String(formData.get("group") || "") as RecipientGroup;
    const houseId = String(formData.get("houseId") || "") || undefined;
    const subject = String(formData.get("subject") || "") || undefined;
    const body = String(formData.get("body") || "");
    const channelsRaw = String(formData.get("channels") || "");
    if (!group) throw new Error("Choose a recipient group");
    if (!body) throw new Error("Message body is required");
    const channels = channelsRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean) as NotificationChannel[];
    if (!channels.length) throw new Error("Choose at least one channel");

    const recipients = await resolveRecipients(group, { houseId });
    if (!recipients.length) throw new Error("No recipients match this group");

    const result = await sendMessage({
      channels,
      recipients,
      subject,
      body,
      senderId: session.userId,
    });
    revalidatePath("/owner/messages");
    return {
      success: true,
      error: `Sent to ${result.total} recipient(s): ${result.emailSent} email, ${result.smsSent} SMS, ${result.failed} failed`,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ───────────────────────── Settings ───────────────────────────

export async function updateSettings(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("OWNER");
  try {
    const data = {
      businessName: String(formData.get("businessName") || "Ivy House"),
      ownerName: String(formData.get("ownerName") || "House Owner"),
      ownerEmail: String(formData.get("ownerEmail") || ""),
      ownerPhone: String(formData.get("ownerPhone") || "") || null,
      currency: String(formData.get("currency") || "USD"),
      invoicePrefix: String(formData.get("invoicePrefix") || "INV"),
      receiptPrefix: String(formData.get("receiptPrefix") || "RCT"),
      statementPrefix: String(formData.get("statementPrefix") || "STM"),
      paymentTermsDays: Number(formData.get("paymentTermsDays") || 7),
      defaultMessage: String(formData.get("defaultMessage") || "") || null,
    };
    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    await audit({ action: "settings.updated", entityType: "Settings" });
    revalidatePath("/owner/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
