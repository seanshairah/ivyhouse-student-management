"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createStudentAccount, sendStudentCredentials, loginUrl } from "@/services/credentials";
import { smsProviderStatus } from "@/services/sms";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface AddStudentResult {
  success: boolean;
  error?: string;
  reused?: boolean;
  emailed?: boolean;
  texted?: boolean;
}

/**
 * Owner manually adds a single student, then runs the same pipeline as the
 * bulk import: create the account (temp password + forced change), record any
 * deposit, and immediately send login credentials by email + SMS.
 */
export async function addStudentAction(formData: FormData): Promise<AddStudentResult> {
  await requireRole("OWNER");
  try {
    const str = (k: string) => String(formData.get(k) || "").trim();
    const fullName = str("fullName");
    const email = str("email").toLowerCase();
    const phone = str("phone");
    const depositRaw = str("deposit");
    const deposit = depositRaw ? Number(depositRaw) : 0;

    if (fullName.length < 2) return { success: false, error: "Enter the student's full name." };
    if (!EMAIL_RE.test(email)) return { success: false, error: "Enter a valid email address." };
    if (depositRaw && (Number.isNaN(deposit) || deposit < 0))
      return { success: false, error: "Enter a valid deposit amount." };

    const { studentProfileId, reused } = await createStudentAccount({
      fullName,
      email,
      phone: phone || null,
      deposit,
    });

    const sent = await sendStudentCredentials(studentProfileId);

    revalidatePath("/owner/onboarding");
    revalidatePath("/owner/students");
    return { success: true, reused, emailed: sent.email, texted: sent.sms };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export interface CredentialsBatchResult {
  sent: number;
  failed: number;
  remaining: number;
  errors: string[];
}

/**
 * Send login credentials to a small batch of not-yet-notified students, then
 * return how many remain. The client calls this repeatedly until `remaining`
 * hits 0 — keeping each request short (Vercel function limits) and spacing the
 * sends out to respect the SMS provider's rate limits.
 */
export async function sendCredentialsBatchAction(
  limit = 5,
): Promise<CredentialsBatchResult> {
  await requireRole("OWNER");

  const batch = await prisma.studentProfile.findMany({
    where: { credentialsSentAt: null, user: { role: "STUDENT", isActive: true } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 10),
    select: { id: true, fullName: true, phone: true },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const s = batch[i];
    const r = await sendStudentCredentials(s.id);
    if (r.ok) sent++;
    else {
      failed++;
      errors.push(`${s.fullName}: ${r.error ?? "delivery failed"}`);
    }
    if (i < batch.length - 1) await sleep(1200); // gentle on the SMS provider
  }

  const remaining = await prisma.studentProfile.count({
    where: { credentialsSentAt: null, user: { role: "STUDENT", isActive: true } },
  });

  revalidatePath("/owner/onboarding");
  return { sent, failed, remaining, errors };
}

/**
 * How long to leave a student alone after texting them. Sending ROTATES the
 * password, so a reminded student still looks "never signed in" — without a
 * cooldown the same people would be texted again on every run, and the batch
 * loop would never terminate.
 */
const REMINDER_COOLDOWN_HOURS = 6;

/**
 * Students who were sent a login but have never used it: their account is
 * still on the temporary password we issued. `phone` must be present — this
 * reminder goes out by SMS, and roster-imported students with no contact
 * details on file cannot be reached at all.
 */
function notSignedInWhere(cutoff: Date) {
  return {
    status: "ACTIVE" as const,
    id: { not: "test_profile_seed" },
    phone: { not: "" },
    user: { role: "STUDENT" as const, isActive: true, mustChangePassword: true },
    OR: [{ credentialsSentAt: null }, { credentialsSentAt: { lt: cutoff } }],
  };
}

function reminderCutoff(): Date {
  return new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);
}

/** The sign-in link the SMS will contain, so the owner can sanity-check it. */
export async function portalLoginUrl(): Promise<string> {
  await requireRole("OWNER");
  return loginUrl();
}

/**
 * Text a fresh temporary password to students who have never signed in.
 *
 * SMS only: they already have the email, and the ones who never opened it are
 * exactly the ones a second email would not reach. Each send rotates to a new
 * password so what arrives always works. Batched, because dozens of sends do
 * not fit in one serverless slice — the client calls this until `remaining`
 * reaches 0.
 *
 * Refuses to run when no SMS provider is configured. The provider falls back
 * to a mock that reports success, so without this check the dashboard would
 * cheerfully report "texted 66 students" having sent nothing at all.
 */
export async function remindNotSignedInBatchAction(
  limit = 5,
): Promise<CredentialsBatchResult> {
  await requireRole("OWNER");

  if (!smsProviderStatus().configured) {
    const remaining = await prisma.studentProfile.count({ where: notSignedInWhere(reminderCutoff()) });
    return {
      sent: 0,
      failed: 0,
      remaining,
      errors: [
        "No SMS provider is configured, so nothing was sent. Set SMSPOP_API_KEY and SMSPOP_SENDER_ID, then try again.",
      ],
    };
  }

  const where = notSignedInWhere(reminderCutoff());

  const batch = await prisma.studentProfile.findMany({
    where,
    orderBy: { fullName: "asc" },
    take: Math.min(Math.max(limit, 1), 10),
    select: { id: true, fullName: true },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const s = batch[i];
    const r = await sendStudentCredentials(s.id, {
      channels: { email: false, sms: true },
    });
    if (r.sms) sent++;
    else {
      failed++;
      errors.push(`${s.fullName}: ${r.error ?? "SMS not delivered"}`);
    }
    if (i < batch.length - 1) await sleep(1200); // gentle on the SMS provider
  }

  const remaining = await prisma.studentProfile.count({ where: notSignedInWhere(reminderCutoff()) });

  revalidatePath("/owner/onboarding");
  return { sent, failed, remaining, errors };
}
