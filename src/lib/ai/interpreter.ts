/**
 * AI Interpreter - OnSite Timekeeper v4 (Redesign: Bolinha Azul)
 *
 * ROLE CHANGE: Guardian is now a CONSULTANT, not a GATEKEEPER.
 * It classifies events for analytics/logging but NEVER blocks real exits.
 *
 * The blue dot position is validated upstream (geofenceLogic.ts).
 * By the time an event reaches here, it's already confirmed by the blue dot.
 *
 * Flow:
 * 1. Build context (profile, session, device)
 * 2. Run local classification (free, instant) — for analytics only
 * 3. If entry at odd hours → send to AI for flag_review
 * 4. Return verdict — exits ALWAYS confirm, entries may be flagged
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
 * Get today's exit count for a specific fence from geofence_events table.
 * Only counts confirmed events (logged AFTER AI verdict).
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
// LOCAL CLASSIFICATION (v4: consultant, never blocks)
// ============================================================

interface LocalScore {
  score: number;         // 0-1 (0 = suspicious, 1 = clean)
  reason: string;
  skipAI: boolean;       // if true, local classification is sufficient (no API call needed)
}

/**
 * Local classification — classifies events for analytics.
 *
 * v4 CHANGES:
 * - EXIT events are NEVER blocked (skipAI: true + high score = confirm)
 * - GPS bounce detection is removed (blue dot already validated upstream)
 * - Only entries at truly odd hours go to AI for flag_review
 * - "No active session" exits still return score 0 (phantom, safe to ignore)
 */
export function localScore(
  event: TimekeeperEvent,
  session: SessionContext,
  profile: WorkerProfile,
): LocalScore {
  const hour = new Date(event.timestamp).getHours();
  const dayOfWeek = new Date(event.timestamp).getDay();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const isWorkDay = profile.typical_work_days.includes(dayNames[dayOfWeek]);

  // ─── ENTRY SCORING ───
  if (isEntryEvent(event.type)) {
    // Entry at night = suspicious, send to AI
    if (hour >= 22 || hour <= 3) {
      return { score: 0.1, reason: 'Entry at unusual hour (night)', skipAI: false };
    }
    // Work hours + work day = definitely real
    if (hour >= 5 && hour <= 12 && isWorkDay) {
      return { score: 0.95, reason: 'Clean entry during work hours', skipAI: true };
    }
    // Reasonable hours
    if (hour >= 5 && hour <= 20) {
      return { score: 0.85, reason: 'Entry during reasonable hours', skipAI: true };
    }
    // Default entry
    return { score: 0.7, reason: 'Entry with moderate confidence', skipAI: false };
  }

  // ─── EXIT SCORING (v4: NEVER blocks, only classifies) ───
  if (isExitEvent(event.type)) {
    // No active session = nothing to exit from (safe to ignore — no data loss)
    if (!session.active_tracking_exists) {
      return { score: 0.0, reason: 'No active session — phantom exit', skipAI: true };
    }

    const sessionDurationHours = session.enter_time
      ? (Date.now() - new Date(session.enter_time).getTime()) / (1000 * 60 * 60)
      : 0;

    // Short session flag (classify only, still confirm)
    if (sessionDurationHours < 0.5) {
      return { score: 0.7, reason: `Short session exit (${Math.round(sessionDurationHours * 60)}min) — confirming (blue dot verified)`, skipAI: true };
    }

    // Normal exit
    if (sessionDurationHours >= 4) {
      return { score: 0.95, reason: `Clean exit after ${sessionDurationHours.toFixed(1)}h session`, skipAI: true };
    }

    // Default exit — always confirm (blue dot already validated upstream)
    return { score: 0.85, reason: `Exit after ${sessionDurationHours.toFixed(1)}h — confirmed (blue dot verified)`, skipAI: true };
  }

  // ─── RECONCILE CHECK ───
  // Reconcile events are safety nets — always confirm
  return { score: 0.85, reason: 'Reconcile event — confirming', skipAI: true };
}

// ============================================================
// AI API CALL (only for suspicious entries)
// ============================================================

/**
 * Call AI interpreter via Supabase Edge Function.
 * v4: Only called for entries at odd hours. Exits never reach here.
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
      console.log(`[AI-GUARDIAN] ❌ Edge Function error: ${error.message}`);
      logger.error('ai', `Edge Function error: ${error.message}`);
      return fallbackVerdict(event);
    }

    const verdict: AIVerdict = data;
    console.log(`[AI-GUARDIAN] 🤖 AI verdict: ${verdict.action} (confidence=${verdict.confidence}) | ${verdict.reason}`);
    logger.info('ai', `AI verdict: ${verdict.action} (${verdict.confidence})`, { reason: verdict.reason });
    return verdict;
  } catch (error) {
    console.log(`[AI-GUARDIAN] ❌ AI interpreter failed: ${String(error)}`);
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
 * Fallback when AI is unreachable.
 * v4: ALWAYS confirm. The blue dot was already validated upstream.
 */
function fallbackVerdict(event: TimekeeperEvent): AIVerdict {
  if (isExitEvent(event.type)) {
    return {
      action: 'confirm_exit',
      confidence: 0.8,
      reason: 'AI unreachable — confirming exit (blue dot verified upstream)',
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
    action: 'confirm_entry',
    confidence: 0.5,
    reason: 'AI unreachable — confirming event',
  };
}

// ============================================================
// MAIN INTERPRETER (v4: consultant, never blocks)
// ============================================================

/**
 * Main entry point. Called by locationStore.processEventWithAI.
 *
 * v4 CHANGES:
 * - Exits ALWAYS return confirm_exit (blue dot already validated)
 * - Only suspicious entries (night hours) go to AI
 * - No more ignore_exit or wait_more_data for exits
 */
export async function interpretEvent(
  event: TimekeeperEvent,
  userId: string
): Promise<AIVerdict> {
  console.log(`[AI-GUARDIAN] 🛡️ interpretEvent called: type=${event.type}, fence=${event.fence_name}, accuracy=${event.accuracy?.toFixed(0)}m, dist=${event.distance_from_center?.toFixed(0)}m`);

  // 1. Build context
  const profile = buildWorkerProfile(userId);
  const exitInfo = getTodayExitCount(userId, event.fence_id);
  const device = await buildDeviceContextAsync();

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

  // 2. Local classification
  const local = localScore(event, session, profile);

  console.log(`[AI-GUARDIAN] 🧮 Local: score=${local.score.toFixed(2)} | skipAI=${local.skipAI} | ${local.reason}`);
  logger.info('ai', `Local: ${local.score.toFixed(2)} (${local.reason})`, { skipAI: local.skipAI });

  // 3. If local is sufficient, return verdict
  if (local.skipAI) {
    const action = isEntryEvent(event.type)
      ? (local.score > 0.5 ? 'confirm_entry' : 'ignore_entry')
      : (local.score > 0.5 ? 'confirm_exit' : 'ignore_exit');

    console.log(`[AI-GUARDIAN] ✅ LOCAL verdict: ${action} (confidence=${local.score.toFixed(2)})`);
    return {
      action: action as AIVerdict['action'],
      confidence: local.score,
      reason: `[LOCAL] ${local.reason}`,
    };
  }

  // 4. Gray zone — call AI (only for suspicious entries, never for exits)
  if (device.network === 'offline') {
    console.log(`[AI-GUARDIAN] 📴 OFFLINE — using fallback`);
    logger.warn('ai', 'Offline — using fallback');
    return fallbackVerdict(event);
  }

  console.log(`[AI-GUARDIAN] 🌐 Gray zone (score=${local.score.toFixed(2)}) — calling AI...`);
  return callAIInterpreter(event, session, profile, device);
}

// ============================================================
// EVENT LOGGERS
// ============================================================

/**
 * Log a confirmed geofence event to geofence_events table.
 * v4: Called AFTER AI verdict (only confirmed events are logged).
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
  }
}
