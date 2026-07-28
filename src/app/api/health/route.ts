import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileAndExpirePayments } from "@/services/payments";

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

    // Housekeeping, on the daily cron that already exists rather than a second
    // scheduler: reconcile every in-flight payment against Paynow, then close
    // out what is genuinely dead. A student who abandoned a checkout otherwise
    // sees "payment in progress" indefinitely — and a payment Paynow collected
    // but never told us about would otherwise sit unreceipted forever.
    const sweep = await reconcileAndExpirePayments().catch(() => null);

    return NextResponse.json(
      {
        ok: true,
        db: "up",
        ms: Date.now() - started,
        settledPayments: sweep?.settled ?? 0,
        expiredPayments: sweep?.closed ?? 0,
        withdrawnCharges: sweep?.withdrawn ?? 0,
        unresolvedPayments: sweep?.unresolved ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: (e as Error).message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
