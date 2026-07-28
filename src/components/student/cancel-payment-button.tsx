"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { cancelPaymentAction } from "@/app/student/actions";
import { Button } from "@/components/ui/button";

/**
 * Abandon a payment that was started and never completed.
 *
 * Only offered for in-flight payments; the action refuses anything already
 * settled, so this can never be used to make a paid payment disappear.
 */
export function CancelPaymentButton({
  reference,
  size = "sm",
}: {
  reference: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function cancel() {
    startTransition(async () => {
      try {
        const res = await cancelPaymentAction(reference);
        if (res.success) {
          toast.success("Payment request cancelled.");
          router.refresh();
        } else {
          toast.error(res.error ?? "Could not cancel this payment.");
        }
      } catch {
        toast.error("Could not cancel this payment. Please try again.");
      } finally {
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size={size}
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        <X className="size-4" aria-hidden="true" />
        Cancel
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Cancel this request?</span>
      <Button variant="destructive" size={size} onClick={cancel} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Yes
      </Button>
      <Button
        variant="ghost"
        size={size}
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        No
      </Button>
    </div>
  );
}
