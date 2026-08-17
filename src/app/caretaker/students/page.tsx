import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  CaretakerStudentsManager,
  type CaretakerStudentRow,
  type RoomOption,
} from "@/components/caretaker/students-manager";

export default async function CaretakerStudentsPage() {
  const session = await requireRole(["CARETAKER", "OWNER"]);
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { houseId: true, house: { select: { name: true } } },
  });
  const houseFilter = caretaker?.houseId ? { houseId: caretaker.houseId } : {};

  const [students, rooms] = await Promise.all([
    prisma.studentProfile.findMany({
      where: {
        ...houseFilter,
        status: { notIn: ["ARCHIVED", "MOVED_OUT"] },
      },
      include: {
        house: { select: { name: true } },
        room: { select: { number: true } },
        charges: {
          where: { status: "OUTSTANDING" },
          select: { amount: true, allocations: { select: { amount: true } } },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.room.findMany({
      where: { ...houseFilter, status: { not: "MAINTENANCE" } },
      select: { id: true, number: true, capacity: true, occupied: true },
      orderBy: { number: "asc" },
    }),
  ]);

  const rows: CaretakerStudentRow[] = students.map((s) => {
    let balance = 0;
    for (const c of s.charges) {
      const allocated = c.allocations.reduce(
        (sum, a) => sum + toNumber(a.amount),
        0,
      );
      balance += Math.max(0, toNumber(c.amount) - allocated);
    }
    return {
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      roomNumber: s.room?.number ?? null,
      houseName: s.house?.name ?? "—",
      status: s.status,
      balance,
    };
  });

  // Sort by room number (numeric where possible) so the list reads like the
  // building does.
  rows.sort((a, b) => {
    const na = Number(a.roomNumber), nb = Number(b.roomNumber);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return (a.roomNumber ?? "zz").localeCompare(b.roomNumber ?? "zz");
  });

  const roomOptions: RoomOption[] = rooms
    .filter((r) => r.occupied < r.capacity)
    .map((r) => ({ id: r.id, number: r.number, free: r.capacity - r.occupied }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description={
          caretaker?.house
            ? `Everyone in ${caretaker.house.name} — record payments, add or remove students.`
            : "All students — record payments, add or remove students."
        }
      />
      <CaretakerStudentsManager students={rows} rooms={roomOptions} />
    </div>
  );
}
