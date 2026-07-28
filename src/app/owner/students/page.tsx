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
      include: {
        house: true,
        room: true,
        charges: {
          where: { status: "OUTSTANDING" },
          select: {
            amount: true,
            dueDate: true,
            allocations: { select: { amount: true } },
          },
        },
      },
    }),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Balances come from the charge ledger. This used to sum Invoice.amount and
  // Invoice.amountPaid, which meant every deposit and every self-service rent
  // or transport payment — the majority of real money — was invisible, and the
  // column read zero for most students.
  const rows: StudentRow[] = students.map((s) => {
    let outstanding = 0;
    let arrears = 0;
    const now = new Date();
    for (const c of s.charges) {
      const allocated = c.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
      const remaining = Math.max(0, toNumber(c.amount) - allocated);
      if (remaining <= 0) continue;
      outstanding += remaining;
      if (c.dueDate && c.dueDate < now) arrears += remaining;
    }
    return {
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      houseId: s.houseId,
      houseName: s.house?.name ?? "—",
      roomNumber: s.room?.number ?? null,
      status: s.status,
      balance: outstanding,
      arrears,
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
