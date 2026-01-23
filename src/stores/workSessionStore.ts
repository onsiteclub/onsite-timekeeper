/**
 * Work Session Store - OnSite Timekeeper (SIMPLIFIED)
 * 
 * Simplified session store that delegates to the new exitHandler system.
 * Only handles entry notifications and skipped locations.
 */

import { create } from 'zustand';
import { logger } from '../lib/logger';
import {
  requestNotificationPermission,
  configureNotificationCategories,
  addResponseListener,
  type GeofenceNotificationData,
} from '../lib/notifications';
import {
  clearSkippedToday,
  removeFromSkippedToday as removeFromSkippedTodayBg,
} from '../lib/backgroundTasks';
import type { Coordinates } from '../lib/location';

// Import from refactored modules
import {
  setStoreRef,
  markAppReady,
  resetBootGate as resetBootGateHelper,
} from './sessionHelpers';

import {
  handleGeofenceEnterLogic,
  handleGeofenceExitLogic,
} from './sessionHandlers';

// ============================================
// STORE INTERFACE (v2 SIMPLIFIED - NO BUTTONS)
// ============================================

interface WorkSessionState {
  isInitialized: boolean;
  skippedToday: string[];
  lastProcessedEnterLocationId: string | null;

  // Actions
  initialize: () => Promise<void>;

  // Geofence handlers (simplified - all automatic)
  handleGeofenceEnter: (
    locationId: string,
    locationName: string | null,
    coords?: Coordinates & { accuracy?: number }
  ) => Promise<void>;

  handleGeofenceExit: (
    locationId: string,
    locationName: string | null,
    coords?: Coordinates & { accuracy?: number }
  ) => Promise<void>;

  // Helpers (simplified)
  resetSkippedToday: () => void;
  removeFromSkippedToday: (locationId: string) => void;
  resetBootGate: () => void;
}

// ============================================
// STORE
// ============================================

export const useWorkSessionStore = create<WorkSessionState>((set, get) => ({
  // Initial state (simplified)
  isInitialized: false,
  skippedToday: [],
  lastProcessedEnterLocationId: null,

  // ============================================
  // INITIALIZE
  // ============================================
  initialize: async () => {
    if (get().isInitialized) return;

    try {
      logger.info('boot', '⏱️ Initializing work session store (simplified)...');

      await requestNotificationPermission();
      await configureNotificationCategories();

      // Simplified notification response listener (v2 - no button actions)
      // All geofence notifications are informative only
      addResponseListener((response) => {
        const actionIdentifier = response.actionIdentifier;
        const data = response.notification.request.content.data as GeofenceNotificationData | undefined;

        logger.info('notification', `📲 Notification tapped: ${actionIdentifier}`, { type: data?.type });

        // No actions needed - all notifications are informative only
        // User tapping opens the app (default behavior)
      });

      set({ isInitialized: true });
      
      // BOOT GATE: Mark app as ready
      setStoreRef(get());
      markAppReady();
      
      logger.info('boot', '✅ Work session store initialized (simplified)');
    } catch (error) {
      logger.error('session', 'Error initializing', { error: String(error) });
      set({ isInitialized: true });
      
      // Even on error, mark as ready to not block events forever
      setStoreRef(get());
      markAppReady();
    }
  },

  // ============================================
  // GEOFENCE HANDLERS (delegated to simplified handlers)
  // ============================================
  handleGeofenceEnter: async (locationId, locationName, coords) => {
    await handleGeofenceEnterLogic(get, set, locationId, locationName, coords);
  },

  handleGeofenceExit: async (locationId, locationName, coords) => {
    await handleGeofenceExitLogic(get, set, locationId, locationName, coords);
  },

  // ============================================
  // HELPERS (simplified)
  // ============================================
  resetSkippedToday: () => {
    clearSkippedToday();
    set({ 
      skippedToday: [], 
      lastProcessedEnterLocationId: null,
    });
    logger.info('session', 'Skipped list reset');
  },

  removeFromSkippedToday: (locationId: string) => {
    const { skippedToday } = get();
    if (skippedToday.includes(locationId)) {
      removeFromSkippedTodayBg(locationId);
      set({ skippedToday: skippedToday.filter(id => id !== locationId) });
      logger.debug('session', `Removed ${locationId} from skippedToday`);
    }
  },
  
  resetBootGate: () => {
    resetBootGateHelper();
  },
}));
