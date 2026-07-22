import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { TRANSPORT_FEE } from "@/constants";

/** High-level KPIs for the owner overview. */
export async function getOverviewStats() {
  const [
    totalStudents,
    activeStudents,
    rooms,
    pendingApplications,
    paidPayments,
    invoices,
    // Students with an assigned room drive the expected monthly rent roll; each
    // pays their room's per-student rate. Students on transport add the flat fee.
    housedStudents,
    transportStudents,
  ] = await Promise.all([
    prisma.studentProfile.count({ where: { status: { notIn: ["ARCHIVED"] } } }),
    prisma.studentProfile.count({ where: { status: "ACTIVE" } }),
    prisma.room.findMany(),
    prisma.application.count({
      where: { status: { in: ["NEW", "AWAITING_REVIEW"] } },
    }),
    prisma.payment.findMany({ where: { status: "PAID" } }),
    prisma.invoice.findMany({ where: { status: { not: "CANCELLED" } } }),
    prisma.studentProfile.findMany({
      where: { status: { notIn: ["ARCHIVED", "MOVED_OUT"] }, roomId: { not: null } },
      select: { room: { select: { price: true } } },
    }),
    prisma.studentProfile.count({
      where: { status: { notIn: ["ARCHIVED", "MOVED_OUT"] }, usesTransport: true },
    }),
  ]);

  const totalRooms = rooms.length;
  const availableRooms = rooms.filter((r) => r.status === "AVAILABLE").length;
  const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED").length;
  const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
  const occupied = rooms.reduce((s, r) => s + r.occupied, 0);
  const occupancyRate = capacity ? Math.round((occupied / capacity) * 100) : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyRevenue = paidPayments
    .filter((p) => p.paidAt && p.paidAt >= monthStart)
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const totalRevenue = paidPayments.reduce((s, p) => s + toNumber(p.amount), 0);

  const totalInvoiced = invoices.reduce((s, i) => s + toNumber(i.amount), 0);
  const totalPaid = invoices.reduce((s, i) => s + toNumber(i.amountPaid), 0);
  const outstanding = totalInvoiced - totalPaid;

  // Projected recurring monthly income: rent for every housed student (their
  // room's per-student rate) plus the transport fee for every subscriber.
  const expectedMonthlyRent = housedStudents.reduce(
    (s, st) => s + (st.room ? toNumber(st.room.price) : 0),
    0,
  );
  const expectedMonthlyTransport = transportStudents * TRANSPORT_FEE;
  const expectedMonthlyIncome = expectedMonthlyRent + expectedMonthlyTransport;

  return {
    totalStudents,
    activeStudents,
    totalRooms,
    availableRooms,
    occupiedRooms,
    pendingApplications,
    occupancyRate,
    monthlyRevenue,
    totalRevenue,
    outstanding,
    housedStudents: housedStudents.length,
    transportStudents,
    expectedMonthlyRent,
    expectedMonthlyTransport,
    expectedMonthlyIncome,
  };
}

/** Monthly revenue series for charts (last N months). */
export async function getRevenueSeries(months = 6) {
  const payments = await prisma.payment.findMany({
    where: { status: "PAID", paidAt: { not: null } },
  });
  const series: { month: string; revenue: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const revenue = payments
      .filter((p) => p.paidAt && p.paidAt >= d && p.paidAt < next)
      .reduce((s, p) => s + toNumber(p.amount), 0);
    series.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      revenue,
    });
  }
  return series;
}

/** Occupancy breakdown per house. */
export async function getOccupancyByHouse() {
  const houses = await prisma.house.findMany({ include: { rooms: true } });
  return houses.map((h) => {
    const capacity = h.rooms.reduce((s, r) => s + r.capacity, 0);
    const occupied = h.rooms.reduce((s, r) => s + r.occupied, 0);
    return {
      house: h.name,
      capacity,
      occupied,
      available: capacity - occupied,
      rate: capacity ? Math.round((occupied / capacity) * 100) : 0,
    };
  });
}

export async function getApplicationsByStatus() {
  const grouped = await prisma.application.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return grouped.map((g) => ({ status: g.status, count: g._count._all }));
}

export async function getOutstandingBalances() {
  const students = await prisma.studentProfile.findMany({
    include: { invoices: true, house: true },
  });
  return students
    .map((s) => {
      const due = s.invoices
        .filter((i) => i.status !== "CANCELLED")
        .reduce((sum, i) => sum + toNumber(i.amount), 0);
      const paid = s.invoices.reduce((sum, i) => sum + toNumber(i.amountPaid), 0);
      return {
        id: s.id,
        name: s.fullName,
        house: s.house?.name ?? "—",
        due,
        paid,
        balance: due - paid,
      };
    })
    .filter((s) => s.balance > 0.005)
    .sort((a, b) => b.balance - a.balance);
}

/** House performance summary (students, occupancy, revenue). */
export async function getHousePerformance() {
  const houses = await prisma.house.findMany({
    include: {
      rooms: true,
      students: { include: { payments: { where: { status: "PAID" } } } },
    },
  });
  return houses.map((h) => {
    const capacity = h.rooms.reduce((s, r) => s + r.capacity, 0);
    const occupied = h.rooms.reduce((s, r) => s + r.occupied, 0);
    const revenue = h.students.reduce(
      (s, st) => s + st.payments.reduce((p, pay) => p + toNumber(pay.amount), 0),
      0,
    );
    return {
      house: h.name,
      students: h.students.length,
      rooms: h.rooms.length,
      capacity,
      occupied,
      occupancyRate: capacity ? Math.round((occupied / capacity) * 100) : 0,
      revenue,
    };
  });
}

/** Convert an array of flat objects to a CSV string. */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}
