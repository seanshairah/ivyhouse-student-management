import { randomInt } from "crypto";
import { StudentStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { recordManualPayment } from "@/core/billing/deposits";
import { sendTemplatedEmail } from "@/services/email";
import { sendStatusSMS } from "@/services/sms";
import { EMAIL_SUBJECTS } from "@/constants/messages";
import { audit } from "@/services/audit";
import { platform } from "@/core/platform";

/**
 * The sign-in link students are sent. Exported so the dashboard can show the
 * owner exactly which URL is about to go out — a misconfigured APP_URL would
 * otherwise mail everyone a link to localhost.
 */
export function loginUrl(): string {
  const base = platform().appUrl || process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  return `${base.replace(/\/$/, "")}/auth/login`;
}

/** Readable temporary password, e.g. "Ivy-K7P2QX" (no ambiguous characters). */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return `Ivy-${s}`;
}

export interface CreateStudentInput {
  fullName: string;
  email: string;
  phone?: string | null;
  deposit?: number | null;
}

/**
 * Provision a student account: a User (role STUDENT) with a temporary password
 * + mustChangePassword, a StudentProfile in the house, and — if a deposit was
 * paid — a paid CASH deposit payment. Reuses an existing user by email (email
 * is unique) instead of duplicating. Returns the profile id + temp password.
 *
 * This is the single "create a student" routine shared by the bulk import and
 * the owner's manual add — the downstream flow (credentials, forced password
 * change, onboarding) is identical either way.
 */
export async function createStudentAccount(
  input: CreateStudentInput,
): Promise<{ studentProfileId: string; tempPassword: string; reused: boolean }> {
  const email = input.email.toLowerCase().trim();
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const house = await prisma.house.findFirst({ select: { id: true } });

  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: input.fullName,
          phone: input.phone ?? undefined,
          role: UserRole.STUDENT,
          isActive: true,
          passwordHash,
          mustChangePassword: true,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          name: input.fullName,
          phone: input.phone ?? null,
          role: UserRole.STUDENT,
          passwordHash,
          mustChangePassword: true,
        },
      });

  const profile = await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { fullName: input.fullName, email, phone: input.phone ?? "" },
    create: {
      userId: user.id,
      fullName: input.fullName,
      email,
      phone: input.phone ?? "",
      status: StudentStatus.PROSPECT,
      houseId: house?.id ?? null,
    },
  });

  if (input.deposit && input.deposit > 0) {
    // Shared with the other platform. Raises a DEPOSIT charge, settles it,
    // and issues a receipt — previously this wrote a bare Payment row, so the
    // student had no receipt and the owner's deposit total read zero.
    await recordManualPayment({
      studentProfileId: profile.id,
      amount: input.deposit,
      onlyIfNone: true,
    });
  }

  await audit({
    action: "student.created",
    entityType: "StudentProfile",
    entityId: profile.id,
    metadata: { email, reused: Boolean(existing) },
  }).catch(() => undefined);

  return { studentProfileId: profile.id, tempPassword, reused: Boolean(existing) };
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
export interface CredentialSendOptions {
  /**
   * Which channels to deliver on. Defaults to both. Sending on one channel
   * only is useful for a reminder run: students who never signed in have
   * already been emailed, so a second email adds nothing an SMS would not.
   */
  channels?: { email?: boolean; sms?: boolean };
}

export async function sendStudentCredentials(
  studentProfileId: string,
  options: CredentialSendOptions = {},
): Promise<CredentialSendResult> {
  const wantEmail = options.channels?.email ?? true;
  const wantSms = options.channels?.sms ?? true;
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

  const emailRes = wantEmail
    ? await sendTemplatedEmail(
        profile.email,
        EMAIL_SUBJECTS.credentialsIssued,
        "credentialsIssued",
        data,
      ).catch(() => ({ ok: false }) as { ok: boolean })
    : ({ ok: false } as { ok: boolean });

  let smsOk = false;
  if (wantSms && profile.phone) {
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
