import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  RECORD-LEVEL ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Authentication answers "who are you". This module answers "may you touch
 * THIS record" — the check that was missing.
 *
 * Every route and action that takes a record id from the client must run one of
 * these before reading or writing. Signing in is not authorisation: a student
 * with a valid session was previously able to fetch any other student's
 * invoice, receipt or statement by changing the id in the URL.
 *
 * Staff (OWNER, CARETAKER) may access any record in their own database. That is
 * safe because each platform has its own database — there is no other
 * business's data present to reach.
 */

const STAFF_ROLES: UserRole[] = ["OWNER", "CARETAKER"];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export interface Actor {
  userId: string;
  role: UserRole;
}

/** The student profile belonging to this user, if they have one. */
export async function ownProfileId(userId: string): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}

/**
 * May this actor access records belonging to `studentProfileId`?
 * Staff: yes. A student: only their own.
 */
export async function canAccessStudent(
  actor: Actor,
  studentProfileId: string | null | undefined,
): Promise<boolean> {
  if (!studentProfileId) return false;
  if (isStaff(actor.role)) return true;
  return (await ownProfileId(actor.userId)) === studentProfileId;
}

/** May this actor read this invoice? */
export async function canAccessInvoice(
  actor: Actor,
  invoiceId: string,
): Promise<boolean> {
  if (isStaff(actor.role)) return true;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { studentProfileId: true },
  });
  return canAccessStudent(actor, invoice?.studentProfileId);
}

/** May this actor read this receipt? */
export async function canAccessReceipt(
  actor: Actor,
  receiptId: string,
): Promise<boolean> {
  if (isStaff(actor.role)) return true;
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: { payment: { select: { studentProfileId: true } } },
  });
  return canAccessStudent(actor, receipt?.payment.studentProfileId);
}

/** May this actor act on this payment (poll it, settle it, read it)? */
export async function canAccessPayment(
  actor: Actor,
  reference: string,
): Promise<boolean> {
  if (isStaff(actor.role)) return true;
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { studentProfileId: true },
  });
  return canAccessStudent(actor, payment?.studentProfileId);
}
