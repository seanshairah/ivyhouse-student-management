import { prisma } from "@/lib/prisma";
import { InvoiceStatus, ChargeCategory, type Prisma } from "@prisma/client";
import { nextNumber } from "@/services/numbering";
import { getStudentAccount, raiseCharge } from "@/core/billing/ledger";
import { toNumber } from "@/lib/utils";

export interface CreateInvoiceInput {
  studentProfileId: string;
  applicationId?: string;
  description: string;
  amount: number;
  dueInDays?: number;
  /** What the money is for. Drives which balance it lands in. */
  category?: ChargeCategory;
}

/**
 * Create an invoice, and the charge that actually makes the student owe it.
 *
 * The invoice is the *document*; the charge is the *debt*. Balances are derived
 * from charges, so an invoice raised without one would print and email
 * correctly while the student's balance stayed exactly where it was.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  tx: Prisma.TransactionClient = prisma,
) {
  const number = await nextNumber("invoice", tx);
  const dueDate = input.dueInDays
    ? new Date(Date.now() + input.dueInDays * 86400000)
    : null;

  const invoice = await tx.invoice.create({
    data: {
      number,
      studentProfileId: input.studentProfileId,
      applicationId: input.applicationId,
      description: input.description,
      amount: input.amount,
      status: InvoiceStatus.SENT,
      dueDate,
    },
  });

  await raiseCharge(
    {
      studentProfileId: input.studentProfileId,
      category: input.category ?? ChargeCategory.OTHER,
      description: input.description,
      amount: input.amount,
      dueDate,
      invoiceId: invoice.id,
    },
    tx,
  );

  return invoice;
}

/** Recompute invoice status from its payments after a payment changes. */
export async function updateInvoiceAfterPayment(
  invoiceId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return null;

  const paid = invoice.payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
  const total = toNumber(invoice.amount);

  let status: InvoiceStatus = InvoiceStatus.SENT;
  if (paid >= total && total > 0) status = InvoiceStatus.PAID;
  else if (paid > 0) status = InvoiceStatus.PARTIALLY_PAID;
  else if (invoice.dueDate && invoice.dueDate < new Date())
    status = InvoiceStatus.OVERDUE;

  return tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: paid, status },
  });
}

/**
 * A student's balance, derived from the charge ledger.
 *
 * This used to sum Invoice.amount and Invoice.amountPaid, which meant any
 * payment not attached to an invoice — every self-service rent and transport
 * payment — was invisible to it. It now delegates to the ledger, which is the
 * one authoritative answer, and additionally reports rent and transport
 * separately as well as combined.
 */
export type StudentBalance = Awaited<ReturnType<typeof getStudentBalance>>;

/** A zero balance, for students who have no profile or no charges yet. */
export function emptyStudentBalance(): StudentBalance {
  const zero = (category: ChargeCategory) => ({
    category,
    charged: 0,
    paid: 0,
    outstanding: 0,
    arrears: 0,
    nextDueDate: null,
  });
  return {
    totalDue: 0,
    totalPaid: 0,
    balance: 0,
    rent: zero(ChargeCategory.RENT),
    transport: zero(ChargeCategory.TRANSPORT),
    other: zero(ChargeCategory.OTHER),
    arrears: 0,
    inArrears: false,
    nextDueDate: null,
    credit: 0,
  };
}

export async function getStudentBalance(studentProfileId: string) {
  const account = await getStudentAccount(studentProfileId);
  return {
    totalDue: account.totalCharged,
    totalPaid: account.totalPaid,
    balance: account.totalOutstanding,
    rent: account.rent,
    transport: account.transport,
    other: account.other,
    arrears: account.totalArrears,
    inArrears: account.inArrears,
    nextDueDate: account.nextDueDate,
    credit: account.unallocatedCredit,
  };
}
