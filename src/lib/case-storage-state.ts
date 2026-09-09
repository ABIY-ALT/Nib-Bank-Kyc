import { prisma } from '@/lib/prisma';

/**
 * A case's storage state is derived from its documents: it counts as ARCHIVED
 * or DELETED only when ALL of them are, because a tier move takes a case's
 * documents together. A case holding no documents is ACTIVE.
 *
 * That question used to be asked of the Memo table on every read, which cost
 * five sequential scans of it per archive query. It is now answered once at
 * write time and stored on KYC.storageState. This module is the ONLY place the
 * rule is written down — every path that creates, moves or removes a document
 * calls it, so the column cannot drift from the documents it summarises.
 */

export type CaseStorageState = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

/** The canonical rule. Kept as a pure function so it can be tested and reused. */
export function deriveCaseStorageState(
  memos: { storageTier: string; archiveDeletedAt: Date | null }[],
): CaseStorageState {
  if (memos.length === 0) return 'ACTIVE';
  if (memos.every(m => m.archiveDeletedAt !== null)) return 'DELETED';
  if (memos.every(m => m.storageTier === 'ARCHIVE')) return 'ARCHIVED';
  return 'ACTIVE';
}

/** Prisma client or an interactive transaction — either can run these writes. */
type Db = Pick<typeof prisma, 'memo' | 'kYC'>;

/**
 * Recomputes `storageState` for the given cases and writes back only those that
 * actually changed.
 *
 * Callers pass the cases they just touched, so the set is bounded by the batch
 * they were already processing. Never throws: a stale state flag must not fail
 * an upload or a file move that has already happened on disk — the reconcile
 * pass (`npm run storage:reconcile-state`) repairs anything missed.
 */
export async function syncCaseStorageState(kycIds: string[], db: Db = prisma): Promise<void> {
  const ids = [...new Set(kycIds.filter(Boolean))];
  if (ids.length === 0) return;

  try {
    const [memos, cases] = await Promise.all([
      db.memo.findMany({
        where: { kycId: { in: ids } },
        select: { kycId: true, storageTier: true, archiveDeletedAt: true },
      }),
      db.kYC.findMany({
        where: { id: { in: ids } },
        select: { id: true, storageState: true },
      }),
    ]);

    const byCase = new Map<string, { storageTier: string; archiveDeletedAt: Date | null }[]>();
    for (const id of ids) byCase.set(id, []);
    for (const m of memos) byCase.get(m.kycId)?.push(m);

    // One updateMany per state rather than one update per case: a batch of 200
    // cases becomes at most three statements.
    const buckets: Record<CaseStorageState, string[]> = { ACTIVE: [], ARCHIVED: [], DELETED: [] };
    for (const row of cases) {
      const next = deriveCaseStorageState(byCase.get(row.id) ?? []);
      if (next !== (row.storageState as CaseStorageState)) buckets[next].push(row.id);
    }

    for (const [state, changed] of Object.entries(buckets) as [CaseStorageState, string[]][]) {
      if (changed.length === 0) continue;
      await db.kYC.updateMany({
        where: { id: { in: changed } },
        data: { storageState: state as any },
      });
    }
  } catch {
    // Deliberately swallowed — see the doc comment above.
  }
}
