"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { pollPaymentAction } from "@/app/student/actions";

const POLL_INTERVAL = 4000;
const MAX_POLLS = 20; // ~80s

/**
 * Silently re-checks a pending payment after the student returns from Paynow.
 * Paynow settles asynchronously (webhook + poll), so rather than make the
 * student refresh manually, we poll a few times and refresh the page once the
 * payment is confirmed (or definitively fails).
 */
export function PaymentPendingPoll({ reference }: { reference: string }) {
  const router = useRouter();

  React.useEffect(() => {
    let polls = 0;
    let active = true;

    const timer = setInterval(async () => {
      if (!active) return;
      polls += 1;
      try {
        const res = await pollPaymentAction(reference);
        if (res.status === "paid" || res.status === "failed") {
          clearInterval(timer);
          router.refresh();
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (polls >= MAX_POLLS) clearInterval(timer);
    }, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reference, router]);

  return null;
}
