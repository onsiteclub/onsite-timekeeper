/**
 * Map Screen Hooks - OnSite Timekeeper
 *
 * Custom hook for the Jobsites screen (v2: bottom panel, 1-fence limit)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, Keyboard, Animated } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import type { TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';

import {
  useLocationStore,
  selectLocations,
  selectCurrentLocation,
} from '../../stores/locationStore';
import { logger } from '../../lib/logger';
import { getRandomGeofenceColor } from '../../constants/colors';
import {
  DEFAULT_REGION,
  DEFAULT_RADIUS,
  ZOOM_CLOSE,
  ZOOM_DEFAULT,
  MAP_ANIMATION_DURATION,
  GEOCODE_DEBOUNCE,
  type SearchResult,
} from './constants';

// ============================================
// HOOK
// ============================================

export function useMapScreen() {
  // Refs
  const mapRef = useRef<MapView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const geocodeTimer = useRef<ReturnType<typeof setTimeout>>();

  // Store - selectors
  const locations = useLocationStore(selectLocations);
  const currentLocation = useLocationStore(selectCurrentLocation);

  // Store - methods
  const addLocation = useLocationStore(s => s.addLocation);
  const removeLocation = useLocationStore(s => s.removeLocation);
  const editLocation = useLocationStore(s => s.editLocation);
  const refreshCurrentLocation = useLocationStore(s => s.refreshCurrentLocation);

  // ============================================
  // DERIVED STATE
  // ============================================

  const fence = locations.length > 0 ? locations[0] : null;
  const panelState: 'adding' | 'configured' = fence ? 'configured' : 'adding';

  // ============================================
  // STATE
  // ============================================

  const [mapReady, setMapReady] = useState(false);
  const [region, setRegion] = useState<Region>(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        ...ZOOM_DEFAULT,
      };
    }
    return DEFAULT_REGION;
  });

  // Map center (updated on region change)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      return { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }
    return null;
  });

  // Reverse geocoded address
  const [address, setAddress] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  // State A: adding controls
  const [fenceName, setFenceName] = useState('');
  const [fenceNameError, setFenceNameError] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(DEFAULT_RADIUS);
  const [isAdding, setIsAdding] = useState(false);

  // ============================================
  // EFFECTS
  // ============================================

  // Refresh GPS when map tab is focused
  useFocusEffect(
    useCallback(() => {
      refreshCurrentLocation();
    }, [])
  );

  // Update region when location changes before map is ready
  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude && !mapReady) {
      setRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        ...ZOOM_DEFAULT,
      });
    }
  }, [currentLocation, mapReady]);

  // Set initial mapCenter from GPS
  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude && !mapCenter) {
      setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    }
  }, [currentLocation, mapCenter]);

  // Center map on fence when ready (State B)
  useEffect(() => {
    if (!mapReady || !fence) return;
    setTimeout(() => {
      animateToLocation(fence.latitude, fence.longitude, 'close');
    }, 300);
  }, [mapReady, fence?.id]);

  // Reverse geocode existing fence on mount (State B)
  useEffect(() => {
    if (fence && !address) {
      reverseGeocode(fence.latitude, fence.longitude);
    }
  }, [fence?.id]);

  // ============================================
  // HELPERS
  // ============================================

  const shakeInput = useCallback(() => {
    setFenceNameError(true);
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();

    nameInputRef.current?.focus();
    setTimeout(() => setFenceNameError(false), 2000);
  }, [shakeAnimation]);

  const animateToLocation = useCallback((
    latitude: number,
    longitude: number,
    zoom: 'close' | 'default' = 'close'
  ) => {
    const delta = zoom === 'close' ? ZOOM_CLOSE : ZOOM_DEFAULT;
    mapRef.current?.animateToRegion(
      { latitude, longitude, ...delta },
      MAP_ANIMATION_DURATION
    );
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (isGeocoding) return;
    setIsGeocoding(true);
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const addr = r.formattedAddress
          || [r.street, r.city].filter(Boolean).join(', ')
          || [r.name, r.city].filter(Boolean).join(', ')
          || '';
        setAddress(addr);
      } else {
        setAddress('');
      }
    } catch (error) {
      logger.warn('gps', 'Reverse geocode failed', { error: String(error) });
      setAddress('');
    } finally {
      setIsGeocoding(false);
    }
  }, [isGeocoding]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleMapPress = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const handleRegionChange = useCallback((newRegion: Region) => {
    setMapCenter({ lat: newRegion.latitude, lng: newRegion.longitude });

    // Debounced reverse geocode — always update address as user pans
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => {
      reverseGeocode(newRegion.latitude, newRegion.longitude);
    }, GEOCODE_DEBOUNCE);
  }, [reverseGeocode]);

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    animateToLocation(result.latitude, result.longitude, 'close');
  }, [animateToLocation]);

  const handleGoToMyLocation = useCallback(async () => {
    await refreshCurrentLocation();
    if (currentLocation) {
      animateToLocation(currentLocation.latitude, currentLocation.longitude, 'default');
    } else {
      Alert.alert('GPS', 'Location not available');
    }
  }, [currentLocation, animateToLocation, refreshCurrentLocation]);

  const handleAddFence = useCallback(async () => {
    if (!fenceName.trim()) {
      shakeInput();
      return;
    }
    if (!mapCenter) return;

    // 1-fence guard
    if (locations.length > 0) {
      logger.warn('ui', 'Blocked: 1-fence limit');
      return;
    }

    setIsAdding(true);
    try {
      await addLocation(
        fenceName.trim(),
        mapCenter.lat,
        mapCenter.lng,
        selectedRadius,
        getRandomGeofenceColor()
      );

      // Clear form
      setFenceName('');
      setSelectedRadius(DEFAULT_RADIUS);
      setFenceNameError(false);

      // Geocode the saved position for State B
      reverseGeocode(mapCenter.lat, mapCenter.lng);

      logger.info('ui', `Fence added: "${fenceName}"`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not add location');
    } finally {
      setIsAdding(false);
    }
  }, [fenceName, mapCenter, selectedRadius, locations.length, addLocation, shakeInput, reverseGeocode]);

  const handleDeleteFence = useCallback(() => {
    const f = locations[0];
    if (!f) return;

    Alert.alert(
      'Remove Jobsite',
      `Remove "${f.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeLocation(f.id);
              setAddress('');
              logger.info('ui', `Fence deleted: "${f.name}"`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Could not remove');
            }
          },
        },
      ]
    );
  }, [locations, removeLocation]);

  const handleChangeRadius = useCallback(async (newRadius: number) => {
    const f = locations[0];
    if (!f) return;
    try {
      await editLocation(f.id, { radius: newRadius });
      logger.info('ui', `Radius changed: ${f.name} -> ${newRadius}m`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not change radius');
    }
  }, [locations, editLocation]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Refs
    mapRef,
    nameInputRef,
    shakeAnimation,

    // Map state
    region,
    mapCenter,

    // Panel state
    fence,
    panelState,
    address,
    isGeocoding,

    // State A (adding) controls
    fenceName,
    setFenceName,
    fenceNameError,
    setFenceNameError,
    selectedRadius,
    setSelectedRadius,
    isAdding,

    // Store data
    locations,
    currentLocation,

    // Handlers
    handleMapReady,
    handleMapPress,
    handleRegionChange,
    handleSelectSearchResult,
    handleGoToMyLocation,
    handleAddFence,
    handleDeleteFence,
    handleChangeRadius,
  };
}
