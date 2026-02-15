/**
 * Map Screen Hooks - OnSite Timekeeper
 * 
 * Custom hook containing all logic for the Map screen
 * 
 * REFACTORED: Updated to use English selectors and methods
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, Keyboard, Animated } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import type { TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';

import {
  useLocationStore,
  selectLocations,
  selectCurrentLocation,
  selectIsGeofencingActive,
  type WorkLocation,
} from '../../stores/locationStore';
import { logger } from '../../lib/logger';
import { getRandomGeofenceColor } from '../../constants/colors';
import {
  DEFAULT_REGION,
  DEFAULT_RADIUS,
  ZOOM_CLOSE,
  ZOOM_DEFAULT,
  MAP_ANIMATION_DURATION,
  type TempPin,
  type SearchResult,
} from './constants';

// ============================================
// HOOK
// ============================================

export function useMapScreen() {
  // URL params - for centering on specific location
  const params = useLocalSearchParams<{ locationId?: string }>();
  const targetLocationId = params.locationId;

  // Refs
  const mapRef = useRef<MapView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // Store - selectors for state
  const locations = useLocationStore(selectLocations);
  const currentLocation = useLocationStore(selectCurrentLocation);
  const isMonitoringActive = useLocationStore(selectIsGeofencingActive);
  
  // Store - methods (English names)
  const addLocation = useLocationStore(s => s.addLocation);
  const removeLocation = useLocationStore(s => s.removeLocation);
  const editLocation = useLocationStore(s => s.editLocation);
  const startMonitoring = useLocationStore(s => s.startMonitoring);
  const stopMonitoring = useLocationStore(s => s.stopMonitoring);
  // FIX: Use refreshCurrentLocation instead of updateLocation for getting GPS
  const refreshCurrentLocation = useLocationStore(s => s.refreshCurrentLocation);

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

  // Temporary pin (before confirming)
  const [tempPin, setTempPin] = useState<TempPin | null>(null);

  // Radius adjustment modal - store full object to avoid race condition
  const [selectedLocation, setSelectedLocation] = useState<WorkLocation | null>(null);
  const [showRadiusModal, setShowRadiusModal] = useState(false);

  // Add location modal
  const [showNameModal, setShowNameModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationRadius, setNewLocationRadius] = useState(DEFAULT_RADIUS);
  const [nameInputError, setNameInputError] = useState(false);

  // Loading
  const [isAdding, setIsAdding] = useState(false);

  // Track current map center for onboarding circle (when no locations yet)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      return { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }
    return null;
  });

  // ============================================
  // EFFECTS
  // ============================================

  // Refresh GPS when map tab is focused (not just on mount)
  useFocusEffect(
    useCallback(() => {
      refreshCurrentLocation();
    }, [])
  );

  // Update region when location changes
  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude && !mapReady) {
      setRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        ...ZOOM_DEFAULT,
      });
    }
  }, [currentLocation, mapReady]);

  // FIX: Update mapCenter when currentLocation changes (for onboarding circle)
  // This ensures the circle is tappable even if user hasn't panned the map
  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude && !mapCenter) {
      logger.debug('ui', '📍 Setting initial mapCenter from GPS');
      setMapCenter({ lat: currentLocation.latitude, lng: currentLocation.longitude });
    }
  }, [currentLocation, mapCenter]);

  // ============================================
  // HELPERS
  // ============================================

  const shakeInput = useCallback(() => {
    setNameInputError(true);
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();

    nameInputRef.current?.focus();
    setTimeout(() => setNameInputError(false), 2000);
  }, [shakeAnimation]);

  const cancelAndClearPin = useCallback(() => {
    logger.debug('ui', '❌ Add location cancelled');
    setShowNameModal(false);
    setTempPin(null);
    setNewLocationName('');
    setNewLocationRadius(DEFAULT_RADIUS);
    setNameInputError(false);
  }, []);

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

  const fitToAllLocations = useCallback(() => {
    if (locations.length === 0) {
      logger.debug('ui', '⚠️ No locations to fit - using current location or default');
      if (currentLocation) {
        animateToLocation(currentLocation.latitude, currentLocation.longitude, 'default');
      }
      return;
    }

    if (locations.length === 1) {
      // Single location - just center on it with close zoom
      logger.debug('ui', `📍 Fitting to single location: "${locations[0].name}"`);
      animateToLocation(locations[0].latitude, locations[0].longitude, 'close');
      return;
    }

    // Multiple locations - fit to bounds
    logger.debug('ui', `📍 Fitting map to ${locations.length} locations`);
    const coordinates = locations.map(loc => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
    }));

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
      animated: true,
    });
  }, [locations, currentLocation, animateToLocation]);

  // Handle map navigation based on URL params
  useEffect(() => {
    if (!mapReady) return;

    if (targetLocationId) {
      // Long press from home - center specific location
      const targetLocation = locations.find(loc => loc.id === targetLocationId);
      if (targetLocation) {
        logger.info('ui', `🎯 Centering map on: "${targetLocation.name}" (from URL param)`);
        // Small delay to ensure map is fully rendered
        setTimeout(() => {
          animateToLocation(targetLocation.latitude, targetLocation.longitude, 'close');
        }, 300);
      } else {
        logger.warn('ui', `⚠️ Target location not found: ${targetLocationId}`);
      }
    } else if (locations.length > 0) {
      // Normal navigation - fit all locations
      logger.info('ui', '🗺️ Fitting map to all locations (normal navigation)');
      setTimeout(() => {
        fitToAllLocations();
      }, 300);
    }
  }, [mapReady, targetLocationId, locations, animateToLocation, fitToAllLocations]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleMapReady = useCallback(() => {
    console.log('🗺️ Map loaded');
    setMapReady(true);
  }, []);

  const handleMapPress = useCallback(() => {
    // Simple tap just dismisses keyboard
    Keyboard.dismiss();
  }, []);

  // Track map center as user pans (for onboarding circle)
  const handleRegionChange = useCallback((newRegion: Region) => {
    setMapCenter({ lat: newRegion.latitude, lng: newRegion.longitude });
  }, []);

  // Handler for clicking the onboarding circle (creates location at map center)
  const handleOnboardingCirclePress = useCallback(() => {
    logger.info('ui', '🔵 Onboarding circle TAP received', {
      hasMapCenter: !!mapCenter,
      mapCenter: mapCenter ? `${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)}` : 'null',
      hasCurrentLocation: !!currentLocation,
    });

    if (!mapCenter) {
      logger.warn('ui', '⚠️ mapCenter is null - cannot add location');
      return;
    }

    Keyboard.dismiss();
    logger.debug('ui', '🔵 Onboarding circle pressed - creating temp pin at map center', {
      lat: mapCenter.lat.toFixed(5),
      lng: mapCenter.lng.toFixed(5)
    });

    setTempPin({ lat: mapCenter.lat, lng: mapCenter.lng });
    setNewLocationName('');
    setNewLocationRadius(DEFAULT_RADIUS);
    setNameInputError(false);
    setShowNameModal(true);
  }, [mapCenter, currentLocation]);

  const handleMapLongPress = useCallback((e: any) => {
    Keyboard.dismiss();

    const { latitude, longitude } = e.nativeEvent.coordinate;
    logger.debug('ui', '📍 Map long press - creating temp pin', { lat: latitude.toFixed(5), lng: longitude.toFixed(5) });
    setTempPin({ lat: latitude, lng: longitude });

    // Open name modal automatically
    setNewLocationName('');
    setNewLocationRadius(DEFAULT_RADIUS);
    setNameInputError(false);
    setShowNameModal(true);
  }, []);

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    // Move map to center on search result
    // The onboarding circle will be positioned over this location
    animateToLocation(result.latitude, result.longitude, 'close');

    // If user already has locations, open the modal directly
    // Otherwise, they'll click the onboarding circle
    if (locations.length > 0) {
      setTempPin({ lat: result.latitude, lng: result.longitude });
      setTimeout(() => {
        setNewLocationName('');
        setNewLocationRadius(DEFAULT_RADIUS);
        setNameInputError(false);
        setShowNameModal(true);
      }, 600);
    }
    // For new users (no locations), the pulsing circle guides them to tap
  }, [animateToLocation, locations.length]);

  const handleGoToMyLocation = useCallback(async () => {
    // Request fresh GPS before animating (don't use stale position)
    await refreshCurrentLocation();
    if (currentLocation) {
      animateToLocation(currentLocation.latitude, currentLocation.longitude, 'default');
    } else {
      Alert.alert('GPS', 'Location not available');
    }
  }, [currentLocation, animateToLocation, refreshCurrentLocation]);

  const handleConfirmAddLocation = useCallback(async () => {
    // Validation: if no name, shake and don't close
    if (!newLocationName.trim()) {
      logger.debug('ui', '⚠️ Location name empty - validation failed');
      shakeInput();
      return;
    }
    if (!tempPin) return;

    setIsAdding(true);
    logger.info('ui', `➕ Adding location: "${newLocationName}"`, { 
      lat: tempPin.lat.toFixed(5), 
      lng: tempPin.lng.toFixed(5),
      radius: newLocationRadius 
    });
    
    try {
      // FIX: addLocation now takes separate arguments, not an object
      await addLocation(
        newLocationName.trim(),
        tempPin.lat,
        tempPin.lng,
        newLocationRadius,
        getRandomGeofenceColor()
      );

      // Clear everything
      setTempPin(null);
      setShowNameModal(false);
      setNewLocationName('');
      setNewLocationRadius(DEFAULT_RADIUS);
      setNameInputError(false);

      logger.info('ui', `✅ Location added successfully: "${newLocationName}"`);
      Alert.alert('✅ Success', `Location "${newLocationName}" added!`);
    } catch (error: any) {
      logger.error('ui', `❌ Failed to add location: "${newLocationName}"`, { error: error.message });
      Alert.alert('Error', error.message || 'Could not add location');
    } finally {
      setIsAdding(false);
    }
  }, [newLocationName, tempPin, newLocationRadius, addLocation, shakeInput]);

  const handleCirclePress = useCallback((locationId: string) => {
    const location = locations.find(l => l.id === locationId);
    if (location) {
      logger.debug('ui', `🎯 Opening options modal: "${location.name}"`);

      // Center the location when clicked
      animateToLocation(location.latitude, location.longitude, 'close');

      setSelectedLocation(location);
      setShowRadiusModal(true);
    } else {
      logger.warn('ui', `⚠️ Location not found for id: ${locationId}`);
    }
  }, [locations, animateToLocation]);

  const handleCircleLongPress = useCallback((locationId: string, locationName: string) => {
    logger.debug('ui', `🗑️ Delete requested: "${locationName}"`);
    Alert.alert(
      '🗑️ Remove Location',
      `Remove "${locationName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            logger.info('ui', `🗑️ Deleting location: "${locationName}"`, { id: locationId });
            try {
              await removeLocation(locationId);
              logger.info('ui', `✅ Location deleted: "${locationName}"`);

              // Auto-adjust zoom to fit remaining locations
              setTimeout(() => {
                fitToAllLocations();
              }, 500);
            } catch (error: any) {
              logger.error('ui', `❌ Failed to delete location: "${locationName}"`, { error: error.message });
              Alert.alert('Error', error.message || 'Could not remove');
            }
          },
        },
      ]
    );
  }, [removeLocation, fitToAllLocations]);

  const handleChangeRadius = useCallback(async (newRadius: number) => {
    if (!selectedLocation) return;

    logger.info('ui', `📏 Changing radius: "${selectedLocation.name}"`, { 
      from: selectedLocation.radius, 
      to: newRadius 
    });
    
    try {
      await editLocation(selectedLocation.id, { radius: newRadius });
      logger.info('ui', `✅ Radius updated: "${selectedLocation.name}" → ${newRadius}m`);
      setShowRadiusModal(false);
      setSelectedLocation(null);
    } catch (error: any) {
      logger.error('ui', `❌ Failed to change radius: "${selectedLocation.name}"`, { error: error.message });
      Alert.alert('Error', error.message || 'Could not change radius');
    }
  }, [selectedLocation, editLocation]);

  const handleToggleMonitoring = useCallback(() => {
    if (isMonitoringActive) {
      logger.info('ui', '⏹️ User toggled monitoring OFF');
      stopMonitoring();
    } else {
      if (locations.length === 0) {
        logger.warn('ui', '⚠️ Cannot start monitoring - no locations');
        Alert.alert('Warning', 'Add at least one location first');
        return;
      }
      logger.info('ui', `▶️ User toggled monitoring ON (${locations.length} locations)`);
      startMonitoring();
    }
  }, [isMonitoringActive, locations.length, startMonitoring, stopMonitoring]);

  const handleLocationChipPress = useCallback((latitude: number, longitude: number) => {
    animateToLocation(latitude, longitude, 'close');
  }, [animateToLocation]);

  const handleCloseRadiusModal = useCallback(() => {
    logger.debug('ui', '❌ Options modal closed');
    setShowRadiusModal(false);
    setSelectedLocation(null);
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Refs
    mapRef,
    nameInputRef,
    shakeAnimation,

    // State
    mapReady,
    region,
    tempPin,
    showNameModal,
    newLocationName,
    newLocationRadius,
    nameInputError,
    isAdding,
    showRadiusModal,
    selectedLocation,
    mapCenter,

    // Store data
    locations,
    currentLocation,
    isMonitoringActive,

    // Setters
    setNewLocationName,
    setNewLocationRadius,
    setNameInputError,

    // Handlers
    handleMapReady,
    handleMapPress,
    handleMapLongPress,
    handleRegionChange,
    handleOnboardingCirclePress,
    handleSelectSearchResult,
    handleGoToMyLocation,
    handleConfirmAddLocation,
    handleCirclePress,
    handleCircleLongPress,
    handleChangeRadius,
    handleToggleMonitoring,
    handleCloseRadiusModal,
    cancelAndClearPin,
  };
}
