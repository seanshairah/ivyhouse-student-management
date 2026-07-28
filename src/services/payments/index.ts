import { prisma } from "@/lib/prisma";
import {
  PaymentStatus,
  StudentStatus,
  ApplicationStatus,
  ApplicationType,
  RoomStatus,
  ChargeCategory,
  type Prisma,
} from "@prisma/client";
import { generateReference, formatCurrency, formatDate, toNumber } from "@/lib/utils";
import {
  createPaynowPayment,
  createPaynowMobilePayment,
  verifyPaynowPayment,
  getPaynowConfig,
  type MobileMethod,
} from "./paynow";
import {
  monthlyRentFor,
  priceFor,
  periodFrom,
  dueDateFromNow,
  type PaymentPurpose,
} from "@/core/billing/pricing";
import {
  raiseCharge,
  allocatePayment,
  deallocatePayment,
  withdrawChargesForPayment,
  withdrawStrandedCharges,
} from "@/core/billing/ledger";
import {
  cancelUnclearedPayment,
  STALE_AFTER_MINUTES,
} from "@/core/billing/uncleared";
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
    include: { studentProfile: true, charges: { select: { category: true } } },
  });
  if (!invoice) throw new Error("Invoice not found");
  // Carry the invoice's category onto the payment so revenue reporting can
  // split rent from transport before the allocations exist.
  const category = invoice.charges[0]?.category ?? ChargeCategory.OTHER;

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
      category,
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
  method: MobileMethod | "web";
  phone?: string;
}): Promise<SelfPaymentResult> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: opts.profileId },
    include: { room: true },
  });
  if (!profile) return { ok: false, error: "Student profile not found" };

  // Rent needs a room. Without one, monthlyRentFor() falls back to the
  // platform default and we would invent a rent debt for accommodation the
  // student has not actually been given — a real risk, since a large share of
  // students on both platforms are onboarded but not yet allocated a room.
  // Transport is independent of a room, so that stays available.
  const isRent = opts.purpose === "RENT_MONTH" || opts.purpose === "RENT_SEMESTER";
  if (isRent && !profile.room) {
    return {
      ok: false,
      error:
        "You don't have a room assigned yet, so there's no rent to pay. " +
        "Please contact the office — they'll allocate your room first.",
    };
  }

  // The amount is computed here, on the server, from the student's own room and
  // the platform's configured rates. The browser only ever sends a purpose.
  const monthly = monthlyRentFor(
    profile.room?.type,
    profile.room ? toNumber(profile.room.price) : null,
  );
  const { amount, description, category, months } = priceFor(opts.purpose, monthly);

  // Duplicate guard: if an identical attempt is already in flight (same student
  // + amount, started seconds ago), continue THAT one rather than starting a
  // second. Two payments for one debt means two charges, and the student's
  // balance climbs every time they double-click.
  //
  // What matters is that the existing attempt is always made usable again. The
  // old guard handed the caller back whatever the in-flight payment happened to
  // have — which for a payment started as an EcoCash prompt is no browser link
  // at all. "Pay online" then received a success with nowhere to go, and showed
  // "Could not open the payment page" before the student's retry finally worked.
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
    if (opts.method === "web") {
      // A real hosted link is reusable as-is; anything else means asking Paynow
      // for a fresh one against the same reference.
      if (isUsableCheckoutLink(recent.paymentLink)) {
        return {
          ok: true,
          reference: recent.reference,
          amount,
          redirectUrl: recent.paymentLink!,
        };
      }
      return startWebCheckout({
        payment: recent,
        email: profile.email,
        description,
        amount,
      });
    }
    // A prompt already sitting on the student's phone should not be re-sent.
    if (hasLiveMobilePrompt(recent.transaction)) {
      return {
        ok: true,
        reference: recent.reference,
        amount,
        pollUrl: recent.transaction?.pollUrl ?? undefined,
        instructions:
          "You already have a payment in progress for this amount — check your phone or wait for it to confirm.",
      };
    }
    return startMobileCheckout({
      payment: recent,
      email: profile.email,
      description,
      amount,
      method: opts.method,
      phone: opts.phone,
    });
  }

  const reference = generateReference("PAY");

  // The payment record comes first so the charge can point at it, and so an
  // attempt that dies while we are talking to Paynow still leaves a trace.
  const payment = await prisma.payment.create({
    data: {
      reference,
      studentProfileId: profile.id,
      amount,
      category,
      method: "PAYNOW",
      status: PaymentStatus.PENDING,
    },
  });

  // Raise the charge BEFORE taking the money.
  //
  // Previously a self-service payment created a Payment row with no charge and
  // no invoice behind it, so the student's balance never moved when they paid
  // and the owner's reports could not see what the money was for. The charge is
  // the thing the ledger derives balances from, so it has to exist first — and
  // it carries the payment it was raised for, so if that attempt never produces
  // money the charge can be withdrawn again exactly.
  const period = periodFrom(new Date(), months);
  await raiseCharge({
    studentProfileId: profile.id,
    category,
    description,
    amount,
    dueDate: dueDateFromNow(),
    periodStart: period.start,
    periodEnd: period.end,
    originPaymentId: payment.id,
  });

  return opts.method === "web"
    ? startWebCheckout({ payment, email: profile.email, description, amount })
    : startMobileCheckout({
        payment,
        email: profile.email,
        description,
        amount,
        method: opts.method,
        phone: opts.phone,
      });
}

/** A charge withdrawn because the attempt behind it can never produce money. */
const DECLINED_NOTE = "Withdrawn automatically — the payment was declined.";

interface CheckoutTarget {
  payment: { id: string; reference: string };
  email: string;
  description: string;
  amount: number;
}

/**
 * Is this stored link something a student's browser can actually be sent to?
 *
 * In live mode only Paynow's own hosted page can take money — our internal
 * checkout is a development mock. A link that fails this test is treated as
 * absent, and a fresh one is requested.
 */
function isUsableCheckoutLink(link: string | null | undefined): boolean {
  if (!link || !/^https?:\/\//i.test(link)) return false;
  if (getPaynowConfig().mode === "development") return true;
  return link.includes("paynow.co.zw");
}

/** Is there a mobile-money prompt already sitting on the payer's phone? */
function hasLiveMobilePrompt(
  transaction: { pollUrl: string | null; rawStatus: string | null } | null,
): boolean {
  return Boolean(transaction?.pollUrl) && /prompt-sent/.test(transaction?.rawStatus ?? "");
}

/**
 * Open (or re-open) a Paynow hosted checkout for an existing payment record.
 *
 * Always resolves to either a link the caller can redirect to or an error worth
 * showing — never a success with nothing behind it.
 */
async function startWebCheckout(t: CheckoutTarget): Promise<SelfPaymentResult> {
  const r = await createPaynowPayment({
    reference: t.payment.reference,
    amount: t.amount,
    email: t.email,
    description: t.description,
  });

  const rawStatus = r.ok
    ? r.mode === "development"
      ? "mock-initiated"
      : "initiated"
    : r.ambiguous
      ? "uncertain"
      : (r.providerError ?? r.error ?? "declined");

  await prisma.payment.update({
    where: { id: t.payment.id },
    data: {
      // Only stay PENDING if Paynow actually took it, or the outcome is
      // uncertain. A hard decline used to be written as PENDING with no poll
      // URL, which left a payment request stuck "in progress" forever —
      // nothing could ever settle it and nothing cleared it away.
      status: r.ok || r.ambiguous ? PaymentStatus.PENDING : PaymentStatus.FAILED,
      // Never overwrite a good link with nothing.
      ...(r.redirectUrl ? { paymentLink: r.redirectUrl } : {}),
      transaction: {
        upsert: {
          create: {
            provider: "paynow",
            pollUrl: r.pollUrl,
            providerRef: r.providerRef,
            rawStatus,
          },
          update: { pollUrl: r.pollUrl, providerRef: r.providerRef, rawStatus },
        },
      },
    },
  });

  if (!r.ok || !r.redirectUrl) {
    // A hard decline means no money will arrive, so withdraw the charge rather
    // than leaving the student owing a debt they never agreed to. An ambiguous
    // result keeps the charge: the payment may still land.
    if (!r.ambiguous) await withdrawChargesForPayment(t.payment.id, DECLINED_NOTE);
    return {
      ok: false,
      reference: t.payment.reference,
      error:
        r.error ||
        "We couldn't open the payment page just now. Please try again in a moment.",
    };
  }
  return {
    ok: true,
    reference: t.payment.reference,
    amount: t.amount,
    redirectUrl: r.redirectUrl,
  };
}

/** Send (or re-send) a mobile-money prompt for an existing payment record. */
async function startMobileCheckout(
  t: CheckoutTarget & { method: MobileMethod; phone?: string },
): Promise<SelfPaymentResult> {
  const phone = (t.phone || "").trim();
  if (phone.replace(/[^\d]/g, "").length < 9) {
    // Nothing was sent to Paynow, so withdraw the charge we raised.
    await withdrawChargesForPayment(
      t.payment.id,
      "Withdrawn automatically — no valid mobile number was given.",
    );
    return { ok: false, reference: t.payment.reference, error: "Enter a valid mobile money number." };
  }

  const r = await createPaynowMobilePayment({
    reference: t.payment.reference,
    amount: t.amount,
    email: t.email,
    description: t.description,
    phone,
    method: t.method,
  });

  const rawStatus = r.ok
    ? `${t.method}-prompt-sent`
    : r.ambiguous
      ? "uncertain"
      : (r.providerError ?? r.error ?? "declined");

  await prisma.payment.update({
    where: { id: t.payment.id },
    data: {
      // Ambiguous (network/timeout) stays PENDING so polling/webhook can still
      // resolve it — never auto-fail an uncertain charge.
      status: r.ok || r.ambiguous ? PaymentStatus.PENDING : PaymentStatus.FAILED,
      transaction: {
        upsert: {
          create: {
            provider: "paynow",
            pollUrl: r.pollUrl,
            providerRef: r.providerRef,
            rawStatus,
          },
          update: { pollUrl: r.pollUrl, providerRef: r.providerRef, rawStatus },
        },
      },
    },
  });

  if (!r.ok) {
    if (!r.ambiguous) await withdrawChargesForPayment(t.payment.id, DECLINED_NOTE);
    return {
      ok: false,
      reference: t.payment.reference,
      error: r.ambiguous
        ? "We couldn't confirm the request reached EcoCash. Please don't pay again yet — check your phone, then your payment history in a minute."
        : r.error,
    };
  }
  return {
    ok: true,
    reference: t.payment.reference,
    amount: t.amount,
    pollUrl: r.pollUrl,
    instructions: r.instructions,
  };
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
  if (isUsableCheckoutLink(payment.paymentLink)) {
    return { kind: "redirect", url: payment.paymentLink! };
  }

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
export interface PollResult {
  status: "paid" | "pending" | "failed";
  message?: string;
  /**
   * Whether this reflects a definitive answer rather than a failure to get one.
   * False means Paynow could not be reached or could not be trusted — never
   * write a payment off on that basis.
   */
  reconciled: boolean;
}

export async function pollAndSettle(reference: string): Promise<PollResult> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { transaction: true },
  });
  if (!payment) return { status: "failed", message: "Payment not found", reconciled: true };
  // Terminal states never change from a poll.
  if (payment.status === PaymentStatus.PAID) return { status: "paid", reconciled: true };
  if (
    payment.status === PaymentStatus.FAILED ||
    payment.status === PaymentStatus.CANCELLED ||
    payment.status === PaymentStatus.REFUNDED
  ) {
    return {
      status: "failed",
      message: PAYMENT_STATUS_LABEL[payment.status],
      reconciled: true,
    };
  }

  const pollUrl = payment.transaction?.pollUrl;
  if (!pollUrl || pollUrl.startsWith("mock://")) {
    // No verifiable provider poll URL. Only auto-settle the simulated mock in
    // development; in live we can NEVER settle without Paynow confirming.
    if (getPaynowConfig().mode === "development") {
      await settlePayment(reference);
      return { status: "paid", reconciled: true };
    }
    // Nothing was ever registered with a provider, so there is nothing
    // outstanding to find out — this IS the definitive answer.
    return { status: "pending", reconciled: true };
  }

  const verify = await verifyPaynowPayment(pollUrl);
  const reconciled = verify.reachable;
  switch (verify.outcome) {
    case "paid":
      await settlePayment(reference);
      return { status: "paid", reconciled: true };
    case "cancelled":
      await setPaymentStatus(reference, PaymentStatus.CANCELLED, verify.status);
      return { status: "failed", message: "This payment was cancelled.", reconciled };
    case "refunded":
      await setPaymentStatus(reference, PaymentStatus.REFUNDED, verify.status);
      return {
        status: "failed",
        message: "This payment was refunded / reversed.",
        reconciled,
      };
    case "failed":
      await failPayment(reference, verify.status);
      return { status: "failed", message: verify.status, reconciled };
    case "processing":
      await setPaymentStatus(reference, PaymentStatus.PROCESSING, verify.status);
      return { status: "pending", message: "Payment is processing.", reconciled };
    default:
      return { status: "pending", message: verify.status, reconciled };
  }
}

export interface SweepResult {
  /** Payments Paynow confirmed as paid, now settled and receipted. */
  settled: number;
  /** Dead requests closed out, with their charges withdrawn. */
  closed: number;
  /** Left alone because we could not get a trustworthy answer. */
  unresolved: number;
  /** Charges withdrawn that had been stranded by an already-dead payment. */
  withdrawn: number;
}

/**
 * Ask Paynow about every in-flight payment old enough to be finished, then
 * close out whatever is genuinely dead.
 *
 * The order matters, and getting it wrong loses money. The sweep used to cancel
 * stale payments outright, without asking anybody — which was survivable only
 * because it left the charge standing. Now that closing a request also
 * withdraws its charge, cancelling a payment Paynow has actually collected
 * would erase the debt AND the record of the money in one go.
 *
 * That is not hypothetical: a payment sitting PENDING here was reported "Paid"
 * by Paynow, its webhook having never arrived. The next unconditional sweep
 * would have written it off. So every payment that reached a provider is
 * reconciled first, and anything we could not reach the provider about is left
 * exactly as it is — a request stuck in progress is a nuisance, but discarding
 * a real payment is not recoverable from the database alone.
 */
export async function reconcileAndExpirePayments(
  olderThanMinutes = STALE_AFTER_MINUTES,
): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await prisma.payment.findMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
      createdAt: { lt: cutoff },
    },
    select: { reference: true, transaction: { select: { pollUrl: true } } },
    orderBy: { createdAt: "asc" },
  });

  const result: SweepResult = { settled: 0, closed: 0, unresolved: 0, withdrawn: 0 };

  for (const p of stale) {
    const reachedProvider =
      Boolean(p.transaction?.pollUrl) && !p.transaction!.pollUrl!.startsWith("mock://");

    if (reachedProvider) {
      const verdict = await pollAndSettle(p.reference).catch(() => null);
      if (!verdict || !verdict.reconciled) {
        result.unresolved += 1;
        continue;
      }
      if (verdict.status === "paid") {
        result.settled += 1;
        continue;
      }
      if (verdict.status === "failed") {
        // pollAndSettle already moved it through the state machine, which
        // withdrew the charge with it.
        result.closed += 1;
        continue;
      }
      // Reconciled, and Paynow says it was never paid: an abandoned checkout.
      // Fall through and close it.
    }

    const closed = await cancelUnclearedPayment(p.reference, {
      reason: "expired-uncollected",
    }).catch(() => ({ ok: false }));
    if (closed.ok) result.closed += 1;
    else result.unresolved += 1;
  }

  // Charges stranded by payments that died before anything withdrew them.
  // Those payments are terminal and nothing above will ever revisit them, so
  // this is the only thing that takes the debt back off the account.
  result.withdrawn = await withdrawStrandedCharges();

  return result;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/**
 * ── Payment state machine ────────────────────────────────────────────────
 *
 * Every transition a payment is allowed to make, and nothing else. Anything
 * absent from this table is rejected, which is what stops a late or forged
 * out-of-order provider callback from rewriting settled history.
 *
 *   PENDING    → PROCESSING, PAID, FAILED, CANCELLED
 *   PROCESSING → PAID, FAILED, CANCELLED
 *   PAID       → REFUNDED            (the only way out of PAID)
 *   FAILED     → PENDING             (provider retry of the same reference)
 *   CANCELLED  → (terminal)
 *   REFUNDED   → (terminal)
 *
 * PAID is promoted only by settlePayment(), and only after Paynow itself has
 * confirmed. No other function may set it.
 */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [PaymentStatus.PENDING],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Move a payment to a non-paid status, honouring the state machine above.
 * Never promotes a payment to PAID — only settlePayment does that.
 *
 * A refund is the one legal exit from PAID: when it happens the money must also
 * come back off the ledger, so the charges it had settled go back to
 * outstanding and the student is billed for them again.
 *
 * The mirror image applies at the other end: a payment moving to FAILED or
 * CANCELLED can never produce money, so any charge raised purely for that
 * attempt is withdrawn. Without this a declined EcoCash prompt — the student
 * pressing "no" on their phone — still left the rent standing as a debt.
 */
async function setPaymentStatus(
  reference: string,
  status: PaymentStatus,
  rawStatus?: string,
) {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { transaction: true },
  });
  if (!payment) return null;

  if (!canTransition(payment.status, status)) {
    // Not an error — this is the guard doing its job against a late or
    // duplicated provider callback. Record it and leave the payment alone.
    console.warn("[payments] rejected illegal transition", {
      reference,
      from: payment.status,
      to: status,
    });
    return payment;
  }
  if (payment.status === status) return payment;

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (status === PaymentStatus.REFUNDED) {
      await deallocatePayment(payment.id, tx);
    }
    if (status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED) {
      await withdrawChargesForPayment(
        payment.id,
        status === PaymentStatus.CANCELLED
          ? "Withdrawn automatically — the payment was cancelled."
          : DECLINED_NOTE,
        tx,
      );
    }
    return tx.payment.update({
      where: { id: payment.id },
      data: {
        status,
        ...(payment.transaction && rawStatus
          ? { transaction: { update: { rawStatus } } }
          : {}),
      },
    });
  });
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

    // Apply the money to the student's outstanding charges, inside the same
    // transaction that marked it paid — the balance can never be observed in a
    // state where the payment is settled but the debt is still standing.
    // Idempotent, so a replayed webhook re-derives the same allocations.
    await allocatePayment(payment.id, tx);

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
  return setPaymentStatus(reference, PaymentStatus.FAILED, reason);
}
