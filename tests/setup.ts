/**
 * Test environment.
 *
 * These tests run against a real PostgreSQL database because the behaviour
 * under test — atomic settlement, allocation idempotency, Decimal arithmetic —
 * only exists at the database boundary. Mocking Prisma here would test the mock.
 *
 * Paynow stays in mock mode so no real financial transaction is ever attempted.
 */
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.NEXTAUTH_SECRET ||= "test-secret-not-used-in-any-real-deployment";
process.env.PAYNOW_MODE = "development";
process.env.DATABASE_URL ||=
  "postgresql://postgres:postgres@127.0.0.1:5432/housing_test?schema=public";
