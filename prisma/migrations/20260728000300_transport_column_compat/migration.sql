-- ─────────────────────────────────────────────────────────────────────────
--  COMPATIBILITY SHIM: usesTransport <-> transportOptIn
-- ─────────────────────────────────────────────────────────────────────────
--
-- 20260728000100 renamed "usesTransport" to "transportOptIn". That rename is
-- correct, but it is NOT backwards compatible: a deployment still running the
-- previous build has a Prisma client that names "usesTransport" explicitly in
-- its SELECT lists, so every query touching StudentProfile fails the moment the
-- rename lands — which takes the live site down until the new build ships.
--
-- This is the expand half of an expand/contract migration, which is what the
-- rename should have been from the start: carry BOTH column names, kept in
-- lockstep by a trigger, so old and new code can run against the same database
-- at the same time and the deploy order stops mattering.
--
-- CONTRACT STEP (run only once BOTH platforms are deployed on the new build):
--   DROP TRIGGER IF EXISTS student_transport_sync ON "StudentProfile";
--   DROP FUNCTION IF EXISTS sync_student_transport();
--   ALTER TABLE "StudentProfile" DROP COLUMN IF EXISTS "usesTransport";

ALTER TABLE "StudentProfile"
  ADD COLUMN IF NOT EXISTS "usesTransport" BOOLEAN NOT NULL DEFAULT false;

-- Seed the legacy column from the current truth.
UPDATE "StudentProfile" SET "usesTransport" = "transportOptIn"
WHERE "usesTransport" IS DISTINCT FROM "transportOptIn";

-- Keep them in step in BOTH directions: old code writes usesTransport, new code
-- writes transportOptIn, and either must be visible to the other immediately.
CREATE OR REPLACE FUNCTION sync_student_transport() RETURNS TRIGGER AS $sync$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Whichever side was supplied wins; default false when neither was.
    IF NEW."transportOptIn" IS DISTINCT FROM NEW."usesTransport" THEN
      IF NEW."transportOptIn" THEN
        NEW."usesTransport" := NEW."transportOptIn";
      ELSE
        NEW."transportOptIn" := NEW."usesTransport";
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: propagate whichever column actually changed.
  IF NEW."transportOptIn" IS DISTINCT FROM OLD."transportOptIn" THEN
    NEW."usesTransport" := NEW."transportOptIn";
  ELSIF NEW."usesTransport" IS DISTINCT FROM OLD."usesTransport" THEN
    NEW."transportOptIn" := NEW."usesTransport";
  END IF;
  RETURN NEW;
END;
$sync$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_transport_sync ON "StudentProfile";
CREATE TRIGGER student_transport_sync
  BEFORE INSERT OR UPDATE ON "StudentProfile"
  FOR EACH ROW EXECUTE FUNCTION sync_student_transport();
