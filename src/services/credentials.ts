import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendTemplatedEmail } from "@/services/email";
import { sendStatusSMS } from "@/services/sms";
import { EMAIL_SUBJECTS } from "@/constants/messages";
import { audit } from "@/services/audit";

function loginUrl(): string {
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  return `${base.replace(/\/$/, "")}/auth/login`;
}

/** Readable temporary password, e.g. "Ivy-K7P2QX" (no ambiguous characters). */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return `Ivy-${s}`;
}

export interface CredentialSendResult {
  ok: boolean;
  email: boolean;
  sms: boolean;
  error?: string;
}

/**
 * (Re)issue login credentials to a student: rotate to a fresh temporary
 * password (forcing a change on next login) and deliver it by email + SMS.
 *
 * Stored passwords are hashed and can't be read back, so a resend must ROTATE
 * — what we send is then guaranteed to match the database. `credentialsSentAt`
 * is stamped only when at least one channel succeeds, so a fully-failed send
 * stays eligible for retry.
 */
export async function sendStudentCredentials(
  studentProfileId: string,
): Promise<CredentialSendResult> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: true },
  });
  if (!profile || !profile.user) {
    return { ok: false, email: false, sms: false, error: "Student not found" };
  }

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: profile.userId },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      isActive: true,
    },
  });

  const data = {
    studentName: profile.fullName,
    email: profile.email,
    password: tempPassword,
    loginUrl: loginUrl(),
  };

  const emailRes = await sendTemplatedEmail(
    profile.email,
    EMAIL_SUBJECTS.credentialsIssued,
    "credentialsIssued",
    data,
  ).catch(() => ({ ok: false }) as { ok: boolean });

  let smsOk = false;
  if (profile.phone) {
    const smsRes = await sendStatusSMS(profile.phone, "credentialsIssued", data).catch(
      () => ({ ok: false }) as { ok: boolean },
    );
    smsOk = Boolean(smsRes.ok);
  }

  const ok = Boolean(emailRes.ok) || smsOk;
  if (ok) {
    await prisma.studentProfile
      .update({ where: { id: profile.id }, data: { credentialsSentAt: new Date() } })
      .catch(() => undefined);
  }

  await audit({
    action: "student.credentials_sent",
    entityType: "StudentProfile",
    entityId: profile.id,
    metadata: { email: Boolean(emailRes.ok), sms: smsOk, ok },
  }).catch(() => undefined);

  return { ok, email: Boolean(emailRes.ok), sms: smsOk };
}
