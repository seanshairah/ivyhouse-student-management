-- Link a charge to the payment attempt that raised it.
--
-- Self-service charges are raised before the money is taken, so the ledger has
-- something to allocate against when it arrives. When the attempt dies, the
-- charge has to be withdrawn — and until now that was done by matching on
-- student + category + recency, which could just as easily withdraw a genuine
-- charge raised by the office. This column makes the withdrawal exact.
--
-- Additive only: nullable column, index, nullable FK. Nothing is renamed or
-- dropped, so the currently deployed code keeps working unchanged while this
-- is applied. Written to be safely re-runnable on both production databases.

ALTER TABLE "Charge" ADD COLUMN IF NOT EXISTS "originPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "Charge_originPaymentId_idx"
  ON "Charge"("originPaymentId");

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Charge_originPaymentId_fkey'
  ) THEN
    ALTER TABLE "Charge"
      ADD CONSTRAINT "Charge_originPaymentId_fkey"
      FOREIGN KEY ("originPaymentId") REFERENCES "Payment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$mig$;
