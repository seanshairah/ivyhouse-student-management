import { FileText, Printer } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildStatement } from "@/services/statements";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { INVOICE_STATUS_META, PAYMENT_STATUS_META } from "@/constants";

export default async function StudentStatementPage() {
  const session = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.userId },
  });

  const statement = profile ? await buildStatement(profile.id) : null;

  if (!profile || !statement) {
    return (
      <div className="space-y-6">
        <PageHeader title="Statement" description="Your account statement" />
        <EmptyState
          icon={<FileText className="size-5" />}
          title="No statement available"
          description="Your statement will appear once you have invoices or payments on your account."
        />
      </div>
    );
  }

  const { student, invoices, payments, totals } = statement;

  return (
    <div className="space-y-6">
      <PageHeader title="Account statement" description="A full breakdown of your account">
        <Button asChild variant="brand">
          <a
            href={`/api/documents/statement/${profile.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Printer />
            Open printable statement
          </a>
        </Button>
      </PageHeader>

      {/* Account holder */}
      <Card>
        <CardHeader>
          <CardTitle>Account holder</CardTitle>
          <CardDescription>Statement details</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Name" value={student.fullName} />
          <Row label="Email" value={student.email} />
          <Row label="House" value={student.house ?? "—"} />
          <Row label="Room" value={student.room ? `Room ${student.room}` : "—"} />
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total due"
          value={formatCurrency(totals.totalDue)}
          icon="FileText"
          accent="blue"
        />
        <StatCard
          label="Total paid"
          value={formatCurrency(totals.totalPaid)}
          icon="CheckCircle2"
          accent="emerald"
        />
        <StatCard
          label="Balance"
          value={formatCurrency(totals.balance)}
          icon="Wallet"
          accent={totals.balance > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.number}>
                    <TableCell className="font-medium">{inv.number}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {inv.description}
                    </TableCell>
                    <TableCell>{formatDate(inv.issuedAt)}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>{formatCurrency(inv.amountPaid)}</TableCell>
                    <TableCell>
                      <StatusBadge meta={INVOICE_STATUS_META[inv.status]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices.</p>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.reference}>
                    <TableCell className="font-medium">{p.reference}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>{formatDate(p.paidAt ?? p.createdAt)}</TableCell>
                    <TableCell>{formatCurrency(p.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No payments.</p>
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
