/**
 * Daily Hours - OnSite Timekeeper
 *
 * CRUD operations for daily_hours table.
 * This is the user-facing consolidated view (1 record per day).
 *
 * GPS data goes to location_audit (proof trail).
 * daily_hours is what the user sees and can edit.
 */

import { db, generateUUID, now, getToday, type DailyHoursDB, type DailyHoursSource, type DailyHoursType } from './core';
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
  type: DailyHoursType;
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
  type?: DailyHoursType;
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
  type?: DailyHoursType;
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
    type: record.type || 'work',
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
  // Use local date, not UTC (toISOString returns UTC which is wrong near midnight)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      `SELECT * FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
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
       WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
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
      `SELECT * FROM daily_hours WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC`,
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
      `SELECT * FROM daily_hours WHERE user_id = ? AND synced_at IS NULL AND deleted_at IS NULL ORDER BY date ASC`,
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
    type = 'work',
    firstEntry,
    lastExit,
    notes,
  } = params;

  try {
    // Defense: ensure numeric fields are actually numbers (AI can return strings)
    const safeTotalMinutes = typeof totalMinutes === 'number' && !isNaN(totalMinutes) ? Math.round(totalMinutes) : 0;
    const safeBreakMinutes = typeof breakMinutes === 'number' && !isNaN(breakMinutes) ? Math.round(breakMinutes) : 0;

    if (safeTotalMinutes !== totalMinutes || safeBreakMinutes !== breakMinutes) {
      logger.warn('database', '[daily_hours] UPSERT: sanitized non-numeric values', {
        totalMinutes: String(totalMinutes), safeTotalMinutes,
        breakMinutes: String(breakMinutes), safeBreakMinutes,
      });
    }

    // Check for existing record (including soft-deleted)
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
          type = ?,
          first_entry = COALESCE(?, first_entry),
          last_exit = ?,
          notes = COALESCE(?, notes),
          updated_at = ?,
          synced_at = NULL
        WHERE user_id = ? AND date = ?`,
        [
          safeTotalMinutes,
          safeBreakMinutes,
          locationName || null,
          locationId || null,
          verified ? 1 : 0,
          source,
          type,
          firstEntry || null,
          lastExit || null,
          notes || null,
          timestamp,
          userId,
          date,
        ]
      );

      logger.info('database', `[daily_hours] UPDATED ${date}`, {
        totalMinutes: safeTotalMinutes,
        source,
        type,
        verified,
      });
    } else {
      // Check if there's a soft-deleted record blocking INSERT
      const softDeleted = db.getFirstSync<{ id: string }>(
        `SELECT id FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NOT NULL`,
        [userId, date]
      );

      if (softDeleted) {
        // Resurrect the soft-deleted record
        db.runSync(
          `UPDATE daily_hours SET
            total_minutes = ?,
            break_minutes = ?,
            location_name = ?,
            location_id = ?,
            verified = ?,
            source = ?,
            type = ?,
            first_entry = ?,
            last_exit = ?,
            notes = ?,
            deleted_at = NULL,
            updated_at = ?,
            synced_at = NULL
          WHERE user_id = ? AND date = ?`,
          [
            safeTotalMinutes,
            safeBreakMinutes,
            locationName || null,
            locationId || null,
            verified ? 1 : 0,
            source,
            type,
            firstEntry || null,
            lastExit || null,
            notes || null,
            timestamp,
            userId,
            date,
          ]
        );

        logger.info('database', `[daily_hours] RESURRECTED (was soft-deleted) ${date}`, {
          totalMinutes: safeTotalMinutes,
          source,
          type,
        });
      } else {
        // CREATE new record
        const id = generateUUID();

        db.runSync(
          `INSERT INTO daily_hours (
            id, user_id, date, total_minutes, break_minutes,
            location_name, location_id, verified, source, type,
            first_entry, last_exit, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            userId,
            date,
            safeTotalMinutes,
            safeBreakMinutes,
            locationName || null,
            locationId || null,
            verified ? 1 : 0,
            source,
            type,
            firstEntry || null,
            lastExit || null,
            notes || null,
            timestamp,
            timestamp,
          ]
        );

        logger.info('database', `[daily_hours] CREATED ${date}`, {
          totalMinutes: safeTotalMinutes,
          source,
          type,
          verified,
        });
      }
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
    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      values.push(updates.type);
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
 * Soft-delete daily hours for a specific date
 * Sets deleted_at and clears synced_at so deletion syncs to Supabase
 */
export function deleteDailyHours(userId: string, date: string): boolean {
  try {
    db.runSync(
      `UPDATE daily_hours SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE user_id = ? AND date = ?`,
      [now(), now(), userId, date]
    );
    logger.info('database', `[daily_hours] SOFT-DELETED ${date}`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours] DELETE error', { error: String(error) });
    return false;
  }
}

/**
 * Soft-delete daily hours by record ID (UUID)
 */
export function deleteDailyHoursById(userId: string, id: string): boolean {
  try {
    db.runSync(
      `UPDATE daily_hours SET deleted_at = ?, updated_at = ?, synced_at = NULL WHERE user_id = ? AND id = ?`,
      [now(), now(), userId, id]
    );
    logger.info('database', `[daily_hours] SOFT-DELETED by id ${id.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours] DELETE BY ID error', { error: String(error) });
    return false;
  }
}

/**
 * Get soft-deleted records pending sync (need to be deleted from Supabase)
 */
export function getDeletedDailyHoursForSync(userId: string): DailyHoursEntry[] {
  try {
    const records = db.getAllSync<DailyHoursDB>(
      `SELECT * FROM daily_hours WHERE user_id = ? AND deleted_at IS NOT NULL AND synced_at IS NULL`,
      [userId]
    );
    return records.map(toEntry);
  } catch (error) {
    logger.error('database', '[daily_hours] GET DELETED FOR SYNC error', { error: String(error) });
    return [];
  }
}

/**
 * Hard-delete a record after successful Supabase deletion (cleanup tombstone)
 */
export function purgeDeletedDailyHours(userId: string, date: string): void {
  try {
    db.runSync(
      `DELETE FROM daily_hours WHERE user_id = ? AND date = ? AND deleted_at IS NOT NULL`,
      [userId, date]
    );
  } catch (error) {
    logger.error('database', '[daily_hours] PURGE error', { error: String(error) });
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
    const existing = db.getFirstSync<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM daily_hours WHERE user_id = ? AND date = ?`,
      [record.user_id, record.date]
    );

    // Skip if locally deleted (tombstone exists, pending sync)
    if (existing?.deleted_at) {
      logger.debug('database', `[daily_hours] SKIP upsert from sync (locally deleted): ${record.date}`);
      return;
    }

    if (existing) {
      db.runSync(
        `UPDATE daily_hours SET
          total_minutes = ?,
          break_minutes = ?,
          location_name = ?,
          location_id = ?,
          verified = ?,
          source = ?,
          type = ?,
          first_entry = ?,
          last_exit = ?,
          notes = ?,
          updated_at = ?,
          synced_at = ?
        WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
        [
          record.total_minutes,
          record.break_minutes,
          record.location_name,
          record.location_id,
          record.verified,
          record.source,
          record.type || 'work',
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
          location_name, location_id, verified, source, type,
          first_entry, last_exit, notes, created_at, updated_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          record.type || 'work',
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

/**
 * Web data initialization (no-op on native — SQLite is source of truth)
 * On web, daily.web.ts overrides this to load from Supabase into memory cache.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function initWebData(_userId: string): Promise<void> {
  // No-op on native
}

