import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { InvoicesTable, type InvoiceRow } from "@/components/owner/invoices-table";

export default async function OwnerInvoicesPage() {
  await requireRole("OWNER");

  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    include: { studentProfile: true },
  });

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    studentName: i.studentProfile.fullName,
    amount: toNumber(i.amount),
    amountPaid: toNumber(i.amountPaid),
    status: i.status,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Issue payment links and track outstanding invoices."
      />
      <InvoicesTable invoices={rows} />
    </div>
  );
}
