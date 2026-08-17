import { prisma } from "@/lib/prisma";
import {
  ChargeCategory,
  ChargeStatus,
  PaymentMethod,
  PaymentStatus,
  RoomStatus,
  RoomType,
  StudentStatus,
} from "@prisma/client";
import { allocatePayment } from "@/core/billing/ledger";
import { createReceipt } from "@/services/receipts";
import { createStudentAccount } from "@/services/credentials";

/**
 * Rebuild a house from a roster sheet: rooms 1..N (two sharing), every listed
 * student placed and ACTIVE, and each semester ledger written so the
 * dashboards answer the only question the owner asked for — paid in full,
 * paid for the month, or not paid.
 *
 * The sheet is the money truth, with one carve-out: ONLINE payments the
 * gateway has already confirmed. Those Payment rows are audit history and
 * survive every import; their value is assumed to be INCLUDED in the sheet's
 * credited figure (the book records everything received, however it came).
 * So each student's gateway-paid total is allocated against the rebuilt
 * charges first, and the import payment only covers the remainder. Without
 * this, a student who paid $480 through Paynow and appears as 480 on the
 * sheet would be credited twice — or their surviving gateway payment would
 * dangle as phantom "credit".
 *
 * RESUMABLE BY DESIGN. Serverless gives an action a bounded slice of time,
 * and dozens of ledger rebuilds may not fit in one. Each student imports in
 * their own transaction behind an is-it-done-already check (deterministic
 * reference + amount), so running again continues where the last run stopped
 * — and a finished import is a no-op. Re-uploading a CORRECTED sheet also
 * works: an amount change fails the check and that student is rebuilt.
 */

export interface RosterRow {
  /** Room label as the sheet writes it — "7", "40", "A01". */
  room: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** Total credited toward the semester, as recorded in the owner's book. */
  credited: number;
}

export interface RosterImportOptions {
  houseSlug: string;
  /** Deterministic payment-reference prefix; also the import's identity. */
  refPrefix: string;
  /**
   * Beds per room label, straight off the sheet — a 3-sharing room lists
   * three lines, an empty bed is a line with no name. Every room gets at
   * least two beds: a lone entry means a roommate is missing from the book,
   * not that the room is a single.
   */
  beds: Record<string, number>;
  /**
   * Monthly rent PER STUDENT by room size, chosen by the human at upload —
   * e.g. { 2: 120 } or { 2: 135, 3: 105 }. Sharing three ways is cheaper per
   * head, so the price is a property of the room size, not the house.
   */
  monthlyPriceByCapacity: Record<number, number>;
}

const MONTHS: Array<[string, string, string]> = [
  ["August 2026", "2026-08-01", "2026-08-31"],
  ["September 2026", "2026-09-01", "2026-09-30"],
  ["October 2026", "2026-10-01", "2026-10-31"],
  ["November 2026", "2026-11-01", "2026-11-30"],
];

export interface RosterImportSummary {
  rooms: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  receipts: number;
  paidInFull: number;
  paidOneMonth: number;
  partiallyPaid: number;
  notPaid: number;
  done: boolean;
}

/** Normalised name key for duplicate detection: lowercase, letters only, sorted tokens. */
export function normaliseName(fullName: string): string {
  return (fullName || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
}

export function placeholderEmail(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug}@unknown.invalid`;
}

export async function runRosterImport(
  rows: RosterRow[],
  opts: RosterImportOptions,
): Promise<RosterImportSummary> {
  if (!rows.length) throw new Error("The roster is empty.");

  const capacityOf = (room: string) =>
    Math.min(6, Math.max(2, opts.beds[room] ?? 2));
  const monthlyOf = (room: string) => {
    const price = opts.monthlyPriceByCapacity[capacityOf(room)];
    if (!price || price <= 0) {
      throw new Error(
        `No monthly price set for ${capacityOf(room)}-sharing rooms (room ${room}).`,
      );
    }
    return price;
  };
  for (const r of rows) monthlyOf(r.room); // fail before any write, not mid-import

  const house = await prisma.house.findUnique({ where: { slug: opts.houseSlug } });
  if (!house) throw new Error(`House "${opts.houseSlug}" not found.`);

  // ── Phase A: the building itself ─────────────────────────────
  const wanted = [...new Set([...rows.map((r) => r.room), ...Object.keys(opts.beds)])].sort();
  await prisma.$transaction(
    async (tx) => {
      await tx.studentProfile.updateMany({
        where: { room: { houseId: house.id } },
        data: { roomId: null },
      });
      await tx.application.updateMany({
        where: { room: { houseId: house.id } },
        data: { roomId: null },
      });
      await tx.room.deleteMany({
        where: { houseId: house.id, number: { notIn: wanted } },
      });
      for (const number of wanted) {
        const existing = await tx.room.findFirst({
          where: { houseId: house.id, number },
        });
        const cap = capacityOf(number);
        const data = {
          type: cap >= 3 ? RoomType.SHARED_TRIPLE : RoomType.SHARED_DOUBLE,
          capacity: cap,
          price: monthlyOf(number),
          status: RoomStatus.OCCUPIED,
        };
        if (existing) {
          await tx.room.update({ where: { id: existing.id }, data });
        } else {
          await tx.room.create({
            data: { houseId: house.id, number, ...data, amenities: [] },
          });
        }
      }
    },
    { timeout: 30000 },
  );
  const rooms = await prisma.room.findMany({
    where: { houseId: house.id },
    select: { id: true, number: true },
  });
  const roomByNumber = new Map(rooms.map((r) => [r.number, r.id]));

  // ── Phase B: one student at a time, resumable ────────────────
  const summary: RosterImportSummary = {
    rooms: rooms.length,
    processed: 0, created: 0, updated: 0, skipped: 0, receipts: 0,
    paidInFull: 0, paidOneMonth: 0, partiallyPaid: 0, notPaid: 0,
    done: false,
  };
  const roomSlot = new Map<string, number>();

  for (const row of rows) {
    const slot = (roomSlot.get(row.room) ?? 0) + 1;
    roomSlot.set(row.room, slot);
    const reference = `${opts.refPrefix}-R${row.room.padStart(2, "0")}-${String.fromCharCode(64 + Math.min(slot, 26))}`;
    const email = (row.email ?? placeholderEmail(row.fullName)).toLowerCase();
    const roomId = roomByNumber.get(row.room);
    if (!roomId) throw new Error(`Room ${row.room} missing after phase A`);

    const monthly = monthlyOf(row.room);
    // Paid-in-full / paid-for-the-month / not-paid, judged against what THIS
    // student's room costs. "Not paid" means under half a month — a bare
    // booking amount, nothing that covers living there.
    if (row.credited >= monthly * MONTHS.length) summary.paidInFull++;
    else if (row.credited === monthly) summary.paidOneMonth++;
    else if (row.credited < monthly / 2) summary.notPaid++;
    else summary.partiallyPaid++;

    // Find or create the account.
    const user = await prisma.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    });
    let profileId = user?.studentProfile?.id;
    if (!profileId && email.endsWith("@unknown.invalid")) {
      const key = normaliseName(row.fullName);
      const sameName = (
        await prisma.studentProfile.findMany({
          where: { houseId: house.id },
          select: { id: true, fullName: true },
        })
      ).filter((p) => normaliseName(p.fullName) === key);
      if (sameName.length === 1) profileId = sameName[0].id;
    }
    if (!profileId) {
      // This platform's account routine places the student in the (single)
      // house itself; room placement happens in the rebuild below.
      const created = await createStudentAccount({
        fullName: row.fullName,
        email,
        phone: row.phone,
      });
      profileId = created.studentProfileId;
      summary.created++;
    } else {
      summary.updated++;
    }

    // Money the gateway has already confirmed for this student. Kept, and
    // assumed included in the sheet's figure — see the header comment.
    const gatewayPayments = await prisma.payment.findMany({
      where: {
        studentProfileId: profileId,
        method: PaymentMethod.PAYNOW,
        status: PaymentStatus.PAID,
      },
      select: { id: true, amount: true },
    });
    const gatewayPaid = gatewayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const importAmount = Math.max(0, row.credited - gatewayPaid);

    // Already imported at this amount? Then just make sure they're placed.
    const [ourCharges, ourPayment] = await Promise.all([
      prisma.charge.count({
        where: { studentProfileId: profileId, description: { startsWith: "Rent — " } },
      }),
      prisma.payment.findUnique({ where: { reference } }),
    ]);
    if (
      ourCharges === MONTHS.length &&
      (importAmount <= 0 || (ourPayment && Number(ourPayment.amount) === importAmount))
    ) {
      await prisma.studentProfile.update({
        where: { id: profileId },
        data: {
          status: StudentStatus.ACTIVE,
          houseId: house.id,
          roomId,
          moveInDate: new Date("2026-08-01"),
        },
      });
      summary.skipped++;
      summary.processed++;
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.studentProfile.update({
          where: { id: profileId },
          data: {
            fullName: row.fullName,
            status: StudentStatus.ACTIVE,
            houseId: house.id,
            roomId,
            moveInDate: new Date("2026-08-01"),
          },
        });

        // Out with this student's previous book; gateway rows stay.
        const oldPayments = await tx.payment.findMany({
          where: { studentProfileId: profileId, method: { not: PaymentMethod.PAYNOW } },
          select: { id: true },
        });
        const oldIds = oldPayments.map((p) => p.id);
        await tx.paymentAllocation.deleteMany({
          where: { OR: [{ paymentId: { in: oldIds } }, { charge: { studentProfileId: profileId } }] },
        });
        await tx.receipt.deleteMany({ where: { paymentId: { in: oldIds } } });
        await tx.charge.deleteMany({ where: { studentProfileId: profileId } });
        await tx.payment.deleteMany({ where: { id: { in: oldIds } } });

        await tx.charge.createMany({
          data: MONTHS.map(([label, start, end]) => ({
            studentProfileId: profileId!,
            category: ChargeCategory.RENT,
            description: `Rent — ${label}`,
            amount: monthly,
            status: ChargeStatus.OUTSTANDING,
            periodStart: new Date(start),
            periodEnd: new Date(end),
            dueDate: new Date(start),
          })),
        });

        // Gateway money lands on the new charges first…
        for (const gp of gatewayPayments) {
          await allocatePayment(gp.id, tx);
        }
        // …and the import payment covers the remainder of the book.
        if (importAmount > 0) {
          const payment = await tx.payment.create({
            data: {
              reference,
              studentProfileId: profileId!,
              amount: importAmount,
              category: ChargeCategory.RENT,
              method: PaymentMethod.CASH,
              status: PaymentStatus.PAID,
              paidAt: new Date(),
            },
          });
          await allocatePayment(payment.id, tx);
          await createReceipt(payment.id, importAmount, tx);
          summary.receipts++;
        }
      },
      { timeout: 15000 },
    );
    summary.processed++;
  }

  // ── Phase C: occupancy from the ground truth ─────────────────
  for (const room of rooms) {
    const occupied = await prisma.studentProfile.count({
      where: { roomId: room.id },
    });
    await prisma.room.update({
      where: { id: room.id },
      data: {
        occupied,
        status:
          occupied >= capacityOf(room.number)
            ? RoomStatus.OCCUPIED
            : occupied > 0
              ? RoomStatus.RESERVED
              : RoomStatus.AVAILABLE,
      },
    });
  }

  summary.done = summary.processed === rows.length;
  return summary;
}
