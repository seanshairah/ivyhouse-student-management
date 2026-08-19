import type { PlatformConfig } from "@/core/platform/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  IVY HOUSE — platform configuration
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This file is the ONLY thing that differs between the two housing platforms
 * that run on this operating system. Everything under `src/core/` is shared and
 * byte-identical across both repositories; if you find yourself about to fork a
 * file in `src/core/`, add a setting here instead.
 *
 * The public marketing site (src/app/page.tsx, /houses, /about and
 * src/components/marketing/**) is deliberately NOT driven by this file — each
 * platform keeps its own independent brand, copy and imagery.
 */
export const platformConfig: PlatformConfig = {
  key: "ivy-house",
  name: "Ivy House",
  legalName: "Ivy Properties",
  tagline: "Secure, verified student living beside Chinhoyi's main campus.",

  // Where the operating system lives. Used for links in email/SMS and for the
  // Paynow return/result URLs when they are not set explicitly.
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  contact: {
    email: "info@ivyproperties.co.zw",
    phone: "+263 77 000 0000",
    address: "Chinhoyi, Zimbabwe",
  },

  // Sender identity for outbound notifications. Must be on a domain verified
  // with the email provider, or delivery silently fails.
  senders: {
    emailFrom:
      process.env.RESEND_FROM_EMAIL ??
      process.env.EMAIL_FROM ??
      "Ivy Properties <notifications@ivyproperties.co.zw>",
    smsSenderId: process.env.SMSPOP_SENDER_ID ?? "Ivyhouse",
  },

  billing: {
    currency: "USD",
    // Months billed as one semester.
    semesterMonths: 4,
    // Flat monthly campus transport / shuttle subscription.
    transportMonthlyFee: 15,
    // Rent per student per month, by room sharing tier. A room type absent from
    // this map falls back to the room's own `price` column.
    rentByRoomType: {
      SHARED_DOUBLE: 120,
      SHARED_TRIPLE: 90,
    },
    // Used only when a student has no room and no tier price applies.
    defaultMonthlyRent: 120,
    // Days a newly raised charge is given before it counts as arrears.
    paymentTermsDays: 7,
    // Whether a student may pay part of an outstanding charge.
    allowPartialPayments: true,
    // Whether one payment may settle rent and transport together.
    allowCombinedPayments: true,
  },

  documents: {
    invoicePrefix: "INV",
    receiptPrefix: "RCT",
    statementPrefix: "STM",
  },
};
