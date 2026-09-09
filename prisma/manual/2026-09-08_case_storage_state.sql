-- KYC.storageState — production rollout.
--
-- Replaces the relation filters that made every archive query scan the whole
-- Memo table five times. Run these in order, on a live database, one statement
-- at a time. Steps 1-2 are fast; step 3 is the only one that touches every row;
-- step 4 must not run inside a transaction.

-- 1. The enum.
DO $$ BEGIN
  CREATE TYPE "CaseStorageState" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. The column. Postgres 11+ records the default in the catalogue instead of
--    rewriting the table, so this is fast even at millions of rows.
ALTER TABLE "KYC"
  ADD COLUMN IF NOT EXISTS "storageState" "CaseStorageState" NOT NULL DEFAULT 'ACTIVE';

-- 3. Backfill. Every case starts ACTIVE from the default, so only cases whose
--    documents are ALL archived or ALL freed need correcting — normally a small
--    fraction of the table. Equivalent to `npm run storage:backfill-state`,
--    which is the safer way to run it (it reports before it writes).
UPDATE "KYC" k
SET "storageState" = d.derived::"CaseStorageState"
FROM (
  SELECT k2.id,
         CASE
           WHEN COUNT(m.id) = 0 THEN 'ACTIVE'
           WHEN bool_and(m."archiveDeletedAt" IS NOT NULL) THEN 'DELETED'
           WHEN bool_and(m."storageTier" = 'ARCHIVE') THEN 'ARCHIVED'
           ELSE 'ACTIVE'
         END AS derived
  FROM "KYC" k2
  LEFT JOIN "Memo" m ON m."kycId" = k2.id
  GROUP BY k2.id
) d
WHERE k.id = d.id AND k."storageState"::text <> d.derived;

-- 4. Indexes. CONCURRENTLY builds without blocking readers or writers, unlike
--    the plain CREATE INDEX that `prisma db push` would issue. Each statement
--    must run on its own — never inside BEGIN/COMMIT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "KYC_storageState_status_isUrgent_submittedAt_idx"
  ON "KYC" ("storageState", "status", "isUrgent", "submittedAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "KYC_districtName_status_storageState_idx"
  ON "KYC" ("districtName", "status", "storageState");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "KYC_branchName_status_storageState_idx"
  ON "KYC" ("branchName", "status", "storageState");

-- 5. Confirm no CONCURRENTLY build was left INVALID (a failed one is unusable
--    and must be dropped and rebuilt):
--   SELECT c.relname, i.indisvalid
--   FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE c.relname LIKE 'KYC_%storageState%';
--
-- 6. Afterwards, and any time you suspect drift:
--   npm run storage:backfill-state -- --dry
