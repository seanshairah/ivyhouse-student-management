import Link from "next/link";
import { XCircle, AlertTriangle, CreditCard } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { confirmPaymentReturn } from "@/app/student/actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { PaymentSuccess } from "@/components/student/payment-success";
import { PayButton } from "@/components/student/pay-button";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; status?: string }>;
}) {
  const session = await requireRole("STUDENT");
  const { ref, status } = await searchParams;

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });

  if (!ref || !profile) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Payment" />
        <EmptyState
          icon={<CreditCard className="size-5" />}
          title="No payment to show"
          description="We couldn't find a payment reference."
          action={
            <Button asChild variant="brand">
              <Link href="/student/payments">Back to payments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const cancelled = status === "cancelled" || status === "failed";

  // For non-cancelled returns, idempotently verify/settle the payment.
  if (!cancelled) {
    await confirmPaymentReturn(ref);
  }

  const payment = await prisma.payment.findUnique({
    where: { reference: ref },
    include: { receipt: true },
  });

  if (!payment || payment.studentProfileId !== profile.id) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Payment" />
        <EmptyState
          icon={<CreditCard className="size-5" />}
          title="Payment not found"
          description="We couldn't find that payment."
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
  const isPaid = payment.status === "PAID";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardContent className="p-8">
          {cancelled ? (
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <XCircle className="size-9" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">
                Payment cancelled
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your payment was not completed. You can try again whenever you&apos;re ready.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <PayButton reference={payment.reference} size="default" label="Try again" />
                <Button asChild variant="outline">
                  <Link href="/student/payments">Back to payments</Link>
                </Button>
              </div>
            </div>
          ) : isPaid ? (
            <PaymentSuccess
              amount={amount}
              receiptNumber={payment.receipt?.number}
              receiptId={payment.receipt?.id}
            />
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="size-9" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">
                Payment pending
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                We&apos;re still confirming your payment. This can take a moment — please
                check back shortly.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button asChild variant="brand">
                  <Link href="/student/payments">Back to payments</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
