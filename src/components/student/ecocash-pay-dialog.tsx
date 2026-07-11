"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Smartphone, CheckCircle2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  initiateSelfPaymentAction,
  pollPaymentAction,
} from "@/app/student/actions";
import { formatCurrency } from "@/lib/utils";
import type { PaymentPurpose } from "@/constants";

type Phase = "form" | "prompted" | "paid" | "failed";

const POLL_INTERVAL = 4000;
const MAX_POLLS = 25; // ~100s

export function EcocashPayDialog({
  purpose,
  amount,
  title,
  triggerLabel,
  defaultPhone = "",
  variant = "brand",
  size = "sm",
  fullWidth = false,
}: {
  purpose: PaymentPurpose;
  amount: number;
  title: string;
  triggerLabel: string;
  defaultPhone?: string;
  variant?: "brand" | "outline" | "default" | "secondary";
  size?: "sm" | "default" | "lg";
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("form");
  const [phone, setPhone] = React.useState(defaultPhone);
  const [message, setMessage] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();
  const [webPending, startWeb] = React.useTransition();
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const polls = React.useRef(0);

  const stopPolling = React.useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  React.useEffect(() => () => stopPolling(), [stopPolling]);

  function reset() {
    stopPolling();
    polls.current = 0;
    setPhase("form");
    setMessage("");
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function beginPolling(reference: string) {
    polls.current = 0;
    timer.current = setInterval(async () => {
      polls.current += 1;
      const res = await pollPaymentAction(reference);
      if (res.status === "paid") {
        stopPolling();
        setPhase("paid");
        toast.success("Payment received. Thank you!");
        router.refresh();
      } else if (res.status === "failed") {
        stopPolling();
        setPhase("failed");
        setMessage(res.message || "The payment was cancelled or failed.");
      } else if (polls.current >= MAX_POLLS) {
        stopPolling();
        setPhase("failed");
        setMessage(
          "We didn't get a confirmation in time. If you approved it, it may still complete — check your payment history shortly.",
        );
      }
    }, POLL_INTERVAL);
  }

  function sendPrompt() {
    startTransition(async () => {
      const res = await initiateSelfPaymentAction({ purpose, method: "ecocash", phone });
      if (res.success && res.reference) {
        setPhase("prompted");
        setMessage(
          res.instructions ||
            "Check your phone and enter your EcoCash PIN to approve the payment.",
        );
        beginPolling(res.reference);
      } else {
        setPhase("failed");
        setMessage(res.error || "Could not start the payment.");
      }
    });
  }

  function payOnline() {
    startWeb(async () => {
      const res = await initiateSelfPaymentAction({ purpose, method: "web" });
      if (res.success && res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        toast.error(res.error || "Could not open the payment page.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={fullWidth ? "w-full" : undefined}>
          <Smartphone />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {formatCurrency(amount)} · Pay instantly with EcoCash.
          </DialogDescription>
        </DialogHeader>

        {phase === "form" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ecocash-phone">EcoCash number</Label>
              <Input
                id="ecocash-phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You&apos;ll get a prompt on this number to approve {formatCurrency(amount)}.
              </p>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={payOnline}
                disabled={webPending || pending}
              >
                {webPending ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                Pay online instead
              </Button>
              <Button type="button" variant="brand" onClick={sendPrompt} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Smartphone />}
                Send EcoCash prompt
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "prompted" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="size-8 animate-spin text-brand-500" />
            <p className="font-semibold">Check your phone</p>
            <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">
              Waiting for confirmation… you can keep this open.
            </p>
          </div>
        )}

        {phase === "paid" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <p className="font-semibold">Payment received</p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(amount)} paid. A receipt has been generated.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}

        {phase === "failed" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
              {message}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="brand" onClick={reset}>
                Try again
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
