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
import { showArrivalNotification, showEndOfDayNotification } from './notifications';
import { upsertDailyHours, getDailyHours, formatTimeHHMM } from './database/daily';

// ============================================
// CONSTANTS
// ============================================

const EXIT_COOLDOWN_MS = 60 * 1000; // 60 seconds

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

// ============================================
// ACTIVE TRACKING (SQLite singleton)
// ============================================

export interface ActiveTracking {
  location_id: string;
  location_name: string;
  enter_at: string;
}

function getActiveTracking(): ActiveTracking | null {
  try {
    return db.getFirstSync<ActiveTracking>(
      `SELECT location_id, location_name, enter_at FROM active_tracking WHERE id = 'current'`
    );
  } catch {
    return null;
  }
}

function setActiveTracking(locationId: string, locationName: string): void {
  const now = new Date().toISOString();
  db.runSync(
    `INSERT OR REPLACE INTO active_tracking (id, location_id, location_name, enter_at, created_at)
     VALUES ('current', ?, ?, ?, ?)`,
    [locationId, locationName, now, now]
  );
}

function clearActiveTracking(): void {
  db.runSync(`DELETE FROM active_tracking WHERE id = 'current'`);
}

// ============================================
// GEOFENCE ENTER
// ============================================

export async function onGeofenceEnter(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  logger.info('session', `🚶 ENTER: ${locationName}`);

  // 1. Cancel any pending exit for this location (re-entry during cooldown)
  const pending = pendingExits.get(locationId);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingExits.delete(locationId);
    logger.info('session', `↩️ Re-entry during cooldown, continuing tracking: ${locationName}`);
    return; // Continue existing tracking, don't create new
  }

  // 2. Check if already tracking (shouldn't happen, but handle gracefully)
  const existing = getActiveTracking();
  if (existing && existing.location_id === locationId) {
    logger.info('session', `⚠️ Already tracking this location: ${locationName}`);
    return;
  }

  // 3. If tracking a different location, close that one first
  if (existing && existing.location_id !== locationId) {
    logger.info('session', `⚠️ Switching locations: ${existing.location_name} → ${locationName}`);

    // Cancel pending exit for the OLD location (prevents timeout from clearing new tracking)
    const oldPending = pendingExits.get(existing.location_id);
    if (oldPending) {
      clearTimeout(oldPending.timeoutId);
      pendingExits.delete(existing.location_id);
      logger.info('session', `🧹 Cancelled pending exit for old location: ${existing.location_name}`);
    }

    await confirmExit(userId, existing.location_id, existing.location_name, existing.enter_at, new Date());
  }

  // 4. Save new tracking entry
  setActiveTracking(locationId, locationName);
  logger.info('session', `✅ Tracking started: ${locationName}`);

  // 5. Check if this is first entry of the day
  const today = getToday();
  const existingDaily = getDailyHours(userId, today);
  const isFirstEntry = !existingDaily || !existingDaily.first_entry;

  // 6. Update daily_hours with first_entry if needed
  if (isFirstEntry) {
    const entryTime = formatTimeHHMM(new Date());
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
    logger.info('session', `📅 First entry of day: ${entryTime}`);
  }

  // 7. Notification only on first entry of the day
  if (isFirstEntry) {
    await showArrivalNotification(locationName);
  }

  // 8. Refresh UI
  useDailyLogStore.getState().reloadToday();
  useDailyLogStore.getState().startTracking(locationId, locationName);
}

// ============================================
// GEOFENCE EXIT
// ============================================

export async function onGeofenceExit(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  logger.info('session', `🚶 EXIT: ${locationName}`);

  // 1. Check if we're tracking this location
  const tracking = getActiveTracking();
  if (!tracking || tracking.location_id !== locationId) {
    logger.warn('session', `⚠️ Exit without active tracking: ${locationName}`);
    return;
  }

  // 2. Cancel any existing pending exit for this location
  const existingPending = pendingExits.get(locationId);
  if (existingPending) {
    clearTimeout(existingPending.timeoutId);
  }

  // 3. Schedule exit with 60s cooldown
  const exitTime = new Date();
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

  logger.info('session', `⏳ Exit cooldown started (60s): ${locationName}`);
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
  logger.info('session', `✅ Exit confirmed: ${locationName}`);

  // 0. Guard: if a different location is now being tracked, this is a stale exit
  //    (the exit was already handled by onGeofenceEnter's location switch)
  const currentTracking = getActiveTracking();
  if (currentTracking && currentTracking.location_id !== locationId) {
    logger.warn('session', `⚠️ Stale exit for ${locationName}, now tracking ${currentTracking.location_name} — skipping`);
    return;
  }

  // 1. Calculate duration
  const entryTime = new Date(enterAt);
  const durationMs = exitTime.getTime() - entryTime.getTime();
  const durationMinutes = Math.max(0, Math.round(durationMs / 60000));

  logger.info('session', `⏱️ Duration: ${durationMinutes} minutes`);

  // 2. Clear active tracking
  clearActiveTracking();

  // 3. Update daily_hours
  const today = getToday();
  const existingDaily = getDailyHours(userId, today);
  const totalMinutes = (existingDaily?.total_minutes || 0) + durationMinutes;
  const exitTimeStr = formatTimeHHMM(exitTime);

  upsertDailyHours({
    userId,
    date: today,
    totalMinutes,
    locationName,
    locationId,
    verified: true,
    source: 'gps',
    firstEntry: existingDaily?.first_entry || formatTimeHHMM(entryTime),
    lastExit: exitTimeStr,
  });

  logger.info('session', `📅 daily_hours updated: total=${totalMinutes}min, last_exit=${exitTimeStr}`);

  // 4. Notification with total hours
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  await showEndOfDayNotification(hours, mins, locationName);

  // 5. Refresh UI
  useDailyLogStore.getState().reloadToday();
  useDailyLogStore.getState().resetTracking();

  // 6. Sync (non-blocking)
  useSyncStore.getState().syncNow().catch(e =>
    logger.warn('sync', 'Exit sync failed (will retry)', { error: String(e) })
  );
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
  logger.info('session', '🧹 All pending exits cleared');
}
