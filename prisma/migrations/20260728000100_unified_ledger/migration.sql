-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('RENT', 'TRANSPORT', 'DEPOSIT', 'PENALTY', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WAIVED', 'CANCELLED');

-- AlterTable
-- RENAME, not drop-and-add. `prisma migrate diff` generates
--   DROP COLUMN "usesTransport" + ADD COLUMN "transportOptIn"
-- which would silently reset every student's transport subscription to false.
-- Renaming preserves the existing values.
ALTER TABLE "StudentProfile" RENAME COLUMN "usesTransport" TO "transportOptIn";
ALTER TABLE "StudentProfile" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "platformKey" TEXT;

-- CreateTable
CREATE TABLE "Charge" (
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
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Charge_studentProfileId_status_idx" ON "Charge"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "Charge_studentProfileId_category_status_idx" ON "Charge"("studentProfileId", "category", "status");

-- CreateIndex
CREATE INDEX "Charge_status_dueDate_idx" ON "Charge"("status", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentAllocation_chargeId_idx" ON "PaymentAllocation"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_chargeId_key" ON "PaymentAllocation"("paymentId", "chargeId");

-- CreateIndex
CREATE INDEX "StudentProfile_status_idx" ON "StudentProfile"("status");

-- CreateIndex
CREATE INDEX "StudentProfile_houseId_status_idx" ON "StudentProfile"("houseId", "status");

-- CreateIndex
CREATE INDEX "Invoice_studentProfileId_status_idx" ON "Invoice"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_studentProfileId_status_idx" ON "Payment"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;


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
WHERE i."status" <> 'CANCELLED';

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
