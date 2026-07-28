import { prisma } from "@/lib/prisma";
import { ChargeCategory, ChargeStatus } from "@prisma/client";
import { toNumber } from "@/lib/utils";
import { transportMonthlyFee } from "@/core/billing/pricing";

/** High-level KPIs for the owner overview. */
export async function getOverviewStats() {
  const [
    totalStudents,
    activeStudents,
    rooms,
    pendingApplications,
    revenueByCategory,
    monthRevenue,
    // Students with an assigned room drive the expected monthly rent roll; each
    // pays their room's per-student rate. Students on transport add the flat fee.
    housedStudents,
    transportStudents,
    outstandingCharges,
    outstandingAllocations,
  ] = await Promise.all([
    prisma.studentProfile.count({ where: { status: { notIn: ["ARCHIVED"] } } }),
    prisma.studentProfile.count({ where: { status: "ACTIVE" } }),
    prisma.room.findMany(),
    prisma.application.count({
      where: { status: { in: ["NEW", "AWAITING_REVIEW"] } },
    }),
    // Aggregated in the database rather than pulled into memory. These used to
    // be findMany() over every payment and every invoice ever created, summed
    // in JS on each dashboard render — fine with seed data, ruinous at scale.
    prisma.payment.groupBy({
      by: ["category"],
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidAt: { gte: startOfThisMonth() } },
      _sum: { amount: true },
    }),
    prisma.studentProfile.findMany({
      where: { status: { notIn: ["ARCHIVED", "MOVED_OUT"] }, roomId: { not: null } },
      select: { room: { select: { price: true } } },
    }),
    prisma.studentProfile.count({
      where: { status: { notIn: ["ARCHIVED", "MOVED_OUT"] }, transportOptIn: true },
    }),
    // Outstanding money, derived from the charge ledger — the single source of
    // truth — instead of summing a denormalised Invoice.amountPaid column that
    // only moved when a payment happened to be attached to an invoice.
    prisma.charge.aggregate({
      where: { status: ChargeStatus.OUTSTANDING },
      _sum: { amount: true },
    }),
    prisma.paymentAllocation.aggregate({
      where: { charge: { status: ChargeStatus.OUTSTANDING } },
      _sum: { amount: true },
    }),
  ]);

  const totalRooms = rooms.length;
  // Count by bed space, not by the status enum: a 1-of-2 shared room is neither
  // fully "AVAILABLE" nor "OCCUPIED", so status-based counts read 0/0 and
  // mislead. "Available" = has a free bed; "occupied" = at capacity.
  const availableRooms = rooms.filter((r) => r.occupied < r.capacity).length;
  const occupiedRooms = rooms.filter(
    (r) => r.capacity > 0 && r.occupied >= r.capacity,
  ).length;
  const capacity = rooms.reduce((s, r) => s + r.capacity, 0);
  const occupied = rooms.reduce((s, r) => s + r.occupied, 0);
  const occupancyRate = capacity ? Math.round((occupied / capacity) * 100) : 0;

  // Revenue split by the charge category recorded on the payment itself. This
  // replaces two different string heuristics that disagreed with each other:
  // one platform matched `reference.startsWith("DEP-")`, the other
  // `/deposit/i` against a free-text invoice description.
  const sumFor = (category: ChargeCategory) =>
    toNumber(
      revenueByCategory.find((r) => r.category === category)?._sum.amount ?? 0,
    );

  const rentRevenue = sumFor(ChargeCategory.RENT);
  const transportRevenue = sumFor(ChargeCategory.TRANSPORT);
  const depositsCollected = sumFor(ChargeCategory.DEPOSIT);
  const totalRevenue = revenueByCategory.reduce(
    (s, r) => s + toNumber(r._sum.amount ?? 0),
    0,
  );
  const collectedThisMonth = toNumber(monthRevenue._sum.amount ?? 0);

  const outstanding = Math.max(
    0,
    toNumber(outstandingCharges._sum.amount ?? 0) -
      toNumber(outstandingAllocations._sum.amount ?? 0),
  );

  // Projected recurring monthly income: rent for every housed student (their
  // room's per-student rate) plus the transport fee for every subscriber.
  const expectedMonthlyRent = housedStudents.reduce(
    (s, st) => s + (st.room ? toNumber(st.room.price) : 0),
    0,
  );
  const expectedMonthlyTransport = transportStudents * transportMonthlyFee();
  const expectedMonthlyIncome = expectedMonthlyRent + expectedMonthlyTransport;

  return {
    totalStudents,
    activeStudents,
    totalRooms,
    availableRooms,
    occupiedRooms,
    pendingApplications,
    occupancyRate,
    collectedThisMonth,
    depositsCollected,
    rentRevenue,
    transportRevenue,
    totalRevenue,
    outstanding,
    housedStudents: housedStudents.length,
    transportStudents,
    expectedMonthlyRent,
    expectedMonthlyTransport,
    expectedMonthlyIncome,
  };
}

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Monthly revenue series for charts (last N months). */
export async function getRevenueSeries(months = 6) {
  // Only fetch the window being charted, and exclude deposits by their recorded
  // category rather than by guessing from the reference string.
  const now0 = new Date();
  const windowStart = new Date(now0.getFullYear(), now0.getMonth() - (months - 1), 1);
  const payments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: windowStart },
      category: { not: ChargeCategory.DEPOSIT },
    },
    select: { paidAt: true, amount: true },
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

/**
 * Every student who owes money, with rent and transport shown separately.
 * Derived from the charge ledger in one pass — no per-student query, and no
 * reliance on the denormalised Invoice.amountPaid column.
 */
export async function getOutstandingBalances() {
  const students = await prisma.studentProfile.findMany({
    where: { status: { notIn: ["ARCHIVED"] } },
    select: {
      id: true,
      fullName: true,
      house: { select: { name: true } },
      charges: {
        where: { status: ChargeStatus.OUTSTANDING },
        select: {
          category: true,
          amount: true,
          dueDate: true,
          allocations: { select: { amount: true } },
        },
      },
    },
  });

  const now = new Date();
  return students
    .map((s) => {
      let rent = 0;
      let transport = 0;
      let other = 0;
      let arrears = 0;
      for (const c of s.charges) {
        const allocated = c.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
        const remaining = Math.max(0, toNumber(c.amount) - allocated);
        if (remaining <= 0) continue;
        if (c.category === ChargeCategory.RENT) rent += remaining;
        else if (c.category === ChargeCategory.TRANSPORT) transport += remaining;
        else other += remaining;
        if (c.dueDate && c.dueDate < now) arrears += remaining;
      }
      return {
        id: s.id,
        name: s.fullName,
        house: s.house?.name ?? "—",
        rent,
        transport,
        other,
        balance: rent + transport + other,
        arrears,
        inArrears: arrears > 0,
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
