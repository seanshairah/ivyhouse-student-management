import { prisma } from "@/lib/prisma";
import { StudentStatus } from "@prisma/client";

/**
 * Operational data-quality checks for the owner dashboard.
 *
 * These are the things that quietly stop a student being billed, contacted or
 * housed, and that nobody notices because nothing errors — the student simply
 * sits in the system doing nothing. Surfacing them beats discovering them at
 * the end of a term.
 *
 * Every check returns the affected students so the owner can act, not just a
 * count they have to go hunting for.
 */

export type IssueKey =
  | "no_room"
  | "no_next_of_kin"
  | "missing_phone"
  | "missing_email"
  | "credentials_never_sent"
  | "never_signed_in"
  | "active_without_room"
  | "in_arrears";

export interface StudentIssue {
  id: string;
  fullName: string;
  email: string;
  house: string | null;
}

export interface IssueGroup {
  key: IssueKey;
  title: string;
  /** Why it matters, in one line, for the owner. */
  consequence: string;
  severity: "high" | "medium" | "low";
  count: number;
  students: StudentIssue[];
}

export interface RoomIssue {
  id: string;
  number: string;
  house: string;
  problem: string;
}

export interface DataQualityReport {
  issues: IssueGroup[];
  rooms: RoomIssue[];
  totalStudents: number;
  studentsNeedingAttention: number;
}

const LIMIT = 200;

function toIssue(s: {
  id: string;
  fullName: string;
  email: string;
  house: { name: string } | null;
}): StudentIssue {
  return { id: s.id, fullName: s.fullName, email: s.email, house: s.house?.name ?? null };
}

export async function getDataQualityReport(): Promise<DataQualityReport> {
  const select = {
    id: true,
    fullName: true,
    email: true,
    house: { select: { name: true } },
  } as const;

  // Archived and moved-out students are history; they are not actionable.
  const live = { status: { notIn: [StudentStatus.ARCHIVED, StudentStatus.MOVED_OUT] } };

  const [
    totalStudents,
    noRoom,
    activeNoRoom,
    noNextOfKin,
    missingPhone,
    missingEmail,
    credsNeverSent,
    neverSignedIn,
    arrears,
    rooms,
  ] = await Promise.all([
    prisma.studentProfile.count({ where: live }),
    prisma.studentProfile.findMany({
      where: { ...live, roomId: null },
      select,
      take: LIMIT,
      orderBy: { createdAt: "asc" },
    }),
    prisma.studentProfile.findMany({
      where: { status: StudentStatus.ACTIVE, roomId: null },
      select,
      take: LIMIT,
      orderBy: { createdAt: "asc" },
    }),
    prisma.studentProfile.findMany({
      where: { ...live, OR: [{ nextOfKinName: null }, { nextOfKinPhone: null }] },
      select,
      take: LIMIT,
    }),
    prisma.studentProfile.findMany({
      where: { ...live, OR: [{ phone: "" }, { phone: { equals: " " } }] },
      select,
      take: LIMIT,
    }),
    prisma.studentProfile.findMany({
      where: { ...live, OR: [{ email: "" }, { NOT: { email: { contains: "@" } } }] },
      select,
      take: LIMIT,
    }),
    prisma.studentProfile.findMany({
      where: { ...live, credentialsSentAt: null },
      select,
      take: LIMIT,
    }),
    prisma.studentProfile.findMany({
      where: { ...live, user: { lastLoginAt: null }, credentialsSentAt: { not: null } },
      select,
      take: LIMIT,
    }),
    prisma.studentProfile.findMany({
      where: {
        ...live,
        charges: { some: { status: "OUTSTANDING", dueDate: { lt: new Date() } } },
      },
      select,
      take: LIMIT,
    }),
    prisma.room.findMany({
      select: {
        id: true,
        number: true,
        capacity: true,
        occupied: true,
        price: true,
        house: { select: { name: true } },
        _count: { select: { students: true } },
      },
    }),
  ]);

  const issues: IssueGroup[] = ([
    {
      key: "active_without_room",
      title: "Marked active but has no room",
      consequence:
        "Counted as a resident in occupancy and revenue figures, but cannot be billed rent.",
      severity: "high",
      count: activeNoRoom.length,
      students: activeNoRoom.map(toIssue),
    },
    {
      key: "in_arrears",
      title: "In arrears",
      consequence: "Has a charge past its due date.",
      severity: "high",
      count: arrears.length,
      students: arrears.map(toIssue),
    },
    {
      key: "missing_phone",
      title: "No phone number",
      consequence:
        "Cannot receive SMS reminders, and cannot pay by EcoCash prompt — that needs a number.",
      severity: "high",
      count: missingPhone.length,
      students: missingPhone.map(toIssue),
    },
    {
      key: "missing_email",
      title: "No usable email address",
      consequence: "Cannot receive credentials, receipts or password resets.",
      severity: "high",
      count: missingEmail.length,
      students: missingEmail.map(toIssue),
    },
    {
      key: "no_room",
      title: "Awaiting room allocation",
      consequence: "Cannot be charged rent until a room is assigned.",
      severity: "medium",
      count: noRoom.length,
      students: noRoom.map(toIssue),
    },
    {
      key: "never_signed_in",
      title: "Sent credentials but never signed in",
      consequence:
        "Has login details and has not used them — the invite may not have reached them.",
      severity: "medium",
      count: neverSignedIn.length,
      students: neverSignedIn.map(toIssue),
    },
    {
      key: "credentials_never_sent",
      title: "Never sent login credentials",
      consequence: "Has an account but no way to know about it.",
      severity: "medium",
      count: credsNeverSent.length,
      students: credsNeverSent.map(toIssue),
    },
    {
      key: "no_next_of_kin",
      title: "No next-of-kin recorded",
      consequence: "Nobody to contact in an emergency.",
      severity: "low",
      count: noNextOfKin.length,
      students: noNextOfKin.map(toIssue),
    },
  ] satisfies IssueGroup[]).filter((g) => g.count > 0);

  // Room-level problems: a stored occupancy count that disagrees with the
  // students actually assigned will misreport availability in both directions.
  const roomIssues: RoomIssue[] = [];
  const seen = new Map<string, string>();
  for (const r of rooms) {
    const house = r.house?.name ?? "—";
    const key = `${house}::${r.number}`;
    if (seen.has(key)) {
      roomIssues.push({
        id: r.id,
        number: r.number,
        house,
        problem: `Duplicate room number in ${house}`,
      });
    }
    seen.set(key, r.id);

    if (r.occupied !== r._count.students) {
      roomIssues.push({
        id: r.id,
        number: r.number,
        house,
        problem: `Occupancy says ${r.occupied} but ${r._count.students} student(s) are assigned`,
      });
    }
    if (r._count.students > r.capacity) {
      roomIssues.push({
        id: r.id,
        number: r.number,
        house,
        problem: `Over capacity: ${r._count.students} students in ${r.capacity} bed(s)`,
      });
    }
    if (Number(r.price) <= 0) {
      roomIssues.push({
        id: r.id,
        number: r.number,
        house,
        problem: "No rent price set — rent cannot be charged for this room",
      });
    }
  }

  const affected = new Set(issues.flatMap((g) => g.students.map((s) => s.id)));

  return {
    issues,
    rooms: roomIssues,
    totalStudents,
    studentsNeedingAttention: affected.size,
  };
}
