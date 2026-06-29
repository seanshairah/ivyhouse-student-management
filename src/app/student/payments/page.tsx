import Link from "next/link";
import {
  Wallet,
  CreditCard,
  Download,
  FileText,
  Receipt as ReceiptIcon,
  ArrowRight,
} from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStudentBalance } from "@/services/invoices";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { PayButton } from "@/components/student/pay-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_STATUS_META, INVOICE_STATUS_META } from "@/constants";
import { PaymentStatus } from "@prisma/client";

export default async function StudentPaymentsPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Your invoices and payments" />
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="No billing yet"
          description="Once you have an active application, your invoices and payments will appear here."
        />
      </div>
    );
  }

  const [balance, payments, invoices] = await Promise.all([
    getStudentBalance(profile.id),
    prisma.payment.findMany({
      where: { studentProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      include: { receipt: true },
    }),
    prisma.invoice.findMany({
      where: { studentProfileId: profile.id },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const pending = payments.filter((p) => p.status === PaymentStatus.PENDING);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Your invoices, payments & receipts" />

      {/* Balance summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total billed"
          value={formatCurrency(balance.totalDue)}
          icon="FileText"
          accent="blue"
        />
        <StatCard
          label="Total paid"
          value={formatCurrency(balance.totalPaid)}
          icon="CheckCircle2"
          accent="emerald"
        />
        <StatCard
          label="Balance"
          value={formatCurrency(balance.balance)}
          icon="Wallet"
          accent={balance.balance > 0 ? "rose" : "emerald"}
          hint={balance.balance > 0 ? "Outstanding" : "Settled"}
        />
      </div>

      {/* Pending payment requests */}
      {pending.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle>Payment requests</CardTitle>
            <CardDescription>Action needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <CreditCard className="size-5" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {formatCurrency(Number(p.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ref {p.reference}
                    </p>
                  </div>
                </div>
                <PayButton reference={p.reference} size="default" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Statement link */}
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-semibold">Account statement</p>
              <p className="text-sm text-muted-foreground">
                A full breakdown of your invoices and payments.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/statement">
              View statement
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>All invoices on your account</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.number}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {inv.description}
                    </TableCell>
                    <TableCell>{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell>{formatDate(inv.dueDate)}</TableCell>
                    <TableCell>
                      <StatusBadge meta={INVOICE_STATUS_META[inv.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={`/api/documents/invoice/${inv.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText />
                          View
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No invoices"
              description="Invoices will appear here when issued."
            />
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>All payments on your account</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.reference}</TableCell>
                    <TableCell>{formatCurrency(Number(p.amount))}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>{formatDate(p.paidAt)}</TableCell>
                    <TableCell>
                      <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === PaymentStatus.PENDING ? (
                        <PayButton reference={p.reference} />
                      ) : p.status === PaymentStatus.PAID && p.receipt ? (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={`/api/documents/receipt/${p.receipt.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download />
                            Receipt
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<ReceiptIcon className="size-5" />}
              title="No payments yet"
              description="Your payment history will appear here."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
