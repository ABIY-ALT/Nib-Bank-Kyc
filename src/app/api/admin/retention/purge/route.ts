/**
 * Retention sweep endpoint.
 *
 * The sweep normally runs by itself on the in-process scheduler (see
 * lib/auto-retention-scheduler.ts). This endpoint exists for the two cases the
 * timer cannot cover:
 *
 *   • An external scheduler (Windows Task Scheduler, systemd timer, Cloud
 *     Scheduler) driving the sweep — authenticate with the CRON_SECRET header.
 *     Required when the app runs more than one instance, where each instance
 *     would otherwise sweep on its own timer.
 *   • An operator asking for an immediate pass — authenticate with a normal
 *     session holding PURGE_VAULT_STORAGE.
 *
 * GET  — read-only preview of the policy and what it currently holds eligible.
 * POST — runs the sweep. Body: { "dryRun": true } reports without deleting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, verifyPermission } from '@/actions/auth-server';
import { previewAutoPurge, runAutoRetentionPurge } from '@/lib/auto-retention';
import { logInstitutionalError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type Authorization =
  | { ok: true; kind: 'CRON' }
  | { ok: true; kind: 'SESSION'; userId: string; email: string }
  | { ok: false; status: number; error: string };

/**
 * Constant-time comparison so a wrong secret cannot be discovered by timing the
 * responses.
 */
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
  if (!(await verifyPermission('PURGE_VAULT_STORAGE'))) {
    return { ok: false, status: 403, error: 'Forbidden. PURGE_VAULT_STORAGE is required.' };
  }
  return { ok: true, kind: 'SESSION', userId: session.id, email: session.email };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const preview = await previewAutoPurge();
    return NextResponse.json({ ...preview });
  } catch (error: any) {
    logInstitutionalError(error, 'RETENTION_PREVIEW_FAILED');
    return NextResponse.json({ error: 'Failed to read retention status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let dryRun: boolean | undefined;
  let force: boolean | undefined;
  try {
    const body = await req.json();
    dryRun = typeof body?.dryRun === 'boolean' ? body.dryRun : undefined;
    force = typeof body?.force === 'boolean' ? body.force : undefined;
  } catch {
    // No body — run with the stored policy.
  }

  try {
    const result = await runAutoRetentionPurge({
      trigger: auth.kind === 'CRON' ? 'CRON_ENDPOINT' : 'MANUAL',
      actorId: auth.kind === 'SESSION' ? auth.userId : null,
      actorEmail: auth.kind === 'SESSION' ? auth.email : 'system@retention',
      dryRun,
      // Only an authenticated operator may override the policy switch; a cron
      // caller must respect it, otherwise turning the policy off would not stop
      // the deletions.
      force: auth.kind === 'SESSION' ? force : false,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    logInstitutionalError(error, 'RETENTION_PURGE_FAILED');
    return NextResponse.json({ error: 'Retention sweep failed.' }, { status: 500 });
  }
}
