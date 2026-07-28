import { prisma } from "@/lib/prisma";
import { ChargeCategory, ChargeStatus } from "@prisma/client";
import { toNumber } from "@/lib/utils";
import { nextNumber } from "@/services/numbering";
import { getStudentAccount, CATEGORY_LABEL } from "@/core/billing/ledger";

export interface StatementData {
  student: {
    fullName: string;
    email: string;
    phone: string;
    house: string | null;
    room: string | null;
  };
  /** Everything the student has been charged, with its category. */
  charges: {
    category: ChargeCategory;
    categoryLabel: string;
    description: string;
    amount: number;
    paid: number;
    outstanding: number;
    status: ChargeStatus;
    issuedAt: Date;
    dueDate: Date | null;
    overdue: boolean;
  }[];
  payments: {
    reference: string;
    amount: number;
    method: string;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
  }[];
  totals: {
    totalDue: number;
    totalPaid: number;
    balance: number;
    /** Rent and transport broken out, as well as combined. */
    rent: { charged: number; paid: number; outstanding: number };
    transport: { charged: number; paid: number; outstanding: number };
    other: { charged: number; paid: number; outstanding: number };
    arrears: number;
    credit: number;
    nextDueDate: Date | null;
  };
}

/** Build a live statement view for a student. */
export async function buildStatement(
  studentProfileId: string,
): Promise<StatementData | null> {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      house: true,
      room: true,
      // The statement is built from CHARGES, not invoices. Most real money in
      // both platforms arrived as deposits and self-service payments that never
      // had an invoice, so an invoice-based statement showed a student who had
      // paid hundreds of dollars a total of zero.
      charges: {
        orderBy: { createdAt: "desc" },
        include: { allocations: { select: { amount: true } } },
      },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) return null;

  const now = new Date();
  const charges = student.charges.map((c) => {
    const amount = toNumber(c.amount);
    const paid = c.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
    const outstanding = Math.max(0, amount - paid);
    return {
      category: c.category,
      categoryLabel: CATEGORY_LABEL[c.category],
      description: c.description,
      amount,
      paid: Math.min(paid, amount),
      outstanding,
      status: c.status,
      issuedAt: c.createdAt,
      dueDate: c.dueDate,
      overdue: outstanding > 0 && !!c.dueDate && c.dueDate < now,
    };
  });

  const payments = student.payments.map((p) => ({
    reference: p.reference,
    amount: toNumber(p.amount),
    method: p.method,
    status: p.status,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }));

  // One authoritative source for the numbers, shared with the dashboards.
  const account = await getStudentAccount(studentProfileId);

  return {
    student: {
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      house: student.house?.name ?? null,
      room: student.room?.number ?? null,
    },
    charges,
    payments,
    totals: {
      totalDue: account.totalCharged,
      totalPaid: account.totalPaid,
      balance: account.totalOutstanding,
      rent: {
        charged: account.rent.charged,
        paid: account.rent.paid,
        outstanding: account.rent.outstanding,
      },
      transport: {
        charged: account.transport.charged,
        paid: account.transport.paid,
        outstanding: account.transport.outstanding,
      },
      other: {
        charged: account.other.charged,
        paid: account.other.paid,
        outstanding: account.other.outstanding,
      },
      arrears: account.totalArrears,
      credit: account.unallocatedCredit,
      nextDueDate: account.nextDueDate,
    },
  };
}

/** Persist a statement snapshot (for emailing / records). */
export async function generateStatement(studentProfileId: string) {
  const data = await buildStatement(studentProfileId);
  if (!data) return null;
  const number = await nextNumber("statement");
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.statement.create({
    data: {
      number,
      studentProfileId,
      periodStart,
      periodEnd: now,
      totalDue: data.totals.totalDue,
      totalPaid: data.totals.totalPaid,
      balance: data.totals.balance,
      snapshot: data as unknown as object,
    },
  });
}
