/**
 * Background scheduler for automatic archive tiering.
 *
 * Started once from the Next.js instrumentation hook (Node runtime only), so
 * settled cases move off the server without anyone opening a screen.
 *
 * CADENCE — two speeds, matching the retention sweep
 * --------------------------------------------------
 * Idle:      every 6 hours. Cases become eligible slowly (a week after
 *            approval), so there is nothing to find most of the time and an
 *            empty pass costs two counting queries.
 * Catch-up:  every 60 seconds. One pass moves a bounded number of cases, so the
 *            first run against years of approved history would take a long time
 *            at the idle rate. While a backlog remains AND the last pass made
 *            real progress, the next one is scheduled immediately. Once the
 *            backlog clears, the loop settles back to the idle interval.
 *
 * Progress is required before chaining: a pass that moves nothing (archive
 * volume full, every copy failing) must not be retried in a tight loop.
 *
 * Armed in production only, and only when AUTO_ARCHIVE_ENABLED is on — see
 * schedulerDisabled(). If the app ever runs as more than one instance, disable
 * the in-process timer (AUTO_ARCHIVE_SCHEDULER=false) and drive
 * POST /api/admin/archive/auto from a single external scheduler instead.
 */

import { formatArchiveBytes, resolveAutoArchiveConfig, runAutoArchive } from '@/lib/auto-archive';

const DEFAULT_INTERVAL_MINUTES = 6 * 60;
const STARTUP_DELAY_MS = 3 * 60 * 1000;
/** Gap between back-to-back passes while a backlog is still draining. */
const CATCHUP_DELAY_MS = 60 * 1000;

// Survives dev-server hot reloads, which would otherwise stack a new timer on
// every reload.
const globalRef = globalThis as typeof globalThis & {
  __nibArchiveTimer?: NodeJS.Timeout;
};

function resolveIntervalMs(): number {
  const raw = Number(process.env.AUTO_ARCHIVE_INTERVAL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * Whether the timer should be armed at all.
 *
 * Off outside production unless asked: a developer machine shares the database
 * with everyone else's testing, and a job that moves files between volumes has
 * no business starting itself during `next dev`.
 */
function schedulerDisabled(): { disabled: boolean; reason?: string } {
  // Deliberately does NOT consult the policy: the timer is armed regardless and
  // each pass reads the current policy from the settings row. Switching the job
  // on in Settings therefore takes effect on the next pass, with no restart.
  const raw = (process.env.AUTO_ARCHIVE_SCHEDULER || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return { disabled: true, reason: 'AUTO_ARCHIVE_SCHEDULER=false' };
  }
  const explicitlyOn = ['1', 'true', 'yes', 'on'].includes(raw);
  if (process.env.NODE_ENV !== 'production' && !explicitlyOn) {
    return {
      disabled: true,
      reason: 'not a production build (set AUTO_ARCHIVE_SCHEDULER=true to arm it here)',
    };
  }
  return { disabled: false };
}

/**
 * Runs one pass and returns how long to wait before the next.
 * Never throws — a background failure must not reach the process guards.
 */
async function tick(idleMs: number): Promise<number> {
  try {
    const result = await runAutoArchive({ trigger: 'SCHEDULER' });

    if (!result.ran) {
      // Switched off, overlapping, or the volume is unavailable/full. Only the
      // conditions worth acting on are logged — a job left switched off in
      // Settings would otherwise print the same line forever.
      if (result.reason && !/switched off/i.test(result.reason)) {
        console.log(`[AutoArchive] Pass skipped — ${result.reason}`);
      }
      return idleMs;
    }

    if (result.filesMoved > 0 || result.filesFailed > 0) {
      console.log(
        `[AutoArchive] Moved ${result.filesMoved} file(s) across ${result.casesProcessed} case(s) ` +
          `to the archive volume, freeing ${formatArchiveBytes(result.bytesFreed)}` +
          (result.filesFailed > 0 ? `, ${result.filesFailed} failed` : '') +
          (result.filesNotFreed > 0 ? `, ${result.filesNotFreed} original(s) not deleted` : '') +
          (result.config.dryRun ? ' [DRY RUN — nothing was moved]' : ''),
      );
    }
    if (result.warning) console.error(`[AutoArchive] ${result.warning}`);

    // Backlog still draining and this pass actually moved it — keep going now
    // rather than hours from now.
    if (result.moreRemaining && result.filesMoved > 0) {
      console.log(`[AutoArchive] More eligible cases queued — next pass in ${CATCHUP_DELAY_MS / 1000}s.`);
      return CATCHUP_DELAY_MS;
    }

    return idleMs;
  } catch (error: any) {
    console.error('[AutoArchive] Scheduled pass error:', error?.message || error);
    return idleMs;
  }
}

export function startAutoArchiveScheduler() {
  const { disabled, reason } = schedulerDisabled();
  if (disabled) {
    console.log(`[AutoArchive] In-process scheduler not armed — ${reason}.`);
    return;
  }
  if (globalRef.__nibArchiveTimer) return;

  const idleMs = resolveIntervalMs();

  // Self-rescheduling loop rather than setInterval: each pass decides when the
  // next one happens, so a slow pass can never overlap the following one.
  const arm = (delayMs: number) => {
    const timer = setTimeout(() => {
      // The .catch is the loop's survival guarantee: if scheduling the next
      // pass ever throws, re-arm anyway, otherwise one failure would silently
      // end automatic archiving for the lifetime of the process.
      void tick(idleMs)
        .then(arm)
        .catch((error: any) => {
          console.error('[AutoArchive] Scheduler error, retrying later:', error?.message || error);
          arm(idleMs);
        });
    }, delayMs);
    timer.unref?.(); // must not hold the process open on shutdown
    globalRef.__nibArchiveTimer = timer;
  };

  arm(STARTUP_DELAY_MS);

  console.log(
    `[AutoArchive] Scheduler armed — first pass in ${Math.round(STARTUP_DELAY_MS / 1000)}s, then every ` +
      `${Math.round(idleMs / 60000)} minute(s). The policy is read from Settings on every pass; ` +
      'passes do nothing while it is switched off there.',
  );
}
