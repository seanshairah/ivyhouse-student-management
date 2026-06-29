"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { payNowAction } from "@/app/student/actions";

interface CheckoutClientProps {
  reference: string;
  amount: number;
}

/** Simulated Paynow checkout actions: pay (settle) or cancel. */
export function CheckoutClient({ reference, amount }: CheckoutClientProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const pay = () =>
    start(async () => {
      const res = await payNowAction(reference);
      if (res.success) {
        router.push(
          `/student/payments/return?ref=${encodeURIComponent(reference)}&status=paid`,
        );
      } else {
        toast.error(res.error ?? "Payment failed. Please try again.");
      }
    });

  const cancel = () =>
    router.push(
      `/student/payments/return?ref=${encodeURIComponent(reference)}&status=cancelled`,
    );

  return (
    <div className="space-y-3">
      <Button
        variant="brand"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={pay}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Lock />
        )}
        Pay {formatCurrency(amount)} now
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={cancel}
      >
        Cancel
      </Button>
      <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Secured simulated checkout
      </p>
    </div>
  );
}
