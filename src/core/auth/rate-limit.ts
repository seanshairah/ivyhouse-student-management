import { prisma } from "@/lib/prisma";

/**
 * Sliding-window rate limiting, backed by the database.
 *
 * Both platforms deploy to serverless, where consecutive requests can land on
 * different instances. An in-process counter would reset constantly and enforce
 * nothing, so the window lives in a table instead.
 *
 * Used to slow down two things that had no protection at all:
 *   - password guessing against the login form
 *   - repeated payment initiation, which each round-trips to Paynow
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window frees up, when blocked. */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Bucket identity, e.g. `login:${email}`. Keep it low-cardinality. */
  key: string;
  /** Attempts permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Record an attempt and report whether it is allowed.
 *
 * Fails OPEN: if the rate-limit table is unreachable we let the request
 * through rather than locking every student out of the portal. Rate limiting is
 * a mitigation, not the security boundary — authentication and authorisation
 * are, and those fail closed.
 */
export async function rateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000);

  try {
    const recent = await prisma.rateLimit.count({
      where: { key: opts.key, createdAt: { gte: since } },
    });

    if (recent >= opts.limit) {
      const oldest = await prisma.rateLimit.findFirst({
        where: { key: opts.key, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const freesAt = oldest
        ? oldest.createdAt.getTime() + opts.windowSeconds * 1000
        : Date.now();
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((freesAt - Date.now()) / 1000)),
      };
    }

    await prisma.rateLimit.create({ data: { key: opts.key } });
    return {
      allowed: true,
      remaining: opts.limit - recent - 1,
      retryAfterSeconds: 0,
    };
  } catch (err) {
    console.error("[rate-limit] check failed, allowing request", err);
    return { allowed: true, remaining: opts.limit, retryAfterSeconds: 0 };
  }
}

/**
 * Clear a bucket. Called after a successful login so a legitimate user who
 * mistyped their password a few times isn't left throttled.
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } }).catch(() => undefined);
}

/**
 * Drop windows that have expired. Called opportunistically (1-in-50 logins) so
 * the table stays small without needing a scheduled job.
 */
export async function pruneRateLimits(olderThanSeconds = 3600): Promise<void> {
  if (Math.random() > 0.02) return;
  await prisma.rateLimit
    .deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - olderThanSeconds * 1000) } },
    })
    .catch(() => undefined);
}

/** How many failed sign-ins we tolerate, and over what window. */
export const LOGIN_LIMIT = { limit: 8, windowSeconds: 15 * 60 };
/** Payment initiations per student. Generous — it only stops runaway retries. */
export const PAYMENT_LIMIT = { limit: 12, windowSeconds: 10 * 60 };
/**
 * Mobile-money prompts per DESTINATION number, across the whole platform.
 *
 * PAYMENT_LIMIT is keyed to the paying student, which protects the merchant
 * account from runaway retries but does nothing for the person on the other
 * end: a student can type any number they like into the EcoCash field, so the
 * per-student budget becomes a budget for pushing USSD prompts at a stranger's
 * phone. Whoever owns that number never consented to any of it and cannot
 * appeal to us to stop.
 *
 * Keyed by a hash of the number rather than the number itself, so throttling
 * abuse doesn't require accumulating a table of everyone's phone number.
 *
 * Tight on purpose. A student paying for themselves needs one prompt, and a
 * retry or two if the first is fumbled; nobody legitimately needs a fourth
 * inside a quarter of an hour.
 */
export const PROMPT_DESTINATION_LIMIT = { limit: 3, windowSeconds: 15 * 60 };
/**
 * How often the reconciliation sweep may actually run.
 *
 * /api/health is deliberately public — it is a keep-warm and uptime probe, and
 * gating it behind a secret would mean an outage looks like a healthy 401. But
 * it also runs the payment sweep, which makes one outbound Paynow call for
 * every in-flight payment. That turns one unauthenticated GET into N provider
 * calls: cheap to send, expensive to serve, and the likely outcome is Paynow
 * throttling or blocking us — which would break settlement for real students.
 *
 * The sweep is idempotent and time-based, so running it more than once every
 * few minutes achieves nothing. A cooldown removes the amplification without
 * needing a secret, and the daily cron clears it comfortably — so this can
 * never be the reason a payment goes unsettled.
 */
export const SWEEP_COOLDOWN = { limit: 1, windowSeconds: 5 * 60 };
