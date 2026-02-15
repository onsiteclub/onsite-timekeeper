/**
 * AI Interpreter - OnSite Timekeeper v4
 *
 * Guardian AI REMOVED — OS geofencing is the sole decision maker.
 * This file only keeps buildWorkerProfile (used by Secretary AI and Voice).
 */

import { logger } from '../logger';
import { db, toLocalDateString } from '../database/core';

// ============================================================
// TYPES
// ============================================================

export interface WorkerProfile {
  avg_entry_time: string;      // "07:15" format
  avg_exit_time: string;       // "16:30" format
  avg_shift_hours: number;
  typical_work_days: string[]; // ["mon","tue","wed","thu","fri"]
  sites_visited_avg: number;   // per day
  data_points: number;         // how many days of data we have
}

// ============================================================
// WORKER PROFILE (used by Secretary AI + Voice)
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
