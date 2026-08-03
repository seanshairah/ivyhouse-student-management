"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, X, Trash2, Receipt } from "lucide-react";
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
import { useRouter } from "next/navigation";
import {
  cancelUnclearedPaymentAction,
  expireStalePaymentsAction,
} from "@/app/owner/actions";
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

  const router = useRouter();

  function settle(reference: string) {
    const fd = new FormData();
    fd.set("reference", reference);
    startTransition(async () => {
      try {
        const res = await markPaymentPaid(fd);
        if (res.success) {
          toast.success("Payment marked as paid");
          router.refresh();
        } else toast.error(res.error ?? "Failed");
      } catch {
        toast.error("Could not update that payment. Please try again.");
      }
    });
  }

  /** Close out a request that was started and never completed. */
  function cancel(reference: string) {
    const fd = new FormData();
    fd.set("reference", reference);
    startTransition(async () => {
      try {
        const res = await cancelUnclearedPaymentAction(fd);
        if (res.success) {
          toast.success("Payment request cancelled");
          router.refresh();
        } else toast.error(res.error ?? "Could not cancel that request.");
      } catch {
        toast.error("Could not cancel that request. Please try again.");
      }
    });
  }

  /** Sweep every request too old to complete. */
  function clearStale() {
    startTransition(async () => {
      try {
        const res = await expireStalePaymentsAction();
        if (res.success) {
          toast.success(res.message ?? "Cleared stale payment requests");
          router.refresh();
        } else toast.error(res.error ?? "Could not clear stale requests.");
      } catch {
        toast.error("Could not clear stale requests. Please try again.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={pending} onClick={clearStale}>
            <Trash2 className="size-4" /> Clear stale requests
          </Button>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => settle(p.reference)}>
                          <CheckCircle2 className="size-4" /> Mark paid
                        </Button>
                        {/* Uncleared requests pile up from abandoned checkouts
                            and ignored prompts. Only in-flight ones can be
                            cancelled — the action refuses settled payments. */}
                        {/* Outline, not ghost: this sits directly beside a
                            bordered "Mark paid" in a table row, where a
                            chromeless button reads as a label rather than a
                            control until the pointer happens to cross it. */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => cancel(p.reference)}
                        >
                          <X className="size-4" /> Cancel
                        </Button>
                      </div>
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
