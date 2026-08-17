import { prisma } from "@/lib/prisma";
import {
  ChargeCategory,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { generateReference } from "@/lib/utils";
import { allocatePayment } from "@/core/billing/ledger";
import { createReceipt } from "@/services/receipts";

/**
 * Record money received at the office AGAINST WHAT THE STUDENT ALREADY OWES.
 *
 * This is the missing sibling of recordManualPayment(). That function raises
 * its own charge and settles it — right for a booking deposit, which creates
 * the debt and the money in the same breath. It is wrong for rent handed over
 * in cash, because the rent charge already exists on the ledger: raising a
 * second charge would double the debt and the "payment" would only ever settle
 * the copy.
 *
 * Here the payment is created already-PAID and handed to allocatePayment(),
 * which pays down the student's outstanding charges in the paid category,
 * oldest first — the same allocation rule every other settlement path uses.
 * Anything beyond what is outstanding stays on the payment as unallocated
 * credit rather than being refused: the caretaker counting cash at a desk
 * should never have to hand money back because the ledger disagreed.
 *
 * A receipt is always issued. Cash with no paperwork is how disputes start.
 */
export interface OfficePaymentInput {
  studentProfileId: string;
  amount: number;
  category?: ChargeCategory;
  method?: PaymentMethod;
}

export interface OfficePaymentResult {
  paymentId: string;
  reference: string;
  receiptNumber: string;
  /** How much landed on outstanding charges. */
  allocated: number;
  /** How much remained as credit on the account. */
  credit: number;
}

export async function recordOfficePayment(
  input: OfficePaymentInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<OfficePaymentResult> {
  const amount = input.amount;
  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero.");
  const category = input.category ?? ChargeCategory.RENT;

  const payment = await tx.payment.create({
    data: {
      reference: generateReference("CSH"),
      studentProfileId: input.studentProfileId,
      amount,
      category,
      method: input.method ?? PaymentMethod.CASH,
      status: PaymentStatus.PAID,
      paidAt: new Date(),
    },
  });

  const { allocated, credit } = await allocatePayment(payment.id, tx);
  const receipt = await createReceipt(payment.id, amount, tx);

  return {
    paymentId: payment.id,
    reference: payment.reference,
    receiptNumber: receipt.number,
    allocated,
    credit,
  };
}
