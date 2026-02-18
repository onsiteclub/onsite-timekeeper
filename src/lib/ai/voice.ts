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
import { toLocalDateString } from '../database/core';
import { getDailyHours, getDailyHoursByPeriod, upsertDailyHours, updateDailyHours, deleteDailyHours } from '../database/daily';
import { buildWorkerProfile } from './interpreter';
import { useLocationStore } from '../../stores/locationStore';
import { buscarEnderecoAutocomplete } from '../geocoding';

// ============================================================
// TYPES
// ============================================================

export interface VoiceAction {
  action: 'start' | 'update_record' | 'delete_record' | 'pause' | 'resume' | 'stop' | 'send_report' | 'generate_report' | 'query' | 'navigate' | 'create_location' | 'cannot_do' | 'clarify';
  site_name?: string;
  date?: string;
  address?: string;
  radius?: number;
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
  today_date: string;        // YYYY-MM-DD local date (canonical reference for AI)
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
    const recentEntries = getDailyHoursByPeriod(userId, sevenDaysAgo, toLocalDateString(new Date()));
    const recentDays = recentEntries.map(e => ({
      date: e.date,
      location_name: e.location_name,
      first_entry: e.first_entry,
      last_exit: e.last_exit,
      total_minutes: e.total_minutes,
      break_minutes: e.break_minutes,
      is_manual_edit: e.source === 'manual' || e.source === 'edited' ? 1 : 0,
      ai_corrected: 0,
    }));

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
      // Extract HTTP status and response body for debugging
      let statusCode = 'unknown';
      let responseBody = '';
      try {
        if (error.context instanceof Response) {
          statusCode = String(error.context.status);
          responseBody = await error.context.text();
        }
      } catch {
        // ignore
      }
      logger.error('voice', `Edge function error (HTTP ${statusCode})`, {
        error: error.message,
        status: statusCode,
        body: responseBody || 'no body',
      });
      console.log(`[VOICE] Edge function error: HTTP ${statusCode}, body: ${responseBody}, msg: ${error.message}`);
      return { responseText: 'Problema de conexao. Tenta de novo.', actionExecuted: 'error' };
    }

    const action = data as VoiceAction;

    // Log full AI response for debugging (console + logger for visibility)
    console.log('[VOICE] AI response:', JSON.stringify(action, null, 2));
    logger.info('voice', `AI response: ${action.action}`, {
      date: action.date,
      changes: action.changes ? JSON.stringify(action.changes) : undefined,
      period: action.period ? JSON.stringify(action.period) : undefined,
      screen: action.screen,
      reason: action.reason,
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
        console.log('[VOICE] update_record SKIPPED: missing date or changes', { date: action.date, changes: action.changes });
        logger.warn('voice', `update_record: missing date or changes`, { date: action.date, changes: action.changes });
        break;
      }

      console.log(`[VOICE] update_record: target date = ${action.date}, changes =`, action.changes);
      const existing = getDailyHours(userId, action.date);
      console.log(`[VOICE] update_record: existing record for ${action.date}:`, existing ? 'FOUND' : 'NULL (will create new)');

      // Resolve each field: AI value > existing value > fallback
      const firstEntry = action.changes.first_entry || existing?.first_entry || undefined;
      const lastExit = action.changes.last_exit || existing?.last_exit || undefined;
      const breakMin = action.changes.break_minutes ?? existing?.break_minutes ?? 0;

      // Calculate total_minutes — ALWAYS recalculate from times when available
      // AI sometimes returns a string description instead of a number (e.g. "existing total recalculated...")
      let totalMinutes = 0;

      // Try to recalculate from entry/exit times (most reliable)
      if (firstEntry && lastExit) {
        const [sh, sm] = firstEntry.split(':').map(Number);
        const [eh, em] = lastExit.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          totalMinutes = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
          if (totalMinutes < 0) totalMinutes = 0;
        }
      }

      // Fallback: use AI value ONLY if it's a valid number
      if (!totalMinutes && action.changes.total_minutes != null) {
        const aiValue = Number(action.changes.total_minutes);
        if (!isNaN(aiValue) && aiValue > 0) {
          totalMinutes = Math.round(aiValue);
        } else {
          console.log(`[VOICE] update_record: AI returned invalid total_minutes: "${action.changes.total_minutes}" — recalculating`);
          logger.warn('voice', `update_record: AI returned non-numeric total_minutes`, { value: String(action.changes.total_minutes) });
        }
      }

      // Last fallback: keep existing value
      if (!totalMinutes) {
        totalMinutes = existing?.total_minutes || 0;
      }

      logger.info('voice', `update_record: writing ${action.date}`, {
        firstEntry, lastExit, breakMin, totalMinutes,
        hadExisting: !!existing,
      });

      // Resolve location: existing record > first available location
      let locationName = existing?.location_name || undefined;
      let locationId = existing?.location_id || undefined;
      if (!locationName) {
        const locations = useLocationStore.getState().locations;
        if (locations.length > 0) {
          locationName = locations[0].name;
          locationId = locations[0].id;
        }
      }

      // Use upsertDailyHours — creates record if it doesn't exist, updates if it does
      const result = upsertDailyHours({
        userId,
        date: action.date,
        totalMinutes,
        breakMinutes: breakMin,
        locationName,
        locationId,
        verified: true,
        source: 'manual',
        firstEntry,
        lastExit,
      });

      if (!result) {
        console.log(`[VOICE] update_record: upsert FAILED for ${action.date}`);
        logger.error('voice', `update_record: upsert FAILED for ${action.date}`);
        break;
      }

      // Mark as voice edit (highest priority) — upsert above already sets source:'manual'
      try {
        updateDailyHours(userId, action.date, { source: 'manual' });
      } catch (e) {
        console.log(`[VOICE] update_record: marking voice edit failed:`, String(e));
        logger.error('voice', `update_record: marking voice edit failed`, { error: String(e) });
      }

      console.log(`[VOICE] update_record: SUCCESS ${action.date} → ${totalMinutes}min (entry=${firstEntry}, exit=${lastExit})`);
      logger.info('voice', `update_record: SUCCESS ${action.date} → ${totalMinutes}min`);
      break;
    }

    case 'delete_record': {
      if (!action.date) {
        console.log('[VOICE] delete_record SKIPPED: missing date');
        logger.warn('voice', `delete_record: missing date`);
        break;
      }
      console.log(`[VOICE] delete_record: target date = ${action.date}`);
      const existingForDelete = getDailyHours(userId, action.date);
      if (!existingForDelete) {
        console.log(`[VOICE] delete_record: NO RECORD found for ${action.date} — nothing to delete`);
        logger.warn('voice', `delete_record: no record found for ${action.date}`);
        break;
      }
      console.log(`[VOICE] delete_record: found record for ${action.date}, deleting...`);
      deleteDailyHours(userId, action.date);
      console.log(`[VOICE] delete_record: SUCCESS deleted ${action.date}`);
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

    case 'create_location': {
      if (!action.address) {
        logger.warn('voice', 'create_location: missing address');
        break;
      }

      // Use current GPS location as bias so geocoding prioritizes nearby results
      const userCoords = useLocationStore.getState().currentLocation;
      console.log(`[VOICE] create_location: geocoding "${action.address}" (bias: ${userCoords ? `${userCoords.latitude.toFixed(2)},${userCoords.longitude.toFixed(2)}` : 'none'})`);
      const geoResults = await buscarEnderecoAutocomplete(
        action.address,
        userCoords?.latitude,
        userCoords?.longitude,
      );
      if (!geoResults || geoResults.length === 0) {
        console.log(`[VOICE] create_location: geocoding FAILED for "${action.address}"`);
        logger.warn('voice', `create_location: geocoding failed for "${action.address}"`);
        break;
      }

      const geo = geoResults[0];
      // Use site_name from AI, or extract just "number, street" from geocoded address
      const shortAddress = geo.endereco ? geo.endereco.split(', ').slice(0, 2).join(', ') : '';
      const locationName = action.site_name || shortAddress || action.address;
      const locationRadius = action.radius || 100;

      console.log(`[VOICE] create_location: "${locationName}" at (${geo.latitude}, ${geo.longitude}), radius=${locationRadius}`);
      try {
        await useLocationStore.getState().addLocation(
          locationName, geo.latitude, geo.longitude, locationRadius
        );
        console.log(`[VOICE] create_location: SUCCESS "${locationName}"`);
        logger.info('voice', `create_location: SUCCESS "${locationName}" at (${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)})`);
      } catch (e) {
        console.log(`[VOICE] create_location: FAILED`, String(e));
        logger.error('voice', `create_location: failed`, { error: String(e) });
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
