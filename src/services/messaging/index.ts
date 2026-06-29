import { prisma } from "@/lib/prisma";
import { NotificationChannel, MessageStatus } from "@prisma/client";
import { sendEmail } from "@/services/email";
import { sendSMS } from "@/services/sms";
import { brandedEmail } from "@/services/email/templates";
import { audit } from "@/services/audit";

export type RecipientGroup =
  | "ALL_STUDENTS"
  | "HOUSE"
  | "UNPAID"
  | "APPROVED"
  | "PAYMENT_PENDING"
  | "CARETAKERS"
  | "CUSTOM";

export interface Recipient {
  name: string;
  email?: string;
  phone?: string;
}

/** Resolve a recipient group into concrete contacts. */
export async function resolveRecipients(
  group: RecipientGroup,
  opts?: { houseId?: string; ids?: string[] },
): Promise<Recipient[]> {
  switch (group) {
    case "ALL_STUDENTS": {
      const s = await prisma.studentProfile.findMany({
        where: { status: { notIn: ["ARCHIVED", "MOVED_OUT"] } },
      });
      return s.map((x) => ({ name: x.fullName, email: x.email, phone: x.phone }));
    }
    case "HOUSE": {
      const s = await prisma.studentProfile.findMany({
        where: { houseId: opts?.houseId },
      });
      return s.map((x) => ({ name: x.fullName, email: x.email, phone: x.phone }));
    }
    case "APPROVED": {
      const apps = await prisma.application.findMany({
        where: { status: { in: ["APPROVED", "PAYMENT_PENDING"] } },
      });
      return apps.map((a) => ({ name: a.fullName, email: a.email, phone: a.phone }));
    }
    case "PAYMENT_PENDING": {
      const apps = await prisma.application.findMany({
        where: { status: "PAYMENT_PENDING" },
      });
      return apps.map((a) => ({ name: a.fullName, email: a.email, phone: a.phone }));
    }
    case "UNPAID": {
      const invoices = await prisma.invoice.findMany({
        where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
        include: { studentProfile: true },
        distinct: ["studentProfileId"],
      });
      return invoices.map((i) => ({
        name: i.studentProfile.fullName,
        email: i.studentProfile.email,
        phone: i.studentProfile.phone,
      }));
    }
    case "CARETAKERS": {
      const c = await prisma.caretaker.findMany({ where: { isActive: true } });
      return c.map((x) => ({ name: x.name, email: x.email, phone: x.phone }));
    }
    case "CUSTOM": {
      if (!opts?.ids?.length) return [];
      const s = await prisma.studentProfile.findMany({
        where: { id: { in: opts.ids } },
      });
      return s.map((x) => ({ name: x.fullName, email: x.email, phone: x.phone }));
    }
    default:
      return [];
  }
}

export interface SendMessageInput {
  channels: NotificationChannel[];
  recipients: Recipient[];
  subject?: string;
  body: string;
  senderId?: string;
  relatedType?: string;
  relatedId?: string;
}

/** Send a message across channels and log every attempt. */
export async function sendMessage(input: SendMessageInput) {
  let emailSent = 0;
  let smsSent = 0;
  let failed = 0;

  for (const r of input.recipients) {
    if (input.channels.includes(NotificationChannel.EMAIL) && r.email) {
      const html = brandedEmail({
        heading: input.subject || "A message from Ivy House",
        intro: `Hi ${r.name},`,
        bodyHtml: input.body.replace(/\n/g, "<br/>"),
      });
      const res = await sendEmail({
        to: r.email,
        subject: input.subject || "Message from Ivy House",
        html,
      });
      await logMessage(input, r, NotificationChannel.EMAIL, res.ok, res.error);
      res.ok ? emailSent++ : failed++;
    }
    if (input.channels.includes(NotificationChannel.SMS) && r.phone) {
      const res = await sendSMS(r.phone, input.body);
      await logMessage(input, r, NotificationChannel.SMS, res.ok, res.error);
      res.ok ? smsSent++ : failed++;
    }
  }

  await audit({
    userId: input.senderId,
    action: "message.sent",
    metadata: {
      channels: input.channels,
      recipients: input.recipients.length,
      emailSent,
      smsSent,
      failed,
    },
  });

  return { emailSent, smsSent, failed, total: input.recipients.length };
}

async function logMessage(
  input: SendMessageInput,
  r: Recipient,
  channel: NotificationChannel,
  ok: boolean,
  error?: string,
) {
  await prisma.messageLog
    .create({
      data: {
        channel,
        recipient: channel === NotificationChannel.EMAIL ? r.email! : r.phone!,
        recipientName: r.name,
        subject: input.subject,
        body: input.body,
        status: ok ? MessageStatus.SENT : MessageStatus.FAILED,
        error,
        senderId: input.senderId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      },
    })
    .catch(() => undefined);
}
