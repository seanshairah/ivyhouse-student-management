import { prisma } from "@/lib/prisma";
import { PaymentStatus, ChargeStatus, type Prisma } from "@prisma/client";

/**
 * Uncleared payment requests — payments started and never finished.
 *
 * These accumulate for ordinary reasons: a student opens the Paynow checkout
 * and closes the tab, an EcoCash prompt is ignored, or the provider declines
 * after we have already written the row. Left alone they sit on the student's
 * dashboard as a payment permanently "in progress", and nobody can tell which
 * ones are still live.
 *
 * Nothing here can touch settled money. Every operation is scoped to PENDING
 * and PROCESSING, so a PAID payment is untouchable by construction — cancelling
 * is not a way to reverse a payment, and must never become one.
 */

/** A payment older than this can no longer complete; the provider session is gone. */
export const STALE_AFTER_MINUTES = 60;

export interface UnclearedPayment {
  id: string;
  reference: string;
  amount: number;
  status: PaymentStatus;
  createdAt: Date;
  student: { id: string; fullName: string; email: string } | null;
  /** True once it is old enough that it can never settle. */
  stale: boolean;
  /** Whether the provider ever acknowledged it — no poll URL means it never registered. */
  reachedProvider: boolean;
}

export async function listUnclearedPayments(
  opts: { studentProfileId?: string; limit?: number } = {},
): Promise<UnclearedPayment[]> {
  const rows = await prisma.payment.findMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      ...(opts.studentProfileId ? { studentProfileId: opts.studentProfileId } : {}),
    },
    select: {
      id: true,
      reference: true,
      amount: true,
      status: true,
      createdAt: true,
      transaction: { select: { pollUrl: true } },
      studentProfile: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });

  const cutoff = Date.now() - STALE_AFTER_MINUTES * 60_000;
  return rows.map((p) => ({
    id: p.id,
    reference: p.reference,
    amount: Number(p.amount),
    status: p.status,
    createdAt: p.createdAt,
    student: p.studentProfile
      ? {
          id: p.studentProfile.id,
          fullName: p.studentProfile.fullName,
          email: p.studentProfile.email,
        }
      : null,
    stale: p.createdAt.getTime() < cutoff,
    reachedProvider: Boolean(p.transaction?.pollUrl),
  }));
}

export interface CancelResult {
  ok: boolean;
  error?: string;
}

/**
 * Cancel one uncleared payment request.
 *
 * Refuses anything that is not PENDING or PROCESSING, so a settled payment can
 * never be cancelled away — reversing money is what a refund is for, and that
 * goes through the payment state machine.
 *
 * The charge raised for the attempt is withdrawn too, but only if nothing has
 * been allocated against it: a student who part-paid keeps the debt for the
 * part they still owe.
 */
export async function cancelUnclearedPayment(
  reference: string,
  opts: { actorId?: string; reason?: string } = {},
  client: Prisma.TransactionClient = prisma,
): Promise<CancelResult> {
  const payment = await client.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, studentProfileId: true, category: true },
  });
  if (!payment) return { ok: false, error: "Payment not found." };

  if (payment.status === PaymentStatus.PAID) {
    return {
      ok: false,
      error:
        "This payment has already been received. Cancelling it here would not " +
        "return the money — record a refund instead.",
    };
  }
  if (
    payment.status !== PaymentStatus.PENDING &&
    payment.status !== PaymentStatus.PROCESSING
  ) {
    return { ok: false, error: "This payment is already closed." };
  }

  await client.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.CANCELLED,
      transaction: {
        update: { rawStatus: opts.reason ?? "cancelled-by-user" },
      },
    },
  });

  // Withdraw the charge this attempt raised, if nothing was ever paid against it.
  await client.charge.updateMany({
    where: {
      studentProfileId: payment.studentProfileId,
      category: payment.category,
      status: ChargeStatus.OUTSTANDING,
      allocations: { none: {} },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
    },
    data: {
      status: ChargeStatus.CANCELLED,
      adjustmentNote: "Withdrawn — the payment request it was raised for was cancelled.",
      adjustedById: opts.actorId ?? null,
    },
  });

  return { ok: true };
}

/**
 * Close out payment requests too old to complete.
 *
 * Runs from the daily cron rather than as its own scheduled job — there is no
 * need for more moving parts than the problem deserves.
 */
export async function expireStalePayments(
  olderThanMinutes = STALE_AFTER_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const result = await prisma.payment.updateMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      createdAt: { lt: cutoff },
    },
    data: { status: PaymentStatus.CANCELLED },
  });
  return result.count;
}
