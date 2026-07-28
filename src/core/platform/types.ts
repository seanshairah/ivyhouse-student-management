/**
 * Shape of a platform's configuration.
 *
 * SHARED CORE — this file is identical in every repository that runs this
 * operating system. Per-platform values live in `src/platform/config.ts`.
 */

/** Stable identifier for a platform. Also stored in Settings.platformKey. */
export type PlatformKey = "ivy-house" | "blessbri";

export interface PlatformBilling {
  currency: string;
  semesterMonths: number;
  transportMonthlyFee: number;
  /** Monthly rent per student keyed by Prisma RoomType. */
  rentByRoomType: Record<string, number>;
  defaultMonthlyRent: number;
  paymentTermsDays: number;
  allowPartialPayments: boolean;
  allowCombinedPayments: boolean;
}

export interface PlatformConfig {
  key: PlatformKey;
  name: string;
  legalName: string;
  tagline: string;
  appUrl: string;
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  senders: {
    emailFrom: string;
    smsSenderId: string;
  };
  billing: PlatformBilling;
  documents: {
    invoicePrefix: string;
    receiptPrefix: string;
    statementPrefix: string;
  };
}
