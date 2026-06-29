import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentsTable, type StudentRow } from "@/components/owner/students-table";

export default async function OwnerStudentsPage() {
  await requireRole("OWNER");

  const [students, houses] = await Promise.all([
    prisma.studentProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: { house: true, room: true, invoices: true },
    }),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: StudentRow[] = students.map((s) => {
    const due = s.invoices
      .filter((i) => i.status !== "CANCELLED")
      .reduce((sum, i) => sum + toNumber(i.amount), 0);
    const paid = s.invoices.reduce((sum, i) => sum + toNumber(i.amountPaid), 0);
    return {
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      houseId: s.houseId,
      houseName: s.house?.name ?? "—",
      roomNumber: s.room?.number ?? null,
      status: s.status,
      balance: due - paid,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="All residents and applicants with balances and contact details."
      />
      <StudentsTable students={rows} houses={houses} />
    </div>
  );
}
