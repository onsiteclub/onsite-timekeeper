/**
 * Map Screen Hooks - OnSite Timekeeper
 *
 * Custom hook for the Locations screen (v2: bottom panel, 1-fence limit)
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
import { useSettingsStore } from '../../stores/settingsStore';
import { logger } from '../../lib/logger';
import { getRandomGeofenceColor } from '../../constants/colors';
import {
  DEFAULT_REGION,
  DEFAULT_RADIUS,
  RADIUS_MIN,
  RADIUS_MAX,
  SLIDER_STEP,
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
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Store - selectors
  const locations = useLocationStore(selectLocations);
  const currentLocation = useLocationStore(selectCurrentLocation);

  // Store - methods
  const addLocation = useLocationStore(s => s.addLocation);
  const removeLocation = useLocationStore(s => s.removeLocation);
  const editLocation = useLocationStore(s => s.editLocation);
  const refreshCurrentLocation = useLocationStore(s => s.refreshCurrentLocation);
  const enableAutoLogging = useLocationStore(s => s.enableAutoLogging);
  const disableAutoLogging = useLocationStore(s => s.disableAutoLogging);

  // Auto-logging state
  const autoLoggingEnabled = useSettingsStore(s => s.autoLoggingEnabled);
  const autoStartEnabled = useSettingsStore(s => s.autoStartEnabled);
  const autoStopEnabled = useSettingsStore(s => s.autoStopEnabled);
  const updateSetting = useSettingsStore(s => s.updateSetting);
  const [isTogglingAutoLog, setIsTogglingAutoLog] = useState(false);

  // Trigger mode derived from autoStart/autoStop
  type TriggerMode = 'arrive' | 'leave' | 'both';
  const triggerMode: TriggerMode = autoStartEnabled && autoStopEnabled
    ? 'both'
    : autoStartEnabled
      ? 'arrive'
      : 'leave';

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
  const [addingStep, setAddingStep] = useState<'picking' | 'naming'>('picking');
  const [confirmedCenter, setConfirmedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState('');
  const [fenceName, setFenceName] = useState('');
  const [fenceNameError, setFenceNameError] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState(DEFAULT_RADIUS);
  const [isAdding, setIsAdding] = useState(false);

  // Move mode — user wants to relocate an existing fence without deleting
  const [isMoving, setIsMoving] = useState(false);

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

  const handleConfirmLocation = useCallback(() => {
    if (!mapCenter) return;
    setConfirmedCenter({ lat: mapCenter.lat, lng: mapCenter.lng });
    setConfirmedAddress(address);
    // Auto-suggest name from address (first part before comma)
    const suggested = address ? address.split(',')[0].trim().substring(0, 40) : '';
    setFenceName(suggested);
    setAddingStep('naming');
  }, [mapCenter, address]);

  const handleCancelNaming = useCallback(() => {
    setAddingStep('picking');
    setConfirmedCenter(null);
    setConfirmedAddress('');
    setFenceName('');
    setFenceNameError(false);
  }, []);

  const doAddFence = useCallback(async () => {
    const center = confirmedCenter || mapCenter;
    if (!center) return;
    setIsAdding(true);
    try {
      const radius = useSettingsStore.getState().defaultRadius;
      await addLocation(
        fenceName.trim(),
        center.lat,
        center.lng,
        radius,
        getRandomGeofenceColor()
      );

      // Clear form + reset step
      setFenceName('');
      setSelectedRadius(DEFAULT_RADIUS);
      setFenceNameError(false);
      setAddingStep('picking');
      setConfirmedCenter(null);
      setConfirmedAddress('');

      // Geocode the saved position for State B
      reverseGeocode(center.lat, center.lng);

      logger.info('ui', `Fence added: "${fenceName}"`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not add location');
    } finally {
      setIsAdding(false);
    }
  }, [fenceName, confirmedCenter, mapCenter, addLocation, reverseGeocode]);

  const handleAddFence = useCallback(async () => {
    if (!fenceName.trim()) {
      shakeInput();
      return;
    }
    if (!mapCenter) return;

    // 1-fence limit: offer to replace existing
    if (locations.length > 0) {
      const existing = locations[0];
      Alert.alert(
        'Replace Location?',
        `You already have "${existing.name}" saved.\n\nReplace it with "${fenceName.trim()}"?`,
        [
          { text: 'Keep Current', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await removeLocation(existing.id);
                logger.info('ui', `Fence replaced: "${existing.name}" → "${fenceName.trim()}"`);
                await doAddFence();
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Could not replace location');
              }
            },
          },
        ]
      );
      return;
    }

    await doAddFence();
  }, [fenceName, mapCenter, locations, shakeInput, removeLocation, doAddFence]);

  const handleDeleteFence = useCallback(() => {
    const f = locations[0];
    if (!f) return;

    Alert.alert(
      'Delete Location?',
      `"${f.name}" will be permanently removed.\n\nYour logged hours will NOT be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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

  // Slider handler — snaps to SLIDER_STEP increments, debounced save
  const sliderDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sliderValue, setSliderValue] = useState<number | null>(null);

  const handleSliderChange = useCallback((value: number) => {
    const snapped = Math.round(value / SLIDER_STEP) * SLIDER_STEP;
    setSliderValue(snapped);
  }, []);

  const handleSliderComplete = useCallback((value: number) => {
    const snapped = Math.round(value / SLIDER_STEP) * SLIDER_STEP;
    setSliderValue(snapped);
    if (sliderDebounce.current) clearTimeout(sliderDebounce.current);
    sliderDebounce.current = setTimeout(() => {
      handleChangeRadius(snapped);
    }, 300);
  }, [handleChangeRadius]);

  // Rename location handler
  const handleRenameLocation = useCallback((newName: string) => {
    const f = locations[0];
    if (!f || !newName.trim()) return;
    editLocation(f.id, { name: newName.trim() });
    logger.info('ui', `Location renamed: "${f.name}" → "${newName.trim()}"`);
  }, [locations, editLocation]);

  // ============================================
  // MOVE LOCATION (relocate existing fence)
  // ============================================

  const handleStartMove = useCallback(() => {
    const f = locations[0];
    if (!f) return;
    setIsMoving(true);
    setTimeout(() => animateToLocation(f.latitude, f.longitude, 'close'), 100);
    logger.info('ui', `Move started: ${f.name}`);
  }, [locations, animateToLocation]);

  const handleCancelMove = useCallback(() => {
    const f = locations[0];
    setIsMoving(false);
    if (f) {
      setTimeout(() => animateToLocation(f.latitude, f.longitude, 'close'), 100);
    }
  }, [locations, animateToLocation]);

  const handleConfirmMove = useCallback(async () => {
    const f = locations[0];
    if (!f || !mapCenter) return;
    try {
      await editLocation(f.id, {
        latitude: mapCenter.lat,
        longitude: mapCenter.lng,
      });
      setIsMoving(false);
      reverseGeocode(mapCenter.lat, mapCenter.lng);
      logger.info('ui', `Location moved: ${f.name}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not move location');
    }
  }, [locations, mapCenter, editLocation, reverseGeocode]);

  // Draggable marker drop — quick relocation with confirm
  const handleMarkerDragEnd = useCallback((latitude: number, longitude: number) => {
    const f = locations[0];
    if (!f) return;
    Alert.alert(
      'Move location?',
      `Move "${f.name}" to this new position?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          // Re-center on original so the marker visually snaps back
          onPress: () => animateToLocation(f.latitude, f.longitude, 'close'),
        },
        {
          text: 'Move',
          onPress: async () => {
            try {
              await editLocation(f.id, { latitude, longitude });
              reverseGeocode(latitude, longitude);
              logger.info('ui', `Location moved via drag: ${f.name}`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Could not move');
            }
          },
        },
      ]
    );
  }, [locations, editLocation, reverseGeocode, animateToLocation]);

  // ============================================
  // AUTO-LOGGING TOGGLE
  // ============================================

  const handleToggleAutoLogging = useCallback(async (value: boolean) => {
    if (value) {
      setIsTogglingAutoLog(true);
      try {
        updateSetting('autoStartEnabled', true);
        updateSetting('autoStopEnabled', true);
        await enableAutoLogging();
      } finally {
        setIsTogglingAutoLog(false);
      }
    } else {
      // Confirm before turning off
      Alert.alert(
        'Turn off Auto-logging?',
        'This will disable background location detection. Your hours will no longer be logged automatically and the map will be locked.\n\nYou can still log hours manually anytime.',
        [
          { text: 'Keep On', style: 'cancel' },
          {
            text: 'Turn Off',
            style: 'destructive',
            onPress: async () => {
              setIsTogglingAutoLog(true);
              try {
                await disableAutoLogging();
              } finally {
                setIsTogglingAutoLog(false);
              }
            },
          },
        ]
      );
    }
  }, [enableAutoLogging, disableAutoLogging, updateSetting]);

  const handleTriggerModeChange = useCallback((mode: TriggerMode) => {
    switch (mode) {
      case 'arrive':
        updateSetting('autoStartEnabled', true);
        updateSetting('autoStopEnabled', false);
        break;
      case 'leave':
        updateSetting('autoStartEnabled', false);
        updateSetting('autoStopEnabled', true);
        break;
      case 'both':
        updateSetting('autoStartEnabled', true);
        updateSetting('autoStopEnabled', true);
        break;
    }
    logger.info('ui', `Trigger mode changed: ${mode}`);
  }, [updateSetting]);

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
    addingStep,
    confirmedAddress,
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

    // Auto-logging
    autoLoggingEnabled,
    isTogglingAutoLog,
    handleToggleAutoLogging,

    // Trigger mode
    triggerMode,
    handleTriggerModeChange,

    // Slider state
    sliderValue,
    handleSliderChange,
    handleSliderComplete,

    // Handlers
    handleMapReady,
    handleMapPress,
    handleRegionChange,
    handleSelectSearchResult,
    handleGoToMyLocation,
    handleConfirmLocation,
    handleCancelNaming,
    handleAddFence,
    handleDeleteFence,
    handleChangeRadius,
    handleRenameLocation,

    // Move mode
    isMoving,
    handleStartMove,
    handleConfirmMove,
    handleCancelMove,
    handleMarkerDragEnd,
  };
}
