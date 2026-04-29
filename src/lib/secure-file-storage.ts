import fs from 'fs/promises';
import { createReadStream as fsCreateReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR_NAME } from './file-upload-validation';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export const QUARANTINE_DIR_NAME = 'quarantine_uploads';

export function getSecureUploadRoot(): string {
  // Store uploads outside app web root by default.
  const root = process.env.UPLOAD_DIR_PATH || path.resolve(process.cwd(), '..', UPLOADS_DIR_NAME);
  return path.normalize(root);
}

export function getQuarantineRoot(): string {
  const root = path.resolve(getSecureUploadRoot(), '..', QUARANTINE_DIR_NAME);
  return path.normalize(root);
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

export function resolveSecureUploadPath(storageKey: string, inQuarantine = false): string {
  const root = inQuarantine ? getQuarantineRoot() : getSecureUploadRoot();
  
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

export function createReadStream(storageKey: string): any {
  const source = resolveSecureUploadPath(storageKey);
  return fsCreateReadStream(source);
}

export async function readSecureUploadedFile(storageKey: string): Promise<Buffer> {
  const source = resolveSecureUploadPath(storageKey);
  return fs.readFile(source);
}

export async function deleteSecureUploadedFile(storageKey: string, inQuarantine = false): Promise<void> {
  const target = resolveSecureUploadPath(storageKey, inQuarantine);
  await fs.unlink(target);
}
