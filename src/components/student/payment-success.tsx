"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Download, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface PaymentSuccessProps {
  amount: number;
  receiptNumber?: string | null;
  receiptId?: string | null;
}

/** Animated success state shown on the payment return page. */
export function PaymentSuccess({
  amount,
  receiptNumber,
  receiptId,
}: PaymentSuccessProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
      >
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 260, damping: 18 }}
        >
          <Check className="size-10" strokeWidth={3} />
        </motion.span>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-5 font-display text-2xl font-bold tracking-tight"
      >
        Payment successful
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="mt-1.5 text-sm text-muted-foreground"
      >
        We&apos;ve received your payment of{" "}
        <span className="font-semibold text-foreground">
          {formatCurrency(amount)}
        </span>
        .
      </motion.p>

      {receiptNumber && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-2 text-sm"
        >
          Receipt <span className="font-semibold">{receiptNumber}</span>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 }}
        className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center"
      >
        {receiptId && (
          <Button asChild variant="outline">
            <a
              href={`/api/documents/receipt/${receiptId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download />
              Download receipt
            </a>
          </Button>
        )}
        <Button asChild variant="brand">
          <Link href="/student/payments">
            Back to payments
            <ArrowRight />
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
