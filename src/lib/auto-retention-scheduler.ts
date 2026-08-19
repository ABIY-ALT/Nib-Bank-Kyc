/**
 * Background scheduler for the automatic retention purge.
 *
 * Started once from the Next.js instrumentation hook (Node runtime only), so
 * the sweep runs on its own without anyone opening a screen or wiring up an
 * external cron job.
 *
 * CADENCE — two speeds
 * --------------------
 * Idle:      hourly. Nothing is eligible most of the time, and a sweep with an
 *            empty result costs one aggregate query.
 * Catch-up:  every 30 seconds. A single sweep handles a bounded number of cases
 *            so it can never monopolise the server, so a production backlog —
 *            months of un-approved cases on the first deploy — would take days
 *            to drain at the idle rate. Whenever a sweep reports that eligible
 *            cases remain AND it made real progress, the next one is scheduled
 *            immediately instead of an hour later. The backlog therefore clears
 *            itself within minutes of deployment, then the loop settles back to
 *            hourly on its own.
 *
 * Progress is required before chaining: if a sweep clears nothing (every file
 * blocked by antivirus, storage volume unavailable), speeding up would only
 * hammer a broken system, so it falls back to the idle interval.
 *
 * Armed in production only unless AUTO_PURGE_SCHEDULER says otherwise — see
 * schedulerDisabled() below.
 *
 * If this app is ever run with more than one instance, disable the in-process
 * scheduler (AUTO_PURGE_SCHEDULER=false) and drive
 * POST /api/admin/retention/purge from a single external scheduler instead.
 */

import { runAutoRetentionPurge, formatBytes } from '@/lib/auto-retention';

const DEFAULT_INTERVAL_MINUTES = 60;
const STARTUP_DELAY_MS = 2 * 60 * 1000;
/** Gap between back-to-back sweeps while a backlog is still draining. */
const CATCHUP_DELAY_MS = 30 * 1000;

// Survives dev-server hot reloads, which re-evaluate modules and would
// otherwise stack a new timer on every reload.
const globalRef = globalThis as typeof globalThis & {
  __nibRetentionTimer?: NodeJS.Timeout;
};

/**
 * Gap between passes while a backlog drains. Lower drains a large queue faster
 * at the cost of a higher sustained duty cycle; the default leaves the server
 * idle for most of each minute.
 */
function resolveCatchupMs(): number {
  const raw = Number(process.env.AUTO_PURGE_CATCHUP_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : CATCHUP_DELAY_MS / 1000;
  return seconds * 1000;
}

function resolveIntervalMs(): number {
  const raw = Number(process.env.AUTO_PURGE_INTERVAL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * Whether the timer should be armed at all.
 *
 * Off by default outside production: a developer machine shares the same
 * database as everyone else's testing, and an unattended job that deletes files
 * has no business starting itself the moment someone runs `next dev`. Set
 * AUTO_PURGE_SCHEDULER=true to arm it anyway, or run it on demand from
 * Settings → Automatic Storage Cleanup.
 */
function schedulerDisabled(): { disabled: boolean; reason?: string } {
  const raw = (process.env.AUTO_PURGE_SCHEDULER || '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return { disabled: true, reason: 'AUTO_PURGE_SCHEDULER=false' };
  }
  const explicitlyOn = ['1', 'true', 'yes', 'on'].includes(raw);
  if (process.env.NODE_ENV !== 'production' && !explicitlyOn) {
    return {
      disabled: true,
      reason: 'not a production build (set AUTO_PURGE_SCHEDULER=true to arm it here)',
    };
  }
  return { disabled: false };
}

/**
 * Runs one sweep and returns how long to wait before the next one.
 * Never throws — a background failure must not reach the process guards.
 */
async function tick(idleMs: number): Promise<number> {
  try {
    const result = await runAutoRetentionPurge({ trigger: 'SCHEDULER' });

    if (!result.ran) {
      // Disabled, overlapping, or the storage root is unavailable. Nothing to
      // report and nothing to chase — wait for the normal interval.
      return idleMs;
    }

    const cleared = result.filesPurged + result.filesMissing;

    if (cleared > 0 || result.filesBlocked > 0) {
      console.log(
        `[AutoRetention] Freed ${formatBytes(result.bytesFreed)} — ${result.filesPurged} file(s) across ` +
          `${result.casesProcessed} case(s)` +
          (result.filesMissing > 0 ? `, ${result.filesMissing} stale record(s) cleared` : '') +
          (result.filesBlocked > 0 ? `, ${result.filesBlocked} blocked (will retry)` : '') +
          (result.config.dryRun ? ' [DRY RUN — nothing was deleted]' : '')
      );
    }
    if (result.storageWarning) {
      console.error(`[AutoRetention] ${result.storageWarning}`);
      return idleMs;
    }

    // Backlog still draining and this pass actually moved it — keep going now
    // rather than an hour from now.
    if (result.moreRemaining && cleared > 0) {
      const catchupMs = resolveCatchupMs();
      console.log(
        `[AutoRetention] More eligible cases queued — next pass in ${Math.round(catchupMs / 1000)}s.`
      );
      return catchupMs;
    }

    return idleMs;
  } catch (error: any) {
    console.error('[AutoRetention] Scheduled sweep error:', error?.message || error);
    return idleMs;
  }
}

export function startAutoRetentionScheduler() {
  const { disabled, reason } = schedulerDisabled();
  if (disabled) {
    console.log(`[AutoRetention] In-process scheduler not armed — ${reason}.`);
    return;
  }
  if (globalRef.__nibRetentionTimer) return;

  const idleMs = resolveIntervalMs();

  // Self-rescheduling loop rather than setInterval: each sweep decides when the
  // next one should happen, and a slow sweep can never overlap the following one.
  const arm = (delayMs: number) => {
    const timer = setTimeout(() => {
      // The .catch is the loop's survival guarantee: if scheduling the next pass
      // ever throws, re-arm anyway. Without it a single failure would silently
      // end automatic cleanup for the lifetime of the process.
      void tick(idleMs)
        .then(arm)
        .catch((error: any) => {
          console.error('[AutoRetention] Scheduler error, retrying later:', error?.message || error);
          arm(idleMs);
        });
    }, delayMs);
    timer.unref?.(); // must not hold the process open on shutdown
    globalRef.__nibRetentionTimer = timer;
  };

  arm(STARTUP_DELAY_MS);

  console.log(
    `[AutoRetention] Scheduler armed — first sweep in ${Math.round(STARTUP_DELAY_MS / 1000)}s, ` +
      `then every ${Math.round(idleMs / 60000)} minute(s) (every ` +
      `${Math.round(CATCHUP_DELAY_MS / 1000)}s while a backlog is draining).`
  );
}
