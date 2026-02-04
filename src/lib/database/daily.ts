/**
 * Daily Hours - OnSite Timekeeper
 *
 * CRUD operations for daily_hours table.
 * This is the user-facing consolidated view (1 record per day).
 *
 * GPS data goes to location_audit (proof trail).
 * daily_hours is what the user sees and can edit.
 */

import { db, generateUUID, now, getToday, type DailyHoursDB, type DailyHoursSource } from './core';
import { logger } from '../logger';

// ============================================
// TYPES
// ============================================

export interface DailyHoursEntry {
  id: string;
  user_id: string;
  date: string;
  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;
  verified: boolean; // Converted from INTEGER
  source: DailyHoursSource;
  first_entry: string | null;
  last_exit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export interface UpsertDailyHoursParams {
  userId: string;
  date: string;
  totalMinutes: number;
  breakMinutes?: number;
  locationName?: string;
  locationId?: string;
  verified?: boolean;
  source?: DailyHoursSource;
  firstEntry?: string;
  lastExit?: string;
  notes?: string;
}

export interface UpdateDailyHoursParams {
  totalMinutes?: number;
  breakMinutes?: number;
  locationName?: string;
  locationId?: string;
  verified?: boolean;
  source?: DailyHoursSource;
  firstEntry?: string;
  lastExit?: string;
  notes?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Convert DB record to DailyHoursEntry (with boolean conversion)
 */
function toEntry(record: DailyHoursDB): DailyHoursEntry {
  return {
    ...record,
    verified: record.verified === 1,
  };
}

/**
 * Format time from Date to HH:MM string
 */
export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get date string (YYYY-MM-DD) from Date or ISO string
 */
export function getDateString(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

// ============================================
// GET OPERATIONS
// ============================================

/**
 * Get daily hours for a specific date
 */
export function getDailyHours(userId: string, date: string): DailyHoursEntry | null {
  try {
    const record = db.getFirstSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND date = ?`,
      [userId, date]
    );

    if (!record) return null;
    return toEntry(record);
  } catch (error) {
    logger.error('database', '[daily_hours] GET error', { error: String(error) });
    return null;
  }
}

/**
 * Get daily hours for today
 */
export function getTodayHours(userId: string): DailyHoursEntry | null {
  return getDailyHours(userId, getToday());
}

/**
 * Get daily hours for a date range
 */
export function getDailyHoursByPeriod(
  userId: string,
  startDate: string,
  endDate: string
): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours
       WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET BY PERIOD error', { error: String(error) });
    return [];
  }
}

/**
 * Get all daily hours for a user (for sync)
 */
export function getAllDailyHours(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? ORDER BY date DESC`,
      [userId]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET ALL error', { error: String(error) });
    return [];
  }
}

/**
 * Get unsynced daily hours (for upload to Supabase)
 */
export function getUnsyncedDailyHours(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND synced_at IS NULL ORDER BY date ASC`,
      [userId]
    );

    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET UNSYNCED error', { error: String(error) });
    return [];
  }
}

// ============================================
// CREATE / UPDATE OPERATIONS
// ============================================

/**
 * Create or update daily hours (UPSERT)
 * This is the main function used by geofence and manual entry.
 */
export function upsertDailyHours(params: UpsertDailyHoursParams): DailyHoursEntry | null {
  const {
    userId,
    date,
    totalMinutes,
    breakMinutes = 0,
    locationName,
    locationId,
    verified = false,
    source = 'manual',
    firstEntry,
    lastExit,
    notes,
  } = params;

  try {
    const existing = getDailyHours(userId, date);
    const timestamp = now();

    if (existing) {
      // UPDATE existing record
      db.runSync(
        `UPDATE daily_hours SET
          total_minutes = ?,
          break_minutes = ?,
          location_name = COALESCE(?, location_name),
          location_id = COALESCE(?, location_id),
          verified = ?,
          source = ?,
          first_entry = COALESCE(?, first_entry),
          last_exit = ?,
          notes = COALESCE(?, notes),
          updated_at = ?,
          synced_at = NULL
        WHERE user_id = ? AND date = ?`,
        [
          totalMinutes,
          breakMinutes,
          locationName || null,
          locationId || null,
          verified ? 1 : 0,
          source,
          firstEntry || null,
          lastExit || null,
          notes || null,
          timestamp,
          userId,
          date,
        ]
      );

      logger.info('database', `[daily_hours] UPDATED ${date}`, {
        totalMinutes,
        source,
        verified,
      });
    } else {
      // CREATE new record
      const id = generateUUID();

      db.runSync(
        `INSERT INTO daily_hours (
          id, user_id, date, total_minutes, break_minutes,
          location_name, location_id, verified, source,
          first_entry, last_exit, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          date,
          totalMinutes,
          breakMinutes,
          locationName || null,
          locationId || null,
          verified ? 1 : 0,
          source,
          firstEntry || null,
          lastExit || null,
          notes || null,
          timestamp,
          timestamp,
        ]
      );

      logger.info('database', `[daily_hours] CREATED ${date}`, {
        totalMinutes,
        source,
        verified,
      });
    }

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] UPSERT error', { error: String(error) });
    return null;
  }
}

/**
 * Update specific fields of daily hours
 */
export function updateDailyHours(
  userId: string,
  date: string,
  updates: UpdateDailyHoursParams
): DailyHoursEntry | null {
  try {
    const existing = getDailyHours(userId, date);
    if (!existing) {
      logger.warn('database', `[daily_hours] UPDATE failed - not found: ${date}`);
      return null;
    }

    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.totalMinutes !== undefined) {
      setClauses.push('total_minutes = ?');
      values.push(updates.totalMinutes);
    }
    if (updates.breakMinutes !== undefined) {
      setClauses.push('break_minutes = ?');
      values.push(updates.breakMinutes);
    }
    if (updates.locationName !== undefined) {
      setClauses.push('location_name = ?');
      values.push(updates.locationName);
    }
    if (updates.locationId !== undefined) {
      setClauses.push('location_id = ?');
      values.push(updates.locationId);
    }
    if (updates.verified !== undefined) {
      setClauses.push('verified = ?');
      values.push(updates.verified ? 1 : 0);
    }
    if (updates.source !== undefined) {
      setClauses.push('source = ?');
      values.push(updates.source);
    }
    if (updates.firstEntry !== undefined) {
      setClauses.push('first_entry = ?');
      values.push(updates.firstEntry);
    }
    if (updates.lastExit !== undefined) {
      setClauses.push('last_exit = ?');
      values.push(updates.lastExit);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(updates.notes);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    // Always update timestamp and mark for sync
    setClauses.push('updated_at = ?');
    values.push(now());
    setClauses.push('synced_at = NULL');

    // Add WHERE clause values
    values.push(userId, date);

    db.runSync(
      `UPDATE daily_hours SET ${setClauses.join(', ')} WHERE user_id = ? AND date = ?`,
      values
    );

    logger.info('database', `[daily_hours] UPDATED ${date}`, { fields: Object.keys(updates) });

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] UPDATE error', { error: String(error) });
    return null;
  }
}

/**
 * Add minutes to today's total (used by geofence exit)
 */
export function addMinutesToDay(
  userId: string,
  date: string,
  minutesToAdd: number,
  lastExit?: string
): DailyHoursEntry | null {
  try {
    const existing = getDailyHours(userId, date);

    if (!existing) {
      // Create new entry
      return upsertDailyHours({
        userId,
        date,
        totalMinutes: minutesToAdd,
        lastExit,
        verified: true,
        source: 'gps',
      });
    }

    // Add to existing
    const newTotal = existing.total_minutes + minutesToAdd;

    db.runSync(
      `UPDATE daily_hours SET
        total_minutes = ?,
        last_exit = COALESCE(?, last_exit),
        updated_at = ?,
        synced_at = NULL
      WHERE user_id = ? AND date = ?`,
      [newTotal, lastExit || null, now(), userId, date]
    );

    logger.info('database', `[daily_hours] ADDED ${minutesToAdd}min to ${date}`, {
      newTotal,
    });

    return getDailyHours(userId, date);
  } catch (error) {
    logger.error('database', '[daily_hours] ADD MINUTES error', { error: String(error) });
    return null;
  }
}

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete daily hours for a specific date
 */
export function deleteDailyHours(userId: string, date: string): boolean {
  try {
    db.runSync(`DELETE FROM daily_hours WHERE user_id = ? AND date = ?`, [userId, date]);
    logger.info('database', `[daily_hours] DELETED ${date}`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours] DELETE error', { error: String(error) });
    return false;
  }
}

// ============================================
// SYNC OPERATIONS
// ============================================

/**
 * Mark daily hours as synced
 */
export function markDailyHoursSynced(userId: string, date: string): void {
  try {
    db.runSync(
      `UPDATE daily_hours SET synced_at = ? WHERE user_id = ? AND date = ?`,
      [now(), userId, date]
    );
  } catch (error) {
    logger.error('database', '[daily_hours] MARK SYNCED error', { error: String(error) });
  }
}

/**
 * Upsert from sync (download from Supabase)
 */
export function upsertDailyHoursFromSync(record: DailyHoursDB): void {
  try {
    const existing = db.getFirstSync<{ id: string }>(
      `SELECT id FROM daily_hours WHERE user_id = ? AND date = ?`,
      [record.user_id, record.date]
    );

    if (existing) {
      db.runSync(
        `UPDATE daily_hours SET
          total_minutes = ?,
          break_minutes = ?,
          location_name = ?,
          location_id = ?,
          verified = ?,
          source = ?,
          first_entry = ?,
          last_exit = ?,
          notes = ?,
          updated_at = ?,
          synced_at = ?
        WHERE user_id = ? AND date = ?`,
        [
          record.total_minutes,
          record.break_minutes,
          record.location_name,
          record.location_id,
          record.verified,
          record.source,
          record.first_entry,
          record.last_exit,
          record.notes,
          record.updated_at,
          now(),
          record.user_id,
          record.date,
        ]
      );
    } else {
      db.runSync(
        `INSERT INTO daily_hours (
          id, user_id, date, total_minutes, break_minutes,
          location_name, location_id, verified, source,
          first_entry, last_exit, notes, created_at, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.user_id,
          record.date,
          record.total_minutes,
          record.break_minutes,
          record.location_name,
          record.location_id,
          record.verified,
          record.source,
          record.first_entry,
          record.last_exit,
          record.notes,
          record.created_at,
          record.updated_at,
          now(),
        ]
      );
    }
  } catch (error) {
    logger.error('database', '[daily_hours] UPSERT FROM SYNC error', { error: String(error) });
  }
}

// ============================================
// MIGRATION: Convert records to daily_hours
// ============================================

/**
 * Migrate existing records to daily_hours
 * Call this once during app upgrade
 */
export function migrateRecordsToDailyHours(userId: string): number {
  try {
    logger.info('database', '[daily_hours] Starting migration from records...');

    // Get all completed records grouped by date
    const migrationData = db.getAllSync<{
      date: string;
      total_minutes: number;
      break_minutes: number;
      location_name: string;
      location_id: string;
      verified: number;
      first_entry: string;
      last_exit: string;
    }>(
      `SELECT
        DATE(entry_at) as date,
        SUM(
          CASE
            WHEN exit_at IS NOT NULL
            THEN ROUND((julianday(exit_at) - julianday(entry_at)) * 24 * 60 - COALESCE(pause_minutes, 0))
            ELSE 0
          END
        ) as total_minutes,
        SUM(COALESCE(pause_minutes, 0)) as break_minutes,
        -- Get location from longest session of the day
        (SELECT r2.location_name FROM records r2
         WHERE r2.user_id = records.user_id
         AND DATE(r2.entry_at) = DATE(records.entry_at)
         AND r2.exit_at IS NOT NULL
         ORDER BY (julianday(r2.exit_at) - julianday(r2.entry_at)) DESC
         LIMIT 1) as location_name,
        (SELECT r2.location_id FROM records r2
         WHERE r2.user_id = records.user_id
         AND DATE(r2.entry_at) = DATE(records.entry_at)
         AND r2.exit_at IS NOT NULL
         ORDER BY (julianday(r2.exit_at) - julianday(r2.entry_at)) DESC
         LIMIT 1) as location_id,
        MAX(CASE WHEN type = 'automatic' THEN 1 ELSE 0 END) as verified,
        TIME(MIN(entry_at)) as first_entry,
        TIME(MAX(exit_at)) as last_exit
      FROM records
      WHERE user_id = ? AND exit_at IS NOT NULL
      GROUP BY user_id, DATE(entry_at)`,
      [userId]
    );

    let migratedCount = 0;

    for (const row of migrationData) {
      // Skip if already exists
      const existing = getDailyHours(userId, row.date);
      if (existing) continue;

      upsertDailyHours({
        userId,
        date: row.date,
        totalMinutes: Math.round(row.total_minutes),
        breakMinutes: row.break_minutes,
        locationName: row.location_name,
        locationId: row.location_id,
        verified: row.verified === 1,
        source: row.verified === 1 ? 'gps' : 'manual',
        firstEntry: row.first_entry,
        lastExit: row.last_exit,
      });

      migratedCount++;
    }

    logger.info('database', `[daily_hours] Migration complete: ${migratedCount} days migrated`);
    return migratedCount;
  } catch (error) {
    logger.error('database', '[daily_hours] MIGRATION error', { error: String(error) });
    return 0;
  }
}
