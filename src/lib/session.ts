import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { getSession, homeForRole, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Require an authenticated user. Redirects to login if absent or if the
 * account has since been deactivated, and forces a pending password change
 * before any protected page renders (covers owner, student and caretaker).
 */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isActive: true, mustChangePassword: true },
  });
  if (!user || !user.isActive) redirect("/auth/login");
  if (user.mustChangePassword) redirect("/auth/change-password");

  return session;
}

/** Require a specific role (or one of several). Redirects appropriately. */
export async function requireRole(
  roles: UserRole | UserRole[],
): Promise<SessionPayload> {
  const session = await requireUser();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.role)) {
    redirect(homeForRole(session.role));
  }
  return session;
}
