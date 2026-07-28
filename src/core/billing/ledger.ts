import { prisma } from "@/lib/prisma";
import {
  ChargeCategory,
  ChargeStatus,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { toNumber } from "@/lib/utils";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE LEDGER — the one authoritative answer to "what does this student owe?"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Rules this module exists to enforce:
 *
 *  1. A balance is DERIVED, never stored. It is always
 *       sum(OUTSTANDING charges) - sum(allocations against those charges)
 *     so there is no running total anywhere that can drift out of step.
 *
 *  2. Rent and transport are separate CATEGORIES on the charge itself, not
 *     guesses made from a description string or a reference prefix. The old
 *     code inferred "is this a deposit?" from `reference.startsWith("DEP-")` in
 *     one platform and `/deposit/i.test(description)` in the other — two
 *     different answers to the same question. Category is now explicit.
 *
 *  3. Money is applied to charges through PaymentAllocation rows, so one
 *     payment can settle several charges (combined payment) and one charge can
 *     be settled by several payments (partial payment) without either side
 *     needing to know about the other.
 */

/** Money owed and paid within a single charge category. */
export interface CategoryBalance {
  category: ChargeCategory;
  /** Total raised in this category (excluding waived/cancelled). */
  charged: number;
  /** Total allocated against those charges. */
  paid: number;
  /** charged - paid. Never negative; credit surfaces separately. */
  outstanding: number;
  /** Outstanding amount whose due date has passed. */
  arrears: number;
  /** Earliest unpaid due date, if any. */
  nextDueDate: Date | null;
}

export interface StudentAccount {
  studentProfileId: string;
  rent: CategoryBalance;
  transport: CategoryBalance;
  /** Deposits, penalties, adjustments and anything else. */
  other: CategoryBalance;
  /** Every category combined — what the student owes in total. */
  totalOutstanding: number;
  totalCharged: number;
  totalPaid: number;
  /** Any outstanding amount already past its due date. */
  totalArrears: number;
  /** Money received that is not yet applied to any charge. */
  unallocatedCredit: number;
  nextDueDate: Date | null;
  inArrears: boolean;
}

const EMPTY = (category: ChargeCategory): CategoryBalance => ({
  category,
  charged: 0,
  paid: 0,
  outstanding: 0,
  arrears: 0,
  nextDueDate: null,
});

/** Charge categories that count as rent for reporting purposes. */
const RENT_CATEGORIES: ChargeCategory[] = [ChargeCategory.RENT];
const TRANSPORT_CATEGORIES: ChargeCategory[] = [ChargeCategory.TRANSPORT];

/**
 * Build a student's complete account position in a single query.
 *
 * Deliberately one round-trip: the student dashboard, the owner's student
 * detail page and the statement generator all call this, and the previous code
 * recomputed similar numbers three different ways in three different files.
 */
export async function getStudentAccount(
  studentProfileId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<StudentAccount> {
  const charges = await client.charge.findMany({
    where: {
      studentProfileId,
      status: { in: [ChargeStatus.OUTSTANDING, ChargeStatus.SETTLED] },
    },
    select: {
      category: true,
      amount: true,
      dueDate: true,
      allocations: { select: { amount: true } },
    },
  });

  const now = new Date();
  const buckets = new Map<ChargeCategory, CategoryBalance>();

  for (const charge of charges) {
    const bucket = buckets.get(charge.category) ?? EMPTY(charge.category);
    const amount = toNumber(charge.amount);
    const allocated = charge.allocations.reduce(
      (sum, a) => sum + toNumber(a.amount),
      0,
    );
    // Clamp: an over-allocation must not create a negative charge balance that
    // silently cancels out another charge's genuine arrears.
    const remaining = Math.max(0, amount - allocated);

    bucket.charged += amount;
    bucket.paid += Math.min(allocated, amount);
    bucket.outstanding += remaining;

    if (remaining > 0 && charge.dueDate) {
      if (charge.dueDate < now) bucket.arrears += remaining;
      if (!bucket.nextDueDate || charge.dueDate < bucket.nextDueDate) {
        bucket.nextDueDate = charge.dueDate;
      }
    }
    buckets.set(charge.category, bucket);
  }

  const merge = (categories: ChargeCategory[], label: ChargeCategory) => {
    const out = EMPTY(label);
    for (const c of categories) {
      const b = buckets.get(c);
      if (!b) continue;
      out.charged += b.charged;
      out.paid += b.paid;
      out.outstanding += b.outstanding;
      out.arrears += b.arrears;
      if (b.nextDueDate && (!out.nextDueDate || b.nextDueDate < out.nextDueDate)) {
        out.nextDueDate = b.nextDueDate;
      }
    }
    return out;
  };

  const rent = merge(RENT_CATEGORIES, ChargeCategory.RENT);
  const transport = merge(TRANSPORT_CATEGORIES, ChargeCategory.TRANSPORT);
  const otherCategories = [...buckets.keys()].filter(
    (c) => !RENT_CATEGORIES.includes(c) && !TRANSPORT_CATEGORIES.includes(c),
  );
  const other = merge(otherCategories, ChargeCategory.OTHER);

  // Settled money that hasn't been applied to a charge — an overpayment, or a
  // payment that arrived before its charge was raised. Shown to the student as
  // credit rather than being silently lost.
  const paidAgg = await client.payment.aggregate({
    where: { studentProfileId, status: PaymentStatus.PAID },
    _sum: { amount: true },
  });
  const allocatedAgg = await client.paymentAllocation.aggregate({
    where: { payment: { studentProfileId, status: PaymentStatus.PAID } },
    _sum: { amount: true },
  });
  const unallocatedCredit = Math.max(
    0,
    toNumber(paidAgg._sum.amount ?? 0) - toNumber(allocatedAgg._sum.amount ?? 0),
  );

  const nextDueDate = [rent.nextDueDate, transport.nextDueDate, other.nextDueDate]
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const totalOutstanding = rent.outstanding + transport.outstanding + other.outstanding;
  const totalArrears = rent.arrears + transport.arrears + other.arrears;

  return {
    studentProfileId,
    rent,
    transport,
    other,
    totalOutstanding,
    totalCharged: rent.charged + transport.charged + other.charged,
    totalPaid: rent.paid + transport.paid + other.paid,
    totalArrears,
    unallocatedCredit,
    nextDueDate,
    inArrears: totalArrears > 0,
  };
}

export interface RaiseChargeInput {
  studentProfileId: string;
  category: ChargeCategory;
  description: string;
  amount: number;
  dueDate?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  invoiceId?: string | null;
}

/** Raise a new charge against a student. */
export async function raiseCharge(
  input: RaiseChargeInput,
  client: Prisma.TransactionClient = prisma,
) {
  if (!(input.amount > 0)) {
    throw new Error("A charge amount must be greater than zero.");
  }
  return client.charge.create({
    data: {
      studentProfileId: input.studentProfileId,
      category: input.category,
      description: input.description,
      amount: input.amount,
      dueDate: input.dueDate ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      invoiceId: input.invoiceId ?? null,
      status: ChargeStatus.OUTSTANDING,
    },
  });
}

/**
 * Apply a settled payment to the student's outstanding charges.
 *
 * Allocation order: the payment's own category first (so a transport payment
 * clears transport debt, never rent), oldest due date first within a category.
 * Whatever cannot be allocated stays as credit and is picked up by the next
 * charge raised — money is never discarded.
 *
 * IDEMPOTENT. Allocation rows are keyed on (paymentId, chargeId) and this
 * function first clears any allocations the payment already has, so replaying a
 * webhook re-derives the same rows instead of paying the debt down twice.
 */
export async function allocatePayment(
  paymentId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<{ allocated: number; credit: number }> {
  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      amount: true,
      status: true,
      category: true,
      studentProfileId: true,
    },
  });
  if (!payment) throw new Error("Payment not found");
  // Only settled money is allowed to move a balance.
  if (payment.status !== PaymentStatus.PAID) return { allocated: 0, credit: 0 };

  // Idempotency: undo anything this payment previously did, then redo it from
  // scratch. Undoing must also return the charges it had settled to
  // OUTSTANDING — deleting the allocation rows alone would leave those charges
  // marked settled but unpaid, and the re-run would skip them and lose the money.
  await deallocatePayment(payment.id, client);

  const charges = await client.charge.findMany({
    where: {
      studentProfileId: payment.studentProfileId,
      status: ChargeStatus.OUTSTANDING,
    },
    select: {
      id: true,
      category: true,
      amount: true,
      dueDate: true,
      createdAt: true,
      allocations: { select: { amount: true } },
    },
  });

  const preferred = payment.category;
  const ordered = charges.sort((a, b) => {
    // The payment's own category is settled first.
    const aPreferred = a.category === preferred ? 0 : 1;
    const bPreferred = b.category === preferred ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    // Then oldest debt first.
    const aDue = a.dueDate?.getTime() ?? a.createdAt.getTime();
    const bDue = b.dueDate?.getTime() ?? b.createdAt.getTime();
    return aDue - bDue;
  });

  let remaining = toNumber(payment.amount);
  let allocated = 0;

  for (const charge of ordered) {
    if (remaining <= 0) break;
    const already = charge.allocations.reduce((s, a) => s + toNumber(a.amount), 0);
    const owed = round2(toNumber(charge.amount) - already);
    if (owed <= 0) continue;

    const apply = round2(Math.min(owed, remaining));
    if (apply <= 0) continue;

    await client.paymentAllocation.create({
      data: { paymentId: payment.id, chargeId: charge.id, amount: apply },
    });

    remaining = round2(remaining - apply);
    allocated = round2(allocated + apply);

    if (apply >= owed) {
      await client.charge.update({
        where: { id: charge.id },
        data: { status: ChargeStatus.SETTLED },
      });
    }
  }

  return { allocated, credit: round2(remaining) };
}

/**
 * Reverse a payment's effect on the ledger — used when a settled payment is
 * later refunded or reversed by the provider. Charges it had settled return to
 * OUTSTANDING so they are billed again.
 */
export async function deallocatePayment(
  paymentId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  const allocations = await client.paymentAllocation.findMany({
    where: { paymentId },
    select: { chargeId: true },
  });
  if (allocations.length === 0) return;

  await client.paymentAllocation.deleteMany({ where: { paymentId } });
  await client.charge.updateMany({
    where: {
      id: { in: allocations.map((a) => a.chargeId) },
      status: ChargeStatus.SETTLED,
    },
    data: { status: ChargeStatus.OUTSTANDING },
  });
}

/** Currency rounding. Amounts are Decimal(10,2) in the database. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
