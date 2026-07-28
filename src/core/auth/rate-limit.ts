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
