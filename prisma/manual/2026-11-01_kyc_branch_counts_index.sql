-- KYC branch-count index, for applying to a live database.
--
-- Branch users make up about 95% of accounts, and every sidebar badge and
-- dashboard card they load filters KYC by branchId, which had no index. This was
-- the main cause of the sustained PostgreSQL CPU load.
--
-- CONCURRENTLY builds without blocking readers or writers, so this is safe during
-- working hours, though a quiet period is still better. It cannot run inside a
-- transaction block, so do not wrap this file in BEGIN/COMMIT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "KYC_branchId_status_isExceptional_isResubmitted_active_idx"
  ON "KYC" ("branchId", "status", "isExceptional", "isResubmitted", "active");

-- Afterwards, check the build was not left INVALID (a CONCURRENTLY build that
-- fails leaves an unusable index behind, which must be dropped and rebuilt):
--   SELECT c.relname, i.indisvalid
--   FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE c.relname = 'KYC_branchId_status_isExceptional_isResubmitted_active_idx';
