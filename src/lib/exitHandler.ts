/**
 * Tracking Handler - OnSite Timekeeper v3
 *
 * Geofence flow:
 * - ENTER: Save to active_tracking (SQLite singleton)
 * - EXIT: 60s cooldown, then calculate duration and update daily_hours
 * - RE-ENTRY during cooldown: Cancel exit, continue tracking
 */

import { logger } from './logger';
import { db, getToday } from './database/core';
import { useSyncStore } from '../stores/syncStore';
import { useDailyLogStore } from '../stores/dailyLogStore';
import { showArrivalNotification, showEndOfDayNotification, showSessionGuardNotification, showSimpleNotification } from './notifications';
import { useAuthStore } from '../stores/authStore';
import { upsertDailyHours, getDailyHours, formatTimeHHMM } from './database/daily';
import { switchToActiveMode, switchToIdleMode } from './bgGeo';
import { useSettingsStore } from '../stores/settingsStore';

// ============================================
// CONSTANTS
// ============================================

const EXIT_COOLDOWN_MS = 30 * 1000; // 30 seconds
const SESSION_GUARD_FIRST_MS  = 10 * 60 * 60 * 1000; // 10 hours
const SESSION_GUARD_REPEAT_MS =  2 * 60 * 60 * 1000; // 2 hours
const SESSION_GUARD_MAX_MS    = 16 * 60 * 60 * 1000; // 16 hours

// ============================================
// STATE
// ============================================

interface PendingExit {
  locationId: string;
  locationName: string;
  exitTime: Date;
  timeoutId: NodeJS.Timeout;
}

const pendingExits = new Map<string, PendingExit>();

/**
 * Returns the cooldown expiry timestamp (ms) for a location, or 0 if none.
 * UI can poll this to show a countdown warning.
 */
export function getCooldownExpiresAt(locationId: string): number {
  const pending = pendingExits.get(locationId);
  if (!pending) return 0;
  return pending.exitTime.getTime() + EXIT_COOLDOWN_MS;
}

// ============================================
// ACTIVE TRACKING (SQLite singleton)
// ============================================

export interface ActiveTracking {
  location_id: string;
  location_name: string;
  enter_at: string;
  pause_seconds: number;
}

function getActiveTracking(): ActiveTracking | null {
  try {
    const row = db.getFirstSync<ActiveTracking>(
      `SELECT location_id, location_name, enter_at, COALESCE(pause_seconds, 0) as pause_seconds FROM active_tracking WHERE id = 'current'`
    );
    return row;
  } catch {
    return null;
  }
}

function setActiveTracking(locationId: string, locationName: string, enterAt?: string): void {
  const ts = enterAt || new Date().toISOString();
  db.runSync(
    `INSERT OR REPLACE INTO active_tracking (id, location_id, location_name, enter_at, created_at)
     VALUES ('current', ?, ?, ?, ?)`,
    [locationId, locationName, ts, ts]
  );
}

function clearActiveTracking(): void {
  db.runSync(`DELETE FROM active_tracking WHERE id = 'current'`);
}

/**
 * Update pause_seconds in active_tracking (called by hooks.ts on resume)
 */
export function updatePauseSeconds(seconds: number): void {
  db.runSync(
    `UPDATE active_tracking SET pause_seconds = ? WHERE id = 'current'`,
    [seconds]
  );
}

/**
 * Get current pause_seconds from active_tracking (0 if no active session)
 */
export function getPauseSeconds(): number {
  try {
    const row = db.getFirstSync<{ pause_seconds: number }>(
      `SELECT COALESCE(pause_seconds, 0) as pause_seconds FROM active_tracking WHERE id = 'current'`
    );
    return row?.pause_seconds ?? 0;
  } catch {
    return 0;
  }
}

// ============================================
// SESSION GUARD (10h/16h safety net)
// ============================================

let sessionGuardTimer: NodeJS.Timeout | null = null;

function startSessionGuard(locationId: string, locationName: string, enterAt: string): void {
  cancelSessionGuard();

  const elapsed = Date.now() - new Date(enterAt).getTime();

  if (elapsed >= SESSION_GUARD_MAX_MS) {
    logger.info('session', `🛡️ Session guard: already past 16h, auto-ending: ${locationName}`);
    autoEndSession(locationId, locationName);
    return;
  }

  if (elapsed >= SESSION_GUARD_FIRST_MS) {
    logger.info('session', `🛡️ Session guard: past 10h, firing check immediately: ${locationName}`);
    fireSessionGuardCheck(locationId, locationName, enterAt);
    return;
  }

  const delayMs = SESSION_GUARD_FIRST_MS - elapsed;
  logger.info('session', `🛡️ Session guard: scheduled in ${Math.round(delayMs / 60000)}min: ${locationName}`);
  sessionGuardTimer = setTimeout(() => {
    fireSessionGuardCheck(locationId, locationName, enterAt);
  }, delayMs);
}

function fireSessionGuardCheck(locationId: string, locationName: string, enterAt: string): void {
  sessionGuardTimer = null;

  // Check if session still active
  const tracking = getActiveTracking();
  if (!tracking) {
    logger.debug('session', '🛡️ Session guard: no active tracking, cancelling');
    return;
  }

  const elapsed = Date.now() - new Date(enterAt).getTime();

  // 16h limit → auto-end
  if (elapsed >= SESSION_GUARD_MAX_MS) {
    logger.info('session', `🛡️ Session guard: 16h limit reached, auto-ending: ${locationName}`);
    autoEndSession(locationId, locationName);
    return;
  }

  // Send notification
  const hoursRunning = Math.floor(elapsed / 3600000);
  showSessionGuardNotification(locationName, locationId, hoursRunning);

  // Schedule next check in 2h
  sessionGuardTimer = setTimeout(() => {
    fireSessionGuardCheck(locationId, locationName, enterAt);
  }, SESSION_GUARD_REPEAT_MS);

  logger.info('session', `🛡️ Session guard: notification sent (${hoursRunning}h), next check in 2h`);
}

async function autoEndSession(locationId: string, locationName: string): Promise<void> {
  const userId = useAuthStore.getState().getUserId();
  if (!userId) {
    logger.error('session', '🛡️ Session guard: cannot auto-end, no userId');
    return;
  }

  try {
    await onManualExit(userId, locationId, locationName);
    await showSimpleNotification(
      '🏁 Session Auto-Ended',
      `Your timer at ${locationName} was automatically stopped after 16 hours.`
    );
    logger.info('session', `🛡️ Session guard: auto-ended after 16h: ${locationName}`);
  } catch (error) {
    logger.error('session', '🛡️ Session guard: auto-end failed', { error: String(error) });
  }
}

export function cancelSessionGuard(): void {
  if (sessionGuardTimer) {
    clearTimeout(sessionGuardTimer);
    sessionGuardTimer = null;
    logger.debug('session', '🛡️ Session guard cancelled');
  }
}

export function recoverSessionGuard(): void {
  const tracking = getActiveTracking();
  if (!tracking) return;

  logger.info('session', `🛡️ Session guard: recovering from restart for ${tracking.location_name}`);
  startSessionGuard(tracking.location_id, tracking.location_name, tracking.enter_at);
}

// ============================================
// GEOFENCE ENTER
// ============================================

export async function onGeofenceEnter(
  userId: string,
  locationId: string,
  locationName: string,
  eventTimestamp?: string
): Promise<void> {
  const nowMs = Date.now();
  const sdkMs = eventTimestamp ? new Date(eventTimestamp).getTime() : nowMs;
  const delayMs = nowMs - sdkMs;

  logger.info('session', `[4/6] exitHandler ENTER: "${locationName}" | sdkTs=${eventTimestamp || 'none'} | jsNow=${new Date().toISOString()} | delay=${delayMs}ms`);

  // 1. Cancel any pending exit for this location (re-entry during cooldown)
  const pending = pendingExits.get(locationId);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingExits.delete(locationId);
    logger.info('session', `[4/6] ↩️ Re-entry during cooldown, continuing tracking: ${locationName}`);
    return; // Continue existing tracking, don't create new
  }

  // 2. Check if already tracking (shouldn't happen, but handle gracefully)
  const existing = getActiveTracking();
  if (existing && existing.location_id === locationId) {
    logger.info('session', `[4/6] ⚠️ Already tracking this location: ${locationName}`);
    return;
  }

  // 3. If tracking a different location, close that one first
  if (existing && existing.location_id !== locationId) {
    logger.info('session', `[4/6] ⚠️ Switching locations: ${existing.location_name} → ${locationName}`);

    // Cancel pending exit for the OLD location (prevents timeout from clearing new tracking)
    const oldPending = pendingExits.get(existing.location_id);
    if (oldPending) {
      clearTimeout(oldPending.timeoutId);
      pendingExits.delete(existing.location_id);
    }

    await confirmExit(userId, existing.location_id, existing.location_name, existing.enter_at, new Date());
  }

  // 4. Save new tracking entry (use SDK timestamp as enter_at)
  setActiveTracking(locationId, locationName, eventTimestamp);
  switchToActiveMode().catch(() => {}); // Best-effort, non-blocking

  logger.info('session', `[5/6] SQLite active_tracking: enter_at=${eventTimestamp || new Date().toISOString()} | location="${locationName}"`);

  // 4b. Start session guard (safety net for runaway timers)
  startSessionGuard(locationId, locationName, eventTimestamp || new Date().toISOString());

  // 5. Check if this is first entry of the day
  const today = getToday();
  const existingDaily = getDailyHours(userId, today);
  const isFirstEntry = !existingDaily || !existingDaily.first_entry;

  // 6. Update daily_hours with first_entry if needed
  if (isFirstEntry) {
    const entryTime = formatTimeHHMM(eventTimestamp ? new Date(eventTimestamp) : new Date());
    upsertDailyHours({
      userId,
      date: today,
      totalMinutes: existingDaily?.total_minutes || 0,
      locationName,
      locationId,
      verified: true,
      source: 'gps',
      firstEntry: entryTime,
    });
    logger.info('session', `[5/6] daily_hours first_entry=${entryTime} | date=${today}`);
  }

  // 7. Notification only on first entry of the day
  if (isFirstEntry) {
    await showArrivalNotification(locationName);
  }

  // 8. Refresh UI (pass SDK timestamp so timer starts from real enter time)
  useDailyLogStore.getState().reloadToday();
  useDailyLogStore.getState().startTracking(locationId, locationName, eventTimestamp);
  logger.info('session', `[6/6] UI updated: timer started for "${locationName}" | startTime=${eventTimestamp || 'now'}`);
}

// ============================================
// GEOFENCE EXIT
// ============================================

export async function onGeofenceExit(
  userId: string,
  locationId: string,
  locationName: string,
  eventTimestamp?: string
): Promise<void> {
  const nowMs = Date.now();
  const sdkMs = eventTimestamp ? new Date(eventTimestamp).getTime() : nowMs;
  const delayMs = nowMs - sdkMs;

  logger.info('session', `[4/6] exitHandler EXIT: "${locationName}" | sdkTs=${eventTimestamp || 'none'} | jsNow=${new Date().toISOString()} | delay=${delayMs}ms`);

  // 1. Check if we're tracking this location
  const tracking = getActiveTracking();
  if (!tracking || tracking.location_id !== locationId) {
    logger.warn('session', `[4/6] ⚠️ Exit without active tracking: ${locationName}`);
    return;
  }

  // 2. Cancel any existing pending exit for this location
  const existingPending = pendingExits.get(locationId);
  if (existingPending) {
    clearTimeout(existingPending.timeoutId);
  }

  // 3. Schedule exit with cooldown (use SDK timestamp as exitTime)
  const exitTime = eventTimestamp ? new Date(eventTimestamp) : new Date();
  logger.info('session', `[4/6] ⏳ Exit cooldown ${EXIT_COOLDOWN_MS / 1000}s | exitTime=${exitTime.toISOString()} | enter_at=${tracking.enter_at}`);
  const timeoutId = setTimeout(async () => {
    await confirmExit(userId, locationId, locationName, tracking.enter_at, exitTime);
    pendingExits.delete(locationId);
  }, EXIT_COOLDOWN_MS);

  pendingExits.set(locationId, {
    locationId,
    locationName,
    exitTime,
    timeoutId,
  });

  logger.info('session', `⏳ Exit cooldown started (${EXIT_COOLDOWN_MS / 1000}s): ${locationName}`);
}

// ============================================
// CONFIRM EXIT (after cooldown)
// ============================================

async function confirmExit(
  userId: string,
  locationId: string,
  locationName: string,
  enterAt: string,
  exitTime: Date
): Promise<void> {
  logger.info('session', `[5/6] confirmExit: "${locationName}" | enter_at=${enterAt} | exitTime=${exitTime.toISOString()}`);

  // Cancel session guard timer
  cancelSessionGuard();

  // 0. Guard: if a different location is now being tracked, this is a stale exit
  const currentTracking = getActiveTracking();
  if (currentTracking && currentTracking.location_id !== locationId) {
    logger.warn('session', `[5/6] ⚠️ Stale exit for ${locationName}, now tracking ${currentTracking.location_name} — skipping`);
    return;
  }

  // 1. Read pause_seconds BEFORE clearing active tracking
  const pauseSeconds = getPauseSeconds();
  const breakMinutes = Math.ceil(pauseSeconds / 60);

  // 2. Calculate duration (deduct pause)
  const entryTime = new Date(enterAt);
  const durationMs = exitTime.getTime() - entryTime.getTime();
  const durationMinutes = Math.max(0, Math.round((durationMs - pauseSeconds * 1000) / 60000));

  logger.info('session', `[5/6] Duration calc: ${durationMinutes}min | enter=${enterAt} | exit=${exitTime.toISOString()} | pause=${pauseSeconds}s`);

  // 3. Clear active tracking
  clearActiveTracking();
  switchToIdleMode().catch(() => {}); // Best-effort, non-blocking

  // 4. Apply exit adjustment (subtract configured minutes from recorded time)
  const adjustMin = useSettingsStore.getState().exitAdjustmentMinutes;
  const adjustedDuration = Math.max(0, durationMinutes - adjustMin);
  const adjustedExitTime = new Date(exitTime.getTime() - adjustMin * 60000);

  if (adjustMin > 0) {
    logger.info('session', `[4.5] Exit adjustment: -${adjustMin}min | duration ${durationMinutes}→${adjustedDuration}min | exit ${formatTimeHHMM(exitTime)}→${formatTimeHHMM(adjustedExitTime)}`);
  }

  // 5. Update daily_hours
  const today = getToday();
  const existingDaily = getDailyHours(userId, today);
  const totalMinutes = (existingDaily?.total_minutes || 0) + adjustedDuration;
  const existingBreak = existingDaily?.break_minutes || 0;
  const exitTimeStr = formatTimeHHMM(adjustedExitTime);

  upsertDailyHours({
    userId,
    date: today,
    totalMinutes,
    breakMinutes: existingBreak + breakMinutes,
    locationName,
    locationId,
    verified: true,
    source: 'gps',
    firstEntry: existingDaily?.first_entry || formatTimeHHMM(entryTime),
    lastExit: exitTimeStr,
  });

  logger.info('session', `[5/6] daily_hours updated: total=${totalMinutes}min, break=${existingBreak + breakMinutes}min, last_exit=${exitTimeStr}`);

  // 5. Notification with total hours
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  await showEndOfDayNotification(hours, mins, locationName);

  // 6. Refresh UI
  useDailyLogStore.getState().reloadToday();
  useDailyLogStore.getState().resetTracking();
  logger.info('session', `[6/6] UI updated: timer reset, daily reloaded | total=${totalMinutes}min`);

  // 7. Sync (non-blocking)
  useSyncStore.getState().syncNow().catch(e =>
    logger.warn('sync', 'Exit sync failed (will retry)', { error: String(e) })
  );

  // 8. AI Secretário: cleanup today's record (async, non-blocking)
  import('./ai/secretary').then(({ cleanupDay }) => {
    cleanupDay(userId, today).catch(err => {
      logger.warn('secretary', 'Cleanup failed, original data preserved', { error: String(err) });
    });
  }).catch(() => {
    // Module not available, skip
  });
}

// ============================================
// MANUAL EXIT (immediate, no cooldown)
// ============================================

export async function onManualExit(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  logger.info('session', `🛑 MANUAL EXIT: ${locationName}`);

  // 1. Check if we're tracking this location
  const tracking = getActiveTracking();
  if (!tracking || tracking.location_id !== locationId) {
    logger.warn('session', `⚠️ Manual exit without active tracking: ${locationName}`);
    return;
  }

  // 2. Cancel any pending exit for this location
  const existingPending = pendingExits.get(locationId);
  if (existingPending) {
    clearTimeout(existingPending.timeoutId);
    pendingExits.delete(locationId);
  }

  // 3. Immediate exit (no cooldown)
  await confirmExit(userId, locationId, locationName, tracking.enter_at, new Date());
}

// ============================================
// RECOVERY (app restart)
// ============================================

export function getActiveTrackingState(): ActiveTracking | null {
  return getActiveTracking();
}

/**
 * Check if there's active tracking (for UI)
 */
export function hasActiveTracking(): boolean {
  return getActiveTracking() !== null;
}

/**
 * Get tracking duration in minutes (for UI timer)
 */
export function getTrackingDurationMinutes(): number {
  const tracking = getActiveTracking();
  if (!tracking) return 0;

  const entryTime = new Date(tracking.enter_at).getTime();
  const now = Date.now();
  return Math.max(0, Math.round((now - entryTime) / 60000));
}

// ============================================
// CLEANUP
// ============================================

export function clearAllPendingExits(): void {
  for (const [_locationId, pending] of pendingExits.entries()) {
    clearTimeout(pending.timeoutId);
  }
  pendingExits.clear();
  cancelSessionGuard();
  logger.info('session', '🧹 All pending exits cleared');
}
