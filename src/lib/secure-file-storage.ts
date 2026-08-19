import fs from 'fs/promises';
import { createReadStream as fsCreateReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR_NAME } from './file-upload-validation';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export const QUARANTINE_DIR_NAME = 'quarantine_uploads';
export const ARCHIVE_DIR_NAME = 'archive_uploads';

/**
 * Where a file's physical bytes live. Mirrors the Prisma `StorageTier` enum.
 * PRIMARY = the hot secure upload folder. ARCHIVE = a secondary/cheaper volume
 * (e.g. E:) used to free primary space. The DB row records which tier each file
 * is on so retrieval reads from the correct root.
 */
export type StorageTier = 'PRIMARY' | 'ARCHIVE';

export function getSecureUploadRoot(): string {
  // Store uploads outside app web root by default.
  const root = process.env.UPLOAD_DIR_PATH || path.resolve(process.cwd(), '..', UPLOADS_DIR_NAME);
  return path.normalize(root);
}

export function getQuarantineRoot(): string {
  const root = path.resolve(getSecureUploadRoot(), '..', QUARANTINE_DIR_NAME);
  return path.normalize(root);
}

/**
 * Root of the archive (cold) tier. Configurable via ARCHIVE_DIR_PATH (e.g.
 * "E:\\nib_kyc_archive"); defaults to a sibling of the primary root so the
 * feature works out of the box and the path can be repointed without touching
 * any data.
 */
export function getArchiveRoot(): string {
  const root = process.env.ARCHIVE_DIR_PATH || path.resolve(getSecureUploadRoot(), '..', ARCHIVE_DIR_NAME);
  return path.normalize(root);
}

function getRootForTier(tier: StorageTier): string {
  return tier === 'ARCHIVE' ? getArchiveRoot() : getSecureUploadRoot();
}

export async function ensureSecureUploadRoot(): Promise<string> {
  const uploadRoot = getSecureUploadRoot();
  const quarantineRoot = getQuarantineRoot();

  await fs.mkdir(uploadRoot, { recursive: true, mode: DIRECTORY_MODE });
  await fs.mkdir(quarantineRoot, { recursive: true, mode: DIRECTORY_MODE });

  // Best effort hardening; Windows may ignore chmod semantics.
  try {
    await fs.chmod(uploadRoot, DIRECTORY_MODE);
    await fs.chmod(quarantineRoot, DIRECTORY_MODE);
  } catch {
    // no-op
  }

  return uploadRoot;
}

/**
 * Ensures the archive tier root exists. Returns the resolved path so callers can
 * verify the volume (e.g. E:) is reachable before starting a bulk move.
 */
export async function ensureArchiveRoot(): Promise<string> {
  const archiveRoot = getArchiveRoot();
  await fs.mkdir(archiveRoot, { recursive: true, mode: DIRECTORY_MODE });
  try {
    await fs.chmod(archiveRoot, DIRECTORY_MODE);
  } catch {
    // no-op
  }
  return archiveRoot;
}

export function resolveSecureUploadPath(
  storageKey: string,
  inQuarantine = false,
  tier: StorageTier = 'PRIMARY',
): string {
  const root = inQuarantine ? getQuarantineRoot() : getRootForTier(tier);

  // Strict storage key validation: only allow UUID format or similar safe random strings
  if (!/^[a-zA-Z0-9-]{32,64}$/.test(storageKey)) {
    throw new Error('Blocked invalid storage key format');
  }

  const resolved = path.join(root, storageKey);
  const normalizedRoot = path.normalize(root);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('Blocked path traversal attempt');
  }

  return resolved;
}

/**
 * Promotes a file from quarantine to secure storage after validation.
 */
export async function promoteFromQuarantine(storageKey: string): Promise<void> {
  const source = resolveSecureUploadPath(storageKey, true);
  const destination = resolveSecureUploadPath(storageKey, false);
  await ensureSecureUploadRoot();
  await fs.rename(source, destination);
}

/**
 * Generates a unique storage key for a file.
 * DO NOT use original filenames for storage.
 */
export function generateStorageKey(): string {
  return crypto.randomUUID();
}

/**
 * Streamed file write to prevent memory exhaustion.
 */
export async function writeSecureUploadedFile(storageKey: string, buffer: Buffer, inQuarantine = false): Promise<void> {
  await ensureSecureUploadRoot();
  const destination = resolveSecureUploadPath(storageKey, inQuarantine);
  // Using writeFile for small buffers, but ideally we'd use streams for larger ones.
  // In our pipeline, sharp and formidable handles the heavy lifting.
  await fs.writeFile(destination, buffer, { mode: FILE_MODE, flag: 'wx' });
}

/**
 * Verifies that a stored file physically exists and is a readable, non-empty file.
 *
 * Returns `false` instead of throwing for any of the following conditions:
 * - The storage key is malformed (fails strict validation).
 * - The file is missing/deleted (ENOENT).
 * - The path is not a regular file.
 * - The file is zero bytes (was never successfully/completely stored).
 *
 * This lets preview/download/retrieval endpoints run an existence check up
 * front and return a graceful 404 instead of crashing on an async stream error.
 */
/**
 * Reports whether the primary upload root is actually present.
 *
 * Deliberately does NOT create it (unlike ensureSecureUploadRoot) — a bulk
 * purge must be able to tell "the root is missing" from "the files are gone",
 * because a missing root makes every file look already-deleted. Creating it
 * here would hide exactly the misconfiguration the caller is checking for.
 */
export async function secureUploadRootAvailable(): Promise<{
  available: boolean;
  root: string;
  code?: string;
}> {
  const root = getSecureUploadRoot();
  try {
    const stats = await fs.stat(root);
    return stats.isDirectory()
      ? { available: true, root }
      : { available: false, root, code: 'ENOTDIR' };
  } catch (error: any) {
    return { available: false, root, code: error?.code || 'UNKNOWN' };
  }
}

export async function secureUploadedFileExists(
  storageKey: string,
  inQuarantine = false,
  tier: StorageTier = 'PRIMARY',
): Promise<boolean> {
  try {
    const target = resolveSecureUploadPath(storageKey, inQuarantine, tier);
    const stats = await fs.stat(target);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

export function createReadStream(storageKey: string, tier: StorageTier = 'PRIMARY'): any {
  const source = resolveSecureUploadPath(storageKey, false, tier);
  return fsCreateReadStream(source);
}

export async function readSecureUploadedFile(storageKey: string, tier: StorageTier = 'PRIMARY'): Promise<Buffer> {
  const source = resolveSecureUploadPath(storageKey, false, tier);
  return fs.readFile(source);
}

export async function deleteSecureUploadedFile(
  storageKey: string,
  inQuarantine = false,
  tier: StorageTier = 'PRIMARY',
): Promise<void> {
  const target = resolveSecureUploadPath(storageKey, inQuarantine, tier);
  await fs.unlink(target);
}

/**
 * Frees a stored file's bytes and CONFIRMS they are gone before returning.
 *
 * Callers must delete the owning DB row only after this resolves. `fs.unlink`
 * can fail for reasons that have nothing to do with the record — an antivirus,
 * backup or indexing agent holding a Windows handle without FILE_SHARE_DELETE
 * (EBUSY/EPERM), an unavailable storage volume, a malformed storage key. If the
 * row is removed anyway, the bytes stay on disk with nothing referencing them:
 * no screen, query or report can ever surface them again, and the space is lost
 * permanently because nothing in the system reconciles disk against the table.
 *
 * A file that is already absent (ENOENT) counts as freed — the space is back
 * and the row is safe to remove.
 *
 * Throws if the file survives the attempt, so the caller can keep the record
 * and report the failure instead of silently stranding storage.
 */
export async function purgeStoredFileOrThrow(
  storageKey: string,
  tier: StorageTier = 'PRIMARY',
): Promise<void> {
  try {
    await deleteSecureUploadedFile(storageKey, false, tier);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return; // already gone — bytes are free
    throw error;
  }

  // unlink reported success; verify rather than trust it.
  if (await secureUploadedFileExists(storageKey, false, tier)) {
    const stillPresent: any = new Error('File is still present on disk after deletion');
    stillPresent.code = 'EPURGEUNVERIFIED';
    throw stillPresent;
  }
}

/** Computes the SHA-256 hex digest of a file already on disk via streaming to avoid OOM. */
function computeFileHashAtPath(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsCreateReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export type TierTransferResult = {
  /** SHA-256 of the copied file. */
  hash: string;
  /** True when an expected hash was supplied and matched. */
  verified: boolean;
  /** True when the destination already held a valid copy (idempotent no-op). */
  alreadyPresent: boolean;
};

/**
 * Copies a file from one tier to another, writing to a temp name first and
 * renaming into place (so a crash never leaves a partial file under the real
 * key), then verifying the copy's hash against `expectedHash` when provided.
 *
 * This performs NO database changes and NEVER deletes the source — the caller
 * orchestrates the safe sequence (copy -> verify -> update DB -> delete source).
 */
async function copyBetweenTiers(
  storageKey: string,
  from: StorageTier,
  to: StorageTier,
  expectedHash?: string | null,
): Promise<TierTransferResult> {
  if (from === to) throw new Error('Source and destination tier are identical');

  // Make sure the destination root exists (verifies the archive volume is reachable).
  if (to === 'ARCHIVE') {
    await ensureArchiveRoot();
  } else {
    await ensureSecureUploadRoot();
  }

  const source = resolveSecureUploadPath(storageKey, false, from);
  const destination = resolveSecureUploadPath(storageKey, false, to);

  // Idempotency: if a valid copy already exists at the destination, don't redo it.
  try {
    const destStats = await fs.stat(destination);
    if (destStats.isFile() && destStats.size > 0) {
      const existingHash = await computeFileHashAtPath(destination);
      if (!expectedHash || existingHash === expectedHash) {
        return { hash: existingHash, verified: !!expectedHash, alreadyPresent: true };
      }
      // A corrupt/mismatched leftover — remove it and re-copy cleanly.
      await fs.unlink(destination).catch(() => {});
    }
  } catch {
    // Destination absent — normal path, continue.
  }

  const tempDestination = `${destination}.tmp-${crypto.randomUUID()}`;
  await fs.copyFile(source, tempDestination);

  const hash = await computeFileHashAtPath(tempDestination);
  if (expectedHash && hash !== expectedHash) {
    await fs.unlink(tempDestination).catch(() => {});
    throw new Error('Integrity check failed: copied file hash does not match the recorded hash');
  }

  try {
    await fs.chmod(tempDestination, FILE_MODE);
  } catch {
    // no-op (Windows)
  }

  // Atomic within the destination volume.
  await fs.rename(tempDestination, destination);

  return { hash, verified: !!expectedHash, alreadyPresent: false };
}

/**
 * Copies a PRIMARY file to the ARCHIVE tier (used by both "copy" and the first
 * step of "cut"). Does not touch the DB or delete the original.
 */
export function copyToArchive(storageKey: string, expectedHash?: string | null): Promise<TierTransferResult> {
  return copyBetweenTiers(storageKey, 'PRIMARY', 'ARCHIVE', expectedHash);
}

/**
 * Copies an ARCHIVE file back to the PRIMARY tier (first step of "restore").
 * Does not touch the DB or delete the archived copy.
 */
export function copyToPrimary(storageKey: string, expectedHash?: string | null): Promise<TierTransferResult> {
  return copyBetweenTiers(storageKey, 'ARCHIVE', 'PRIMARY', expectedHash);
}
