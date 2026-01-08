/**
 * Work Session Store - OnSite Timekeeper
 * 
 * Manages work session flow:
 * - Fullscreen popup for enter/exit (alarm snooze style)
 * - Auto-action after 30 seconds
 * - PAUSE system with 30 minute countdown
 * - Return to fence (same session)
 * - Notification integration
 * 
 * MODIFIED: 
 * - Geofence events HAVE PRIORITY over pending modals
 * - skippedToday is cleared when EXITING the fence
 * - Enter cancels pending Exit (user returned quickly)
 * - BUG FIX: Added lastProcessedEnterLocalId to prevent duplicate popups
 *   when geofencing restarts (e.g., after adding a new location)
 */

import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/logger';
import {
  solicitarPermissaoNotificacao,
  configurarCategoriasNotificacao,
  mostrarNotificacaoSaida,
  mostrarNotificacaoAutoAcao,
  agendarLembreteInicio,
  cancelarNotificacao,
  adicionarListenerResposta,
  type GeofenceNotificationData,
} from '../lib/notifications';
import {
  addToSkippedToday,
  removeFromSkippedToday,
  clearSkippedToday,
} from '../lib/backgroundTasks';
import { useRegistroStore } from './registroStore';
import type { Coordenadas } from '../lib/location';

// ============================================
// CONSTANTS
// ============================================

const AUTO_ACTION_TIMEOUT = 30000; // 30 seconds for popup
const PAUSE_TIMEOUT = 30 * 60 * 1000; // 30 minutes for pause

// ============================================
// TYPES
// ============================================

export type PendingActionType = 'enter' | 'exit' | 'return';

export interface PendingAction {
  type: PendingActionType;
  locationId: string;
  locationName: string;
  notificationId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  coords?: Coordenadas & { accuracy?: number };
  startTime: number; // For countdown
  
  // Legacy aliases
  localId: string;
  localNome: string;
}

export interface PauseState {
  isPaused: boolean;
  locationId: string;
  locationName: string;
  startTime: number; // When paused
  timeoutId: ReturnType<typeof setTimeout> | null;
  
  // Legacy aliases
  localId: string;
  localNome: string;
}

interface WorkSessionState {
  // State
  isInitialized: boolean;
  
  // Pending action (displays fullscreen popup)
  pendingAction: PendingAction | null;
  
  // PAUSE state
  pauseState: PauseState | null;
  
  // Locations ignored today (cleared when exiting fence)
  skippedToday: string[];
  
  // Scheduled reminders (locationId -> notificationId)
  delayedStarts: Map<string, string>;
  
  // BUG FIX: Track last processed enter to prevent duplicate popups
  lastProcessedEnterLocalId: string | null;

  // Legacy accessor
  isInicializado: boolean;

  // Actions
  initialize: () => Promise<void>;
  
  // Geofence handlers (called by locationStore)
  handleGeofenceEnter: (
    locationId: string,
    locationName: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<void>;
  
  handleGeofenceExit: (
    locationId: string,
    locationName: string,
    coords?: Coordenadas & { accuracy?: number }
  ) => Promise<void>;
  
  // User actions on popup (English)
  actionStart: () => Promise<void>;
  actionSkipToday: () => void;
  actionDelay10Min: () => Promise<void>;
  actionPause: () => Promise<void>;
  actionResume: () => Promise<void>;
  actionEnd: () => Promise<void>;
  actionEndWithAdjustment: (minutesAgo: number) => Promise<void>;
  
  // Helpers (English)
  clearPending: () => void;
  clearPause: () => void;
  resetSkippedToday: () => void;
  removeFromSkippedToday: (locationId: string) => void;
  getRemainingTime: () => number;
  getPauseRemainingTime: () => number;

  // Legacy methods (Portuguese - for compatibility)
  acaoIniciar: () => Promise<void>;
  acaoIgnorarHoje: () => void;
  acaoDelay10Min: () => Promise<void>;
  acaoPausar: () => Promise<void>;
  acaoRetomar: () => Promise<void>;
  acaoEncerrar: () => Promise<void>;
  acaoEncerrarComAjuste: (minutosAtras: number) => Promise<void>;
  limparPending: () => void;
  limparPausa: () => void;
  removerDoSkippedToday: (localId: string) => void;
  getTempoRestante: () => number;
  getTempoRestantePausa: () => number;
}

// ============================================
// HELPER: Clear pending action safely
// ============================================

async function clearPendingAction(pendingAction: PendingAction | null): Promise<void> {
  if (!pendingAction) return;
  
  clearTimeout(pendingAction.timeoutId);
  if (pendingAction.notificationId) {
    await cancelarNotificacao(pendingAction.notificationId);
  }
}

// ============================================
// HELPER: Create pending action with legacy aliases
// ============================================

function createPendingAction(
  type: PendingActionType,
  locationId: string,
  locationName: string,
  notificationId: string,
  timeoutId: ReturnType<typeof setTimeout>,
  startTime: number,
  coords?: Coordenadas & { accuracy?: number }
): PendingAction {
  return {
    type,
    locationId,
    locationName,
    notificationId,
    timeoutId,
    coords,
    startTime,
    // Legacy aliases
    localId: locationId,
    localNome: locationName,
  };
}

// ============================================
// HELPER: Create pause state with legacy aliases
// ============================================

function createPauseState(
  locationId: string,
  locationName: string,
  startTime: number,
  timeoutId: ReturnType<typeof setTimeout> | null
): PauseState {
  return {
    isPaused: true,
    locationId,
    locationName,
    startTime,
    timeoutId,
    // Legacy aliases
    localId: locationId,
    localNome: locationName,
  };
}

// ============================================
// STORE
// ============================================

export const useWorkSessionStore = create<WorkSessionState>((set, get) => ({
  isInitialized: false,
  pendingAction: null,
  pauseState: null,
  skippedToday: [],
  delayedStarts: new Map(),
  lastProcessedEnterLocalId: null,

  // Legacy accessor
  get isInicializado() { return get().isInitialized; },

  initialize: async () => {
    if (get().isInitialized) return;

    try {
      logger.info('boot', '⏱️ Initializing work session store...');

      // Request notification permission
      await solicitarPermissaoNotificacao();

      // Configure notification categories
      await configurarCategoriasNotificacao();

      // Add notification response listener
      adicionarListenerResposta((response) => {
        const actionIdentifier = response.actionIdentifier;
        const data = response.notification.request.content.data as GeofenceNotificationData | undefined;
        
        logger.info('notification', `📲 Response: ${actionIdentifier}`, { data });

        switch (actionIdentifier) {
          case 'start':
            get().actionStart();
            break;
          case 'skip_today':
            get().actionSkipToday();
            break;
          case 'delay_10min':
            get().actionDelay10Min();
            break;
          case 'pause':
            get().actionPause();
            break;
          case 'continue':
            get().actionResume();
            break;
          case 'stop':
            get().actionEnd();
            break;
          case Notifications.DEFAULT_ACTION_IDENTIFIER:
            // User tapped notification (no specific button)
            // Opens app - action will be decided by popup
            break;
        }
      });

      set({ isInitialized: true });
      logger.info('boot', '✅ Work session store initialized');
    } catch (error) {
      logger.error('session', 'Error during initialization', { error: String(error) });
      set({ isInitialized: true });
    }
  },

  // ============================================
  // FENCE ENTRY
  // ============================================
  handleGeofenceEnter: async (locationId, locationName, coords) => {
    const { skippedToday, pendingAction, pauseState, lastProcessedEnterLocalId } = get();
    const registroStore = useRegistroStore.getState();

    logger.info('session', `📍 GEOFENCE ENTER: ${locationName}`, { locationId });

    // ============================================
    // PRIORITY: Close report modal if open
    // ============================================
    if (registroStore.ultimaSessaoFinalizada) {
      logger.debug('session', 'Closing report modal to process event');
      registroStore.limparUltimaSessao();
    }

    // ============================================
    // CASE 1: Was PAUSED at this location → RETURN!
    // ============================================
    if (pauseState && pauseState.locationId === locationId) {
      logger.info('session', `🔄 RETURN (paused): ${locationName}`);

      // Cancel pause timer
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }

      // Cancel previous pending if any
      await clearPendingAction(pendingAction);

      // Configure auto-RESUME in 30 seconds
      const timeoutId = setTimeout(async () => {
        logger.info('session', '⏱️ Auto-RESUME (30s timeout)');
        await get().actionResume();
        await mostrarNotificacaoAutoAcao(locationName, 'start');
      }, AUTO_ACTION_TIMEOUT);

      set({
        pendingAction: createPendingAction(
          'return',
          locationId,
          locationName,
          '',
          timeoutId,
          Date.now(),
          coords
        ),
        lastProcessedEnterLocalId: locationId,
      });

      return;
    }

    // ============================================
    // CASE 2: Had pending EXIT → user returned quickly!
    // ============================================
    if (pendingAction?.type === 'exit' && pendingAction.locationId === locationId) {
      logger.info('session', `↩️ QUICK RETURN - canceling exit: ${locationName}`);
      
      await clearPendingAction(pendingAction);
      set({ 
        pendingAction: null,
        lastProcessedEnterLocalId: locationId,
      });
      
      return;
    }

    // ============================================
    // CASE 3: Location is in skippedToday list
    // ============================================
    if (skippedToday.includes(locationId)) {
      logger.info('session', `😴 Skipped today: ${locationName}`);
      set({ lastProcessedEnterLocalId: locationId });
      return;
    }

    // ============================================
    // CASE 4: Already has active session at this location
    // ============================================
    const currentSession = registroStore.sessaoAtual;
    if (currentSession && currentSession.local_id === locationId) {
      logger.info('session', `✅ Already has active session: ${locationName}`);
      set({ lastProcessedEnterLocalId: locationId });
      return;
    }

    // ============================================
    // CASE 5: Has active session at ANOTHER location
    // ============================================
    if (currentSession && currentSession.local_id !== locationId) {
      logger.warn('session', `⚠️ Already working at ${currentSession.local_nome}, ignoring ${locationName}`);
      set({ lastProcessedEnterLocalId: locationId });
      return;
    }

    // ============================================
    // BUG FIX: Prevent duplicate popup on geofencing restart
    // ============================================
    if (lastProcessedEnterLocalId === locationId) {
      logger.debug('session', `🔄 Entry already processed for ${locationName}, ignoring`);
      return;
    }

    // ============================================
    // CASE 6: New entry - show popup
    // ============================================
    logger.info('session', `🆕 NEW ENTRY: ${locationName}`);

    // Cancel any previous pending
    await clearPendingAction(pendingAction);

    // Configure auto-START in 30 seconds
    const timeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ Auto-START (30s timeout)');
      await get().actionStart();
      await mostrarNotificacaoAutoAcao(locationName, 'start');
    }, AUTO_ACTION_TIMEOUT);

    set({
      pendingAction: createPendingAction(
        'enter',
        locationId,
        locationName,
        '',
        timeoutId,
        Date.now(),
        coords
      ),
      lastProcessedEnterLocalId: locationId,
    });
  },

  // ============================================
  // FENCE EXIT
  // ============================================
  handleGeofenceExit: async (locationId, locationName, coords) => {
    const { pendingAction, pauseState, skippedToday } = get();
    const registroStore = useRegistroStore.getState();
    const currentSession = registroStore.sessaoAtual;

    logger.info('session', `📍 GEOFENCE EXIT: ${locationName}`, { locationId });

    // ============================================
    // Clear lastProcessedEnterLocalId on exit
    // ============================================
    set({ lastProcessedEnterLocalId: null });

    // ============================================
    // PRIORITY: Close report modal if open
    // ============================================
    if (registroStore.ultimaSessaoFinalizada) {
      logger.debug('session', 'Closing report modal to process exit');
      registroStore.limparUltimaSessao();
    }

    // ============================================
    // CASE 1: Had pending ENTER for this location → user left
    // ============================================
    if (pendingAction?.type === 'enter' && pendingAction.locationId === locationId) {
      logger.info('session', `🚶 Left before deciding: ${locationName}`);
      
      await clearPendingAction(pendingAction);
      set({ pendingAction: null });
      
      return;
    }

    // ============================================
    // CASE 2: Location was in skippedToday → remove
    // ============================================
    if (skippedToday.includes(locationId)) {
      logger.info('session', `🔄 Exited skipped location, removing from list: ${locationName}`);
      removeFromSkippedToday(locationId);
      set({ skippedToday: skippedToday.filter(id => id !== locationId) });
      return;
    }

    // ============================================
    // CASE 3: Is PAUSED at this location → start auto-end countdown
    // ============================================
    if (pauseState && pauseState.locationId === locationId) {
      logger.info('session', `⏸️ Exited while paused: ${locationName}`);
      // Pause timer continues - nothing to do
      return;
    }

    // ============================================
    // CASE 4: Has active session at this location → show exit popup
    // ============================================
    if (currentSession && currentSession.local_id === locationId) {
      logger.info('session', `🚪 EXIT with active session: ${locationName}`);

      // Cancel any previous pending
      await clearPendingAction(pendingAction);

      // Show exit notification
      const notificationId = await mostrarNotificacaoSaida(locationId, locationName);

      // Configure auto-END in 30 seconds
      const timeoutId = setTimeout(async () => {
        logger.info('session', '⏱️ Auto-END (30s timeout)');
        await get().actionEnd();
        await mostrarNotificacaoAutoAcao(locationName, 'stop');
      }, AUTO_ACTION_TIMEOUT);

      set({
        pendingAction: createPendingAction(
          'exit',
          locationId,
          locationName,
          notificationId,
          timeoutId,
          Date.now(),
          coords
        ),
      });

      return;
    }

    // ============================================
    // CASE 5: No active session → nothing to do
    // ============================================
    logger.debug('session', `Exit without active session: ${locationName}`);
  },

  // ============================================
  // ACTION: START
  // ============================================
  actionStart: async () => {
    const { pendingAction } = get();
    if (!pendingAction || pendingAction.type !== 'enter') return;

    logger.info('session', `▶️ START: ${pendingAction.locationName}`);

    // Clear pending
    await clearPendingAction(pendingAction);

    // Register entry
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarEntrada(
      pendingAction.locationId,
      pendingAction.locationName,
      pendingAction.coords
    );

    set({ pendingAction: null });
  },

  // ============================================
  // ACTION: SKIP TODAY
  // ============================================
  actionSkipToday: () => {
    const { pendingAction, skippedToday } = get();
    if (!pendingAction) return;

    logger.info('session', `😴 SKIP TODAY: ${pendingAction.locationName}`);

    // Clear pending
    clearTimeout(pendingAction.timeoutId);
    if (pendingAction.notificationId) {
      cancelarNotificacao(pendingAction.notificationId);
    }

    // Persist in AsyncStorage (for background tasks to respect)
    addToSkippedToday(pendingAction.locationId);

    // Add to local ignored list
    set({
      pendingAction: null,
      skippedToday: [...skippedToday, pendingAction.locationId],
    });
  },

  // ============================================
  // ACTION: DELAY 10 MIN
  // ============================================
  actionDelay10Min: async () => {
    const { pendingAction, delayedStarts } = get();
    if (!pendingAction || pendingAction.type !== 'enter') return;

    logger.info('session', `⏰ DELAY 10 MIN: ${pendingAction.locationName}`);

    // Clear current pending
    await clearPendingAction(pendingAction);

    // Schedule reminder
    const notificationId = await agendarLembreteInicio(
      pendingAction.locationId,
      pendingAction.locationName,
      10
    );

    const newDelayed = new Map(delayedStarts);
    newDelayed.set(pendingAction.locationId, notificationId);

    set({
      pendingAction: null,
      delayedStarts: newDelayed,
    });
  },

  // ============================================
  // ACTION: PAUSE (30 minutes)
  // ============================================
  actionPause: async () => {
    const { pendingAction } = get();
    if (!pendingAction || pendingAction.type !== 'exit') return;

    logger.info('session', `⏸️ PAUSE: ${pendingAction.locationName}`);

    // Clear pending
    await clearPendingAction(pendingAction);

    // Configure 30 minute timer
    const pauseTimeoutId = setTimeout(async () => {
      logger.info('session', '⏱️ PAUSE EXPIRED (30min) - Auto-ending');
      
      // End session
      const registroStore = useRegistroStore.getState();
      const { pauseState } = get();
      
      if (pauseState) {
        await registroStore.registrarSaida(pauseState.locationId);
        await mostrarNotificacaoAutoAcao(pauseState.locationName, 'stop');
      }
      
      set({ pauseState: null, pendingAction: null });
    }, PAUSE_TIMEOUT);

    // Save pause state
    set({
      pendingAction: null,
      pauseState: createPauseState(
        pendingAction.locationId,
        pendingAction.locationName,
        Date.now(),
        pauseTimeoutId
      ),
    });
  },

  // ============================================
  // ACTION: RESUME (after pause)
  // ============================================
  actionResume: async () => {
    const { pendingAction, pauseState } = get();
    
    // Can come from return popup or pause screen
    if (pendingAction?.type === 'return') {
      logger.info('session', `▶️ RESUME: ${pendingAction.locationName}`);
      await clearPendingAction(pendingAction);
    }

    // Clear pause state (but DON'T end session!)
    if (pauseState?.timeoutId) {
      clearTimeout(pauseState.timeoutId);
    }

    // Calculate paused minutes (for future logging)
    const pausedMinutes = pauseState 
      ? Math.floor((Date.now() - pauseState.startTime) / 60000)
      : 0;

    logger.info('session', `✅ Session resumed (paused ${pausedMinutes}min)`);

    set({ 
      pendingAction: null, 
      pauseState: null,
    });
  },

  // ============================================
  // ACTION: END
  // ============================================
  actionEnd: async () => {
    const { pendingAction, pauseState } = get();
    
    let locationId: string | null = null;
    let coords: (Coordenadas & { accuracy?: number }) | undefined;

    // Can come from exit popup, return popup, or pause screen
    if (pendingAction) {
      locationId = pendingAction.locationId;
      coords = pendingAction.coords;
      
      await clearPendingAction(pendingAction);
      
      logger.info('session', `⏹️ END: ${pendingAction.locationName}`);
    } else if (pauseState) {
      locationId = pauseState.locationId;
      
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }
      
      logger.info('session', `⏹️ END (from pause): ${pauseState.locationName}`);
    }

    if (!locationId) {
      logger.warn('session', 'No session to end');
      return;
    }

    // Register exit
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarSaida(locationId, coords);

    set({ pendingAction: null, pauseState: null });
  },

  // ============================================
  // ACTION: END WITH ADJUSTMENT
  // ============================================
  actionEndWithAdjustment: async (minutesAgo) => {
    const { pendingAction, pauseState } = get();
    
    let locationId: string | null = null;
    let coords: (Coordenadas & { accuracy?: number }) | undefined;

    if (pendingAction?.type === 'exit' || pendingAction?.type === 'return') {
      locationId = pendingAction.locationId;
      coords = pendingAction.coords;
      
      await clearPendingAction(pendingAction);
      
      logger.info('session', `⏹️ END (${minutesAgo} min ago): ${pendingAction.locationName}`);
    } else if (pauseState) {
      locationId = pauseState.locationId;
      
      if (pauseState.timeoutId) {
        clearTimeout(pauseState.timeoutId);
      }
    }

    if (!locationId) return;

    // Register exit with negative adjustment
    const registroStore = useRegistroStore.getState();
    await registroStore.registrarSaidaComAjuste(
      locationId,
      coords,
      -minutesAgo // Negative = deduct time
    );

    set({ pendingAction: null, pauseState: null });
  },

  // ============================================
  // HELPERS
  // ============================================
  clearPending: () => {
    const { pendingAction } = get();
    if (pendingAction) {
      clearTimeout(pendingAction.timeoutId);
      if (pendingAction.notificationId) {
        cancelarNotificacao(pendingAction.notificationId);
      }
    }
    set({ pendingAction: null });
  },

  clearPause: () => {
    const { pauseState } = get();
    if (pauseState?.timeoutId) {
      clearTimeout(pauseState.timeoutId);
    }
    set({ pauseState: null });
  },

  resetSkippedToday: () => {
    // Clear AsyncStorage
    clearSkippedToday();
    
    // Clear local state
    set({ 
      skippedToday: [], 
      delayedStarts: new Map(),
      lastProcessedEnterLocalId: null,
    });
    logger.info('session', 'Skipped list reset');
  },

  removeFromSkippedToday: (locationId: string) => {
    const { skippedToday } = get();
    if (skippedToday.includes(locationId)) {
      // Remove from AsyncStorage
      removeFromSkippedToday(locationId);
      
      // Remove from local state
      set({ skippedToday: skippedToday.filter(id => id !== locationId) });
      logger.debug('session', `Removed ${locationId} from skippedToday`);
    }
  },

  getRemainingTime: () => {
    const { pendingAction } = get();
    if (!pendingAction) return 0;
    
    const elapsed = Date.now() - pendingAction.startTime;
    const remaining = Math.max(0, AUTO_ACTION_TIMEOUT - elapsed);
    return Math.ceil(remaining / 1000);
  },

  getPauseRemainingTime: () => {
    const { pauseState } = get();
    if (!pauseState) return 0;
    
    const elapsed = Date.now() - pauseState.startTime;
    const remaining = Math.max(0, PAUSE_TIMEOUT - elapsed);
    return Math.ceil(remaining / 1000);
  },

  // ============================================
  // LEGACY METHOD ALIASES (for compatibility)
  // ============================================
  acaoIniciar: async () => get().actionStart(),
  acaoIgnorarHoje: () => get().actionSkipToday(),
  acaoDelay10Min: async () => get().actionDelay10Min(),
  acaoPausar: async () => get().actionPause(),
  acaoRetomar: async () => get().actionResume(),
  acaoEncerrar: async () => get().actionEnd(),
  acaoEncerrarComAjuste: async (minutosAtras) => get().actionEndWithAdjustment(minutosAtras),
  limparPending: () => get().clearPending(),
  limparPausa: () => get().clearPause(),
  removerDoSkippedToday: (localId) => get().removeFromSkippedToday(localId),
  getTempoRestante: () => get().getRemainingTime(),
  getTempoRestantePausa: () => get().getPauseRemainingTime(),
}));
