"use client";

import { useMemo, useState, useTransition } from "react";
import { Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { INVOICE_STATUS_META } from "@/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { generateInvoiceLink } from "@/app/owner/actions";

export interface InvoiceRow {
  id: string;
  number: string;
  studentName: string;
  amount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
}

const UNPAID = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const [tab, setTab] = useState("unpaid");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (tab === "unpaid") return invoices.filter((i) => UNPAID.includes(i.status));
    return invoices.filter((i) => i.status === "PAID");
  }, [invoices, tab]);

  function genLink(invoiceId: string) {
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    startTransition(async () => {
      const res = await generateInvoiceLink(fd);
      if (res.success) toast.success("Payment link generated & sent");
      else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.number}</TableCell>
                  <TableCell className="font-medium">{i.studentName}</TableCell>
                  <TableCell>{formatCurrency(i.amount)}</TableCell>
                  <TableCell>{formatCurrency(i.amountPaid)}</TableCell>
                  <TableCell>
                    <StatusBadge meta={INVOICE_STATUS_META[i.status]} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.dueDate ? formatDate(i.dueDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/api/documents/invoice/${i.id}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" /> View
                        </a>
                      </Button>
                      {UNPAID.includes(i.status) && (
                        <Button variant="outline" size="sm" disabled={pending} onClick={() => genLink(i.id)}>
                          <Link2 className="size-4" /> Payment link
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No invoices" description="Nothing to show in this tab." />
        )}
      </CardContent>
    </Card>
  );
}
