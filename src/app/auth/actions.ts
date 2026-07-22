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
import type { ActionResult } from "@/types";

const INVALID = "Invalid email or password.";

// Best-effort, in-memory brute-force throttle. Keyed by email; resets on a
// successful login. In a multi-instance serverless deployment this only spans
// a single warm instance, so it's a speed bump (paired with the failure delay
// + a generic error message), not a hard lockout.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function recordFailure(email: string) {
  const now = Date.now();
  const e = attempts.get(email);
  if (!e || now - e.firstAt > WINDOW_MS) {
    attempts.set(email, { count: 1, firstAt: now });
  } else {
    e.count += 1;
  }
}

function isLocked(email: string): boolean {
  const e = attempts.get(email);
  if (!e) return false;
  if (Date.now() - e.firstAt > WINDOW_MS) {
    attempts.delete(email);
    return false;
  }
  return e.count >= MAX_ATTEMPTS;
}

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

  if (isLocked(email)) {
    return {
      success: false,
      error: "Too many failed attempts. Please wait a few minutes and try again.",
    };
  }

  const fail = async (reason: string): Promise<ActionResult> => {
    recordFailure(email);
    await audit({ actorEmail: email, action: "auth.login.failed", metadata: { reason } });
    await sleep(500); // throttle brute-force / timing
    return { success: false, error: INVALID };
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return fail(user ? "inactive" : "no_user");
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return fail("bad_password");
  }

  attempts.delete(email);

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
