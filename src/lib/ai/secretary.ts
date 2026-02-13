/**
 * AI Secretary - OnSite Timekeeper (Fase 2: IA Secretário)
 *
 * "Arruma o caderninho" — cleans up daily_hours data after each session
 * and generates structured reports on demand.
 *
 * Two modes:
 * 1. Daily cleanup (auto, after confirmExit) — fixes anomalies in today's record
 * 2. Period report (on demand) — analyzes a date range for export
 *
 * Rules:
 * - Can alter data in SQLite (daily_hours is a "draft")
 * - NEVER touches records with is_manual_edit = 1
 * - Always preserves originals in original_* columns
 * - Logs every correction to ai_corrections table
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import { db } from '../database/core';
import { buildWorkerProfile } from './interpreter';

// ============================================================
// TYPES
// ============================================================

interface DailyRecord {
  id: string;
  date: string;
  location_id: string | null;
  location_name: string | null;
  first_entry: string | null;
  last_exit: string | null;
  total_minutes: number;
  break_minutes: number;
  is_manual_edit: number;
}

interface Correction {
  field: string;
  from: string;
  to: string;
  reason: string;
}

interface DailyCleanupResult {
  mode: 'daily';
  date: string;
  original: { start: string; end: string; total_min: number; break_min: number };
  corrected: { start: string; end: string; total_min: number; break_min: number };
  corrections: Correction[];
  flags: { type: string; message: string }[];
  confidence: number;
}

export interface ReportResult {
  mode: 'report';
  period: { start: string; end: string };
  summary: {
    total_worked_hours: number;
    total_break_hours: number;
    total_days: number;
    avg_per_day: number;
    overtime_hours: number;
    sites: string[];
  };
  daily: {
    date: string;
    location: string;
    start: string;
    end: string;
    worked_hours: number;
    break_min: number;
    status: string;
    was_corrected: boolean;
    correction_note?: string;
  }[];
  flags: { date: string; type: string; message: string }[];
  weekly_totals: { week: string; hours: number; overtime: number }[];
}

// ============================================================
// DAILY CLEANUP (runs after each confirmExit)
// ============================================================

/**
 * Called automatically after confirmExit() saves daily_hours.
 * Sends today's record to IA Secretário for cleanup.
 * If corrections are made, updates SQLite directly.
 */
export async function cleanupDay(userId: string, date: string): Promise<void> {
  try {
    // Read today's record
    const record = db.getFirstSync<DailyRecord>(
      `SELECT id, date, location_id, location_name, first_entry, last_exit,
              total_minutes, break_minutes,
              COALESCE(is_manual_edit, 0) as is_manual_edit
       FROM daily_hours
       WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!record) {
      logger.warn('secretary', `No record found for ${date}`);
      return;
    }

    // Don't touch manually edited records
    if (record.is_manual_edit) {
      logger.info('secretary', `Skipping ${date} — manually edited by worker`);
      return;
    }

    // Get worker profile (reuses buildWorkerProfile from Fase 1)
    const profile = buildWorkerProfile(userId);

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('ai-secretary', {
      body: {
        mode: 'daily',
        daily_hours: [{
          ...record,
          // Map column names for the AI prompt
          start_time: record.first_entry,
          end_time: record.last_exit,
        }],
        profile: {
          ...profile,
          avg_break_min: 30,
        },
      },
    });

    if (error || data?.fallback) {
      logger.warn('secretary', 'AI secretary unavailable, keeping original data');
      return;
    }

    const result = data as DailyCleanupResult;

    // If no corrections, nothing to do
    if (!result.corrections || result.corrections.length === 0) {
      logger.info('secretary', `${date} looks good — no corrections needed`);
      return;
    }

    // Apply corrections to SQLite
    logger.info('secretary', `Applying ${result.corrections.length} corrections to ${date}`);

    db.runSync(
      `UPDATE daily_hours SET
        first_entry = ?,
        last_exit = ?,
        total_minutes = ?,
        break_minutes = ?,
        ai_corrected = 1,
        ai_correction_reason = ?,
        original_first_entry = COALESCE(original_first_entry, first_entry),
        original_last_exit = COALESCE(original_last_exit, last_exit),
        original_total_minutes = COALESCE(original_total_minutes, total_minutes),
        updated_at = datetime('now'),
        synced_at = NULL
       WHERE id = ?`,
      [
        result.corrected.start,
        result.corrected.end,
        result.corrected.total_min,
        result.corrected.break_min,
        result.corrections.map(c => c.reason).join('; '),
        record.id,
      ]
    );

    // Log corrections for transparency
    for (const correction of result.corrections) {
      db.runSync(
        `INSERT INTO ai_corrections (user_id, date, field, original_value, corrected_value, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, date, correction.field, correction.from, correction.to, correction.reason]
      );
    }

    logger.info('secretary', `${date} cleaned up: ${result.corrections.map(c => c.field).join(', ')}`);
  } catch (error) {
    logger.error('secretary', 'Daily cleanup failed', { error: String(error) });
    // Non-critical — original data is preserved
  }
}

// ============================================================
// PERIOD REPORT (on demand)
// ============================================================

/**
 * Called when worker requests a report for a date range.
 * Returns structured report data ready for UI rendering.
 */
export async function generateReport(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ReportResult | null> {
  try {
    const records = db.getAllSync<DailyRecord>(
      `SELECT id, date, location_id, location_name, first_entry, last_exit,
              total_minutes, break_minutes,
              COALESCE(is_manual_edit, 0) as is_manual_edit
       FROM daily_hours
       WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );

    if (records.length === 0) {
      return null;
    }

    const profile = buildWorkerProfile(userId);

    const { data, error } = await supabase.functions.invoke('ai-secretary', {
      body: {
        mode: 'report',
        daily_hours: records.map(r => ({
          ...r,
          start_time: r.first_entry,
          end_time: r.last_exit,
        })),
        profile: {
          ...profile,
          avg_break_min: 30,
        },
      },
    });

    if (error || data?.fallback) {
      logger.warn('secretary', 'AI secretary unavailable, generating basic report');
      return generateBasicReport(records, startDate, endDate);
    }

    return data as ReportResult;
  } catch (error) {
    logger.error('secretary', 'Report generation failed', { error: String(error) });
    return null;
  }
}

/**
 * Fallback report when AI is unavailable — just formats the raw data.
 */
function generateBasicReport(
  records: DailyRecord[],
  startDate: string,
  endDate: string
): ReportResult {
  const totalMin = records.reduce((sum, r) => sum + r.total_minutes, 0);
  const totalBreakMin = records.reduce((sum, r) => sum + r.break_minutes, 0);
  const sites = [...new Set(records.map(r => r.location_name).filter(Boolean))] as string[];

  return {
    mode: 'report',
    period: { start: startDate, end: endDate },
    summary: {
      total_worked_hours: Math.round(totalMin / 60 * 10) / 10,
      total_break_hours: Math.round(totalBreakMin / 60 * 10) / 10,
      total_days: records.length,
      avg_per_day: Math.round(totalMin / records.length / 60 * 10) / 10,
      overtime_hours: 0,
      sites,
    },
    daily: records.map(r => ({
      date: r.date,
      location: r.location_name || 'Unknown',
      start: r.first_entry || '',
      end: r.last_exit || '',
      worked_hours: Math.round(r.total_minutes / 60 * 10) / 10,
      break_min: r.break_minutes,
      status: 'raw',
      was_corrected: false,
    })),
    flags: [],
    weekly_totals: [],
  };
}

// ============================================================
// UNDO CORRECTION (worker reverts AI change)
// ============================================================

/**
 * Worker disagrees with AI correction — revert to original values.
 */
export function undoCorrection(userId: string, date: string): boolean {
  try {
    const record = db.getFirstSync<{
      id: string;
      original_first_entry: string | null;
      original_last_exit: string | null;
      original_total_minutes: number | null;
    }>(
      `SELECT id, original_first_entry, original_last_exit, original_total_minutes
       FROM daily_hours
       WHERE user_id = ? AND date = ? AND ai_corrected = 1 AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!record || !record.original_first_entry) {
      return false;
    }

    db.runSync(
      `UPDATE daily_hours SET
        first_entry = original_first_entry,
        last_exit = original_last_exit,
        total_minutes = original_total_minutes,
        ai_corrected = 0,
        ai_correction_reason = NULL,
        is_manual_edit = 1,
        updated_at = datetime('now'),
        synced_at = NULL
       WHERE id = ?`,
      [record.id]
    );

    logger.info('secretary', `Worker reverted AI correction for ${date}`);
    return true;
  } catch (error) {
    logger.error('secretary', 'Undo correction failed', { error: String(error) });
    return false;
  }
}
