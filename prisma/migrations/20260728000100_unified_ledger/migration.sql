-- CreateEnum
-- Written to be re-runnable: this migration is applied by hand to databases
-- that were built with `prisma db push` and are not in identical states.
DO $mig$ BEGIN
  CREATE TYPE "ChargeCategory" AS ENUM ('RENT', 'TRANSPORT', 'DEPOSIT', 'PENALTY', 'ADJUSTMENT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- CreateEnum
DO $mig$ BEGIN
  CREATE TYPE "ChargeStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WAIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- AlterTable
-- RENAME, not drop-and-add. `prisma migrate diff` generates
--   DROP COLUMN "usesTransport" + ADD COLUMN "transportOptIn"
-- which would silently reset every student's transport subscription to false.
-- Renaming preserves the existing values.
DO $mig$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'StudentProfile' AND column_name = 'usesTransport')
  THEN
    ALTER TABLE "StudentProfile" RENAME COLUMN "usesTransport" TO "transportOptIn";
  END IF;
END $mig$;
ALTER TABLE "StudentProfile" ADD COLUMN IF NOT EXISTS "transportOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudentProfile" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "platformKey" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Charge" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "category" "ChargeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "invoiceId" TEXT,
    "adjustedById" TEXT,
    "adjustmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Charge_studentProfileId_status_idx" ON "Charge"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Charge_studentProfileId_category_status_idx" ON "Charge"("studentProfileId", "category", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Charge_status_dueDate_idx" ON "Charge"("status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentAllocation_chargeId_idx" ON "PaymentAllocation"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_chargeId_key" ON "PaymentAllocation"("paymentId", "chargeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentProfile_status_idx" ON "StudentProfile"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentProfile_houseId_status_idx" ON "StudentProfile"("houseId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_studentProfileId_status_idx" ON "Invoice"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_studentProfileId_status_idx" ON "Payment"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "Charge" ADD CONSTRAINT "Charge_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "Charge" ADD CONSTRAINT "Charge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- AddForeignKey
DO $mig$ BEGIN
  ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;


-- ─────────────────────────────────────────────────────────────────────────
--  BACKFILL — carry existing money into the new ledger
-- ─────────────────────────────────────────────────────────────────────────
--
-- Without this, every student's balance would read zero the moment this
-- migration lands, because balances are now derived from Charge rows and no
-- Charge rows exist yet.
--
-- Category is inferred once, here, from the text the old schema had available.
-- This is the only place that guessing is acceptable: from now on the category
-- is recorded explicitly when the charge is raised. Anything unrecognised
-- becomes RENT, since accommodation was the default charge in both platforms.

-- 1. Every non-cancelled invoice becomes a charge.
INSERT INTO "Charge" (
  "id", "studentProfileId", "category", "description", "amount",
  "status", "dueDate", "invoiceId", "createdAt", "updatedAt"
)
SELECT
  'ch_' || i."id",
  i."studentProfileId",
  (CASE
    WHEN i."description" ILIKE '%transport%' OR i."description" ILIKE '%shuttle%'
      THEN 'TRANSPORT'
    WHEN i."description" ILIKE '%deposit%' THEN 'DEPOSIT'
    WHEN i."description" ILIKE '%penalt%' OR i."description" ILIKE '%late fee%'
      THEN 'PENALTY'
    ELSE 'RENT'
  END)::"ChargeCategory",
  i."description",
  i."amount",
  (CASE WHEN i."amountPaid" >= i."amount" THEN 'SETTLED' ELSE 'OUTSTANDING' END)::"ChargeStatus",
  i."dueDate",
  i."id",
  i."createdAt",
  i."updatedAt"
FROM "Invoice" i
WHERE i."status" <> 'CANCELLED'
ON CONFLICT ("id") DO NOTHING;

-- 2. Tag historical payments with the category of the invoice they settled, so
--    revenue reporting can split rent from transport retrospectively.
UPDATE "Payment" p
SET "category" = c."category"
FROM "Charge" c
WHERE c."invoiceId" = p."invoiceId" AND p."invoiceId" IS NOT NULL;

-- 3. Recreate the allocation of each settled payment against its charge, so the
--    derived balance matches what the old denormalised amountPaid column said.
--    Capped at the charge amount so a historical overpayment cannot produce a
--    negative balance.
INSERT INTO "PaymentAllocation" ("id", "paymentId", "chargeId", "amount", "createdAt")
SELECT
  'pa_' || p."id",
  p."id",
  c."id",
  LEAST(p."amount", c."amount"),
  COALESCE(p."paidAt", p."createdAt")
FROM "Payment" p
JOIN "Charge" c ON c."invoiceId" = p."invoiceId"
WHERE p."status" = 'PAID' AND p."invoiceId" IS NOT NULL
ON CONFLICT ("paymentId", "chargeId") DO NOTHING;

-- 4. Stamp the database with the platform it belongs to, so a deployment
--    pointed at the wrong DATABASE_URL fails loudly instead of serving one
--    business's data under the other's brand.
INSERT INTO "Settings" ("id", "platformKey", "updatedAt")
VALUES ('singleton', 'ivy-house', NOW())
ON CONFLICT ("id") DO UPDATE SET "platformKey" = 'ivy-house';

-- 5. Money received with no invoice behind it.
--
-- One platform's self-service flow created a Payment with no Invoice at all,
-- and booking deposits were recorded the same way. Those payments are real
-- money that the old balance query could not see, because it summed invoices.
-- Give each one a charge in the right category and allocate it, so the ledger
-- balances: every dollar received is now attached to something.
--
-- Category is inferred from the reference prefix, which is the only signal the
-- old data carries. DEP-* were booking deposits; anything else was rent.
INSERT INTO "Charge" (
  "id", "studentProfileId", "category", "description", "amount",
  "status", "dueDate", "createdAt", "updatedAt"
)
SELECT
  'ch_p_' || p."id",
  p."studentProfileId",
  (CASE WHEN p."reference" LIKE 'DEP-%' THEN 'DEPOSIT' ELSE 'RENT' END)::"ChargeCategory",
  (CASE WHEN p."reference" LIKE 'DEP-%' THEN 'Booking deposit' ELSE 'Accommodation payment' END),
  p."amount",
  'SETTLED'::"ChargeStatus",
  COALESCE(p."paidAt", p."createdAt"),
  p."createdAt",
  p."updatedAt"
FROM "Payment" p
WHERE p."status" = 'PAID' AND p."invoiceId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "Payment" p
SET "category" = (CASE WHEN p."reference" LIKE 'DEP-%' THEN 'DEPOSIT' ELSE 'RENT' END)::"ChargeCategory"
WHERE p."status" = 'PAID' AND p."invoiceId" IS NULL;

INSERT INTO "PaymentAllocation" ("id", "paymentId", "chargeId", "amount", "createdAt")
SELECT 'pa_p_' || p."id", p."id", 'ch_p_' || p."id", p."amount",
       COALESCE(p."paidAt", p."createdAt")
FROM "Payment" p
WHERE p."status" = 'PAID' AND p."invoiceId" IS NULL
ON CONFLICT ("paymentId", "chargeId") DO NOTHING;

-- 6. Expire payments left PENDING far longer than any real checkout lasts.
--    They can never settle now — the provider session is long gone — and they
--    make the student's dashboard show a payment "in progress" indefinitely.
UPDATE "Payment"
SET "status" = 'CANCELLED'
WHERE "status" IN ('PENDING', 'PROCESSING')
  AND "createdAt" < NOW() - INTERVAL '24 hours';

-- 7. Issue receipts for settled payments that never got one.
--
-- Payments recorded by hand (cash deposits marked paid in the dashboard) never
-- went through settlePayment(), so no receipt was created and the student has
-- no proof of payment. Numbering continues from the Settings counter so it
-- can't collide with receipts issued later.
WITH missing AS (
  SELECT p."id", p."amount", COALESCE(p."paidAt", p."createdAt") AS issued,
         ROW_NUMBER() OVER (ORDER BY COALESCE(p."paidAt", p."createdAt"), p."id") AS seq
  FROM "Payment" p
  LEFT JOIN "Receipt" r ON r."paymentId" = p."id"
  WHERE p."status" = 'PAID' AND r."id" IS NULL
),
base AS (
  SELECT COALESCE((SELECT "receiptCounter" FROM "Settings" WHERE "id" = 'singleton'), 1000) AS start,
         COALESCE((SELECT "receiptPrefix" FROM "Settings" WHERE "id" = 'singleton'), 'RCT') AS prefix
)
INSERT INTO "Receipt" ("id", "number", "paymentId", "amount", "issuedAt", "createdAt")
SELECT
  'rc_' || m."id",
  b.prefix || '-' || LPAD((b.start + m.seq)::text, 5, '0'),
  m."id",
  m."amount",
  m.issued,
  m.issued
FROM missing m CROSS JOIN base b
ON CONFLICT ("id") DO NOTHING;

-- Move the counter past everything we just issued.
UPDATE "Settings"
SET "receiptCounter" = GREATEST(
  "receiptCounter",
  COALESCE((SELECT MAX(NULLIF(regexp_replace("number", '\D', '', 'g'), '')::int)
            FROM "Receipt"), "receiptCounter")
)
WHERE "id" = 'singleton';
