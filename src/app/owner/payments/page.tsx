import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentsTable, type PaymentRow } from "@/components/owner/payments-table";

export default async function OwnerPaymentsPage() {
  await requireRole("OWNER");

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { studentProfile: true, invoice: true, receipt: true },
  });

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    reference: p.reference,
    studentName: p.studentProfile.fullName,
    amount: toNumber(p.amount),
    method: p.method,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    invoiceNumber: p.invoice?.number ?? null,
    receiptId: p.receipt?.id ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Track and reconcile all student payments."
      />
      <PaymentsTable payments={rows} />
    </div>
  );
}
