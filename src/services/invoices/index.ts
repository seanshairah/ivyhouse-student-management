import { prisma } from "@/lib/prisma";
import { InvoiceStatus, type Prisma } from "@prisma/client";
import { nextNumber } from "@/services/numbering";
import { toNumber } from "@/lib/utils";

export interface CreateInvoiceInput {
  studentProfileId: string;
  applicationId?: string;
  description: string;
  amount: number;
  dueInDays?: number;
}

/** Create an invoice with an auto-generated number. */
export async function createInvoice(
  input: CreateInvoiceInput,
  tx: Prisma.TransactionClient = prisma,
) {
  const number = await nextNumber("invoice");
  const dueDate = input.dueInDays
    ? new Date(Date.now() + input.dueInDays * 86400000)
    : null;
  return tx.invoice.create({
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

export async function getStudentBalance(studentProfileId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { studentProfileId, status: { not: "CANCELLED" } },
  });
  const totalDue = invoices.reduce((s, i) => s + toNumber(i.amount), 0);
  const totalPaid = invoices.reduce((s, i) => s + toNumber(i.amountPaid), 0);
  return { totalDue, totalPaid, balance: totalDue - totalPaid };
}
