import Link from "next/link";
import { CheckCircle2, CreditCard, Info } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPaynowConfig } from "@/services/payments";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Separator } from "@/components/ui/misc";
import { CheckoutClient } from "@/components/student/checkout-client";
import { formatCurrency } from "@/lib/utils";
import { PaymentStatus } from "@prisma/client";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const session = await requireRole("STUDENT");
  const { ref } = await searchParams;
  const config = getPaynowConfig();

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });

  const payment = ref
    ? await prisma.payment.findUnique({
        where: { reference: ref },
        include: { invoice: true, studentProfile: true },
      })
    : null;

  // Guard: must exist and belong to this student.
  if (!payment || !profile || payment.studentProfileId !== profile.id) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Checkout" />
        <EmptyState
          icon={<CreditCard className="size-5" />}
          title="Payment not found"
          description="We couldn't find that payment request. It may have expired or already been completed."
          action={
            <Button asChild variant="brand">
              <Link href="/student/payments">Back to payments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const amount = Number(payment.amount);
  const alreadyPaid = payment.status === PaymentStatus.PAID;
  const description = payment.invoice?.description ?? "Accommodation payment";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Checkout" description="Complete your payment" />

      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl gradient-brand text-white">
              <CreditCard className="size-5" />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-tight">Paynow</p>
              <p className="text-xs text-muted-foreground">Secure checkout</p>
            </div>
          </div>
          <Badge color={config.mode === "development" ? "amber" : "emerald"}>
            {config.mode === "development" ? "Test mode" : "Live"}
          </Badge>
        </div>

        <CardContent className="space-y-5 p-6">
          {config.mode === "development" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                This is a development / mock checkout. No real money will be
                charged — clicking pay simulates a successful Paynow payment.
              </span>
            </div>
          )}

          <div className="text-center">
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight">
              {formatCurrency(amount)}
            </p>
          </div>

          <Separator />

          <div className="space-y-2.5 text-sm">
            <Row label="Description" value={description} />
            <Row label="Reference" value={payment.reference} />
            {payment.invoice && (
              <Row label="Invoice" value={payment.invoice.number} />
            )}
            <Row label="Payee" value={payment.studentProfile.fullName} />
          </div>

          <Separator />

          {alreadyPaid ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="size-7" />
              </div>
              <p className="font-semibold">This payment is already complete</p>
              <Button asChild variant="brand" className="w-full">
                <Link href="/student/payments">Back to payments</Link>
              </Button>
            </div>
          ) : (
            <CheckoutClient reference={payment.reference} amount={amount} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
