import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Always run on the server, never cached — this is a keep-warm/health probe.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health + keep-warm endpoint. Runs a trivial query so Neon's compute stays
 * active (the free tier suspends after ~5 min idle, causing slow "cold start"
 * first loads). Ping this every few minutes from a scheduler/uptime monitor.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: "up", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: (e as Error).message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
