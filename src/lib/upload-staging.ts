import logger from './logger';
import { deleteSecureUploadedFile, writeSecureUploadedFile } from './secure-file-storage';

/**
 * Tracks the physical files written during a single upload request so they can
 * be removed again if the request never reaches a committed database row.
 *
 * Every upload path writes the bytes to the secure folder FIRST and creates the
 * `Memo` row afterwards, in a separate statement. That ordering is deliberate —
 * a row must never point at bytes that are not on disk yet — but on its own it
 * leaks storage on every failure after the first write:
 *
 *   - a multi-file upload where file 3 is rejected returns immediately, leaving
 *     files 1 and 2 on disk with nothing referencing them;
 *   - a failed/rolled-back transaction discards the rows but not the bytes;
 *   - any throw between the write and the commit does the same.
 *
 * Nothing in the application reconciles the folder against the table, so each
 * of those files stays forever: invisible to every screen, query and report,
 * and counted only by the file system. Undoing the writes on the failure path
 * keeps the folder to files the database actually knows about.
 *
 * Cleanup is best effort by design — a discard failure must never mask the real
 * error that triggered it, so it is logged rather than thrown.
 */
export class StagedUploadBatch {
  private readonly storageKeys: string[] = [];

  /** Writes an upload's bytes and remembers the key for a possible discard. */
  async write(storageKey: string, buffer: Buffer): Promise<void> {
    await writeSecureUploadedFile(storageKey, buffer);
    this.storageKeys.push(storageKey);
  }

  /** Number of files written so far that a discard would still remove. */
  get size(): number {
    return this.storageKeys.length;
  }

  /**
   * Marks the written files as owned by committed database rows, so a later
   * failure cannot delete them.
   *
   * Call this immediately after the transaction that creates the `Memo` rows.
   * Work that follows a successful commit — writing the audit log, revalidating
   * a path — can still throw, and without this the shared catch would treat
   * that as "the upload failed" and delete documents the case now depends on.
   */
  commit(): void {
    this.storageKeys.length = 0;
  }

  /**
   * Deletes every file written in this request. Call on any path that fails
   * before the owning rows are committed. Safe to call more than once and safe
   * to call when nothing was written.
   */
  async discard(reason: string): Promise<void> {
    if (this.storageKeys.length === 0) return;

    const keys = this.storageKeys.splice(0, this.storageKeys.length);
    let removed = 0;

    for (const storageKey of keys) {
      try {
        await deleteSecureUploadedFile(storageKey);
        removed++;
      } catch (error: any) {
        // ENOENT means the bytes are already gone, which is the desired state.
        if (error?.code === 'ENOENT') {
          removed++;
          continue;
        }
        logger.error('UPLOAD_STAGING_DISCARD_FAILED', {
          storageKey,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('UPLOAD_STAGING_DISCARDED', { reason, requested: keys.length, removed });
  }
}
