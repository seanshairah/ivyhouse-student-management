import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { platform } from "@/core/platform";

/**
 * Password recovery.
 *
 * Neither platform had any way for a student to recover a forgotten password —
 * they had to ask an administrator to reset it by hand, which meant a temporary
 * password travelling over WhatsApp or SMS.
 *
 * Design notes:
 *  - Only the SHA-256 of the token is stored. A database leak yields hashes,
 *    not working reset links.
 *  - Tokens are single-use and short-lived.
 *  - Requesting a reset reveals nothing about whether an account exists.
 *  - Redeeming one clears `mustChangePassword`: the student has just chosen a
 *    password, so forcing them to choose another immediately is nonsense.
 */

const TOKEN_TTL_MINUTES = 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface ResetRequest {
  /** The raw token to put in the emailed link. Null when no account matched. */
  token: string | null;
  email: string;
  name: string | null;
}

/**
 * Issue a reset token for an email address.
 *
 * Returns `token: null` when no active account matches. Callers must respond
 * to the user identically either way — a different message would turn this
 * into an account-enumeration oracle.
 */
export async function createPasswordReset(
  rawEmail: string,
): Promise<ResetRequest> {
  const email = rawEmail.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true },
  });

  if (!user || !user.isActive) return { token: null, email, name: null };

  // Invalidate any outstanding tokens, so a forgotten older email can't be used
  // after the student asks for a fresh link.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
    },
  });

  return { token, email, name: user.name };
}

/** The link to email. */
export function resetUrl(token: string): string {
  const base = platform().appUrl.replace(/\/$/, "");
  return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Redeem a token and set the new password.
 *
 * The token is marked used inside the same transaction that writes the
 * password, so two concurrent submissions of the same link cannot both succeed.
 */
export async function redeemPasswordReset(
  token: string,
  newPassword: string,
): Promise<ResetOutcome> {
  if (!token) return { ok: false, error: "This reset link is invalid." };

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  // One message for every failure mode: expired, already used, never existed.
  const INVALID = "This reset link is invalid or has expired. Please request a new one.";
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: INVALID };
  }

  const passwordHash = await hashPassword(newPassword);

  const claimed = await prisma.$transaction(async (tx) => {
    // Claim the token first. updateMany with usedAt: null makes this a
    // compare-and-set, so a replayed submission finds nothing to claim.
    const result = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (result.count === 0) return false;

    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        // They have just set a password of their own choosing; don't then send
        // them to the forced-change screen.
        mustChangePassword: false,
      },
    });
    return true;
  });

  if (!claimed) return { ok: false, error: INVALID };
  return { ok: true };
}

/** Remove expired tokens. Called opportunistically from the request path. */
export async function prunePasswordResets(): Promise<void> {
  if (Math.random() > 0.05) return;
  await prisma.passwordResetToken
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
}
