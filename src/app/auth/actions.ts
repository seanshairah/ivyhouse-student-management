"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSession,
  destroySession,
  homeForRole,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { audit } from "@/services/audit";
import type { ActionResult } from "@/types";

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

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });
  if (!user || !user.isActive) {
    return { success: false, error: "Invalid email or password." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return { success: false, error: "Invalid email or password." };
  }

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

  return { success: true, data: { redirect: homeForRole(user.role) } };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/auth/login");
}
