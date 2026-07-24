"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createStudentAccount, sendStudentCredentials } from "@/services/credentials";

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
