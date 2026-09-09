-- Storage-overview indexes, for applying to a live database.
--
-- `prisma db push` creates these with a plain CREATE INDEX, which takes a lock
-- that blocks writes to the table while it builds. On a production Memo table
-- holding ~1M rows that is seconds to a minute of blocked uploads. Run this
-- instead: CONCURRENTLY builds without blocking readers or writers.
--
-- Run each statement on its own — CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, so do not wrap this file in BEGIN/COMMIT.
--
-- Serves getArchiveStorageOverview(): the tier aggregates filter on
-- (storageTier, archiveDeletedAt), the "oldest waiting" lookup orders by
-- archivedAt within that, and carrying size lets SUM(size) be answered from the
-- index without touching the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Memo_storageTier_archiveDeletedAt_archivedAt_size_idx"
  ON "Memo" ("storageTier", "archiveDeletedAt", "archivedAt", "size");

-- Serves "when did this action last happen?" lookups on the audit log.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_action_timestamp_idx"
  ON "AuditLog" ("action", "timestamp");

-- Afterwards, check that neither build was left INVALID (a CONCURRENTLY build
-- that fails leaves an unusable index behind, which must be dropped and rebuilt):
--   SELECT c.relname, i.indisvalid
--   FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE c.relname IN (
--     'Memo_storageTier_archiveDeletedAt_archivedAt_size_idx',
--     'AuditLog_action_timestamp_idx'
--   );

-- Added after load testing: serves the vault's "sort by size / document count",
-- which groups a tier's documents by case and orders by the aggregate.
-- Measured on 1M documents: 554 ms -> 162 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Memo_storageTier_kycId_size_idx"
  ON "Memo" ("storageTier", "kycId", "size");
