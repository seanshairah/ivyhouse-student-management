import { prisma } from "@/lib/prisma";
import { type Prisma } from "@prisma/client";
import { nextNumber } from "@/services/numbering";

/** Create a receipt for a successful payment (idempotent per payment). */
export async function createReceipt(
  paymentId: string,
  amount: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const existing = await tx.receipt.findUnique({ where: { paymentId } });
  if (existing) return existing;
  const number = await nextNumber("receipt", tx);
  return tx.receipt.create({
    data: { number, paymentId, amount },
  });
}

export async function getReceipt(id: string) {
  return prisma.receipt.findUnique({
    where: { id },
    include: {
      payment: {
        include: {
          studentProfile: { include: { house: true, room: true } },
          invoice: true,
        },
      },
    },
  });
}
