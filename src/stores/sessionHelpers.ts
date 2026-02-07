/**
 * Session Helpers - OnSite Timekeeper v3
 *
 * Utility functions for session handlers.
 */

import { logger } from '../lib/logger';

// ============================================
// LOCATION NAME RESOLVER
// ============================================

export function resolveLocationName(locationId: string): string {
  try {
    const { useLocationStore } = require('../stores/locationStore');
    const locationStore = useLocationStore.getState();
    const locations = locationStore.locations || [];
    const location = locations.find(
      (l: { id: string; name: string }) => l.id === locationId
    );
    if (location?.name) {
      return location.name;
    }
  } catch (error) {
    logger.warn('session', 'Error resolving location name', { error: String(error) });
  }

  return 'Unknown Location';
}
