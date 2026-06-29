import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { nextNumber } from "@/services/numbering";

export interface StatementData {
  student: {
    fullName: string;
    email: string;
    phone: string;
    house: string | null;
    room: string | null;
  };
  invoices: {
    number: string;
    description: string;
    amount: number;
    amountPaid: number;
    status: string;
    issuedAt: Date;
    dueDate: Date | null;
  }[];
  payments: {
    reference: string;
    amount: number;
    method: string;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
  }[];
  totals: { totalDue: number; totalPaid: number; balance: number };
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
      invoices: { orderBy: { issuedAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) return null;

  const invoices = student.invoices.map((i) => ({
    number: i.number,
    description: i.description,
    amount: toNumber(i.amount),
    amountPaid: toNumber(i.amountPaid),
    status: i.status,
    issuedAt: i.issuedAt,
    dueDate: i.dueDate,
  }));
  const payments = student.payments.map((p) => ({
    reference: p.reference,
    amount: toNumber(p.amount),
    method: p.method,
    status: p.status,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  }));

  const totalDue = invoices
    .filter((i) => i.status !== "CANCELLED")
    .reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);

  return {
    student: {
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      house: student.house?.name ?? null,
      room: student.room?.number ?? null,
    },
    invoices,
    payments,
    totals: { totalDue, totalPaid, balance: totalDue - totalPaid },
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
