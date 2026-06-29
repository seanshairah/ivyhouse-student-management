import { PrismaClient } from "@prisma/client";

/**
 * Build the datasource URL for the current environment.
 *
 * Neon's pooled endpoint (`-pooler`) runs PgBouncer in transaction mode. For
 * Prisma to work reliably against it in a serverless environment (Vercel) we
 * must:
 *   - set `pgbouncer=true` so Prisma disables prepared statements (otherwise
 *     you get intermittent "prepared statement already exists" errors / hangs
 *     under concurrency — a common cause of slow loads and timeouts), and
 *   - cap `connection_limit` low so the many short-lived serverless function
 *     instances don't exhaust Neon's connection pool.
 *
 * These are added automatically for Neon URLs if not already present, so no
 * change to the deployment's environment variables is required.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (!/neon\.tech/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("pgbouncer"))
      url.searchParams.set("pgbouncer", "true");
    if (!url.searchParams.has("connection_limit"))
      url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("pool_timeout"))
      url.searchParams.set("pool_timeout", "15");
    return url.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const url = datasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
