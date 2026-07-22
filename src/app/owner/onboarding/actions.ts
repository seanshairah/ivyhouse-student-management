"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendStudentCredentials } from "@/services/credentials";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
