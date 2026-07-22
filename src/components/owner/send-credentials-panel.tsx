"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { sendCredentialsBatchAction } from "@/app/owner/onboarding/actions";

const BATCH_SIZE = 5;

export function SendCredentialsPanel({ pending }: { pending: number }) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  const [sent, setSent] = React.useState(0);
  const [failed, setFailed] = React.useState(0);
  const [remaining, setRemaining] = React.useState(pending);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!running) setRemaining(pending);
  }, [pending, running]);

  async function run() {
    setRunning(true);
    setDone(false);
    setSent(0);
    setFailed(0);
    setErrors([]);
    let totalSent = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    // Loop small batches until nothing remains, or a batch makes no progress.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let res;
      try {
        res = await sendCredentialsBatchAction(BATCH_SIZE);
      } catch (e) {
        toast.error((e as Error).message || "Sending failed. Please try again.");
        break;
      }
      totalSent += res.sent;
      totalFailed += res.failed;
      allErrors.push(...res.errors);
      setSent(totalSent);
      setFailed(totalFailed);
      setRemaining(res.remaining);
      setErrors(allErrors.slice(0, 20));

      // Stop if done, or if this batch delivered nothing (avoid an infinite loop
      // when every send is failing — e.g. SMS/email not configured).
      if (res.remaining === 0 || res.sent === 0) break;
    }

    setRunning(false);
    setDone(true);
    router.refresh();
    if (totalSent > 0) toast.success(`Sent credentials to ${totalSent} student${totalSent === 1 ? "" : "s"}.`);
    if (totalFailed > 0) toast.error(`${totalFailed} could not be delivered — see details.`);
  }

  return (
    <Card className={pending > 0 ? "border-amber-200" : undefined}>
      <CardHeader>
        <CardTitle>Send login credentials</CardTitle>
        <CardDescription>
          Delivers a fresh temporary password to every student who hasn&apos;t been notified yet.
          Safe to run repeatedly — students already sent are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {running && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <Loader2 className="size-4 animate-spin text-brand-600" />
            <span>
              Sending… {sent} sent{failed ? `, ${failed} failed` : ""} · {remaining} remaining
            </span>
          </div>
        )}

        {done && !running && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Finished — {sent} delivered{failed ? `, ${failed} failed` : ""}. {remaining} still awaiting
              credentials.
            </span>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" /> Delivery issues
            </div>
            <ul className="space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="brand" onClick={run} disabled={running || remaining === 0}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {remaining === 0 ? "All credentials sent" : `Send to ${remaining} pending`}
          </Button>
          <p className="text-xs text-muted-foreground">
            SMS is the primary channel; email is included once your domain is verified in Resend.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
