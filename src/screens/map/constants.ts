/**
 * Map Screen Constants - OnSite Timekeeper
 *
 * Constants, types, and configuration for the Jobsites screen
 */

import type { Region } from 'react-native-maps';

// ============================================
// DEFAULT VALUES
// ============================================

// Default region (Ottawa, CA)
export const DEFAULT_REGION: Region = {
  latitude: 45.4215,
  longitude: -75.6972,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// Default radius in meters (transistorsoft minimum reliable radius is 200m)
export const DEFAULT_RADIUS = 200;

// Available radius options
export const RADIUS_OPTIONS = [200, 300, 500, 800];

// Debounce delay for autocomplete (ms)
export const AUTOCOMPLETE_DELAY = 400;

// Debounce delay for reverse geocoding (ms)
export const GEOCODE_DEBOUNCE = 500;

// Animation duration for map movements
export const MAP_ANIMATION_DURATION = 500;

// Zoom levels
export const ZOOM_CLOSE: Pick<Region, 'latitudeDelta' | 'longitudeDelta'> = {
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

export const ZOOM_DEFAULT: Pick<Region, 'latitudeDelta' | 'longitudeDelta'> = {
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// ============================================
// TYPES
// ============================================

export interface SearchResult {
  latitude: number;
  longitude: number;
  endereco: string;
  cidade?: string;
  estado?: string;
  pais?: string;
  distancia?: number; // Distance from user in km
}
