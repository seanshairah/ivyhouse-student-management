"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSession,
  destroySession,
  homeForRole,
} from "@/lib/auth";
import { loginSchema, changePasswordSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { audit } from "@/services/audit";
import {
  rateLimit,
  clearRateLimit,
  pruneRateLimits,
  LOGIN_LIMIT,
} from "@/core/auth/rate-limit";
import {
  createPasswordReset,
  redeemPasswordReset,
  resetUrl,
  prunePasswordResets,
} from "@/core/auth/password-reset";
import { sendTemplatedEmail } from "@/services/email";
import { EMAIL_SUBJECTS } from "@/constants/messages";
import type { ActionResult } from "@/types";

const INVALID = "Invalid email or password.";

// A real bcrypt hash of a value nobody knows. Compared against when the email
// isn't registered, so an unknown account costs the same time as a wrong
// password and the two are indistinguishable from outside.
const DUMMY_HASH =
  "$2a$10$vIHaYaTrXi55tsQpGNrpZOcUnBw99D7mzAr7guofXHYPX13mMOIZi";

// Brute-force throttling lives in the database (see core/auth/rate-limit).
// It used to be an in-memory Map, which on serverless spans one warm instance
// at best — an attacker spreading guesses across cold starts never hit it.

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const limitKey = `login:${email}`;

  await pruneRateLimits();
  const gate = await rateLimit({ key: limitKey, ...LOGIN_LIMIT });
  if (!gate.allowed) {
    await audit({ actorEmail: email, action: "auth.login.rate_limited" });
    const minutes = Math.ceil(gate.retryAfterSeconds / 60);
    return {
      success: false,
      error: `Too many sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const fail = async (reason: string): Promise<ActionResult> => {
    await audit({ actorEmail: email, action: "auth.login.failed", metadata: { reason } });
    return { success: false, error: INVALID };
  };

  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a bcrypt comparison — against the real hash, or a dummy one when
  // the account doesn't exist. Returning early for an unknown email would make
  // "no such user" measurably faster than "wrong password", which is enough to
  // enumerate the student roll.
  const valid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !user.isActive) return fail(user ? "inactive" : "no_user");
  if (!valid) return fail("bad_password");

  // A legitimate user who mistyped a few times shouldn't stay throttled.
  await clearRateLimit(limitKey);

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "auth.login",
  });

  // First login on a temporary password: force a password change before
  // anything else.
  const redirectTo = user.mustChangePassword
    ? "/auth/change-password"
    : homeForRole(user.role);

  return { success: true, data: { redirect: redirectTo } };
}

/**
 * Change the signed-in user's password. Used both for the forced first-login
 * change and as a normal "change password" action. Clears mustChangePassword.
 */
export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
    return { success: false, error: "Account not found." };
  }

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    await audit({ userId: user.id, actorEmail: user.email, action: "auth.password_change.failed" });
    return { success: false, error: "Your current password is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    },
  });
  await audit({ userId: user.id, actorEmail: user.email, action: "auth.password_change" });

  return { success: true, data: { redirect: homeForRole(user.role) } };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/auth/login");
}

/**
 * "I forgot my password" — issue a reset link.
 *
 * Always reports success, whatever happened. Saying "no account with that
 * email" would let anyone test which addresses are registered, and the student
 * roll is exactly the list an attacker would want.
 */
export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const GENERIC =
    "If that email is registered, we've sent a reset link. Please check your inbox.";

  if (!email || !email.includes("@")) {
    return { success: false, error: "Enter the email address on your account." };
  }

  // Throttle by email so this can't be used to spam somebody's inbox, and by
  // extension can't be used to probe addresses at speed.
  const gate = await rateLimit({ key: `reset:${email}`, limit: 3, windowSeconds: 15 * 60 });
  if (!gate.allowed) return { success: true, message: GENERIC };

  await prunePasswordResets();

  try {
    const request = await createPasswordReset(email);
    if (request.token) {
      await sendTemplatedEmail(
        request.email,
        EMAIL_SUBJECTS.passwordReset,
        "passwordReset",
        {
          studentName: request.name ?? "there",
          resetUrl: resetUrl(request.token),
        },
      ).catch(() => undefined);
    }
    await audit({ actorEmail: email, action: "auth.password_reset.requested" });
  } catch {
    // Never surface the reason — the response must not vary by outcome.
  }

  return { success: true, message: GENERIC };
}

/** Redeem a reset link and set the new password. */
export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");

  if (password !== confirm) {
    return { success: false, error: "The two passwords don't match." };
  }
  if (password.length < 8) {
    return { success: false, error: "Use at least 8 characters." };
  }

  const result = await redeemPasswordReset(token, password);
  if (!result.ok) return { success: false, error: result.error };

  await audit({ action: "auth.password_reset.completed" });
  // Not signed in automatically: possession of an emailed link shouldn't hand
  // out a session. They sign in with the password they just chose.
  return {
    success: true,
    message: "Your password has been changed. You can now sign in.",
  };
}
