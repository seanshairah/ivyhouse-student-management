import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { getSession, homeForRole, type SessionPayload } from "@/lib/auth";

/** Require an authenticated user. Redirects to login if absent. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/auth/login");
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
