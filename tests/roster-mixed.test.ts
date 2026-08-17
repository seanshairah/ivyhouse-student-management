/**
 * PLATFORM-LOCAL test — this house has the mixed building: two-sharing rooms,
 * an A-wing, and nine three-sharing rooms at a lower per-head rent. Runs the
 * REAL upload path — workbook → parser → import engine — against the test
 * database and checks the classifications the owner reads.
 */
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { parseRosterWorkbook } from "@/lib/roster-xlsx";
import { runRosterImport } from "@/services/students/roster-import";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

function sheet(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("a mixed-capacity house imports with per-room-size pricing", () => {
  it("prices 2-share and 3-share students differently and sizes rooms from the sheet", async () => {
    const slug = "mixed-import-test";
    await prisma.house.upsert({
      where: { slug },
      update: {},
      create: {
        name: "Mixed Import Test House",
        slug,
        description: "Fixture",
        location: "Test",
        amenities: [], services: [], rules: [], safetyInfo: [],
      },
    });

    const buf = sheet([
      ["Ivy-like House"],
      ["Room", "Full Name", "Deposit", "Cash Paid"],
      // 2-share at 135/month: 20+115 = exactly one month
      [2, "Mix TwoFull", 20, 115],
      [2, "Mix TwoShort", 20, 100],   // 120 < 135 → part-paid
      // 3-share at 105/month
      [21, "Mix ThreeFull", 20, 85],  // 105 = one month
      [21, "Mix ThreeShort", 20, 70], // 90 → part-paid
      [21, "Mix ThreeNothing", 20, null], // 20 < 52.5 → not paid
      // A-wing 2-share, semester up front
      ["A01", "Mix Semester", 20, 520], // 540 = 4 x 135 → paid in full
      ["A01", null, null, null],        // vacant bed
      ["A03", null, null, null],        // vacant room
      ["A03", null, null, null],
      [null, "Total Cash", 999],
    ]);

    const parsed = parseRosterWorkbook(buf);
    expect(parsed.beds).toEqual({ "2": 2, "21": 3, "A01": 2, "A03": 2 });

    const s = await runRosterImport(parsed.rows, {
      houseSlug: slug,
      refPrefix: "MIXTEST",
      beds: parsed.beds,
      monthlyPriceByCapacity: { 2: 135, 3: 105 },
    });

    expect(s.done).toBe(true);
    expect(s.rooms).toBe(4);
    expect(s.paidInFull).toBe(1);
    expect(s.paidOneMonth).toBe(2);   // TwoFull + ThreeFull, each at their own price
    expect(s.partiallyPaid).toBe(2);
    expect(s.notPaid).toBe(1);

    const rooms = await prisma.room.findMany({
      where: { house: { slug } },
      orderBy: { number: "asc" },
    });
    const byNum = Object.fromEntries(rooms.map((r) => [r.number, r]));
    expect(byNum["21"].capacity).toBe(3);
    expect(byNum["21"].type).toBe("SHARED_TRIPLE");
    expect(Number(byNum["21"].price)).toBe(105);
    expect(byNum["2"].capacity).toBe(2);
    expect(Number(byNum["2"].price)).toBe(135);
    expect(byNum["A03"].occupied).toBe(0);
    expect(byNum["A03"].status).toBe("AVAILABLE");
    expect(byNum["21"].occupied).toBe(3);
    expect(byNum["21"].status).toBe("OCCUPIED");

    // The 3-share full-month student's ledger: August settled, three months owing.
    const p = await prisma.studentProfile.findFirst({
      where: { fullName: "Mix ThreeFull" },
      include: { charges: { include: { allocations: true } } },
    });
    const owing = p!.charges.reduce((sum, c) => {
      const alloc = c.allocations.reduce((a, x) => a + Number(x.amount), 0);
      return sum + Math.max(0, Number(c.amount) - alloc);
    }, 0);
    expect(owing).toBe(315); // 3 x 105

    // Re-running with the same sheet + prices is a no-op.
    const again = await runRosterImport(parsed.rows, {
      houseSlug: slug,
      refPrefix: "MIXTEST",
      beds: parsed.beds,
      monthlyPriceByCapacity: { 2: 135, 3: 105 },
    });
    expect(again.skipped).toBe(6);
  }, 60_000);

  it("refuses to start when a 3-share room has no price", async () => {
    const parsed = parseRosterWorkbook(
      sheet([
        ["Room", "Full Name", "Paid"],
        [21, "A", 85], [21, "B", 85], [21, "C", 85],
      ]),
    );
    await expect(
      runRosterImport(parsed.rows, {
        houseSlug: "mixed-import-test",
        refPrefix: "MIXTEST2",
        beds: parsed.beds,
        monthlyPriceByCapacity: { 2: 135 },
      }),
    ).rejects.toThrow(/3-sharing/);
  });
});
