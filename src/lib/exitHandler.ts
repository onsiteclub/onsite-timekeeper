/**
 * Exit Handler - OnSite Timekeeper v2
 *
 * CONFIGURABLE TIMEOUT SYSTEM:
 * - Entry: Wait X minutes (entryTimeoutMinutes) before registering
 * - Exit: Register immediately, apply adjustment (exitAdjustmentMinutes) on last session
 * - End of day: Show summary notification after 45 min without return
 *
 * User can cancel pending entry by leaving before timeout expires.
 */

import { logger } from './logger';
import { registerExit, handleSessionMerge, getOpenSession } from './database/records';
import { createEntryRecord } from './database/records';
import { useSyncStore } from '../stores/syncStore';
import { useRecordStore } from '../stores/recordStore';
import { showArrivalNotification, showEndOfDayNotification, showPendingEntryNotification, cancelNotification } from './notifications';
import { db, type RecordDB, calculateDuration, getToday } from './database/core';
import { useSettingsStore } from '../stores/settingsStore';
import {
  upsertDailyHours,
  addMinutesToDay,
  getDailyHours,
  formatTimeHHMM,
  getDateString,
} from './database/daily';

// ============================================
// CONSTANTS
// ============================================

const END_OF_DAY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

// ============================================
// STATE MANAGEMENT
// ============================================

interface PendingEntry {
  userId: string;
  locationId: string;
  locationName: string;
  timeoutId: NodeJS.Timeout;
  notificationId?: string;
  entryTime: Date;
}

interface PendingExitNotification {
  locationId: string;
  locationName: string;
  timeoutId: NodeJS.Timeout;
  exitTime: Date;
}

// Map of locationId → PendingEntry (waiting to register)
const pendingEntries = new Map<string, PendingEntry>();

// Map of locationId → PendingExitNotification (kept for backward compat)
const pendingExitNotifications = new Map<string, PendingExitNotification>();

// Map for end-of-day timers
const endOfDayTimers = new Map<string, NodeJS.Timeout>();

// ============================================
// EXIT HANDLER
// ============================================

/**
 * Handle geofence exit
 * 1. Cancel any pending entry (user left before timeout)
 * 2. Register exit immediately (no adjustment - adjustment only on final exit)
 * 3. Update daily_hours with session duration
 * 4. Schedule end-of-day check (45 min without return)
 */
export async function handleExitWithDelay(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  try {
    // 0. CANCEL PENDING ENTRY if user left before timeout expired
    const wasPending = await cancelPendingEntry(locationId);
    if (wasPending) {
      logger.info('session', `🚶 User left before entry confirmed: ${locationName}`);
      // Don't register exit since session was never started
      return;
    }

    // Get session duration BEFORE registering exit
    const session = await getOpenSession(userId, locationId);
    let sessionDuration = 0;
    if (session) {
      sessionDuration = calculateDuration(session.entry_at, new Date().toISOString());
    }

    // 1. REGISTER EXIT IMMEDIATELY (no adjustment - applied only on final exit)
    await registerExit(userId, locationId, 0);

    // 2. UPDATE daily_hours with session duration
    const today = getToday();
    const exitTime = formatTimeHHMM(new Date());

    if (sessionDuration > 0) {
      addMinutesToDay(userId, today, sessionDuration, exitTime);
      logger.info('session', `📅 daily_hours updated: +${sessionDuration}min, last_exit: ${exitTime}`);
    }

    // Refresh UI state
    useRecordStore.getState().reloadData?.();

    logger.info('session', `📤 Exit registered: ${locationName}`);

    // 3. SYNC TO SUPABASE (don't block)
    useSyncStore.getState().syncRecordsOnly().catch(e =>
      logger.warn('sync', 'Exit sync failed (will retry)', { error: String(e) })
    );

    // 4. Schedule end-of-day check (45 min without return)
    scheduleEndOfDayCheck(userId, locationId, locationName);

    logger.info('session', `⏱️ End-of-day check scheduled (45 min): ${locationName}`);

  } catch (error) {
    logger.error('session', 'Error handling exit', { error: String(error), locationName });
  }
}

/**
 * Handle geofence enter - WITH CONFIGURABLE DELAY
 * 1. Cancel end-of-day timer (user returned)
 * 2. Check session merge (immediate if returning)
 * 3. For new sessions: wait entryTimeoutMinutes before registering
 */
export async function handleEnterWithMerge(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  try {
    // 1. Cancel end-of-day timer (user returned before 45 min)
    cancelEndOfDayCheck(userId, locationId);

    // Also cancel legacy pending notification
    await cancelExitNotification(locationId);

    // 2. Check if we can merge sessions
    const mergeResult = await handleSessionMerge(userId, locationId, locationName);

    switch (mergeResult) {
      case 'already_active':
        logger.info('session', `✅ Session already active: ${locationName}`);
        useRecordStore.getState().reloadData?.();
        // Cancel any pending entry (already active)
        await cancelPendingEntry(locationId);
        break;

      case 'merged':
        logger.info('session', `🔄 Session merged silently: ${locationName}`);
        useRecordStore.getState().reloadData?.();

        // SYNC TO SUPABASE (don't block)
        useSyncStore.getState().syncRecordsOnly().catch(e =>
          logger.warn('sync', 'Merge sync failed (will retry)', { error: String(e) })
        );
        // Cancel any pending entry (merged)
        await cancelPendingEntry(locationId);
        break;

      case 'new_session':
        // Get entry timeout from settings
        const entryTimeoutMinutes = useSettingsStore.getState().entryTimeoutMinutes || 0;

        if (entryTimeoutMinutes <= 0) {
          // IMMEDIATE - no delay
          await createNewSession(userId, locationId, locationName);
        } else {
          // DELAYED - schedule entry after timeout
          await schedulePendingEntry(userId, locationId, locationName, entryTimeoutMinutes);
        }
        break;
    }

  } catch (error) {
    logger.error('session', 'Error handling enter', { error: String(error), locationName });
  }
}

/**
 * Create new session immediately
 */
async function createNewSession(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  logger.info('session', `📝 Creating new session: ${locationName}`);

  // Check if this is the first entry of the day for this location
  const isFirstEntry = await checkFirstEntryToday(userId, locationId);
  const today = getToday();
  const entryTime = formatTimeHHMM(new Date());

  // Create new entry record (records table - GPS audit trail)
  await createEntryRecord({
    userId,
    locationId,
    locationName,
    type: 'automatic'
  });

  // UPDATE daily_hours: Set first_entry if this is the first entry of the day
  const existingDaily = getDailyHours(userId, today);
  if (!existingDaily) {
    // First GPS entry of the day - create daily_hours record
    upsertDailyHours({
      userId,
      date: today,
      totalMinutes: 0, // Will be updated on exit
      locationName,
      locationId,
      verified: true,
      source: 'gps',
      firstEntry: entryTime,
    });
    logger.info('session', `📅 daily_hours created with first_entry: ${entryTime}`);
  } else if (!existingDaily.first_entry) {
    // Daily record exists (manual entry?) but no first_entry - update it
    upsertDailyHours({
      userId,
      date: today,
      totalMinutes: existingDaily.total_minutes,
      firstEntry: entryTime,
      verified: true,
      source: 'gps',
    });
    logger.info('session', `📅 daily_hours updated with GPS first_entry: ${entryTime}`);
  }

  // Refresh UI state
  useRecordStore.getState().reloadData?.();

  // SYNC TO SUPABASE (don't block)
  useSyncStore.getState().syncRecordsOnly().catch(e =>
    logger.warn('sync', 'Entry sync failed (will retry)', { error: String(e) })
  );

  // ONLY notify on FIRST entry of the day
  if (isFirstEntry) {
    await showArrivalNotification(locationName);
    logger.info('session', `📬 First entry notification: ${locationName}`);
  } else {
    logger.info('session', `🔇 Subsequent entry (silent): ${locationName}`);
  }
}

/**
 * Schedule pending entry with timeout
 */
async function schedulePendingEntry(
  userId: string,
  locationId: string,
  locationName: string,
  timeoutMinutes: number
): Promise<void> {
  // Cancel existing pending entry if any
  await cancelPendingEntry(locationId);

  const timeoutMs = timeoutMinutes * 60 * 1000;

  logger.info('session', `⏳ Pending entry scheduled: ${locationName} (${timeoutMinutes} min)`);

  // Show notification about pending entry
  const notificationId = await showPendingEntryNotification(locationName, timeoutMinutes);

  // Schedule the actual entry
  const timeoutId = setTimeout(async () => {
    try {
      // Remove from pending
      pendingEntries.delete(locationId);

      // Cancel the notification
      if (notificationId) {
        await cancelNotification(notificationId);
      }

      // Create the session
      await createNewSession(userId, locationId, locationName);

      logger.info('session', `✅ Pending entry confirmed: ${locationName}`);
    } catch (error) {
      logger.error('session', 'Error confirming pending entry', { error: String(error) });
    }
  }, timeoutMs);

  // Store pending entry
  pendingEntries.set(locationId, {
    userId,
    locationId,
    locationName,
    timeoutId,
    notificationId: notificationId || undefined,
    entryTime: new Date(),
  });
}

/**
 * Cancel pending entry (user left before timeout)
 */
export async function cancelPendingEntry(locationId: string): Promise<boolean> {
  const pending = pendingEntries.get(locationId);

  if (pending) {
    clearTimeout(pending.timeoutId);

    if (pending.notificationId) {
      await cancelNotification(pending.notificationId);
    }

    pendingEntries.delete(locationId);

    logger.info('session', `❌ Pending entry cancelled: ${pending.locationName}`);
    return true;
  }

  return false;
}

// ============================================
// NOTIFICATION HELPERS
// ============================================

/**
 * Cancel pending exit notification if exists
 * Returns true if notification was cancelled
 */
export async function cancelExitNotification(locationId: string): Promise<boolean> {
  const pending = pendingExitNotifications.get(locationId);
  
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingExitNotifications.delete(locationId);
    
    logger.debug('session', `❌ Exit notification cancelled: ${pending.locationName}`);
    return true;
  }
  
  return false;
}

// ============================================
// FIRST ENTRY CHECK
// ============================================

/**
 * Check if this is the first entry of the day for this location
 */
async function checkFirstEntryToday(userId: string, locationId: string): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const existingSession = db.getFirstSync<RecordDB>(
      `SELECT id FROM records WHERE user_id = ? AND location_id = ? AND entry_at >= ? LIMIT 1`,
      [userId, locationId, todayStr]
    );

    return !existingSession;
  } catch (error) {
    logger.error('session', 'Error checking first entry', { error: String(error) });
    return true; // Default to showing notification on error
  }
}

// ============================================
// END OF DAY DETECTION
// ============================================

/**
 * Schedule end-of-day check (45 min without return)
 */
function scheduleEndOfDayCheck(userId: string, locationId: string, locationName: string): void {
  const key = `${userId}_${locationId}`;

  // Cancel existing timer if any
  if (endOfDayTimers.has(key)) {
    clearTimeout(endOfDayTimers.get(key)!);
  }

  // Schedule new timer
  const timer = setTimeout(async () => {
    try {
      // Verify user hasn't returned (no active session)
      const activeSession = await getOpenSession(userId, locationId);
      if (!activeSession) {
        // END OF DAY - Generate summary and notify
        await generateDailySummary(userId, locationId, locationName);
      } else {
        logger.info('session', `⏱️ End-of-day cancelled (session active): ${locationName}`);
      }
    } catch (error) {
      logger.error('session', 'Error in end-of-day check', { error: String(error) });
    } finally {
      endOfDayTimers.delete(key);
    }
  }, END_OF_DAY_TIMEOUT_MS);

  endOfDayTimers.set(key, timer);
}

/**
 * Cancel end-of-day check (user returned)
 */
function cancelEndOfDayCheck(userId: string, locationId: string): void {
  const key = `${userId}_${locationId}`;
  if (endOfDayTimers.has(key)) {
    clearTimeout(endOfDayTimers.get(key)!);
    endOfDayTimers.delete(key);
    logger.info('session', `⏱️ End-of-day check cancelled (user returned)`);
  }
}

// ============================================
// DAILY SUMMARY
// ============================================

interface DailySummary {
  date: string;
  locationId: string;
  locationName: string;
  firstEntry: string;
  lastExit: string;
  totalMinutes: number;
  totalBreakMinutes: number;
  sessionsCount: number;
}

/**
 * Generate daily summary and show end-of-day notification
 * Also finalizes the daily_hours record with exit adjustment applied
 */
async function generateDailySummary(
  userId: string,
  locationId: string,
  locationName: string
): Promise<DailySummary | null> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get exit adjustment from settings
    const exitAdjustment = useSettingsStore.getState().exitAdjustmentMinutes || 10;

    // Fetch all completed sessions for today at this location
    const sessions = db.getAllSync<RecordDB>(
      `SELECT * FROM records
       WHERE user_id = ?
         AND location_id = ?
         AND DATE(entry_at) = ?
         AND exit_at IS NOT NULL
       ORDER BY entry_at ASC`,
      [userId, locationId, todayStr]
    );

    if (sessions.length === 0) {
      logger.info('session', `📊 No completed sessions for summary: ${locationName}`);
      return null;
    }

    // Calculate totals
    const firstEntry = sessions[0].entry_at;
    const lastExit = sessions[sessions.length - 1].exit_at!;

    let totalMinutes = 0;
    let totalBreakMinutes = 0;

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      let duration = calculateDuration(session.entry_at, session.exit_at);

      // Apply exit adjustment ONLY to the last session
      if (i === sessions.length - 1) {
        duration = Math.max(0, duration - exitAdjustment);
      }

      totalMinutes += Math.max(0, duration - (session.pause_minutes || 0));
      totalBreakMinutes += session.pause_minutes || 0;
    }

    const summary: DailySummary = {
      date: todayStr,
      locationId,
      locationName,
      firstEntry,
      lastExit,
      totalMinutes,
      totalBreakMinutes,
      sessionsCount: sessions.length,
    };

    // FINALIZE daily_hours with adjusted totals (applying exit adjustment)
    const firstEntryTime = formatTimeHHMM(new Date(firstEntry));
    const lastExitTime = formatTimeHHMM(new Date(lastExit));

    upsertDailyHours({
      userId,
      date: todayStr,
      totalMinutes: totalMinutes,
      breakMinutes: totalBreakMinutes,
      locationName,
      locationId,
      verified: true,
      source: 'gps',
      firstEntry: firstEntryTime,
      lastExit: lastExitTime,
    });

    logger.info('session', `📅 daily_hours finalized: ${totalMinutes}min (adjusted -${exitAdjustment}min)`);

    // Show end-of-day notification
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    await showEndOfDayNotification(hours, mins, locationName);

    logger.info('session', `📊 Daily summary: ${locationName} - ${hours}h ${mins}min`, {
      sessionsCount: sessions.length,
      totalBreakMinutes,
    });

    // Sync to Supabase
    useSyncStore.getState().syncNow().catch(e =>
      logger.warn('sync', 'End-of-day sync failed (will retry)', { error: String(e) })
    );

    return summary;
  } catch (error) {
    logger.error('session', 'Error generating daily summary', { error: String(error) });
    return null;
  }
}

// ============================================
// CLEANUP
// ============================================

/**
 * Cancel all pending timers (app shutdown)
 */
export function clearAllPendingExitNotifications(): void {
  // Clear pending entries
  for (const [_locationId, pending] of pendingEntries.entries()) {
    clearTimeout(pending.timeoutId);
    logger.debug('session', `🧹 Cleared pending entry: ${pending.locationName}`);
  }
  pendingEntries.clear();

  // Clear legacy pending notifications
  for (const [_locationId, pending] of pendingExitNotifications.entries()) {
    clearTimeout(pending.timeoutId);
    logger.debug('session', `🧹 Cleared pending notification: ${pending.locationName}`);
  }
  pendingExitNotifications.clear();

  // Clear end-of-day timers
  for (const [key, timer] of endOfDayTimers.entries()) {
    clearTimeout(timer);
    logger.debug('session', `🧹 Cleared end-of-day timer: ${key}`);
  }
  endOfDayTimers.clear();

  logger.info('session', '🧹 All pending timers cleared');
}

/**
 * Get current pending notifications (for debugging)
 */
export function getPendingExitNotifications(): { locationId: string; locationName: string; exitTime: Date }[] {
  return Array.from(pendingExitNotifications.values()).map(pending => ({
    locationId: pending.locationId,
    locationName: pending.locationName,
    exitTime: pending.exitTime,
  }));
}

// ============================================
// ENTRY POINT FOR ENTRY TIMEOUT SYSTEM (deprecated)
// ============================================

/**
 * @deprecated Use handleEnterWithMerge instead
 * Handle entry with timeout (legacy - kept for backward compatibility)
 */
export async function handleEntryWithTimeout(
  userId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  // Redirect to new simplified flow
  return handleEnterWithMerge(userId, locationId, locationName);
}
