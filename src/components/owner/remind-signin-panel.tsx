"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { remindNotSignedInBatchAction } from "@/app/owner/onboarding/actions";

const BATCH_SIZE = 5;

/**
 * Text a fresh temporary password to every student who has never signed in.
 *
 * `pending` is who a reminder would reach RIGHT NOW — students texted in the
 * last few hours are held back. Sending rotates the password, so a reminded
 * student still counts as "never signed in"; without that cooldown the same
 * people would be texted on every run and the batch loop would never end.
 */
export function RemindSignInPanel({
  pending,
  neverSignedIn,
  loginUrl,
  smsConfigured,
}: {
  pending: number;
  neverSignedIn: number;
  loginUrl: string;
  smsConfigured: boolean;
}) {
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

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let res;
      try {
        res = await remindNotSignedInBatchAction(BATCH_SIZE);
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

      // Stop when nothing is left, or when a whole batch delivered nothing —
      // otherwise a misconfigured SMS provider would loop indefinitely.
      if (res.remaining === 0 || res.sent === 0) break;
    }

    setRunning(false);
    setDone(true);
    router.refresh();
    if (totalSent > 0) toast.success(`Texted ${totalSent} student${totalSent === 1 ? "" : "s"}.`);
    if (totalFailed > 0) toast.error(`${totalFailed} could not be texted — see details.`);
  }

  return (
    <Card className={pending > 0 ? "border-amber-200" : undefined}>
      <CardHeader>
        <CardTitle>Remind students who haven&apos;t signed in</CardTitle>
        <CardDescription>
          Sends an SMS with a fresh temporary password to every student still sitting on the login
          we issued. Students who have already set their own password are never messaged, and each
          send rotates the password so what arrives always works.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!smsConfigured && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              No SMS provider is configured, so nothing can be sent. Set{" "}
              <span className="font-mono">SMSPOP_API_KEY</span> and{" "}
              <span className="font-mono">SMSPOP_SENDER_ID</span>, then reload this page.
            </span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          The SMS will tell students to sign in at{" "}
          <span className="font-medium text-foreground">{loginUrl}</span>. If that is not your live
          site, fix <span className="font-mono">APP_URL</span> before sending.
        </div>

        {running && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <Loader2 className="size-4 animate-spin text-brand-600" />
            <span>
              Texting… {sent} sent{failed ? `, ${failed} failed` : ""} · {remaining} remaining
            </span>
          </div>
        )}

        {done && !running && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Finished — {sent} texted{failed ? `, ${failed} failed` : ""}.{" "}
              {remaining > 0 ? `${remaining} still to text.` : "Nobody left to text right now."}
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
          <Button
            variant="brand"
            onClick={run}
            disabled={running || remaining === 0 || !smsConfigured}
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            {remaining === 0
              ? neverSignedIn === 0
                ? "Everyone has signed in"
                : "Already reminded — try again later"
              : `Text ${remaining} student${remaining === 1 ? "" : "s"}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            SMS only — these students already have the email.
            {neverSignedIn > 0 && ` ${neverSignedIn} still haven't signed in.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
