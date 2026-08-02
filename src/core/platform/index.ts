import { platformConfig } from "@/platform/config";
import type { PlatformConfig } from "./types";

export * from "./types";

/** The configuration for the platform this deployment serves. */
export function platform(): PlatformConfig {
  return platformConfig;
}

/**
 * Fail-closed environment checks.
 *
 * Both of these used to fall back to a safe-looking default, which meant a
 * misconfigured production deploy kept running while doing something dangerous:
 * signing sessions with a publicly-known secret, or treating every payment as
 * settled without money moving. Production now refuses to start instead.
 *
 * Called from `src/lib/auth.ts` and `src/core/payments/paynow.ts`, which are the
 * two places that consume these values.
 */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.NEXTAUTH_SECRET) missing.push("NEXTAUTH_SECRET");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    throw new Error(
      `[${platformConfig.key}] Refusing to start: missing required environment ` +
        `variable(s): ${missing.join(", ")}. See .env.example.`,
    );
  }
}

/**
 * Guard against a deployment pointed at the wrong database.
 *
 * The two platforms are separate businesses with separate databases. Their
 * schemas are identical, so a copy-pasted DATABASE_URL would "work" — one
 * brand quietly serving the other's students, rooms and money. Settings
 * records which platform a database belongs to; this refuses to use a database
 * that claims to belong to somebody else.
 *
 * A null platformKey means the database predates this check, so we adopt it
 * (see `stampPlatformKey`) rather than locking the operator out.
 */
export function assertDatabaseBelongsToPlatform(
  storedKey: string | null | undefined,
): void {
  if (!storedKey) return;
  if (storedKey !== platformConfig.key) {
    throw new Error(
      `[${platformConfig.key}] Database mismatch: DATABASE_URL points at a ` +
        `database belonging to "${storedKey}". Refusing to read or write ` +
        `another platform's records. Check DATABASE_URL for this deployment.`,
    );
  }
}

/**
 * Memoised so the guard costs one query per serverless instance, not one per
 * request. A rejected database is cached as rejected too: the answer cannot
 * change without a redeploy, and re-querying on every request would turn a
 * misconfiguration into a stampede.
 */
let databaseCheck: Promise<void> | null = null;

/**
 * Clear the memoised result. Exists for tests, which need to exercise both the
 * accepting and rejecting paths in one process — in production the answer
 * cannot change without a redeploy, so nothing else should call this.
 */
export function resetDatabasePlatformCheck(): void {
  databaseCheck = null;
}

/**
 * Actually enforce the platform/database pairing.
 *
 * `assertDatabaseBelongsToPlatform` above has existed since the two platforms
 * were split apart — correct, tested by inspection, and never once called.
 * The column it reads was being written by seeding and read by nothing, so the
 * guarantee it documents ("refuses to use a database that claims to belong to
 * somebody else") was not true of the running system: a copy-pasted
 * DATABASE_URL would have had one brand quietly serving the other's students
 * and money, exactly the outcome it was written to prevent.
 *
 * Called from requireUser(), which every protected page and server action
 * passes through before touching data.
 */
export async function ensureDatabaseBelongsToPlatform(
  readStoredKey: () => Promise<string | null | undefined>,
): Promise<void> {
  if (!databaseCheck) {
    databaseCheck = (async () => {
      // A database that cannot be read is a separate failure, handled by the
      // caller's own error path — don't convert it into a platform mismatch.
      const storedKey = await readStoredKey().catch(() => undefined);
      assertDatabaseBelongsToPlatform(storedKey);
    })();
  }
  return databaseCheck;
}
