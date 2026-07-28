-- Backfill Charge.originPaymentId for charges raised before the link existed.
--
-- Self-service charges are written roughly a second before the Payment row for
-- the attempt that raised them, so the pairing is recoverable. This records it
-- for the ones that still matter — charges nothing has been paid against —
-- which is what lets an attempt that died withdraw exactly its own charge.
--
-- Deliberately conservative. A pair is linked only when it is unambiguous in
-- BOTH directions: exactly one payment fits the charge, and exactly one charge
-- fits that payment. Anything with a second candidate on either side is left
-- alone rather than guessed at, because a wrong link would eventually withdraw
-- a debt somebody genuinely owes.
--
-- Records only; no charge, payment or balance changes here.

UPDATE "Charge" c
SET "originPaymentId" = p.id
FROM "Payment" p
WHERE c."originPaymentId" IS NULL
  AND c.status = 'OUTSTANDING'
  AND p."studentProfileId" = c."studentProfileId"
  AND p.category = c.category
  AND p.amount = c.amount
  AND p."createdAt" BETWEEN c."createdAt" AND c."createdAt" + interval '5 seconds'
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentAllocation" a WHERE a."chargeId" = c.id
  )
  AND (
    SELECT count(*) FROM "Payment" p2
    WHERE p2."studentProfileId" = c."studentProfileId"
      AND p2.category = c.category
      AND p2.amount = c.amount
      AND p2."createdAt" BETWEEN c."createdAt" AND c."createdAt" + interval '5 seconds'
  ) = 1
  AND (
    SELECT count(*) FROM "Charge" c2
    WHERE c2."originPaymentId" IS NULL
      AND c2.status = 'OUTSTANDING'
      AND c2."studentProfileId" = p."studentProfileId"
      AND c2.category = p.category
      AND c2.amount = p.amount
      AND p."createdAt" BETWEEN c2."createdAt" AND c2."createdAt" + interval '5 seconds'
  ) = 1;
