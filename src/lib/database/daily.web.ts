/**
 * Daily Hours - OnSite Timekeeper (Web)
 *
 * Supabase-backed in-memory cache for web platform.
 * On web, there's no SQLite — data lives in Supabase,
 * cached in memory for synchronous reads.
 *
 * Flow:
 *  1. syncStore downloads from Supabase → upsertDailyHoursFromSync() → populates cache
 *  2. UI reads via getDailyHours() / getDailyHoursByPeriod() → reads from cache
 *  3. Manual entry → upsertDailyHours() → updates cache + writes to Supabase
 */

import { generateUUID, now, getToday, type DailyHoursDB, type DailyHoursSource, type DailyHoursType } from './core';
import { supabase } from '../supabase';
import { logger } from '../logger';

// ============================================
// TYPES (same as native)
// ============================================

export interface DailyHoursEntry {
  id: string;
  user_id: string;
  date: string;
  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;
  verified: boolean;
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
// IN-MEMORY CACHE
// ============================================

const cache = new Map<string, DailyHoursEntry>();

function cacheKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

// ============================================
// HELPERS (same as native)
// ============================================

export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getDateString(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// SUPABASE → CACHE TRANSFORM
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromSupabase(remote: any): DailyHoursEntry {
  return {
    id: remote.id,
    user_id: remote.user_id,
    date: remote.work_date, // Supabase 'work_date' → local 'date'
    total_minutes: remote.total_minutes || 0,
    break_minutes: remote.break_minutes || 0,
    location_name: remote.location_name,
    location_id: remote.location_id,
    verified: !!remote.verified,
    source: remote.source || 'manual',
    type: remote.type || 'work',
    first_entry: remote.first_entry,
    last_exit: remote.last_exit,
    notes: remote.notes,
    created_at: remote.created_at,
    updated_at: remote.updated_at,
    synced_at: remote.synced_at || now(),
  };
}

function toSupabasePayload(entry: DailyHoursEntry) {
  return {
    id: entry.id,
    user_id: entry.user_id,
    work_date: entry.date, // local 'date' → Supabase 'work_date'
    total_minutes: entry.total_minutes,
    break_minutes: entry.break_minutes,
    location_name: entry.location_name,
    location_id: entry.location_id,
    verified: entry.verified,
    source: entry.source,
    type: entry.type || 'work',
    first_entry: entry.first_entry,
    last_exit: entry.last_exit,
    notes: entry.notes,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    synced_at: now(),
  };
}

// ============================================
// INIT — Load all data from Supabase into cache
// ============================================

export async function initWebData(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('daily_hours')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      logger.error('database', '[daily_hours:web] initWebData failed', { error: error.message });
      return;
    }

    for (const remote of data || []) {
      const entry = fromSupabase(remote);
      cache.set(cacheKey(entry.user_id, entry.date), entry);
    }

    logger.info('database', `[daily_hours:web] Cache loaded: ${cache.size} entries`);
  } catch (error) {
    logger.error('database', '[daily_hours:web] initWebData exception', { error: String(error) });
  }
}

// ============================================
// GET OPERATIONS — read from cache
// ============================================

export function getDailyHours(userId: string, date: string): DailyHoursEntry | null {
  return cache.get(cacheKey(userId, date)) || null;
}

export function getTodayHours(userId: string): DailyHoursEntry | null {
  return getDailyHours(userId, getToday());
}

export function getDailyHoursByPeriod(
  userId: string,
  startDate: string,
  endDate: string
): DailyHoursEntry[] {
  const results: DailyHoursEntry[] = [];
  for (const entry of cache.values()) {
    if (entry.user_id === userId && entry.date >= startDate && entry.date <= endDate) {
      results.push(entry);
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export function getAllDailyHours(userId: string): DailyHoursEntry[] {
  const results: DailyHoursEntry[] = [];
  for (const entry of cache.values()) {
    if (entry.user_id === userId) {
      results.push(entry);
    }
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

export function getUnsyncedDailyHours(_userId: string): DailyHoursEntry[] {
  // On web, writes go directly to Supabase — nothing to upload
  return [];
}

// ============================================
// CREATE / UPDATE OPERATIONS — cache + Supabase
// ============================================

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
    const existing = getDailyHours(userId, date);
    const timestamp = now();

    const entry: DailyHoursEntry = {
      id: existing?.id || generateUUID(),
      user_id: userId,
      date,
      total_minutes: totalMinutes,
      break_minutes: breakMinutes,
      location_name: locationName || existing?.location_name || null,
      location_id: locationId || existing?.location_id || null,
      verified,
      source,
      type,
      first_entry: firstEntry || existing?.first_entry || null,
      last_exit: lastExit || null,
      notes: notes || existing?.notes || null,
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp,
      synced_at: timestamp,
    };

    // Update cache
    cache.set(cacheKey(userId, date), entry);

    // Write to Supabase (background — logs errors to console)
    const payload = toSupabasePayload(entry);
    supabase
      .from('daily_hours')
      .upsert(payload, { onConflict: 'user_id,work_date' })
      .then(({ error }) => {
        if (error) {
          console.error('[OnSite Web] Save failed:', error.message, payload);
          logger.error('database', '[daily_hours:web] Supabase upsert failed', { error: error.message });
        } else {
          console.log('[OnSite Web] Saved to Supabase:', date, totalMinutes, 'min');
        }
      });

    logger.info('database', `[daily_hours:web] UPSERTED ${date}`, { totalMinutes, source, type });
    return entry;
  } catch (error) {
    logger.error('database', '[daily_hours:web] UPSERT error', { error: String(error) });
    return null;
  }
}

export function updateDailyHours(
  userId: string,
  date: string,
  updates: UpdateDailyHoursParams
): DailyHoursEntry | null {
  try {
    const existing = getDailyHours(userId, date);
    if (!existing) {
      logger.warn('database', `[daily_hours:web] UPDATE failed - not found: ${date}`);
      return null;
    }

    const timestamp = now();
    const updated: DailyHoursEntry = {
      ...existing,
      total_minutes: updates.totalMinutes ?? existing.total_minutes,
      break_minutes: updates.breakMinutes ?? existing.break_minutes,
      location_name: updates.locationName !== undefined ? updates.locationName : existing.location_name,
      location_id: updates.locationId !== undefined ? updates.locationId : existing.location_id,
      verified: updates.verified ?? existing.verified,
      source: updates.source ?? existing.source,
      type: updates.type ?? existing.type,
      first_entry: updates.firstEntry !== undefined ? updates.firstEntry : existing.first_entry,
      last_exit: updates.lastExit !== undefined ? updates.lastExit : existing.last_exit,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      updated_at: timestamp,
      synced_at: timestamp,
    };

    cache.set(cacheKey(userId, date), updated);

    // Write to Supabase
    const payload = toSupabasePayload(updated);
    supabase
      .from('daily_hours')
      .upsert(payload, { onConflict: 'user_id,work_date' })
      .then(({ error }) => {
        if (error) {
          console.error('[OnSite Web] Update failed:', error.message);
          logger.error('database', '[daily_hours:web] Supabase update failed', { error: error.message });
        }
      });

    logger.info('database', `[daily_hours:web] UPDATED ${date}`, { fields: Object.keys(updates) });
    return updated;
  } catch (error) {
    logger.error('database', '[daily_hours:web] UPDATE error', { error: String(error) });
    return null;
  }
}

export function addMinutesToDay(
  userId: string,
  date: string,
  minutesToAdd: number,
  lastExit?: string
): DailyHoursEntry | null {
  const existing = getDailyHours(userId, date);

  if (!existing) {
    return upsertDailyHours({
      userId,
      date,
      totalMinutes: minutesToAdd,
      lastExit,
      verified: true,
      source: 'gps',
    });
  }

  return updateDailyHours(userId, date, {
    totalMinutes: existing.total_minutes + minutesToAdd,
    lastExit: lastExit || existing.last_exit || undefined,
  });
}

// ============================================
// DELETE OPERATIONS
// ============================================

export function deleteDailyHours(userId: string, date: string): boolean {
  try {
    cache.delete(cacheKey(userId, date));

    // Delete from Supabase
    supabase
      .from('daily_hours')
      .delete()
      .eq('user_id', userId)
      .eq('work_date', date)
      .then(({ error }) => {
        if (error) {
          logger.error('database', '[daily_hours:web] Supabase delete failed', { error: error.message });
        }
      });

    logger.info('database', `[daily_hours:web] DELETED ${date}`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours:web] DELETE error', { error: String(error) });
    return false;
  }
}

export function deleteDailyHoursById(userId: string, id: string): boolean {
  try {
    // Find and remove from cache
    for (const [key, entry] of cache.entries()) {
      if (entry.id === id && entry.user_id === userId) {
        cache.delete(key);
        break;
      }
    }

    // Delete from Supabase
    supabase
      .from('daily_hours')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          logger.error('database', '[daily_hours:web] Supabase delete by id failed', { error: error.message });
        }
      });

    logger.info('database', `[daily_hours:web] DELETED by id ${id.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('database', '[daily_hours:web] DELETE BY ID error', { error: String(error) });
    return false;
  }
}

export function getDeletedDailyHoursForSync(_userId: string): DailyHoursEntry[] {
  // On web, deletes go directly to Supabase
  return [];
}

export function purgeDeletedDailyHours(_userId: string, _date: string): void {
  // No-op on web
}

// ============================================
// SYNC OPERATIONS — used by syncStore download
// ============================================

export function markDailyHoursSynced(_userId: string, _date: string): void {
  // On web, everything is already synced (data lives in Supabase)
}

/**
 * Called by syncStore when downloading from Supabase.
 * Populates the in-memory cache.
 */
export function upsertDailyHoursFromSync(record: DailyHoursDB): void {
  try {
    const entry: DailyHoursEntry = {
      id: record.id,
      user_id: record.user_id,
      date: record.date,
      total_minutes: record.total_minutes || 0,
      break_minutes: record.break_minutes || 0,
      location_name: record.location_name,
      location_id: record.location_id,
      verified: record.verified === 1 || !!(record.verified as unknown),
      source: record.source || 'manual',
      type: record.type || 'work',
      first_entry: record.first_entry,
      last_exit: record.last_exit,
      notes: record.notes,
      created_at: record.created_at,
      updated_at: record.updated_at,
      synced_at: now(),
    };

    cache.set(cacheKey(entry.user_id, entry.date), entry);
  } catch (error) {
    logger.error('database', '[daily_hours:web] upsertFromSync error', { error: String(error) });
  }
}
