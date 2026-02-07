/**
 * Work Session Store - OnSite Timekeeper v3
 *
 * SIMPLIFIED: Delegates to exitHandler. No dedup, no boot gate.
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

import {
  handleGeofenceEnterLogic,
  handleGeofenceExitLogic,
} from './sessionHandlers';

// ============================================
// STORE INTERFACE (v3 SIMPLIFIED)
// ============================================

interface WorkSessionState {
  isInitialized: boolean;
  skippedToday: string[];

  // Actions
  initialize: () => Promise<void>;

  // Geofence handlers (delegated to exitHandler)
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

  // Helpers
  resetSkippedToday: () => void;
  removeFromSkippedToday: (locationId: string) => void;
}

// ============================================
// STORE
// ============================================

export const useWorkSessionStore = create<WorkSessionState>((set, get) => ({
  // Initial state (v3 simplified)
  isInitialized: false,
  skippedToday: [],

  // ============================================
  // INITIALIZE
  // ============================================
  initialize: async () => {
    if (get().isInitialized) return;

    try {
      logger.info('boot', '⏱️ Initializing work session store v3...');

      await requestNotificationPermission();
      await configureNotificationCategories();

      // Simplified notification response listener
      addResponseListener((response) => {
        const actionIdentifier = response.actionIdentifier;
        const data = response.notification.request.content
          .data as GeofenceNotificationData | undefined;

        logger.info('notification', `📲 Notification tapped: ${actionIdentifier}`, {
          type: data?.type,
        });
        // All notifications are informative - tapping opens app
      });

      set({ isInitialized: true });
      logger.info('boot', '✅ Work session store v3 initialized');
    } catch (error) {
      logger.error('session', 'Error initializing', { error: String(error) });
      set({ isInitialized: true });
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
  // HELPERS
  // ============================================
  resetSkippedToday: () => {
    clearSkippedToday();
    set({ skippedToday: [] });
    logger.info('session', 'Skipped list reset');
  },

  removeFromSkippedToday: (locationId: string) => {
    const { skippedToday } = get();
    if (skippedToday.includes(locationId)) {
      removeFromSkippedTodayBg(locationId);
      set({ skippedToday: skippedToday.filter((id) => id !== locationId) });
      logger.debug('session', `Removed ${locationId} from skippedToday`);
    }
  },
}));
