/**
 * AI Voice - OnSite Timekeeper (Fase 3: IA Voz)
 *
 * Voice = highest priority data source. Overrides GPS, AI Secretary, everything.
 * Worker speaks → AI interprets → app executes. No confirmation, no friction.
 *
 * Hierarchy:
 * 1. VOICE (is_voice_edit=1, is_manual_edit=1)
 * 2. Manual UI edit (is_manual_edit=1)
 * 3. AI Secretary (ai_corrected=1)
 * 4. AI Guardian (real-time filter)
 * 5. Raw GPS
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import { db, toLocalDateString } from '../database/core';
import { getDailyHours, upsertDailyHours } from '../database/daily';
import { buildWorkerProfile } from './interpreter';
import { useLocationStore } from '../../stores/locationStore';

// ============================================================
// TYPES
// ============================================================

export interface VoiceAction {
  action: 'start' | 'update_record' | 'delete_record' | 'pause' | 'resume' | 'stop' | 'send_report' | 'generate_report' | 'query' | 'navigate' | 'cannot_do' | 'clarify';
  site_name?: string;
  date?: string;
  changes?: {
    first_entry?: string;
    last_exit?: string;
    break_minutes?: number;
    total_minutes?: number;
  };
  period?: { start: string; end: string };
  format?: string;
  destination?: 'email' | 'boss' | 'whatsapp';
  query_type?: string;
  filters?: {
    site_name?: string;
    start_date?: string;
    end_date?: string;
  };
  screen?: string;
  params?: Record<string, unknown>;
  reason?: string;
  response_text: string;
}

export interface VoiceAppState {
  now: string;
  has_active_session: boolean;
  current_site: string | null;
  timer: string | null;
  is_paused: boolean;
  available_sites?: { id: string; name: string }[];
}

export interface VoiceResult {
  responseText: string;
  actionExecuted: string;
  action?: VoiceAction;
}

// ============================================================
// VOICE COMMAND PROCESSOR
// ============================================================

/**
 * Main entry point for voice commands.
 * 1. Gets transcript (passed from UI component)
 * 2. Builds app context
 * 3. Sends to Edge Function
 * 4. Executes returned action
 * 5. Returns response text for UI feedback
 */
export async function processVoiceCommand(
  transcript: string,
  userId: string,
  appState: VoiceAppState
): Promise<VoiceResult> {
  try {
    // Build context
    const profile = buildWorkerProfile(userId);

    // Get last 7 days
    const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const recentDays = db.getAllSync(
      `SELECT date, location_name, first_entry, last_exit, total_minutes, break_minutes,
              COALESCE(is_manual_edit, 0) as is_manual_edit,
              COALESCE(ai_corrected, 0) as ai_corrected
       FROM daily_hours
       WHERE user_id = ? AND date >= ? AND deleted_at IS NULL
       ORDER BY date DESC`,
      [userId, sevenDaysAgo]
    );

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('ai-voice', {
      body: {
        transcript,
        app_state: appState,
        recent_days: recentDays,
        profile,
      },
    });

    if (error) {
      logger.error('voice', 'Edge function error', { error: error.message });
      return { responseText: 'Problema de conexao. Tenta de novo.', actionExecuted: 'error' };
    }

    const action = data as VoiceAction;

    // Log full AI response for debugging
    logger.info('voice', `AI response: ${action.action}`, {
      date: action.date,
      changes: action.changes ? JSON.stringify(action.changes) : undefined,
      period: action.period ? JSON.stringify(action.period) : undefined,
      screen: action.screen,
    });

    // Execute the action
    await executeVoiceAction(action, userId);

    return {
      responseText: action.response_text,
      actionExecuted: action.action,
      action,
    };
  } catch (error) {
    logger.error('voice', 'Voice command failed', { error: String(error) });
    return { responseText: 'Algo deu errado. Tenta de novo.', actionExecuted: 'error' };
  }
}

// ============================================================
// ACTION EXECUTOR
// ============================================================

async function executeVoiceAction(
  action: VoiceAction,
  userId: string,
): Promise<void> {
  switch (action.action) {
    case 'update_record': {
      if (!action.date || !action.changes) {
        logger.warn('voice', `update_record: missing date or changes`, { date: action.date, changes: action.changes });
        break;
      }

      const existing = getDailyHours(userId, action.date);

      // Resolve each field: AI value > existing value > fallback
      const firstEntry = action.changes.first_entry || existing?.first_entry || undefined;
      const lastExit = action.changes.last_exit || existing?.last_exit || undefined;
      const breakMin = action.changes.break_minutes ?? existing?.break_minutes ?? 0;

      // Calculate total_minutes: use AI value, or recalculate from times, or keep existing
      let totalMinutes = action.changes.total_minutes || 0;

      if (!totalMinutes && firstEntry && lastExit) {
        const [sh, sm] = firstEntry.split(':').map(Number);
        const [eh, em] = lastExit.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          totalMinutes = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
          if (totalMinutes < 0) totalMinutes = 0;
        }
      }

      if (!totalMinutes) {
        totalMinutes = existing?.total_minutes || 0;
      }

      logger.info('voice', `update_record: writing ${action.date}`, {
        firstEntry, lastExit, breakMin, totalMinutes,
        hadExisting: !!existing,
      });

      // Use upsertDailyHours — creates record if it doesn't exist, updates if it does
      const result = upsertDailyHours({
        userId,
        date: action.date,
        totalMinutes,
        breakMinutes: breakMin,
        locationName: existing?.location_name || undefined,
        locationId: existing?.location_id || undefined,
        verified: true,
        source: 'manual',
        firstEntry,
        lastExit,
      });

      if (!result) {
        logger.error('voice', `update_record: upsert FAILED for ${action.date}`);
        break;
      }

      // Mark as voice edit (highest priority)
      try {
        db.runSync(
          `UPDATE daily_hours SET is_manual_edit = 1, is_voice_edit = 1, synced_at = NULL
           WHERE user_id = ? AND date = ?`,
          [userId, action.date]
        );
      } catch (e) {
        logger.error('voice', `update_record: marking voice edit failed`, { error: String(e) });
      }

      logger.info('voice', `update_record: SUCCESS ${action.date} → ${totalMinutes}min`);
      break;
    }

    case 'delete_record': {
      if (!action.date) {
        logger.warn('voice', `delete_record: missing date`);
        break;
      }
      const existingForDelete = getDailyHours(userId, action.date);
      if (!existingForDelete) {
        logger.warn('voice', `delete_record: no record found for ${action.date}`);
        break;
      }
      db.runSync(
        `UPDATE daily_hours SET deleted_at = datetime('now'), updated_at = datetime('now'), synced_at = NULL WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
        [userId, action.date]
      );
      logger.info('voice', `delete_record: SUCCESS soft-deleted ${action.date}`);
      break;
    }

    case 'start': {
      const locations = useLocationStore.getState().locations;
      const target = action.site_name
        ? locations.find(l => l.name.toLowerCase().includes(action.site_name!.toLowerCase()))
        : locations[0];

      if (!target) {
        logger.warn('voice', 'start: no matching location');
        break;
      }

      try {
        await useLocationStore.getState().handleManualEntry(target.id);
        logger.info('voice', `start: SUCCESS at ${target.name}`);
      } catch (e) {
        logger.error('voice', `start: failed`, { error: String(e) });
      }
      break;
    }

    case 'pause':
    case 'resume':
    case 'stop': {
      // UI component executes session control via handlePause/handleResume/handleStop
      logger.info('voice', `Session control: ${action.action}`);
      break;
    }

    case 'send_report': {
      // UI component handles report generation and sharing
      logger.info('voice', `Send report: ${action.period?.start} to ${action.period?.end} -> ${action.destination}`);
      break;
    }

    case 'generate_report': {
      // UI component handles report generation (open in app)
      logger.info('voice', `Generate report: ${action.period?.start} to ${action.period?.end}`);
      break;
    }

    case 'query': {
      // Read-only — response_text already has the answer
      logger.info('voice', `Query: ${action.query_type}`);
      break;
    }

    case 'navigate': {
      // UI component handles navigation
      logger.info('voice', `Navigate to: ${action.screen}`);
      break;
    }

    case 'cannot_do': {
      // Just show the response_text explaining the limitation
      logger.info('voice', `Cannot do: ${action.reason}`);
      break;
    }

    case 'clarify': {
      // Nothing to execute — just show response_text
      break;
    }
  }
}
