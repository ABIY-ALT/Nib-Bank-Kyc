/**
 * Automatic archive-tiering endpoint.
 *
 * The job normally runs by itself on the in-process scheduler (see
 * lib/auto-archive-scheduler.ts). This endpoint covers the two cases the timer
 * cannot:
 *
 *   • An external scheduler (Windows Task Scheduler, systemd timer, Cloud
 *     Scheduler) driving the job — authenticate with the CRON_SECRET header.
 *     Required when the app runs more than one instance, where each would
 *     otherwise archive on its own timer.
 *   • An operator asking for an immediate pass, or a dry run before switching
 *     the schedule on — authenticate with a session holding the archive
 *     permission.
 *
 * GET  — read-only: the policy, what is eligible right now, and the state of
 *        the archive volume. Changes nothing.
 * POST — runs one pass. Body: { "dryRun": true } reports without moving files.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, verifyPermission } from '@/actions/auth-server';
import { previewAutoArchive, runAutoArchive } from '@/lib/auto-archive';
import { logInstitutionalError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ARCHIVE_PERMISSION = 'DOWNLOAD_MASTER_ARCHIVE';

type Authorization =
  | { ok: true; kind: 'CRON' }
  | { ok: true; kind: 'SESSION'; userId: string; email: string }
  | { ok: false; status: number; error: string };

/** Constant-time comparison so a wrong secret cannot be found by timing. */
function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorize(req: NextRequest): Promise<Authorization> {
  const cronSecret = process.env.CRON_SECRET;
  const provided =
    req.headers.get('x-cron-secret') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

  if (cronSecret && provided && secretsMatch(provided, cronSecret)) {
    return { ok: true, kind: 'CRON' };
  }

  const session = await getServerSession();
  if (!session) {
    return { ok: false, status: 401, error: 'Unauthorized. Session expired or invalid cron secret.' };
  }
  if (!(await verifyPermission(ARCHIVE_PERMISSION))) {
    return { ok: false, status: 403, error: `Forbidden. ${ARCHIVE_PERMISSION} is required.` };
  }
  return { ok: true, kind: 'SESSION', userId: session.id, email: session.email };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    return NextResponse.json(await previewAutoArchive());
  } catch (error: any) {
    logInstitutionalError(error, 'AUTO_ARCHIVE_PREVIEW_FAILED');
    return NextResponse.json({ error: 'Failed to read archiving status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let dryRunOverride: boolean | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.dryRun === 'boolean') dryRunOverride = body.dryRun;
  } catch {
    // No body is fine — run with the configured settings.
  }

  try {
    const result = await runAutoArchive({
      trigger: auth.kind === 'CRON' ? 'CRON' : 'MANUAL',
      actorId: auth.kind === 'SESSION' ? auth.userId : null,
      actorEmail: auth.kind === 'SESSION' ? auth.email : 'system@auto-archive',
      dryRunOverride,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    logInstitutionalError(error, 'AUTO_ARCHIVE_RUN_FAILED');
    return NextResponse.json({ error: 'The archiving pass could not be completed.' }, { status: 500 });
  }
}
