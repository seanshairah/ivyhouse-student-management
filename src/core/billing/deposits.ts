import { prisma } from "@/lib/prisma";
import {
  ChargeCategory,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { generateReference } from "@/lib/utils";
import { raiseCharge, allocatePayment } from "@/core/billing/ledger";
import { createReceipt } from "@/services/receipts";

/**
 * Record money already received in cash or by bank transfer.
 *
 * This is the busiest path in both platforms — most real payments are booking
 * deposits taken at the office — and both had it wrong, in different ways:
 *
 *   - One created a bare Payment row with no charge, no invoice and NO RECEIPT,
 *     so the student had nothing to show for their money.
 *   - The other created an invoice, payment and receipt but left
 *     Payment.category at its OTHER default, so the owner's "deposits
 *     collected" figure — which sums by category — read zero.
 *
 * One function now, used by both, so a deposit is always: a charge in the
 * DEPOSIT category, a settled payment carrying that category, an allocation
 * tying the two together, and a receipt the student can download.
 */
export interface RecordDepositInput {
  studentProfileId: string;
  amount: number;
  /** Defaults to a booking deposit; pass a category for other manual takings. */
  category?: ChargeCategory;
  description?: string;
  method?: PaymentMethod;
  /** Skip if this student already has a settled payment in this category. */
  onlyIfNone?: boolean;
}

export async function recordManualPayment(
  input: RecordDepositInput,
  tx: Prisma.TransactionClient = prisma,
) {
  const amount = input.amount;
  if (!(amount > 0)) throw new Error("A deposit amount must be greater than zero.");

  const category = input.category ?? ChargeCategory.DEPOSIT;
  const description = input.description ?? "Booking deposit";

  if (input.onlyIfNone) {
    // Guard on the recorded category rather than on a "DEP-" reference prefix.
    // The prefix was the old way of asking this question and is exactly the
    // string-sniffing the ledger exists to replace.
    const already = await tx.payment.count({
      where: {
        studentProfileId: input.studentProfileId,
        category,
        status: PaymentStatus.PAID,
      },
    });
    if (already > 0) return null;
  }

  // The debt first, so the money has something to attach to.
  const charge = await raiseCharge(
    {
      studentProfileId: input.studentProfileId,
      category,
      description,
      amount,
      // Already paid, so it is not owed and has no due date.
      dueDate: null,
    },
    tx,
  );

  const payment = await tx.payment.create({
    data: {
      reference: generateReference("DEP"),
      studentProfileId: input.studentProfileId,
      amount,
      category,
      method: input.method ?? PaymentMethod.CASH,
      status: PaymentStatus.PAID,
      paidAt: new Date(),
    },
  });

  // Settle it against the charge we just raised, then issue the receipt. This
  // does not go through settlePayment() because the money did not come from
  // Paynow and there is nothing to verify with a provider — but the ledger
  // effect and the paperwork must be identical.
  await allocatePayment(payment.id, tx);
  const receipt = await createReceipt(payment.id, amount, tx);

  return { charge, payment, receipt };
}
