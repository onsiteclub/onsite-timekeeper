# FASE 1: IA Guardião — Filtro GPS em Tempo Real

> **Implementar PRIMEIRO. Esta fase é independente e resolve o problema urgente de GPS bounce e exits falsos.**
> **Não referencia IA Secretário nem IA Voz — essas vêm depois em documentos separados.**

## CONTEXTO

O OnSite Timekeeper é um app React Native/Expo de rastreamento automático de horas de trabalho via geofencing. A **função única** do app é: **responder quantas horas o worker trabalhou hoje, e onde.** Tudo que o app faz existe para atender esse objetivo com máxima precisão.

O app tem problemas conhecidos com GPS oscilando, exits falsos, Doze Mode matando updates, e edge cases que regras fixas no código não conseguem resolver. A solução é adicionar uma **camada de interpretação por AI** (igual a Calculator usa AI pra interpretar voz), onde eventos GPS brutos passam por uma AI que decide o que é real e o que é ruído antes do código executar.

## ARQUITETURA ATUAL (o que já existe)

```
Stack: React Native + Expo SDK 52+ / TypeScript / Zustand / SQLite / Supabase
```

### Arquivos relevantes e seus papéis:

| Arquivo | Papel |
|---------|-------|
| `src/lib/backgroundTasks.ts` | Define TaskManager tasks (geofence + location). Importado PRIMEIRO no _layout.tsx |
| `src/lib/geofenceLogic.ts` | Processa eventos de geofence (entry/exit). Tem accuracy gate (150m) e exit retry (3x 15s) |
| `src/lib/exitHandler.ts` | Gerencia o fluxo de exit: cooldown 60s, confirmExit(), cálculo de duração, upsert daily_hours |
| `src/lib/location.ts` | startBackgroundLocation() com foreground service. Params: pausesUpdatesAutomatically: false, killServiceOnDestroy: false, activityType: Other |
| `src/stores/locationStore.ts` | Zustand store. startMonitoring/stopMonitoring. Tem reconcile periódico a cada 5 min via setInterval |
| `src/lib/database/core.ts` | SQLite schema. Tabela active_tracking (com pause_seconds), daily_hours, locations |
| `src/hooks/hooks.ts` | Hook da Home screen. Timer visual, pause UI, handlePause/handleResume |
| `src/lib/notifications.ts` | Entry/exit/foreground service notifications |

### Fluxo atual de um EXIT:

```
Geofence nativo detecta exit
  → backgroundTasks.ts recebe evento
  → geofenceLogic.ts processa:
      ├── GPS accuracy < 150m → passa pro exitHandler
      └── GPS accuracy > 150m → scheduleExitRetry (3x, 15s cada)
          └── Se confirma fora → passa pro exitHandler
  → exitHandler.ts:
      ├── Inicia cooldown 60s
      ├── Se re-entry em <60s → cancela exit
      └── Após 60s → confirmExit():
          ├── Lê pause_seconds do active_tracking
          ├── Calcula duração (exit - enter - pause)
          └── Upsert daily_hours + limpa active_tracking
```

### Safety net (reconcile):
```
setInterval 5 min (roda no foreground service)
  → Tem active_tracking?
  → Pega GPS atual
  → Calcula distância do centro da fence
  → Se fora do radius → dispara exit que o nativo perdeu
```

---

## O QUE PRECISA SER CRIADO

### 1. Arquivo: `src/lib/ai/timekeeperSystemPrompt.ts`

Este arquivo exporta o system prompt que será enviado à API do Claude junto com cada evento. É o "cérebro" que explica pro AI o que o Timekeeper é e como interpretar os dados.

```typescript
export const TIMEKEEPER_SYSTEM_PROMPT = `
You are the AI interpreter for OnSite Timekeeper, a construction worker time-tracking app.

## YOUR SOLE PURPOSE
Determine if GPS/geofence events represent REAL worker movements or NOISE/ERRORS.
The app's only job is to answer: "How many hours did this worker work today, and where?"
Every decision you make must serve this goal with maximum accuracy.

## DOMAIN: CONSTRUCTION WORK IN CANADA
- Normal work hours: 5:00 AM - 7:00 PM (varies by trade and season)
- Typical shift: 8-10 hours
- Minimum meaningful session: 30 minutes
- Lunch break: typically 30-60 minutes
- Workers usually visit 1-2 sites per day, rarely more
- Saturday work is common, Sunday is rare
- Winter in Canada means shorter daylight hours (sunrise ~7:30, sunset ~4:30)
- Summer means longer days, possible shifts starting at 5-6 AM

## KNOWN PROBLEMS YOU MUST HANDLE

### GPS Bounce / Oscillation
- PATTERN: Multiple exits in short period, each followed by quick re-entry
- INDICATORS: exits > 3 in 30min, re-entry < 3min after exit, accuracy > 100m
- CAUSE: Metal structures at construction sites degrade GPS signal
- ACTION: Ignore false exits, maintain session

### Doze Mode Delayed Exit (Android)
- PATTERN: Exit detected much later than real departure
- INDICATORS: Long gap between last GPS reading and exit event, exit at unusual hour (e.g., 2 AM)
- CAUSE: Android killed GPS updates, exit detected late when phone wakes
- ACTION: Estimate real exit time from last reliable GPS reading + worker profile

### Phone Battery Died
- PATTERN: Session has entry but no exit, battery was dropping
- INDICATORS: Last battery reading < 10%, no events after certain time
- ACTION: Estimate exit from last known data + worker average shift duration

### Forgot to Stop / Left Without Detection
- PATTERN: Session duration way beyond normal
- INDICATORS: Duration > worker's average + 3 hours, no GPS readings from site
- ACTION: Flag for review, suggest corrected exit time based on profile

### Clock Manipulation
- PATTERN: Device timestamps inconsistent with server time
- INDICATORS: Device time differs from server time by > 5 minutes
- ACTION: Flag as suspicious, recommend using server timestamps

### Construction Site GPS Interference
- PATTERN: Consistently poor accuracy at specific location
- INDICATORS: Site average accuracy > 80m, metal/concrete structures nearby
- ACTION: Increase tolerance for this site, rely on temporal patterns

## YOUR RESPONSE FORMAT (ALWAYS JSON)

{
  "action": "confirm_exit" | "ignore_exit" | "confirm_entry" | "ignore_entry" | "flag_review" | "estimate_exit_time" | "wait_more_data",
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation",
  "estimated_time": "ISO timestamp if action is estimate_exit_time",
  "cooldown_minutes": number (optional, how long to suppress similar events),
  "metadata": {} (optional, any extra data)
}

## DECISION RULES

1. FIRST ENTRY OF DAY between 5:00-9:00 AM with accuracy < 100m → ALWAYS confirm (confidence > 0.9)
2. FINAL EXIT OF DAY between 3:00-7:00 PM after 6+ hours → ALWAYS confirm (confidence > 0.9)
3. Multiple exits in < 30 min → GPS bounce → ignore all except potentially the last one
4. Exit after < 30 min on site → suspicious unless accuracy is very good (< 30m)
5. Entry between 10 PM - 4 AM → highly suspicious, flag for review
6. Session > 14 hours → flag for review, suggest estimated exit
7. Re-entry within 5 minutes of exit → likely GPS bounce, ignore the exit
8. If accuracy > 150m on exit → low confidence, recommend wait_more_data
9. Worker's historical pattern should heavily influence decisions
10. When in doubt, KEEP THE SESSION OPEN (false exit is worse than late exit)
`;
```

### 2. Arquivo: `src/lib/ai/interpreter.ts`

Este é o módulo que empacota o contexto e chama a API.

```typescript
import { TIMEKEEPER_SYSTEM_PROMPT } from './timekeeperSystemPrompt';
import { logger } from '../logger';
import { getDb } from '../database/core';
import * as Location from 'expo-location';
import { supabase } from '../supabase'; // your existing Supabase client

// ============================================================
// TYPES
// ============================================================

export interface TimekeeperEvent {
  type: 'entry' | 'exit' | 'reconcile_check';
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
  timestamp_server?: string;   // for clock drift detection
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
  metadata?: Record<string, any>;
}

// ============================================================
// CONTEXT BUILDERS
// ============================================================

/**
 * Build worker profile from last 30 days of daily_hours data
 */
export async function buildWorkerProfile(userId: string): Promise<WorkerProfile> {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    const rows = await db.getAllAsync<{
      date: string;
      start_time: string;
      end_time: string;
      total_minutes: number;
      day_of_week: number;
    }>(
      `SELECT 
        date,
        start_time,
        end_time,
        total_minutes,
        CAST(strftime('%w', date) AS INTEGER) as day_of_week
       FROM daily_hours 
       WHERE user_id = ? AND date >= ? AND deleted_at IS NULL
       ORDER BY date DESC`,
      [userId, thirtyDaysAgo.split('T')[0]]
    );

    if (rows.length === 0) {
      // No history — return sensible defaults for construction
      return {
        avg_entry_time: '07:00',
        avg_exit_time: '16:00',
        avg_shift_hours: 8.5,
        typical_work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        sites_visited_avg: 1,
        data_points: 0,
      };
    }

    // Calculate averages
    const entryMinutes = rows.map(r => {
      const [h, m] = (r.start_time || '07:00').split(':').map(Number);
      return h * 60 + m;
    });
    const exitMinutes = rows.map(r => {
      const [h, m] = (r.end_time || '16:00').split(':').map(Number);
      return h * 60 + m;
    });
    
    const avgEntryMin = Math.round(entryMinutes.reduce((a, b) => a + b, 0) / entryMinutes.length);
    const avgExitMin = Math.round(exitMinutes.reduce((a, b) => a + b, 0) / exitMinutes.length);
    const avgShift = rows.reduce((a, r) => a + r.total_minutes, 0) / rows.length / 60;

    // Find typical work days
    const dayCounts: Record<number, number> = {};
    rows.forEach(r => { dayCounts[r.day_of_week] = (dayCounts[r.day_of_week] || 0) + 1; });
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const typicalDays = Object.entries(dayCounts)
      .filter(([_, count]) => count >= rows.length * 0.3) // worked at least 30% of the time
      .map(([day, _]) => dayNames[Number(day)]);

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
      sites_visited_avg: 1, // TODO: calculate from data
      data_points: rows.length,
    };
  } catch (error) {
    logger.error('ai', 'Failed to build worker profile', { error: String(error) });
    return {
      avg_entry_time: '07:00',
      avg_exit_time: '16:00',
      avg_shift_hours: 8.5,
      typical_work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      sites_visited_avg: 1,
      data_points: 0,
    };
  }
}

/**
 * Get today's exit count for a specific fence
 */
export async function getTodayExitCount(userId: string, fenceId: string): Promise<{ count: number; lastExitTime: string | null }> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  // This requires an event_log table — if it doesn't exist, return defaults
  try {
    const result = await db.getFirstAsync<{ count: number; last_exit: string | null }>(
      `SELECT COUNT(*) as count, MAX(timestamp) as last_exit 
       FROM geofence_events 
       WHERE user_id = ? AND location_id = ? AND event_type = 'exit' AND date(timestamp) = ?`,
      [userId, fenceId, today]
    );
    return { count: result?.count || 0, lastExitTime: result?.last_exit || null };
  } catch {
    // Table might not exist yet
    return { count: 0, lastExitTime: null };
  }
}

/**
 * Build the complete device context
 */
export async function buildDeviceContext(): Promise<DeviceContext> {
  let batteryLevel: number | null = null;
  let batteryCharging = false;
  
  try {
    // expo-battery if available
    const Battery = require('expo-battery');
    batteryLevel = await Battery.getBatteryLevelAsync();
    const state = await Battery.getBatteryStateAsync();
    batteryCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  } catch {
    // expo-battery not installed, skip
  }

  const { AppState, Platform } = require('react-native');
  const NetInfo = require('@react-native-community/netinfo');
  
  let network: 'wifi' | 'cellular' | 'offline' = 'offline';
  try {
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      network = netState.type === 'wifi' ? 'wifi' : 'cellular';
    }
  } catch {
    // skip
  }

  return {
    battery_level: batteryLevel,
    battery_charging: batteryCharging,
    screen_on: AppState.currentState === 'active',
    app_state: AppState.currentState as 'foreground' | 'background' | 'inactive',
    network,
    os: Platform.OS as 'ios' | 'android',
  };
}

// ============================================================
// LOCAL SCORING (PHASE 1 — runs first, no API cost)
// ============================================================

interface LocalScore {
  score: number;         // 0-1 (0 = definitely noise, 1 = definitely real)
  reason: string;
  skipAI: boolean;       // if true, local score is definitive — no need for AI
}

/**
 * Fast local scoring — resolves 80% of cases without API call.
 * Returns a score and whether the AI call can be skipped.
 */
export function localScore(
  event: TimekeeperEvent,
  session: SessionContext,
  profile: WorkerProfile,
  device: DeviceContext
): LocalScore {
  const hour = new Date(event.timestamp).getHours();
  const minute = new Date(event.timestamp).getMinutes();
  const currentTimeMin = hour * 60 + minute;
  const dayOfWeek = new Date(event.timestamp).getDay();
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const isWorkDay = profile.typical_work_days.includes(dayNames[dayOfWeek]);

  // ─── ENTRY SCORING ───
  if (event.type === 'entry') {
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
  if (event.type === 'exit') {
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
// AI API CALL (PHASE 2 — only for ambiguous cases)
// ============================================================

/**
 * Call AI interpreter via Supabase Edge Function (API key is secure on server).
 * Only called when localScore returns skipAI: false and score is in the gray zone (0.3-0.7).
 */
export async function callAIInterpreter(
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
      return fallbackVerdict(event, session);
    }

    const verdict: AIVerdict = data;
    logger.info('ai', `AI verdict: ${verdict.action} (${verdict.confidence})`, { reason: verdict.reason });
    return verdict;
  } catch (error) {
    logger.error('ai', 'AI interpreter failed, using fallback', { error: String(error) });
    return fallbackVerdict(event, session);
  }
}

/**
 * Fallback when AI is unreachable — conservative decisions
 */
function fallbackVerdict(event: TimekeeperEvent, session: SessionContext): AIVerdict {
  // When AI fails, be conservative: keep sessions open, don't create false exits
  if (event.type === 'exit') {
    return {
      action: 'wait_more_data',
      confidence: 0.3,
      reason: 'AI unreachable — waiting for more data before confirming exit',
      cooldown_minutes: 5,
    };
  }
  if (event.type === 'entry') {
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
 * Main entry point. Call this from geofenceLogic.ts before processing any event.
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
  const [profile, exitInfo, device] = await Promise.all([
    buildWorkerProfile(userId),
    getTodayExitCount(userId, event.fence_id),
    buildDeviceContext(),
  ]);

  // Build session context from active_tracking
  const db = getDb();
  let session: SessionContext;
  try {
    const active = await db.getFirstAsync<{
      enter_at: string;
      pause_seconds: number;
    }>('SELECT enter_at, pause_seconds FROM active_tracking WHERE user_id = ? LIMIT 1', [userId]);

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
  const local = localScore(event, session, profile, device);
  
  logger.info('ai', `Local score: ${local.score} (${local.reason})`, { skipAI: local.skipAI });

  // 3. If local is definitive, convert to verdict
  if (local.skipAI) {
    const action = event.type === 'entry'
      ? (local.score > 0.5 ? 'confirm_entry' : 'ignore_entry')
      : (local.score > 0.5 ? 'confirm_exit' : 'ignore_exit');
    
    return {
      action: action as AIVerdict['action'],
      confidence: local.score,
      reason: `[LOCAL] ${local.reason}`,
    };
  }

  // 4. Gray zone — call AI via Supabase Edge Function
  // Only if we have network
  if (device.network === 'offline') {
    logger.warn('ai', 'Offline — using local score as fallback');
    const action = event.type === 'entry'
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
// EVENT LOGGER (feeds future Prumo training)
// ============================================================

/**
 * Log every event + verdict for future AI training.
 * This data is GOLD for training Prumo in 2027.
 */
export async function logEventForTraining(
  event: TimekeeperEvent,
  verdict: AIVerdict,
  session: SessionContext,
  profile: WorkerProfile,
  device: DeviceContext
): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
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
        session.enter_time ? Math.round((Date.now() - new Date(session.enter_time).getTime()) / 60000) : null,
        session.exits_today,
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
    // Non-critical — don't throw
  }
}
```

### 3. Migração SQLite: tabela `geofence_events` + `ai_event_log`

Adicionar no `core.ts`, dentro do bloco de migrations:

```typescript
// Migration: Add geofence_events table for tracking exit frequency
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS geofence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('entry', 'exit')),
    timestamp TEXT NOT NULL,
    accuracy REAL,
    latitude REAL,
    longitude REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_geofence_events_lookup 
    ON geofence_events(user_id, location_id, event_type, timestamp);
`);

// Migration: Add ai_event_log table for Prumo training data
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS ai_event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT,
    accuracy REAL,
    distance REAL,
    fence_id TEXT,
    session_duration_min INTEGER,
    exits_today INTEGER,
    battery_level REAL,
    verdict_action TEXT,
    verdict_confidence REAL,
    verdict_reason TEXT,
    worker_avg_shift REAL,
    worker_data_points INTEGER,
    os TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
```

### 4. Integração no `geofenceLogic.ts`

O interpreter deve ser chamado **ANTES** do accuracy gate e do exit retry atuais. O novo fluxo:

```
Evento geofence chega
  → interpretEvent() — local score + AI se necessário
  → verdict.action === 'confirm_exit' → passa pro exitHandler (como antes)
  → verdict.action === 'ignore_exit' → descarta, loga
  → verdict.action === 'wait_more_data' → scheduleExitRetry (já existe)
  → verdict.action === 'flag_review' → salva flag, notifica, mas NÃO processa exit
```

No `processGeofenceEvent` (ou equivalente), ANTES do accuracy check atual:

```typescript
import { interpretEvent, logEventForTraining, TimekeeperEvent } from './ai/interpreter';

// ... inside processGeofenceEvent, after receiving the raw event:

const timekeeperEvent: TimekeeperEvent = {
  type: eventType, // 'entry' | 'exit'
  timestamp: new Date().toISOString(),
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy || 999,
  fence_id: locationId,
  fence_name: locationName,
  fence_latitude: fenceCenter.latitude,
  fence_longitude: fenceCenter.longitude,
  fence_radius: fenceRadius,
  distance_from_center: calculatedDistance,
};

const verdict = await interpretEvent(timekeeperEvent, userId);

// Log for Prumo training (async, non-blocking)
logEventForTraining(timekeeperEvent, verdict, session, profile, device).catch(() => {});

// Act on verdict
switch (verdict.action) {
  case 'confirm_exit':
    // Proceed to exitHandler as normal
    await onGeofenceExit(userId, locationId, locationName);
    break;
  case 'ignore_exit':
    logger.info('ai', `🚫 Exit ignored: ${verdict.reason}`);
    break;
  case 'wait_more_data':
    // Use existing retry mechanism
    scheduleExitRetry(/* ... */);
    break;
  case 'flag_review':
    logger.warn('ai', `⚠️ Flagged for review: ${verdict.reason}`);
    // TODO: save flag, maybe notify user
    break;
  case 'confirm_entry':
    await onGeofenceEntry(userId, locationId, locationName);
    break;
  case 'ignore_entry':
    logger.info('ai', `🚫 Entry ignored: ${verdict.reason}`);
    break;
  case 'estimate_exit_time':
    // Use estimated time instead of current time
    logger.info('ai', `⏰ Using estimated exit: ${verdict.estimated_time}`);
    await onGeofenceExit(userId, locationId, locationName, verdict.estimated_time);
    break;
}
```

### 5. Também logar eventos na tabela `geofence_events`

Em todo entry/exit que chega (independente do verdict), logar na tabela pra ter o histórico de frequência:

```typescript
// Inside processGeofenceEvent, BEFORE calling interpretEvent:
await db.runAsync(
  `INSERT INTO geofence_events (user_id, location_id, event_type, timestamp, accuracy, latitude, longitude)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [userId, locationId, eventType, new Date().toISOString(), accuracy, latitude, longitude]
);
```

### 6. Supabase Edge Function: `supabase/functions/ai-interpreter/index.ts`

Esta é a Edge Function que roda no Supabase. A API key do Anthropic fica segura aqui, nunca toca o device.

**Criar o arquivo:**

```bash
# Na raiz do projeto (se ainda não tiver o diretório supabase)
supabase functions new ai-interpreter
```

**Código da Edge Function:**

```typescript
// supabase/functions/ai-interpreter/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// ─── SYSTEM PROMPT ───
// This is the "brain" that tells Claude what OnSite Timekeeper is
// and how to interpret GPS events. Same content as timekeeperSystemPrompt.ts
// but lives server-side so it can't be tampered with.
const SYSTEM_PROMPT = `
You are the AI interpreter for OnSite Timekeeper, a construction worker time-tracking app.

## YOUR SOLE PURPOSE
Determine if GPS/geofence events represent REAL worker movements or NOISE/ERRORS.
The app's only job is to answer: "How many hours did this worker work today, and where?"
Every decision you make must serve this goal with maximum accuracy.

## DOMAIN: CONSTRUCTION WORK IN CANADA
- Normal work hours: 5:00 AM - 7:00 PM (varies by trade and season)
- Typical shift: 8-10 hours
- Minimum meaningful session: 30 minutes
- Lunch break: typically 30-60 minutes
- Workers usually visit 1-2 sites per day, rarely more
- Saturday work is common, Sunday is rare
- Winter in Canada means shorter daylight hours (sunrise ~7:30, sunset ~4:30)
- Summer means longer days, possible shifts starting at 5-6 AM

## KNOWN PROBLEMS YOU MUST HANDLE

### GPS Bounce / Oscillation
- PATTERN: Multiple exits in short period, each followed by quick re-entry
- INDICATORS: exits > 3 in 30min, re-entry < 3min after exit, accuracy > 100m
- CAUSE: Metal structures at construction sites degrade GPS signal
- ACTION: Ignore false exits, maintain session

### Doze Mode Delayed Exit (Android)
- PATTERN: Exit detected much later than real departure
- INDICATORS: Long gap between last GPS reading and exit event, exit at unusual hour (e.g., 2 AM)
- CAUSE: Android killed GPS updates, exit detected late when phone wakes
- ACTION: Estimate real exit time from last reliable GPS reading + worker profile

### Phone Battery Died
- PATTERN: Session has entry but no exit, battery was dropping
- INDICATORS: Last battery reading < 10%, no events after certain time
- ACTION: Estimate exit from last known data + worker average shift duration

### Forgot to Stop / Left Without Detection
- PATTERN: Session duration way beyond normal
- INDICATORS: Duration > worker's average + 3 hours, no GPS readings from site
- ACTION: Flag for review, suggest corrected exit time based on profile

### Clock Manipulation
- PATTERN: Device timestamps inconsistent with server time
- INDICATORS: Device time differs from server time by > 5 minutes
- ACTION: Flag as suspicious, recommend using server timestamps

### Construction Site GPS Interference
- PATTERN: Consistently poor accuracy at specific location
- INDICATORS: Site average accuracy > 80m, metal/concrete structures nearby
- ACTION: Increase tolerance for this site, rely on temporal patterns

## YOUR RESPONSE FORMAT (ALWAYS JSON, nothing else)

{
  "action": "confirm_exit" | "ignore_exit" | "confirm_entry" | "ignore_entry" | "flag_review" | "estimate_exit_time" | "wait_more_data",
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation",
  "estimated_time": "ISO timestamp if action is estimate_exit_time",
  "cooldown_minutes": number (optional, how long to suppress similar events),
  "metadata": {} (optional, any extra data)
}

## DECISION RULES

1. FIRST ENTRY OF DAY between 5:00-9:00 AM with accuracy < 100m → ALWAYS confirm (confidence > 0.9)
2. FINAL EXIT OF DAY between 3:00-7:00 PM after 6+ hours → ALWAYS confirm (confidence > 0.9)
3. Multiple exits in < 30 min → GPS bounce → ignore all except potentially the last one
4. Exit after < 30 min on site → suspicious unless accuracy is very good (< 30m)
5. Entry between 10 PM - 4 AM → highly suspicious, flag for review
6. Session > 14 hours → flag for review, suggest estimated exit
7. Re-entry within 5 minutes of exit → likely GPS bounce, ignore the exit
8. If accuracy > 150m on exit → low confidence, recommend wait_more_data
9. Worker's historical pattern should heavily influence decisions
10. When in doubt, KEEP THE SESSION OPEN (false exit is worse than late exit)
`;

Deno.serve(async (req: Request) => {
  // ─── CORS ───
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // ─── AUTH: Verify the user is authenticated ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── PARSE REQUEST ───
    const { event, session, profile, device } = await req.json();

    if (!event || !event.type) {
      return new Response(JSON.stringify({ error: "Missing event data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ─── BUILD USER MESSAGE ───
    const userMessage = `
GEOFENCE EVENT:
- Type: ${event.type}
- Time: ${event.timestamp}
- GPS Accuracy: ${event.accuracy}m
- Distance from fence center: ${event.distance_from_center}m
- Fence: "${event.fence_name}" (radius: ${event.fence_radius}m)

SESSION STATE:
- Active session: ${session.active_tracking_exists}
- Entry time: ${session.enter_time || "none"}
- Duration so far: ${session.duration_minutes != null ? session.duration_minutes + " minutes" : "N/A"}
- Pause seconds: ${session.pause_seconds}
- Exits today (this fence): ${session.exits_today}
- Time since last exit: ${session.time_since_last_exit_minutes != null ? session.time_since_last_exit_minutes + " minutes" : "N/A"}

WORKER PROFILE (last ${profile.data_points} days):
- Avg entry: ${profile.avg_entry_time}
- Avg exit: ${profile.avg_exit_time}
- Avg shift: ${profile.avg_shift_hours}h
- Work days: ${profile.typical_work_days.join(", ")}

DEVICE:
- Battery: ${device.battery_level !== null ? Math.round(device.battery_level * 100) + "%" : "unknown"}${device.battery_charging ? " (charging)" : ""}
- Screen: ${device.screen_on ? "on" : "off"}
- App: ${device.app_state}
- Network: ${device.network}
- OS: ${device.os}

What is your verdict? Respond ONLY with a JSON object.
`;

    // ─── CALL ANTHROPIC API ───
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errorText);
      return new Response(
        JSON.stringify({
          action: "wait_more_data",
          confidence: 0.3,
          reason: `Anthropic API error: ${anthropicResponse.status}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData.content?.[0]?.text || "";

    // Parse JSON (strip markdown fences if present)
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const verdict = JSON.parse(clean);

    // ─── OPTIONAL: Log to Supabase for analytics ───
    try {
      await supabase.from("ai_verdicts").insert({
        user_id: user.id,
        event_type: event.type,
        accuracy: event.accuracy,
        fence_id: event.fence_id,
        verdict_action: verdict.action,
        verdict_confidence: verdict.confidence,
        verdict_reason: verdict.reason,
        session_duration_min: session.duration_minutes,
        exits_today: session.exits_today,
        os: device.os,
      });
    } catch (logError) {
      // Non-critical, don't fail the response
      console.warn("Failed to log verdict:", logError);
    }

    return new Response(JSON.stringify(verdict), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    // Return fallback verdict instead of error — app must keep working
    return new Response(
      JSON.stringify({
        action: "wait_more_data",
        confidence: 0.3,
        reason: "Edge function error — fallback verdict",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### 7. Deploy da Edge Function

```bash
# Set the API key as secret (never in code)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# Deploy the function
supabase functions deploy ai-interpreter

# Test locally first (optional)
supabase functions serve ai-interpreter --env-file .env.local
```

### 8. Tabela `ai_verdicts` no Supabase (opcional, pra analytics server-side)

SQL para criar no Supabase Dashboard → SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS ai_verdicts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  accuracy REAL,
  fence_id TEXT,
  verdict_action TEXT NOT NULL,
  verdict_confidence REAL,
  verdict_reason TEXT,
  session_duration_min INTEGER,
  exits_today INTEGER,
  os TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only see their own verdicts
ALTER TABLE ai_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verdicts" ON ai_verdicts
  FOR SELECT USING (auth.uid() = user_id);

-- Only the service role (Edge Function) can insert
CREATE POLICY "Service role can insert verdicts" ON ai_verdicts
  FOR INSERT WITH CHECK (true);

-- Index for querying by user and date
CREATE INDEX idx_ai_verdicts_user_date ON ai_verdicts(user_id, created_at DESC);
```

### 9. Configuração do Supabase Client

Verificar que o client do Supabase já está configurado no app. Se não:

```typescript
// src/lib/supabase.ts (provavelmente já existe)
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

O `supabase.functions.invoke()` já envia o JWT do usuário autenticado automaticamente — a Edge Function usa esse token pra validar auth.

---

---

## RESUMO — FASE 1

### Arquivos a CRIAR:
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/ai/timekeeperSystemPrompt.ts` | System prompt referência local |
| `src/lib/ai/interpreter.ts` | Local scoring + Edge Function call + context builders + training logger |
| `supabase/functions/ai-interpreter/index.ts` | Edge Function proxy → Anthropic API |

### Arquivos a EDITAR:
| Arquivo | O que mudar |
|---------|-------------|
| `src/lib/database/core.ts` | Adicionar migrations: tabelas `geofence_events` e `ai_event_log` |
| `src/lib/geofenceLogic.ts` | Integrar `interpretEvent()` ANTES do accuracy gate existente |

### No Supabase Dashboard:
1. SQL Editor → executar CREATE TABLE `ai_verdicts` (com RLS)
2. `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
3. `supabase functions deploy ai-interpreter`

### Dependências novas:
Nenhuma obrigatória. Opcional: `expo-battery` e `@react-native-community/netinfo` para contexto de device.

### Como testar:
1. Deploy a Edge Function
2. Build o app com as mudanças
3. Vá pro canteiro de obra com GPS ruim
4. Monitore logs: `🚫 Exit ignored`, `⏳ EXIT deferred`, `✅ AI verdict: confirm_exit`
5. Se local scoring resolve tudo → IA nem é chamada (zero custo)
6. Se chamar IA → verify no Supabase `ai_verdicts` table

### Custo estimado:
~$36/mês para 100 workers. 80% dos eventos resolvidos localmente (grátis).
