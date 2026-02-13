/**
 * AI Interpreter - OnSite Timekeeper (Fase 1: IA Guardião)
 *
 * GPS event filter: local scoring (free, instant) + AI fallback (ambiguous cases).
 *
 * Flow:
 * 1. Build context (profile, session, device)
 * 2. Run local scoring — resolves ~80% of cases without API cost
 * 3. If definitive → return immediately
 * 4. If ambiguous → call Supabase Edge Function → return AI verdict
 */

import { logger } from '../logger';
import { db, toLocalDateString, getToday } from '../database/core';
import { supabase } from '../supabase';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// ============================================================
// TYPES
// ============================================================

export interface TimekeeperEvent {
  type: 'entry' | 'exit' | 'reconcile_check' | 'reconcile_entry' | 'reconcile_exit';
  timestamp: string;           // ISO
  latitude: number;
  longitude: number;
  accuracy: number;            // meters
  fence_id: string;
  fence_name: string;
  fence_latitude: number;
  fence_longitude: number;
  fence_radius: number;        // meters
  distance_from_center: number; // meters (calculated)
}

export interface DeviceContext {
  battery_level: number | null;      // 0-1
  battery_charging: boolean;
  screen_on: boolean;
  app_state: 'foreground' | 'background' | 'inactive';
  network: 'wifi' | 'cellular' | 'offline';
  os: 'ios' | 'android';
}

export interface SessionContext {
  active_tracking_exists: boolean;
  enter_time: string | null;       // ISO
  pause_seconds: number;
  exits_today: number;             // count of exit events today for this fence
  last_exit_time: string | null;   // ISO
  time_since_last_exit_seconds: number | null;
}

export interface WorkerProfile {
  avg_entry_time: string;      // "07:15" format
  avg_exit_time: string;       // "16:30" format
  avg_shift_hours: number;
  typical_work_days: string[]; // ["mon","tue","wed","thu","fri"]
  sites_visited_avg: number;   // per day
  data_points: number;         // how many days of data we have
}

export interface AIVerdict {
  action: 'confirm_exit' | 'ignore_exit' | 'confirm_entry' | 'ignore_entry' | 'flag_review' | 'estimate_exit_time' | 'wait_more_data';
  confidence: number;
  reason: string;
  estimated_time?: string;
  cooldown_minutes?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================
// CONTEXT BUILDERS
// ============================================================

/**
 * Build worker profile from last 30 days of daily_hours data
 */
export function buildWorkerProfile(userId: string): WorkerProfile {
  const thirtyDaysAgo = toLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  try {
    const rows = db.getAllSync<{
      date: string;
      first_entry: string | null;
      last_exit: string | null;
      total_minutes: number;
      day_of_week: number;
    }>(
      `SELECT
        date,
        first_entry,
        last_exit,
        total_minutes,
        CAST(strftime('%w', date) AS INTEGER) as day_of_week
       FROM daily_hours
       WHERE user_id = ? AND date >= ? AND deleted_at IS NULL
       ORDER BY date DESC`,
      [userId, thirtyDaysAgo]
    );

    if (rows.length === 0) {
      return defaultProfile();
    }

    // Calculate averages from rows that have entry/exit times
    const withEntry = rows.filter(r => r.first_entry);
    const withExit = rows.filter(r => r.last_exit);

    const entryMinutes = withEntry.map(r => {
      const [h, m] = (r.first_entry || '07:00').split(':').map(Number);
      return h * 60 + m;
    });
    const exitMinutes = withExit.map(r => {
      const [h, m] = (r.last_exit || '16:00').split(':').map(Number);
      return h * 60 + m;
    });

    const avgEntryMin = entryMinutes.length > 0
      ? Math.round(entryMinutes.reduce((a, b) => a + b, 0) / entryMinutes.length)
      : 7 * 60;
    const avgExitMin = exitMinutes.length > 0
      ? Math.round(exitMinutes.reduce((a, b) => a + b, 0) / exitMinutes.length)
      : 16 * 60;
    const avgShift = rows.reduce((a, r) => a + r.total_minutes, 0) / rows.length / 60;

    // Find typical work days (worked at least 30% of the time)
    const dayCounts: Record<number, number> = {};
    rows.forEach(r => { dayCounts[r.day_of_week] = (dayCounts[r.day_of_week] || 0) + 1; });
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const typicalDays = Object.entries(dayCounts)
      .filter(([_, count]) => count >= rows.length * 0.3)
      .map(([day]) => dayNames[Number(day)]);

    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    return {
      avg_entry_time: formatTime(avgEntryMin),
      avg_exit_time: formatTime(avgExitMin),
      avg_shift_hours: Math.round(avgShift * 10) / 10,
      typical_work_days: typicalDays.length > 0 ? typicalDays : ['mon', 'tue', 'wed', 'thu', 'fri'],
      sites_visited_avg: 1,
      data_points: rows.length,
    };
  } catch (error) {
    logger.error('ai', 'Failed to build worker profile', { error: String(error) });
    return defaultProfile();
  }
}

function defaultProfile(): WorkerProfile {
  return {
    avg_entry_time: '07:00',
    avg_exit_time: '16:00',
    avg_shift_hours: 8.5,
    typical_work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    sites_visited_avg: 1,
    data_points: 0,
  };
}

/**
 * Get today's exit count for a specific fence from geofence_events table
 */
export function getTodayExitCount(userId: string, fenceId: string): { count: number; lastExitTime: string | null } {
  const today = getToday();

  try {
    const result = db.getFirstSync<{ count: number; last_exit: string | null }>(
      `SELECT COUNT(*) as count, MAX(timestamp) as last_exit
       FROM geofence_events
       WHERE user_id = ? AND location_id = ? AND event_type = 'exit' AND date(timestamp) = ?`,
      [userId, fenceId, today]
    );
    return { count: result?.count || 0, lastExitTime: result?.last_exit || null };
  } catch {
    // Table might not exist yet (pre-migration)
    return { count: 0, lastExitTime: null };
  }
}

/**
 * Build device context (async version — more accurate network info)
 */
export async function buildDeviceContextAsync(): Promise<DeviceContext> {
  let network: 'wifi' | 'cellular' | 'offline' = 'offline';
  try {
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      network = netState.type === 'wifi' ? 'wifi' : 'cellular';
    }
  } catch {
    // NetInfo unavailable
  }

  return {
    battery_level: null,
    battery_charging: false,
    screen_on: AppState.currentState === 'active',
    app_state: AppState.currentState as 'foreground' | 'background' | 'inactive',
    network,
    os: Platform.OS as 'ios' | 'android',
  };
}

// ============================================================
// LOCAL SCORING (runs first, no API cost)
// ============================================================

interface LocalScore {
  score: number;         // 0-1 (0 = definitely noise, 1 = definitely real)
  reason: string;
  skipAI: boolean;       // if true, local score is definitive
}

/**
 * Fast local scoring — resolves ~80% of cases without API call.
 */
export function localScore(
  event: TimekeeperEvent,
  session: SessionContext,
  profile: WorkerProfile,
): LocalScore {
  const hour = new Date(event.timestamp).getHours();
  const minute = new Date(event.timestamp).getMinutes();
  const currentTimeMin = hour * 60 + minute;
  const dayOfWeek = new Date(event.timestamp).getDay();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const isWorkDay = profile.typical_work_days.includes(dayNames[dayOfWeek]);

  // ─── ENTRY SCORING ───
  if (isEntryEvent(event.type)) {
    // Good accuracy + work hours + work day = definitely real
    if (event.accuracy < 50 && hour >= 5 && hour <= 9 && isWorkDay) {
      return { score: 0.95, reason: 'Clean entry during normal work hours', skipAI: true };
    }
    // Entry at night = suspicious
    if (hour >= 22 || hour <= 3) {
      return { score: 0.1, reason: 'Entry at unusual hour (night)', skipAI: false };
    }
    // Decent accuracy, reasonable hours
    if (event.accuracy < 100 && hour >= 5 && hour <= 12) {
      return { score: 0.85, reason: 'Good entry during work hours', skipAI: true };
    }
    // Poor accuracy
    if (event.accuracy > 150) {
      return { score: 0.4, reason: 'Entry with poor GPS accuracy', skipAI: false };
    }
    // Default entry
    return { score: 0.7, reason: 'Entry with moderate confidence', skipAI: false };
  }

  // ─── EXIT SCORING ───
  if (isExitEvent(event.type)) {
    // No active session = nothing to exit from
    if (!session.active_tracking_exists) {
      return { score: 0.0, reason: 'No active session — phantom exit', skipAI: true };
    }

    const sessionDurationHours = session.enter_time
      ? (Date.now() - new Date(session.enter_time).getTime()) / (1000 * 60 * 60)
      : 0;

    // GPS bounce pattern: multiple exits in short time
    if (session.exits_today >= 3 && session.time_since_last_exit_seconds !== null && session.time_since_last_exit_seconds < 1800) {
      return { score: 0.05, reason: `GPS bounce: ${session.exits_today} exits today, last ${Math.round(session.time_since_last_exit_seconds / 60)}min ago`, skipAI: true };
    }

    // Very short session (< 30 min) = suspicious
    if (sessionDurationHours < 0.5) {
      return { score: 0.2, reason: 'Exit after very short session (<30min)', skipAI: false };
    }

    // Clean exit: good accuracy + reasonable duration + afternoon
    if (event.accuracy < 50 && sessionDurationHours >= 6 && hour >= 14 && hour <= 19) {
      return { score: 0.95, reason: 'Clean exit: good GPS, full shift, normal end time', skipAI: true };
    }

    // Good exit: decent accuracy + reasonable hours + decent duration
    if (event.accuracy < 80 && sessionDurationHours >= 4 && hour >= 12 && hour <= 20) {
      return { score: 0.85, reason: 'Good exit with reasonable parameters', skipAI: true };
    }

    // Poor accuracy but long session and late enough
    if (event.accuracy > 100 && sessionDurationHours >= 7 && hour >= 15) {
      return { score: 0.6, reason: 'Poor GPS but session duration and time suggest real exit', skipAI: false };
    }

    // Exit in the middle of expected shift
    const [avgExitH, avgExitM] = profile.avg_exit_time.split(':').map(Number);
    const avgExitMin = avgExitH * 60 + avgExitM;
    const hoursBeforeNormalExit = (avgExitMin - currentTimeMin) / 60;
    if (hoursBeforeNormalExit > 3) {
      return { score: 0.3, reason: `Exit ${Math.round(hoursBeforeNormalExit)}h before normal end time`, skipAI: false };
    }

    // Poor accuracy overall
    if (event.accuracy > 150) {
      return { score: 0.3, reason: 'Exit with very poor GPS accuracy', skipAI: false };
    }

    // Default exit
    return { score: 0.6, reason: 'Exit with moderate confidence', skipAI: false };
  }

  // ─── RECONCILE CHECK ───
  return { score: 0.5, reason: 'Reconcile check — needs AI evaluation', skipAI: false };
}

// ============================================================
// AI API CALL (only for ambiguous cases)
// ============================================================

/**
 * Call AI interpreter via Supabase Edge Function.
 * Only called when localScore returns skipAI: false and score is in the gray zone.
 */
async function callAIInterpreter(
  event: TimekeeperEvent,
  session: SessionContext,
  profile: WorkerProfile,
  device: DeviceContext
): Promise<AIVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-interpreter', {
      body: {
        event,
        session: {
          ...session,
          duration_minutes: session.enter_time
            ? Math.round((Date.now() - new Date(session.enter_time).getTime()) / 60000)
            : null,
          time_since_last_exit_minutes: session.time_since_last_exit_seconds !== null
            ? Math.round(session.time_since_last_exit_seconds / 60)
            : null,
        },
        profile,
        device,
      },
    });

    if (error) {
      logger.error('ai', `Edge Function error: ${error.message}`);
      return fallbackVerdict(event);
    }

    const verdict: AIVerdict = data;
    logger.info('ai', `AI verdict: ${verdict.action} (${verdict.confidence})`, { reason: verdict.reason });
    return verdict;
  } catch (error) {
    logger.error('ai', 'AI interpreter failed, using fallback', { error: String(error) });
    return fallbackVerdict(event);
  }
}

/**
 * Check if event type represents an entry (native or reconcile)
 */
export function isEntryEvent(type: TimekeeperEvent['type']): boolean {
  return type === 'entry' || type === 'reconcile_entry';
}

/**
 * Check if event type represents an exit (native or reconcile)
 */
export function isExitEvent(type: TimekeeperEvent['type']): boolean {
  return type === 'exit' || type === 'reconcile_exit';
}

/**
 * Fallback when AI is unreachable — conservative decisions
 */
function fallbackVerdict(event: TimekeeperEvent): AIVerdict {
  if (isExitEvent(event.type)) {
    return {
      action: 'wait_more_data',
      confidence: 0.3,
      reason: 'AI unreachable — waiting for more data before confirming exit',
      cooldown_minutes: 5,
    };
  }
  if (isEntryEvent(event.type)) {
    return {
      action: 'confirm_entry',
      confidence: 0.6,
      reason: 'AI unreachable — allowing entry (conservative)',
    };
  }
  return {
    action: 'wait_more_data',
    confidence: 0.3,
    reason: 'AI unreachable — holding event',
  };
}

// ============================================================
// MAIN INTERPRETER (combines local + AI)
// ============================================================

/**
 * Main entry point. Call this from locationStore.handleGeofenceEvent
 * before processing any event.
 *
 * Flow:
 * 1. Build context (profile, session, device)
 * 2. Run local scoring (free, instant)
 * 3. If local is definitive → return immediately
 * 4. If ambiguous → call AI API → return verdict
 */
export async function interpretEvent(
  event: TimekeeperEvent,
  userId: string
): Promise<AIVerdict> {
  // 1. Build all context
  const profile = buildWorkerProfile(userId);
  const exitInfo = getTodayExitCount(userId, event.fence_id);
  const device = await buildDeviceContextAsync();

  // Build session context from active_tracking (singleton, no user_id column)
  let session: SessionContext;
  try {
    const active = db.getFirstSync<{
      enter_at: string;
      pause_seconds: number;
    }>('SELECT enter_at, COALESCE(pause_seconds, 0) as pause_seconds FROM active_tracking WHERE id = \'current\'');

    session = {
      active_tracking_exists: !!active,
      enter_time: active?.enter_at || null,
      pause_seconds: active?.pause_seconds || 0,
      exits_today: exitInfo.count,
      last_exit_time: exitInfo.lastExitTime,
      time_since_last_exit_seconds: exitInfo.lastExitTime
        ? (Date.now() - new Date(exitInfo.lastExitTime).getTime()) / 1000
        : null,
    };
  } catch {
    session = {
      active_tracking_exists: false,
      enter_time: null,
      pause_seconds: 0,
      exits_today: 0,
      last_exit_time: null,
      time_since_last_exit_seconds: null,
    };
  }

  // 2. Local scoring
  const local = localScore(event, session, profile);

  logger.info('ai', `Local score: ${local.score.toFixed(2)} (${local.reason})`, { skipAI: local.skipAI });

  // 3. If local is definitive, convert to verdict
  if (local.skipAI) {
    const action = isEntryEvent(event.type)
      ? (local.score > 0.5 ? 'confirm_entry' : 'ignore_entry')
      : (local.score > 0.5 ? 'confirm_exit' : 'ignore_exit');

    return {
      action: action as AIVerdict['action'],
      confidence: local.score,
      reason: `[LOCAL] ${local.reason}`,
    };
  }

  // 4. Gray zone — call AI via Supabase Edge Function (only if online)
  if (device.network === 'offline') {
    logger.warn('ai', 'Offline — using local score as fallback');
    const action = isEntryEvent(event.type)
      ? (local.score > 0.5 ? 'confirm_entry' : 'wait_more_data')
      : (local.score > 0.5 ? 'confirm_exit' : 'wait_more_data');
    return {
      action: action as AIVerdict['action'],
      confidence: local.score,
      reason: `[LOCAL-OFFLINE] ${local.reason}`,
    };
  }

  return callAIInterpreter(event, session, profile, device);
}

// ============================================================
// EVENT LOGGERS
// ============================================================

/**
 * Log a raw geofence event to geofence_events table (for exit frequency tracking).
 * Called BEFORE interpretEvent so we have accurate exit counts.
 */
export function logGeofenceEvent(
  userId: string,
  locationId: string,
  eventType: 'entry' | 'exit',
  accuracy: number | null,
  latitude: number,
  longitude: number,
): void {
  try {
    db.runSync(
      `INSERT INTO geofence_events (user_id, location_id, event_type, timestamp, accuracy, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, locationId, eventType, new Date().toISOString(), accuracy ?? null, latitude, longitude]
    );
  } catch (error) {
    logger.warn('ai', 'Failed to log geofence event', { error: String(error) });
  }
}

/**
 * Log event + verdict for future AI training data.
 */
export function logEventForTraining(
  event: TimekeeperEvent,
  verdict: AIVerdict,
  profile: WorkerProfile,
  device: DeviceContext,
  sessionExitsToday: number,
  sessionDurationMin: number | null,
): void {
  try {
    db.runSync(
      `INSERT INTO ai_event_log (
        timestamp, event_type, accuracy, distance, fence_id,
        session_duration_min, exits_today, battery_level,
        verdict_action, verdict_confidence, verdict_reason,
        worker_avg_shift, worker_data_points, os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.timestamp,
        event.type,
        event.accuracy,
        event.distance_from_center,
        event.fence_id,
        sessionDurationMin,
        sessionExitsToday,
        device.battery_level,
        verdict.action,
        verdict.confidence,
        verdict.reason,
        profile.avg_shift_hours,
        profile.data_points,
        device.os,
      ]
    );
  } catch (error) {
    logger.warn('ai', 'Failed to log event for training', { error: String(error) });
    // Non-critical
  }
}
