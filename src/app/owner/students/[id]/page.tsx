import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber, formatCurrency, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  STUDENT_STATUS_META,
  INVOICE_STATUS_META,
  PAYMENT_STATUS_META,
} from "@/constants";
import { StudentActions } from "@/components/owner/student-actions";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || "—"}</p>
    </div>
  );
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("OWNER");
  const { id } = await params;

  const student = await prisma.studentProfile.findUnique({
    where: { id },
    include: {
      house: true,
      room: true,
      invoices: { orderBy: { issuedAt: "desc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        include: { receipt: true },
      },
    },
  });
  if (!student) notFound();

  const availableRooms = await prisma.room.findMany({
    where: { status: "AVAILABLE" },
    include: { house: true },
    orderBy: [{ houseId: "asc" }, { number: "asc" }],
  });

  const due = student.invoices
    .filter((i) => i.status !== "CANCELLED")
    .reduce((s, i) => s + toNumber(i.amount), 0);
  const paid = student.invoices.reduce((s, i) => s + toNumber(i.amountPaid), 0);
  const balance = due - paid;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/owner/students">
          <ArrowLeft className="size-4" /> Back to students
        </Link>
      </Button>

      <PageHeader title={student.fullName} description={student.email}>
        <StatusBadge meta={STUDENT_STATUS_META[student.status]} />
        <Button asChild variant="outline" size="sm">
          <a href={`/api/documents/statement/${student.id}`} target="_blank" rel="noreferrer">
            <FileText className="size-4" /> Statement
          </a>
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Balance summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Total invoiced</p>
              <p className="mt-1 font-display text-xl font-bold">{formatCurrency(due)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Total paid</p>
              <p className="mt-1 font-display text-xl font-bold text-emerald-600">{formatCurrency(paid)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className={`mt-1 font-display text-xl font-bold ${balance > 0 ? "text-rose-600" : ""}`}>
                {formatCurrency(balance)}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" value={student.phone} />
              <Field label="National ID" value={student.nationalId} />
              <Field label="Institution" value={student.institution} />
              <Field label="Program" value={student.program} />
              <Field label="Year of study" value={student.yearOfStudy} />
              <Field label="House" value={student.house?.name} />
              <Field label="Room" value={student.room?.number} />
              <Field label="Move-in date" value={student.moveInDate ? formatDate(student.moveInDate) : null} />
              <Field label="Lease start" value={student.leaseStart ? formatDate(student.leaseStart) : null} />
              <Field label="Lease end" value={student.leaseEnd ? formatDate(student.leaseEnd) : null} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next of kin</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value={student.nextOfKinName} />
              <Field label="Phone" value={student.nextOfKinPhone} />
              <Field label="Relationship" value={student.nextOfKinRelation} />
              <Field label="Guardian" value={student.guardianName} />
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {student.invoices.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.invoices.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.number}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{i.description}</TableCell>
                        <TableCell>{formatCurrency(toNumber(i.amount))}</TableCell>
                        <TableCell>{formatCurrency(toNumber(i.amountPaid))}</TableCell>
                        <TableCell>
                          <StatusBadge meta={INVOICE_STATUS_META[i.status]} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <a href={`/api/documents/invoice/${i.id}`} target="_blank" rel="noreferrer">View</a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title="No invoices" />
              )}
            </CardContent>
          </Card>

          {/* Payment history */}
          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {student.payments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                        <TableCell>{formatCurrency(toNumber(p.amount))}</TableCell>
                        <TableCell className="text-muted-foreground">{p.method}</TableCell>
                        <TableCell>
                          <StatusBadge meta={PAYMENT_STATUS_META[p.status]} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          {p.receipt && (
                            <Button asChild variant="outline" size="sm">
                              <a href={`/api/documents/receipt/${p.receipt.id}`} target="_blank" rel="noreferrer">
                                <Receipt className="size-4" /> Receipt
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title="No payments" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentActions
                studentProfileId={student.id}
                currentStatus={student.status}
                hasNextOfKin={Boolean(student.nextOfKinPhone)}
                availableRooms={availableRooms.map((r) => ({
                  id: r.id,
                  label: `${r.house.name} · Room ${r.number}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
