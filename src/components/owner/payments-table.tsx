"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PAYMENT_STATUS_META } from "@/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { markPaymentPaid } from "@/app/owner/actions";

export interface PaymentRow {
  id: string;
  reference: string;
  studentName: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  invoiceNumber: string | null;
  receiptId: string | null;
}

const STATUSES = Object.keys(PAYMENT_STATUS_META);

export function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  const [status, setStatus] = useState("all");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => payments.filter((p) => status === "all" || p.status === status),
    [payments, status],
  );

  function settle(reference: string) {
    const fd = new FormData();
    fd.set("reference", reference);
    startTransition(async () => {
      const res = await markPaymentPaid(fd);
      if (res.success) toast.success("Payment marked as paid");
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{PAYMENT_STATUS_META[s].label}</option>
            ))}
          </Select>
          <p className="text-sm text-muted-foreground">{filtered.length} payment(s)</p>
        </div>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                  <TableCell className="font-medium">{p.studentName}</TableCell>
                  <TableCell>{formatCurrency(p.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.method}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {p.status === "PENDING" || p.status === "PROCESSING" ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => settle(p.reference)}>
                        <CheckCircle2 className="size-4" /> Mark paid
                      </Button>
                    ) : p.receiptId ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/documents/receipt/${p.receiptId}`} target="_blank" rel="noreferrer">
                          <Receipt className="size-4" /> Receipt
                        </a>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No payments" description="No payments match this filter." />
        )}
      </CardContent>
    </Card>
  );
}
