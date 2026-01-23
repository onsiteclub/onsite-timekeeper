/**
 * Database - Records (Work Sessions)
 * 
 * CRUD for records and sync functions
 */

import { logger } from '../logger';
import {
  db,
  generateUUID,
  now,
  calculateDuration,
  type RecordDB,
  type RecordType,
  type ComputedSession,
  type DayStats,
} from './core';
import { getLocationById } from './locations';
import { trackMetric, trackSessionMinutes } from './analytics';

// ============================================
// TYPES
// ============================================

export interface CreateRecordParams {
  userId: string;
  locationId: string;
  locationName: string;
  type?: RecordType;
  color?: string;
}

// ============================================
// CRUD
// ============================================

export async function createEntryRecord(params: CreateRecordParams): Promise<string> {
  const id = generateUUID();
  const timestamp = now();

  try {
    logger.info('database', `[DB:records] INSERT ENTRY - location: ${params.locationName}, type: ${params.type || 'automatic'}`);

    // Get location color if not provided
    let color = params.color;
    if (!color) {
      const location = await getLocationById(params.locationId);
      color = location?.color || '#3B82F6';
    }

    db.runSync(
      `INSERT INTO records (id, user_id, location_id, location_name, entry_at, type, color, pause_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        params.userId,
        params.locationId,
        params.locationName,
        timestamp,
        params.type || 'automatic',
        color,
        timestamp
      ]
    );

    // Track analytics
    try {
      const isManual = params.type === 'manual';
      if (isManual) {
        await trackMetric(params.userId, 'manual_entries');
      } else {
        await trackMetric(params.userId, 'auto_entries');
      }
    } catch (e) {
      // Ignore tracking errors
    }

    logger.info('database', `[DB:records] INSERT ENTRY OK - id: ${id}, location: ${params.locationName}`);
    return id;
  } catch (error) {
    logger.error('database', 'Error creating record', { error: String(error) });
    throw error;
  }
}

export async function registerExit(
  userId: string,
  locationId: string,
  adjustmentMinutes: number = 0
): Promise<void> {
  try {
    logger.info('database', `[DB:records] UPDATE EXIT - locationId: ${locationId.substring(0, 8)}..., adjustment: ${adjustmentMinutes}min`);

    // Find active session for this location
    const session = db.getFirstSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND location_id = ? AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1`,
      [userId, locationId]
    );

    if (!session) {
      logger.warn('database', `[DB:records] UPDATE EXIT - NO ACTIVE SESSION for locationId: ${locationId.substring(0, 8)}...`);
      throw new Error('No active session found for this location');
    }

    // Calculate exit with adjustment
    let exitTime = new Date();
    if (adjustmentMinutes > 0) {
      exitTime = new Date(exitTime.getTime() - adjustmentMinutes * 60000);
    }

    db.runSync(
      `UPDATE records SET exit_at = ?, synced_at = NULL WHERE id = ?`,
      [exitTime.toISOString(), session.id]
    );

    // Track session minutes
    try {
      const duration = calculateDuration(session.entry_at, exitTime.toISOString());
      const pauseMin = session.pause_minutes || 0;
      const netMinutes = Math.max(0, duration - pauseMin);
      await trackSessionMinutes(userId, netMinutes, session.type === 'manual');
    } catch (e) {
      // Ignore tracking errors
    }

    logger.info('database', `[DB:records] UPDATE EXIT OK - id: ${session.id}, location: ${session.location_name}`);
  } catch (error) {
    logger.error('database', 'Error registering exit', { error: String(error) });
    throw error;
  }
}

export async function getOpenSession(userId: string, locationId: string): Promise<RecordDB | null> {
  try {
    return db.getFirstSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND location_id = ? AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1`,
      [userId, locationId]
    );
  } catch (error) {
    logger.error('database', 'Error fetching open session', { error: String(error) });
    return null;
  }
}

export async function getGlobalActiveSession(userId: string): Promise<ComputedSession | null> {
  try {
    const session = db.getFirstSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND exit_at IS NULL ORDER BY entry_at DESC LIMIT 1`,
      [userId]
    );

    if (!session) return null;

    return {
      ...session,
      status: 'active',
      duration_minutes: calculateDuration(session.entry_at, null),
    };
  } catch (error) {
    logger.error('database', 'Error fetching global active session', { error: String(error) });
    return null;
  }
}

export async function getTodaySessions(userId: string): Promise<ComputedSession[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    logger.info('database', `[DB:records] SELECT TODAY - userId: ${userId.substring(0, 8)}...`);
    const sessions = db.getAllSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND entry_at >= ? AND entry_at < ? ORDER BY entry_at DESC`,
      [userId, today.toISOString(), tomorrow.toISOString()]
    );
    logger.info('database', `[DB:records] SELECT TODAY OK - count: ${sessions.length}`);

    return sessions.map(s => ({
      ...s,
      status: s.exit_at ? 'finished' : 'active',
      duration_minutes: calculateDuration(s.entry_at, s.exit_at),
    })) as ComputedSession[];
  } catch (error) {
    logger.error('database', '[DB:records] SELECT TODAY ERROR', { error: String(error) });
    return [];
  }
}

export async function getSessionsByPeriod(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ComputedSession[]> {
  try {
    const sessions = db.getAllSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND entry_at >= ? AND entry_at <= ? ORDER BY entry_at ASC`,
      [userId, startDate, endDate]
    );

    return sessions.map(s => ({
      ...s,
      status: s.exit_at ? 'finished' : 'active',
      duration_minutes: calculateDuration(s.entry_at, s.exit_at),
    })) as ComputedSession[];
  } catch (error) {
    logger.error('database', 'Error fetching sessions by period', { error: String(error) });
    return [];
  }
}

export async function getTodayStats(userId: string): Promise<DayStats> {
  try {
    const sessions = await getTodaySessions(userId);
    const finished = sessions.filter(s => s.exit_at);
    
    // Calculate total considering pauses
    let totalMinutes = 0;
    for (const s of finished) {
      const duration = calculateDuration(s.entry_at, s.exit_at);
      const pause = s.pause_minutes || 0;
      totalMinutes += Math.max(0, duration - pause);
    }

    return {
      total_minutes: totalMinutes,
      total_sessions: finished.length,
    };
  } catch (error) {
    logger.error('database', 'Error calculating stats', { error: String(error) });
    return { total_minutes: 0, total_sessions: 0 };
  }
}

// ============================================
// SYNC
// ============================================

export async function getRecordsForSync(userId: string): Promise<RecordDB[]> {
  try {
    return db.getAllSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND synced_at IS NULL`,
      [userId]
    );
  } catch (error) {
    logger.error('database', 'Error fetching records for sync', { error: String(error) });
    return [];
  }
}

export async function markRecordSynced(id: string): Promise<void> {
  try {
    db.runSync(
      `UPDATE records SET synced_at = ? WHERE id = ?`,
      [now(), id]
    );
  } catch (error) {
    logger.error('database', 'Error marking record synced', { error: String(error) });
  }
}

/**
 * Upsert record from Supabase
 */
export async function upsertRecordFromSync(record: RecordDB): Promise<void> {
  try {
    const existing = db.getFirstSync<RecordDB>(
      `SELECT * FROM records WHERE id = ?`,
      [record.id]
    );

    if (existing) {
      // Update if changed
      db.runSync(
        `UPDATE records SET exit_at = ?, manually_edited = ?, edit_reason = ?, pause_minutes = ?, synced_at = ? WHERE id = ?`,
        [record.exit_at, record.manually_edited, record.edit_reason, record.pause_minutes || 0, now(), record.id]
      );
    } else {
      db.runSync(
        `INSERT INTO records (id, user_id, location_id, location_name, entry_at, exit_at, type, 
         manually_edited, edit_reason, color, device_id, pause_minutes, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.id, record.user_id, record.location_id, record.location_name, record.entry_at,
         record.exit_at, record.type, record.manually_edited, record.edit_reason,
         record.color, record.device_id, record.pause_minutes || 0, record.created_at, now()]
      );
    }
  } catch (error) {
    logger.error('database', 'Error in record upsert', { error: String(error) });
  }
}

// ============================================
// SESSION MERGE SYSTEM (NEW)
// ============================================

/**
 * Get last session for a specific location
 */
export async function getLastSessionForLocation(userId: string, locationId: string): Promise<RecordDB | null> {
  try {
    return db.getFirstSync<RecordDB>(
      `SELECT * FROM records WHERE user_id = ? AND location_id = ? ORDER BY entry_at DESC LIMIT 1`,
      [userId, locationId]
    );
  } catch (error) {
    logger.error('database', 'Error fetching last session for location', { error: String(error) });
    return null;
  }
}

/**
 * Add break minutes to a session
 */
export async function addBreakMinutes(sessionId: string, minutes: number): Promise<void> {
  try {
    const session = db.getFirstSync<{ pause_minutes: number | null }>(
      `SELECT pause_minutes FROM records WHERE id = ?`,
      [sessionId]
    );

    if (!session) {
      throw new Error('Session not found');
    }

    const currentBreak = session.pause_minutes || 0;
    const newBreak = currentBreak + Math.round(minutes);

    db.runSync(
      `UPDATE records SET pause_minutes = ?, synced_at = NULL WHERE id = ?`,
      [newBreak, sessionId]
    );

    logger.info('database', `🔄 Break added: ${minutes} min (total: ${newBreak} min)`, { sessionId });
  } catch (error) {
    logger.error('database', 'Error adding break minutes', { error: String(error) });
    throw error;
  }
}

/**
 * Reopen last session (remove exit_at)
 */
export async function reopenLastSession(userId: string, locationId: string): Promise<boolean> {
  try {
    const lastSession = await getLastSessionForLocation(userId, locationId);
    
    if (!lastSession || !lastSession.exit_at) {
      logger.warn('database', 'No session to reopen or already active', { locationId });
      return false;
    }

    db.runSync(
      `UPDATE records SET exit_at = NULL, synced_at = NULL WHERE id = ?`,
      [lastSession.id]
    );

    logger.info('database', `🔄 Session reopened: ${lastSession.location_name}`, { id: lastSession.id });
    return true;
  } catch (error) {
    logger.error('database', 'Error reopening session', { error: String(error) });
    return false;
  }
}

/**
 * Handle session merge logic
 * Returns 'merged', 'new_session', or 'already_active'
 */
export async function handleSessionMerge(
  userId: string,
  locationId: string,
  locationName: string
): Promise<'merged' | 'new_session' | 'already_active'> {
  try {
    logger.info('database', `[DB:records] SESSION MERGE CHECK - location: ${locationName}`);
    const lastSession = await getLastSessionForLocation(userId, locationId);

    if (!lastSession) {
      logger.info('database', `[DB:records] SESSION MERGE - no previous session, will create new`);
      return 'new_session';
    }

    // If session is still active (no exit), ignore
    if (!lastSession.exit_at) {
      logger.info('database', `[DB:records] SESSION MERGE - already active, ignoring`);
      return 'already_active';
    }

    // Calculate gap in minutes
    const now = new Date();
    const exitTime = new Date(lastSession.exit_at);
    const gapMinutes = (now.getTime() - exitTime.getTime()) / 60000;

    // MERGE RULE: < 15 minutes = merge
    if (gapMinutes < 15) {
      await reopenLastSession(userId, locationId);

      // Add break time if gap > 1 minute
      if (gapMinutes > 1) {
        await addBreakMinutes(lastSession.id, gapMinutes);
        logger.info('database', `[DB:records] SESSION MERGE OK - merged with break: ${gapMinutes.toFixed(1)} min`, {
          locationName,
          gapMinutes: gapMinutes.toFixed(1)
        });
      } else {
        logger.info('database', `[DB:records] SESSION MERGE OK - merged (no break): ${gapMinutes.toFixed(1)} min`, {
          locationName,
          gapMinutes: gapMinutes.toFixed(1)
        });
      }

      return 'merged';
    }

    // Gap >= 15 minutes = new session
    logger.info('database', `[DB:records] SESSION MERGE - gap too large: ${gapMinutes.toFixed(1)} min, will create new`, {
      locationName
    });
    return 'new_session';
    
  } catch (error) {
    logger.error('database', 'Error in session merge logic', { error: String(error) });
    return 'new_session'; // Fallback to new session
  }
}
