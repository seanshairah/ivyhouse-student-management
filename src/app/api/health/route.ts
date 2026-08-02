import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileAndExpirePayments } from "@/services/payments";
import { rateLimit, SWEEP_COOLDOWN } from "@/core/auth/rate-limit";

// Always run on the server, never cached — this is a keep-warm/health probe.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Is this the scheduler, rather than the open internet?
 *
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to cron invocations
 * when that variable is set. It is optional here on purpose: if it is absent
 * the sweep still runs, just under the cooldown below. Requiring it would mean
 * that forgetting to set one variable silently stops every payment settling —
 * the failure mode this endpoint exists to prevent.
 */
function isScheduledRun(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Health + keep-warm endpoint. Runs a trivial query so Neon's compute stays
 * active (the free tier suspends after ~5 min idle, causing slow "cold start"
 * first loads). Ping this every few minutes from a scheduler/uptime monitor.
 *
 * The liveness check is public and always runs — an uptime monitor that has to
 * authenticate cannot tell an outage from a misconfigured credential. The
 * payment sweep is the expensive part and is rate-limited separately.
 */
export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;

    // Housekeeping, on the daily cron that already exists rather than a second
    // scheduler: reconcile every in-flight payment against Paynow, then close
    // out what is genuinely dead. A student who abandoned a checkout otherwise
    // sees "payment in progress" indefinitely — and a payment Paynow collected
    // but never told us about would otherwise sit unreceipted forever.
    //
    // Each pass makes one outbound Paynow call per in-flight payment, so an
    // open endpoint that swept on every request would let anyone amplify a
    // single GET into N provider calls. The cooldown makes that pointless
    // while leaving the daily run — and any genuine scheduled run — untouched.
    let sweep = null;
    let swept = false;
    if (isScheduledRun(req)) {
      swept = true;
    } else {
      const gate = await rateLimit({ key: "sweep:health", ...SWEEP_COOLDOWN });
      swept = gate.allowed;
    }
    if (swept) sweep = await reconcileAndExpirePayments().catch(() => null);

    return NextResponse.json(
      {
        ok: true,
        db: "up",
        ms: Date.now() - started,
        // Distinguishes "nothing needed doing" from "we didn't look", so a
        // zero here is never mistaken for a clean bill of health.
        swept,
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
