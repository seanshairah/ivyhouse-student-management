import { prisma } from "@/lib/prisma";
import {
  PaymentStatus,
  StudentStatus,
  ApplicationStatus,
  ApplicationType,
  RoomStatus,
  type Prisma,
} from "@prisma/client";
import { generateReference, formatCurrency, formatDate, toNumber } from "@/lib/utils";
import {
  createPaynowPayment,
  createPaynowMobilePayment,
  verifyPaynowPayment,
  getPaynowConfig,
} from "./paynow";
import {
  SEMESTER_MONTHS,
  TRANSPORT_FEE,
  DEFAULT_MONTHLY_RENT,
  monthlyRentFor,
  type PaymentPurpose,
} from "@/constants";
import { updateInvoiceAfterPayment } from "@/services/invoices";
import { createReceipt } from "@/services/receipts";
import { sendTemplatedEmail } from "@/services/email";
import { sendStatusSMS } from "@/services/sms";
import { notifyOwners, notifyDashboard } from "@/services/notifications";
import { EMAIL_SUBJECTS } from "@/constants/messages";
import { audit } from "@/services/audit";

export * from "./paynow";

/**
 * Generate a payment + Paynow link for an invoice.
 * Creates the Payment record, a PaymentTransaction, and returns a link.
 */
export async function generatePaymentLink(
  invoiceId: string,
  opts?: { notify?: boolean },
) {
  const notify = opts?.notify !== false;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: true },
  });
  if (!invoice) throw new Error("Invoice not found");

  const outstanding = toNumber(invoice.amount) - toNumber(invoice.amountPaid);
  const reference = generateReference("PAY");

  const paynow = await createPaynowPayment({
    reference,
    amount: outstanding,
    email: invoice.studentProfile.email,
    description: invoice.description,
  });

  const payment = await prisma.payment.create({
    data: {
      reference,
      studentProfileId: invoice.studentProfileId,
      invoiceId: invoice.id,
      amount: outstanding,
      status: PaymentStatus.PENDING,
      paymentLink: paynow.redirectUrl,
      transaction: {
        create: {
          provider: "paynow",
          pollUrl: paynow.pollUrl,
          providerRef: paynow.providerRef,
          rawStatus: paynow.mode === "development" ? "mock-initiated" : "initiated",
        },
      },
    },
  });

  if (notify) {
    await sendTemplatedEmail(
      invoice.studentProfile.email,
      EMAIL_SUBJECTS.paymentRequest,
      "paymentRequest",
      {
        studentName: invoice.studentProfile.fullName,
        invoiceNumber: invoice.number,
        description: invoice.description,
        amount: formatCurrency(outstanding),
        dueDate: invoice.dueDate ? formatDate(invoice.dueDate) : "—",
        paymentUrl: paynow.redirectUrl || "",
      },
    ).catch(() => undefined);

    await sendStatusSMS(invoice.studentProfile.phone, "paymentLinkGenerated", {
      studentName: invoice.studentProfile.fullName,
      houseName: invoice.description,
      amount: formatCurrency(outstanding),
    }).catch(() => undefined);
  }

  await audit({
    action: "payment.link_generated",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { reference, amount: outstanding, mode: paynow.mode },
  });

  return { payment, redirectUrl: paynow.redirectUrl };
}

/** Resolve a self-service payment purpose into an amount + description. */
export function resolvePurpose(
  purpose: PaymentPurpose,
  monthlyRent: number,
): { amount: number; description: string } {
  const rent = monthlyRent > 0 ? monthlyRent : DEFAULT_MONTHLY_RENT;
  switch (purpose) {
    case "RENT_MONTH":
      return { amount: rent, description: "Accommodation — next month rent" };
    case "RENT_SEMESTER":
      return {
        amount: rent * SEMESTER_MONTHS,
        description: `Accommodation — next semester rent (${SEMESTER_MONTHS} months)`,
      };
    case "TRANSPORT":
      return { amount: TRANSPORT_FEE, description: "Transport / shuttle service — 1 month" };
  }
}

export interface SelfPaymentResult {
  ok: boolean;
  reference?: string;
  amount?: number;
  redirectUrl?: string;
  pollUrl?: string;
  instructions?: string;
  error?: string;
}

/**
 * Student-initiated payment (rent for a month/semester, or transport) via
 * Paynow — either an EcoCash Express phone prompt or a web redirect. Creates
 * the Payment + transaction record; the amount is computed server-side.
 */
export async function createSelfPayment(opts: {
  profileId: string;
  purpose: PaymentPurpose;
  method: "ecocash" | "web";
  phone?: string;
}): Promise<SelfPaymentResult> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: opts.profileId },
    include: { room: true },
  });
  if (!profile) return { ok: false, error: "Student profile not found" };

  const monthly = monthlyRentFor(
    profile.room?.type,
    profile.room ? toNumber(profile.room.price) : null,
  );
  const { amount, description } = resolvePurpose(opts.purpose, monthly);

  // Duplicate-charge guard: if an identical payment is already in flight (same
  // student + amount, created seconds ago), reuse it instead of creating a
  // second charge (double-click / retry after latency).
  const recent = await prisma.payment.findFirst({
    where: {
      studentProfileId: profile.id,
      amount,
      status: PaymentStatus.PENDING,
      createdAt: { gte: new Date(Date.now() - 90_000) },
    },
    include: { transaction: true },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return {
      ok: true,
      reference: recent.reference,
      amount,
      pollUrl: recent.transaction?.pollUrl ?? undefined,
      redirectUrl: recent.paymentLink ?? undefined,
      instructions:
        "You already have a payment in progress for this amount — check your phone or wait for it to confirm.",
    };
  }

  const reference = generateReference("PAY");

  if (opts.method === "ecocash") {
    const phone = (opts.phone || "").trim();
    if (phone.replace(/[^\d]/g, "").length < 9) {
      return { ok: false, error: "Enter a valid EcoCash number." };
    }
    const r = await createPaynowMobilePayment({
      reference,
      amount,
      email: profile.email,
      description,
      phone,
      method: "ecocash",
    });
    await prisma.payment.create({
      data: {
        reference,
        studentProfileId: profile.id,
        amount,
        method: "PAYNOW",
        // Ambiguous (network/timeout) stays PENDING so polling/webhook can
        // still resolve it — never auto-fail an uncertain charge.
        status: r.ok || r.ambiguous ? PaymentStatus.PENDING : PaymentStatus.FAILED,
        transaction: {
          create: {
            provider: "paynow",
            pollUrl: r.pollUrl,
            providerRef: r.providerRef,
            rawStatus: r.ok ? "ecocash-prompt-sent" : r.ambiguous ? "uncertain" : r.error,
          },
        },
      },
    });
    if (!r.ok) {
      return {
        ok: false,
        reference,
        error: r.ambiguous
          ? "We couldn't confirm the request reached EcoCash. Please don't pay again yet — check your phone, then your payment history in a minute."
          : r.error,
      };
    }
    return { ok: true, reference, amount, pollUrl: r.pollUrl, instructions: r.instructions };
  }

  // Web redirect (Paynow hosted checkout)
  const r = await createPaynowPayment({
    reference,
    amount,
    email: profile.email,
    description,
  });
  await prisma.payment.create({
    data: {
      reference,
      studentProfileId: profile.id,
      amount,
      method: "PAYNOW",
      status: PaymentStatus.PENDING,
      paymentLink: r.redirectUrl,
      transaction: {
        create: {
          provider: "paynow",
          pollUrl: r.pollUrl,
          providerRef: r.providerRef,
          rawStatus: r.mode === "development" ? "mock-initiated" : "initiated",
        },
      },
    },
  });
  if (!r.ok) return { ok: false, reference, error: r.error };
  return { ok: true, reference, amount, redirectUrl: r.redirectUrl };
}

/**
 * Resolve how to collect a pending web payment.
 *
 * In development we use the internal simulated checkout. In LIVE mode the
 * student must be sent to Paynow's own hosted page — never our internal page,
 * which cannot take money. If the payment already has a real Paynow browser
 * link we reuse it; otherwise (e.g. it was started as an EcoCash prompt) we
 * create a fresh Paynow web transaction for the same reference and persist the
 * new link + poll URL so the return/webhook flow can still verify it.
 */
export async function resolveWebCheckout(
  reference: string,
): Promise<
  | { kind: "paid" }
  | { kind: "mock" }
  | { kind: "redirect"; url: string }
  | { kind: "error"; message: string }
> {
  const config = getPaynowConfig();
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { transaction: true, studentProfile: true, invoice: true },
  });
  if (!payment) return { kind: "error", message: "Payment not found" };
  if (payment.status === PaymentStatus.PAID) return { kind: "paid" };
  if (payment.status === PaymentStatus.FAILED) {
    return { kind: "error", message: "This payment was cancelled or failed. Please start a new one." };
  }

  // Development: the internal simulated checkout is the intended flow.
  if (config.mode === "development") return { kind: "mock" };

  // Live: reuse an existing real Paynow link if we have one.
  const existing = payment.paymentLink;
  const isRealPaynowLink =
    !!existing && /^https?:\/\//i.test(existing) && existing.includes("paynow.co.zw");
  if (isRealPaynowLink) return { kind: "redirect", url: existing! };

  // No usable hosted link yet — create a fresh Paynow web transaction.
  const r = await createPaynowPayment({
    reference: payment.reference,
    amount: toNumber(payment.amount),
    email: payment.studentProfile.email,
    description: payment.invoice?.description || "Accommodation payment",
  });
  if (!r.ok || !r.redirectUrl) {
    return {
      kind: "error",
      message: r.error || "We couldn't reach Paynow just now. Please try again in a moment.",
    };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      paymentLink: r.redirectUrl,
      transaction: {
        upsert: {
          create: {
            provider: "paynow",
            pollUrl: r.pollUrl,
            providerRef: r.providerRef,
            rawStatus: "initiated",
          },
          update: {
            pollUrl: r.pollUrl,
            providerRef: r.providerRef,
            rawStatus: "initiated",
          },
        },
      },
    },
  });

  return { kind: "redirect", url: r.redirectUrl };
}

/**
 * Poll a payment's status (used by the EcoCash Express client). If Paynow
 * reports paid, settle it (idempotent). Returns a simple status string.
 */
export async function pollAndSettle(
  reference: string,
): Promise<{ status: "paid" | "pending" | "failed"; message?: string }> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { transaction: true },
  });
  if (!payment) return { status: "failed", message: "Payment not found" };
  if (payment.status === PaymentStatus.PAID) return { status: "paid" };
  if (payment.status === PaymentStatus.FAILED) return { status: "failed" };

  const pollUrl = payment.transaction?.pollUrl;
  if (!pollUrl) {
    // No provider poll URL (e.g. a seeded / mock payment). Only auto-settle in
    // development; in live we can't verify, so leave it pending.
    if (getPaynowConfig().mode === "development") {
      await settlePayment(reference);
      return { status: "paid" };
    }
    return { status: "pending" };
  }

  const verify = await verifyPaynowPayment(pollUrl);
  if (verify.paid) {
    await settlePayment(reference);
    return { status: "paid" };
  }
  const s = (verify.status || "").toLowerCase();
  if (s.includes("cancel") || s.includes("fail") || s.includes("disputed")) {
    await failPayment(reference, verify.status);
    return { status: "failed", message: verify.status };
  }
  return { status: "pending", message: verify.status };
}

/**
 * Settle a payment: mark paid, create receipt, update invoice, update student
 * balance/status, and notify everyone. Idempotent — safe to call twice.
 */
export async function settlePayment(reference: string) {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: {
      studentProfile: { include: { house: true, room: true } },
      invoice: true,
    },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === PaymentStatus.PAID) {
    const existing = await prisma.receipt.findUnique({
      where: { paymentId: payment.id },
    });
    return { payment, receipt: existing, alreadyPaid: true };
  }

  const receipt = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });
    const r = await createReceipt(payment.id, toNumber(payment.amount), tx);
    if (payment.invoiceId) {
      await updateInvoiceAfterPayment(payment.invoiceId, tx);
      // Advance any linked application to PAID.
      const inv = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
      });
      if (inv?.applicationId) {
        const app = await tx.application.update({
          where: { id: inv.applicationId },
          data: { status: ApplicationStatus.PAID },
        });

        // Renewal confirmed: extend the lease and, if moving rooms, transfer.
        if (app.type === ApplicationType.RENEWAL) {
          const profile = await tx.studentProfile.findUnique({
            where: { id: payment.studentProfileId },
          });
          const base =
            profile?.leaseEnd && profile.leaseEnd > new Date()
              ? profile.leaseEnd
              : new Date();
          const newLeaseEnd = new Date(base.getTime() + 180 * 86400000);
          const profileData: Prisma.StudentProfileUpdateInput = {
            leaseEnd: newLeaseEnd,
          };

          if (app.roomId && profile?.roomId && app.roomId !== profile.roomId) {
            // Free the old room.
            const oldRoom = await tx.room.findUnique({
              where: { id: profile.roomId },
            });
            if (oldRoom) {
              const occ = Math.max(0, oldRoom.occupied - 1);
              await tx.room.update({
                where: { id: oldRoom.id },
                data: {
                  occupied: occ,
                  status: occ === 0 ? RoomStatus.AVAILABLE : oldRoom.status,
                },
              });
            }
            // Occupy the new room.
            const newRoom = await tx.room.findUnique({
              where: { id: app.roomId },
            });
            if (newRoom) {
              const occ = newRoom.occupied + 1;
              await tx.room.update({
                where: { id: app.roomId },
                data: {
                  occupied: occ,
                  status:
                    occ >= newRoom.capacity
                      ? RoomStatus.OCCUPIED
                      : RoomStatus.RESERVED,
                },
              });
            }
            profileData.room = { connect: { id: app.roomId } };
          }

          await tx.studentProfile.update({
            where: { id: payment.studentProfileId },
            data: profileData,
          });
        }
      }
    }
    await tx.studentProfile.update({
      where: { id: payment.studentProfileId },
      data: { status: StudentStatus.ACTIVE },
    });
    return r;
  }, {
    // Settlement makes many round-trips; the pooled serverless connection to
    // Neon adds latency to each, so give it more than Prisma's 5s default.
    maxWait: 10_000,
    timeout: 20_000,
  });

  // Notifications (best-effort, outside the transaction).
  await sendTemplatedEmail(
    payment.studentProfile.email,
    EMAIL_SUBJECTS.paymentConfirmation,
    "paymentConfirmation",
    {
      studentName: payment.studentProfile.fullName,
      receiptNumber: receipt.number,
      amount: formatCurrency(toNumber(payment.amount)),
      reference: payment.reference,
      date: formatDate(new Date()),
      receiptUrl: `${process.env.APP_URL || ""}/student/payments`,
    },
  ).catch(() => undefined);

  await sendStatusSMS(payment.studentProfile.phone, "paymentCompleted", {
    studentName: payment.studentProfile.fullName,
    amount: formatCurrency(toNumber(payment.amount)),
    receiptNumber: receipt.number,
  }).catch(() => undefined);

  if (payment.studentProfile.userId) {
    await notifyDashboard({
      userId: payment.studentProfile.userId,
      title: "Payment received",
      body: `Your payment of ${formatCurrency(toNumber(payment.amount))} was successful. Receipt ${receipt.number}.`,
      type: "payment",
      link: "/student/payments",
      relatedType: "Payment",
      relatedId: payment.id,
    }).catch(() => undefined);
  }

  await notifyOwners({
    title: "Payment received",
    body: `${payment.studentProfile.fullName} paid ${formatCurrency(toNumber(payment.amount))}.`,
    type: "payment",
    link: "/owner/payments",
    relatedType: "Payment",
    relatedId: payment.id,
  }).catch(() => undefined);

  await audit({
    action: "payment.settled",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { reference, amount: toNumber(payment.amount) },
  });

  return { payment, receipt, alreadyPaid: false };
}

export async function failPayment(reference: string, reason?: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return null;
  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.FAILED, transaction: { update: { rawStatus: reason } } },
  });
}
