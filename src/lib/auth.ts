import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "shm_session";
const ALG = "HS256";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  [key: string]: unknown;
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || "insecure-development-secret-change-me";
  return new TextEncoder().encode(secret);
}

// ── Password hashing ──────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT helpers (edge-safe via jose) ──────────────────────────
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ── Cookie-based session (server components / actions) ────────
export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// ── Role-based route mapping ──────────────────────────────────
export function homeForRole(role: UserRole): string {
  switch (role) {
    case "OWNER":
      return "/owner";
    case "CARETAKER":
      return "/caretaker";
    case "STUDENT":
      return "/student";
    default:
      return "/";
  }
}
