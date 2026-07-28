import { ChargeCategory } from "@prisma/client";
import { platform } from "@/core/platform";

/**
 * Server-side pricing. The browser never sends an amount — it sends a purpose,
 * and this module turns that into money using the platform's configured rates.
 *
 * This is the single place rent and transport prices are decided, for both
 * student self-service payments and administrator-raised charges.
 */

/**
 * The one currency this platform prices, collects and receipts in.
 *
 * Zimbabwe runs two currencies side by side, so "$" on its own is ambiguous.
 * Everything here is US dollars. Which account the money actually lands in is
 * decided by the Paynow integration rather than by anything sent on the wire —
 * see PAYNOW_CURRENCY in `src/services/payments/paynow.ts`, which refuses to
 * run against a configuration claiming anything else.
 */
export const CURRENCY = "USD" as const;

/** What a student can choose to pay for from the portal. */
export type PaymentPurpose = "RENT_MONTH" | "RENT_SEMESTER" | "TRANSPORT_MONTH";

export const PAYMENT_PURPOSES: PaymentPurpose[] = [
  "RENT_MONTH",
  "RENT_SEMESTER",
  "TRANSPORT_MONTH",
];

export function isPaymentPurpose(value: unknown): value is PaymentPurpose {
  return (
    typeof value === "string" &&
    (PAYMENT_PURPOSES as string[]).includes(value)
  );
}

/**
 * The monthly rent for a student: the platform's fixed rate for their room's
 * sharing tier when one is configured, otherwise the room's own price,
 * otherwise the platform default.
 */
export function monthlyRentFor(
  roomType?: string | null,
  roomPrice?: number | null,
): number {
  const { rentByRoomType, defaultMonthlyRent } = platform().billing;
  if (roomType && rentByRoomType[roomType] != null) return rentByRoomType[roomType];
  if (roomPrice && roomPrice > 0) return roomPrice;
  return defaultMonthlyRent;
}

export function transportMonthlyFee(): number {
  return platform().billing.transportMonthlyFee;
}

export interface PricedPurpose {
  amount: number;
  description: string;
  category: ChargeCategory;
  /** Months of service this covers, for the charge's billing period. */
  months: number;
}

/**
 * Turn a purpose into a priced, categorised charge. The returned `category` is
 * what keeps rent and transport in separate ledgers downstream — it is never
 * inferred from the description text.
 */
export function priceFor(
  purpose: PaymentPurpose,
  monthlyRent: number,
): PricedPurpose {
  const { semesterMonths } = platform().billing;
  const rent = monthlyRent > 0 ? monthlyRent : platform().billing.defaultMonthlyRent;

  switch (purpose) {
    case "RENT_MONTH":
      return {
        amount: rent,
        description: "Accommodation — 1 month rent",
        category: ChargeCategory.RENT,
        months: 1,
      };
    case "RENT_SEMESTER":
      return {
        amount: rent * semesterMonths,
        description: `Accommodation — semester rent (${semesterMonths} months)`,
        category: ChargeCategory.RENT,
        months: semesterMonths,
      };
    case "TRANSPORT_MONTH":
      return {
        amount: transportMonthlyFee(),
        description: "Campus transport — 1 month",
        category: ChargeCategory.TRANSPORT,
        months: 1,
      };
  }
}

/** Billing period covering `months` from `from`. */
export function periodFrom(from: Date, months: number): { start: Date; end: Date } {
  const start = new Date(from);
  const end = new Date(from);
  end.setMonth(end.getMonth() + months);
  return { start, end };
}

/** Due date for a newly raised charge, per the platform's payment terms. */
export function dueDateFromNow(now: Date = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + platform().billing.paymentTermsDays);
  return due;
}
