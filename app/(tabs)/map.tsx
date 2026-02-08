/**
 * Map Screen - OnSite Timekeeper
 *
 * Screen to manage work locations:
 * - Search address at top
 * - Pulsing blue circle for onboarding (tap to add location)
 * - Long press on circle = delete
 * - Click on circle = adjust radius
 *
 * REFACTORED: Using EN property names (name, radius, color)
 * UPDATED: Added permission banner for foreground service warnings
 * v2.2: Pulsing circle onboarding - tap circle to add location
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  TextInput,
  StyleSheet,
  Easing,
  Alert,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { colors, withOpacity } from '../../src/constants/colors';
import { useMapScreen } from '../../src/screens/map/hooks';
import { SearchBox } from '../../src/screens/map/SearchBox';
import { styles } from '../../src/screens/map/styles';
import { RADIUS_OPTIONS } from '../../src/screens/map/constants';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';

// Circle size in pixels (represents ~100m radius visually at typical zoom)
const CIRCLE_SIZE = 120;

// ============================================
// COMPONENT
// ============================================

export default function MapScreen() {
  // Pulsing animation for onboarding circle
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  // Success toast
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const successToastAnim = useRef(new Animated.Value(0)).current;
  const prevLocationsCount = useRef(0);

  const {
    // Refs
    mapRef,
    nameInputRef,
    shakeAnimation,

    // State
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
  } = useMapScreen();

  // Pulsing animation loop (always visible for adding new locations)
  useEffect(() => {
    if (!showNameModal) {
      const animation = Animated.loop(
        Animated.sequence([
          // Pulse out
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.15,
              duration: 1000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.5,
              duration: 1000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          // Pulse in
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1000,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.3,
              duration: 1000,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [showNameModal, pulseAnim, opacityAnim]);

  // Detect first location added → show success toast
  useEffect(() => {
    if (prevLocationsCount.current === 0 && locations.length === 1) {
      setShowSuccessToast(true);
      Animated.sequence([
        Animated.timing(successToastAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(5000),
        Animated.timing(successToastAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowSuccessToast(false));
    }
    prevLocationsCount.current = locations.length;
  }, [locations.length, successToastAnim]);

  return (
    <View style={styles.container}>
      {/* MAP */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={region}
        onMapReady={handleMapReady}
        onPress={handleMapPress}
        onLongPress={locations.length > 0 ? handleMapLongPress : undefined}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        loadingEnabled={true}
        loadingIndicatorColor={colors.primary}
      >
        {/* Registered location circles */}
        {locations.map((location) => (
          <React.Fragment key={location.id}>
            <Circle
              center={{ latitude: location.latitude, longitude: location.longitude }}
              radius={location.radius}
              fillColor={withOpacity(location.color, 0.25)}
              strokeColor={location.color}
              strokeWidth={2}
            />
            {/* Label with location name - tappable to open options */}
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => handleCirclePress(location.id)}
            >
              <View style={styles.locationLabel}>
                <View style={[styles.locationLabelDot, { backgroundColor: location.color }]} />
                <Text style={styles.locationLabelText} numberOfLines={1}>
                  {location.name}
                </Text>
                <Ionicons name="settings-outline" size={12} color={colors.textMuted} />
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {/* Temporary pin - only shows if modal is open */}
        {tempPin && showNameModal && (
          <>
            <Circle
              center={{ latitude: tempPin.lat, longitude: tempPin.lng }}
              radius={newLocationRadius}
              fillColor={withOpacity(colors.primary, 0.2)}
              strokeColor={colors.primary}
              strokeWidth={2}
              lineDashPattern={[5, 5]}
            />
            <Marker
              coordinate={{ latitude: tempPin.lat, longitude: tempPin.lng }}
              tracksViewChanges={false}
            >
              <View style={[styles.marker, styles.tempMarker]}>
                <Text style={styles.markerText}>📌</Text>
              </View>
            </Marker>
          </>
        )}
      </MapView>

      {/* CENTER PIN - Shows where new location will be placed */}
      {!showNameModal && !showRadiusModal && (
        <View style={onboardingStyles.crosshairContainer} pointerEvents="none">
          <Ionicons name="location" size={36} color={colors.primary} style={{ marginTop: -36 }} />
          <View style={onboardingStyles.crosshairDot} />
        </View>
      )}

      {/* SEARCH BOX - Memoized component */}
      <SearchBox
        currentLatitude={currentLocation?.latitude}
        currentLongitude={currentLocation?.longitude}
        onSelectResult={handleSelectSearchResult}
      />

      {/* PERMISSION BANNER - Absolutely positioned to not interfere with layout */}
      <View style={onboardingStyles.permissionBannerWrapper} pointerEvents="box-none">
        <MapPermissionBanner />
      </View>

      {/* MY LOCATION BUTTON - with explicit elevation for Android */}
      <TouchableOpacity
        style={[styles.myLocationButton, { elevation: 10, zIndex: 100 }]}
        onPress={handleGoToMyLocation}
        activeOpacity={0.7}
      >
        <Ionicons name="locate" size={24} color={colors.primary} />
      </TouchableOpacity>

      {/* MONITORING BUTTON - with explicit elevation for Android */}
      <TouchableOpacity
        style={[styles.monitorButton, isMonitoringActive && styles.monitorButtonActive, { elevation: 10, zIndex: 100 }]}
        onPress={handleToggleMonitoring}
        activeOpacity={0.7}
      >
        <Text style={[styles.monitorText, isMonitoringActive && styles.monitorTextActive]}>
          {isMonitoringActive ? '🟢 Monitoring' : '⚪ Monitoring OFF'}
        </Text>
      </TouchableOpacity>

      {/* FAB button to add location */}
      {!showNameModal && (
        <TouchableOpacity
          style={onboardingStyles.fab}
          onPress={handleOnboardingCirclePress}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* SUCCESS TOAST (after first location added) */}
      {showSuccessToast && (
        <Animated.View
          style={[
            onboardingStyles.successToast,
            { opacity: successToastAnim }
          ]}
        >
          <View style={onboardingStyles.successToastIcon}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          </View>
          <View style={onboardingStyles.successToastContent}>
            <Text style={onboardingStyles.successToastTitle}>Location Added!</Text>
            <Text style={onboardingStyles.successToastText}>
              Now you can log hours manually in Home, or enter this area to start tracking automatically.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* NAME MODAL */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={cancelAndClearPin}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={cancelAndClearPin}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <Animated.View
              style={[
                styles.nameModal,
                { transform: [{ translateX: shakeAnimation }] }
              ]}
            >
              <Text style={styles.nameModalTitle}>📍 New Location</Text>
              <Text style={styles.nameModalSubtitle}>
                Give this place a name
              </Text>

              <TextInput
                ref={nameInputRef}
                style={[styles.nameInput, nameInputError && styles.nameInputError]}
                placeholder="e.g. Main Office, Jobsite A..."
                placeholderTextColor={colors.textSecondary}
                value={newLocationName}
                onChangeText={(text) => {
                  setNewLocationName(text);
                  if (nameInputError) setNameInputError(false);
                }}
                autoFocus
                maxLength={40}
              />
              {nameInputError && (
                <Text style={styles.nameInputErrorText}>Please enter a name</Text>
              )}

              <Text style={styles.radiusSectionTitle}>Detection Radius</Text>
              <View style={styles.radiusOptionsInline}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.radiusOptionSmall,
                      newLocationRadius === r && styles.radiusOptionSmallActive,
                    ]}
                    onPress={() => setNewLocationRadius(r)}
                  >
                    <Text
                      style={[
                        styles.radiusOptionSmallText,
                        newLocationRadius === r && styles.radiusOptionSmallTextActive,
                      ]}
                    >
                      {r}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.nameModalActions}>
                <TouchableOpacity
                  style={styles.nameModalCancel}
                  onPress={cancelAndClearPin}
                >
                  <Text style={styles.nameModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nameModalConfirm, isAdding && styles.nameModalConfirmDisabled]}
                  onPress={handleConfirmAddLocation}
                  disabled={isAdding}
                >
                  <Text style={styles.nameModalConfirmText}>
                    {isAdding ? 'Adding...' : 'Add Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* LOCATION OPTIONS MODAL */}
      <Modal
        visible={showRadiusModal && selectedLocation !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseRadiusModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseRadiusModal}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.optionsModal}>
              {/* Header */}
              <View style={styles.optionsModalHeader}>
                <View style={[styles.optionsModalIcon, { backgroundColor: selectedLocation?.color || colors.primary }]}>
                  <Ionicons name="location" size={20} color={colors.white} />
                </View>
                <View style={styles.optionsModalHeaderInfo}>
                  <Text style={styles.optionsModalTitle}>{selectedLocation?.name || 'Location'}</Text>
                  <Text style={styles.optionsModalSubtitle}>
                    {selectedLocation?.latitude?.toFixed(4) || '0'}, {selectedLocation?.longitude?.toFixed(4) || '0'}
                  </Text>
                </View>
              </View>

              <View style={styles.optionsModalDivider} />

              {/* Radius Section */}
              <Text style={styles.optionsSectionLabel}>Detection Radius</Text>
              <View style={styles.radiusOptionsRow}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.radiusChip,
                      selectedLocation?.radius === r && styles.radiusChipActive,
                    ]}
                    onPress={() => handleChangeRadius(r)}
                  >
                    <Text
                      style={[
                        styles.radiusChipText,
                        selectedLocation?.radius === r && styles.radiusChipTextActive,
                      ]}
                    >
                      {r}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.optionsModalDivider} />

              {/* Actions List */}
              <View style={styles.optionsActionsList}>
                {/* Edit Name */}
                <TouchableOpacity
                  style={styles.optionsActionItem}
                  onPress={() => {
                    handleCloseRadiusModal();
                    Alert.alert('Coming Soon', 'Edit name will be available in a future update.');
                  }}
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.text} />
                  <Text style={styles.optionsActionText}>Edit Name</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Change Color */}
                <TouchableOpacity
                  style={styles.optionsActionItem}
                  onPress={() => {
                    handleCloseRadiusModal();
                    Alert.alert('Coming Soon', 'Color picker will be available in a future update.');
                  }}
                >
                  <Ionicons name="color-palette-outline" size={20} color={colors.text} />
                  <Text style={styles.optionsActionText}>Change Color</Text>
                  <View style={[styles.colorPreview, { backgroundColor: selectedLocation?.color || colors.primary }]} />
                </TouchableOpacity>

                {/* Pause Tracking */}
                <TouchableOpacity
                  style={styles.optionsActionItem}
                  onPress={() => {
                    handleCloseRadiusModal();
                    Alert.alert('Coming Soon', 'Pause tracking will be available in a future update.');
                  }}
                >
                  <Ionicons name="pause-circle-outline" size={20} color={colors.text} />
                  <Text style={styles.optionsActionText}>Pause Tracking</Text>
                  <Text style={styles.optionsActionHint}>For vacations</Text>
                </TouchableOpacity>

                {/* Open in Maps */}
                <TouchableOpacity
                  style={styles.optionsActionItem}
                  onPress={() => {
                    if (selectedLocation) {
                      const url = `https://www.google.com/maps/search/?api=1&query=${selectedLocation.latitude},${selectedLocation.longitude}`;
                      import('react-native').then(({ Linking }) => Linking.openURL(url));
                    }
                  }}
                >
                  <Ionicons name="navigate-outline" size={20} color={colors.text} />
                  <Text style={styles.optionsActionText}>Open in Maps</Text>
                  <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.optionsModalDivider} />

              {/* Delete */}
              <TouchableOpacity
                style={styles.optionsDeleteBtn}
                onPress={() => {
                  handleCloseRadiusModal();
                  if (selectedLocation) {
                    handleCircleLongPress(selectedLocation.id, selectedLocation.name);
                  }
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={styles.optionsDeleteText}>Delete Location</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ============================================
// ONBOARDING STYLES
// ============================================
const onboardingStyles = StyleSheet.create({
  // Permission banner wrapper - absolutely positioned to not interfere with layout
  permissionBannerWrapper: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 5,
  },
  // Crosshair container - centered on screen (visual indicator only)
  crosshairContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: 40,
    height: 2,
    backgroundColor: colors.primary,
  },
  crosshairVertical: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: colors.primary,
  },
  crosshairDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  // FAB button - fixed position at bottom right
  fab: {
    position: 'absolute',
    bottom: 120,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  // Instruction container
  instructionContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 80,
  },
  instructionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Success toast
  successToast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  successToastIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  successToastContent: {
    flex: 1,
  },
  successToastTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  successToastText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
