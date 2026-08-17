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
 * dangle as phantom "credit". On this platform that is not hypothetical:
 * real semester payments have settled through Paynow.
 *
 * RESUMABLE BY DESIGN. Serverless gives an action a bounded slice of time,
 * and dozens of ledger rebuilds may not fit in one. Each student imports in
 * their own transaction behind an is-it-done-already check (deterministic
 * reference + amount), so running again continues where the last run stopped
 * — and a finished import is a no-op. Re-uploading a CORRECTED sheet also
 * works: an amount change fails the check and that student is rebuilt.
 *
 * This file mirrors the sibling platform's engine; only the account-creation
 * call differs, because the platforms' student services diverged long ago.
 */

export interface RosterRow {
  room: number;
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
  monthlyPrice?: number;
  roomCapacity?: number;
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
  const monthly = opts.monthlyPrice ?? 120;
  const capacity = opts.roomCapacity ?? 2;
  const semesterTotal = monthly * MONTHS.length;

  const house = await prisma.house.findUnique({ where: { slug: opts.houseSlug } });
  if (!house) throw new Error(`House "${opts.houseSlug}" not found.`);

  // ── Phase A: the building itself ─────────────────────────────
  const maxRoom = Math.max(...rows.map((r) => r.room));
  const wanted = Array.from({ length: maxRoom }, (_, i) => String(i + 1));
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
        const data = {
          type: RoomType.SHARED_DOUBLE,
          capacity,
          price: monthly,
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
  const roomSlot = new Map<number, number>();

  for (const row of rows) {
    const slot = (roomSlot.get(row.room) ?? 0) + 1;
    roomSlot.set(row.room, slot);
    const reference = `${opts.refPrefix}-R${String(row.room).padStart(2, "0")}-${String.fromCharCode(64 + Math.min(slot, 26))}`;
    const email = (row.email ?? placeholderEmail(row.fullName)).toLowerCase();
    const roomId = roomByNumber.get(String(row.room));
    if (!roomId) throw new Error(`Room ${row.room} missing after phase A`);

    if (row.credited >= semesterTotal) summary.paidInFull++;
    else if (row.credited === monthly) summary.paidOneMonth++;
    else if (row.credited <= 30) summary.notPaid++;
    else summary.partiallyPaid++;

    // Find or create the account. This platform's routine places the student
    // in the (single) house itself; room placement is ours to do after.
    const user = await prisma.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    });
    let profileId = user?.studentProfile?.id;
    if (!profileId) {
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
          occupied >= capacity
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
