/**
 * Locations Screen - OnSite Timekeeper
 *
 * v3: Map (75%) + Bottom Panel (25%)
 * - Single fence limit (delete to add new)
 * - Bottom panel with stepper, auto-logging toggle, trigger mode
 * - Reverse geocoding for address display
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ScrollView,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { colors, withOpacity } from '../../src/constants/colors';
import { useMapScreen } from '../../src/screens/map/hooks';
import { SearchBox } from '../../src/screens/map/SearchBox';
import { styles } from '../../src/screens/map/styles';
import { RADIUS_MIN, RADIUS_MAX } from '../../src/screens/map/constants';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';
import { usePermissionStatus } from '../../src/hooks/usePermissionStatus';

const RADIUS_CHIPS = [50, 100, 150, 200, 300, 500];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinIcon = require('../../assets/notification-icon.png');

export default function MapScreen() {
  const {
    mapRef, nameInputRef, shakeAnimation,
    region, mapCenter,
    fence, panelState, address, isGeocoding,
    fenceName, setFenceName, fenceNameError, setFenceNameError,
    selectedRadius, setSelectedRadius, isAdding,
    currentLocation,
    autoLoggingEnabled, isTogglingAutoLog, handleToggleAutoLogging,
    handleMapReady, handleMapPress, handleRegionChange,
    handleSelectSearchResult, handleGoToMyLocation,
    handleAddFence, handleDeleteFence, handleChangeRadius,
  } = useMapScreen();

  const { canTrackReliably, openAppSettings } = usePermissionStatus();

  const isAddingMode = panelState === 'adding';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ===== MAP SECTION ===== */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          onMapReady={handleMapReady}
          onPress={handleMapPress}
          onRegionChangeComplete={handleRegionChange}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass
          loadingEnabled
          loadingIndicatorColor={colors.primary}
        >
          {/* Existing fence circle + marker (State B) — dimmed when auto-logging off */}
          {fence && (
            <React.Fragment>
              <Circle
                center={{ latitude: fence.latitude, longitude: fence.longitude }}
                radius={fence.radius}
                fillColor={autoLoggingEnabled ? withOpacity(fence.color, 0.25) : withOpacity('#9E9E9E', 0.12)}
                strokeColor={autoLoggingEnabled ? fence.color : '#9E9E9E'}
                strokeWidth={autoLoggingEnabled ? 2 : 1}
              />
              <Marker
                coordinate={{ latitude: fence.latitude, longitude: fence.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.locationLabel}>
                  <View style={[styles.locationLabelDot, { backgroundColor: fence.color }]} />
                  <Text style={styles.locationLabelText} numberOfLines={1}>
                    {fence.name}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          )}

          {/* Preview circle in State A (follows crosshair) */}
          {isAddingMode && mapCenter && (
            <Circle
              center={{ latitude: mapCenter.lat, longitude: mapCenter.lng }}
              radius={selectedRadius}
              fillColor={withOpacity(colors.primary, 0.12)}
              strokeColor={withOpacity(colors.primary, 0.4)}
              strokeWidth={1.5}
              lineDashPattern={[8, 4]}
            />
          )}
        </MapView>

        {/* BRANDED PIN - Always fixed at map center */}
        <View style={styles.pinWrapper} pointerEvents="none">
          <View style={styles.pinBubble}>
            <Image source={pinIcon} style={styles.pinImage} />
          </View>
          <View style={styles.pinNeedle} />
        </View>

        {/* SEARCH BOX — shows address in display mode, search on tap */}
        <View pointerEvents={!autoLoggingEnabled && panelState === 'configured' ? 'none' : 'auto'} style={!autoLoggingEnabled && panelState === 'configured' ? { opacity: 0.4 } : undefined}>
          <SearchBox
            address={address}
            isGeocoding={isGeocoding}
            latitude={fence ? fence.latitude : mapCenter?.lat}
            longitude={fence ? fence.longitude : mapCenter?.lng}
            currentLatitude={currentLocation?.latitude}
            currentLongitude={currentLocation?.longitude}
            onSelectResult={handleSelectSearchResult}
          />
        </View>

        {/* PERMISSION BANNER */}
        <View style={styles.permissionBannerWrapper} pointerEvents="box-none">
          <MapPermissionBanner />
        </View>

        {/* MY LOCATION BUTTON */}
        <TouchableOpacity
          style={[styles.myLocationButton, { elevation: 10, zIndex: 100 }]}
          onPress={handleGoToMyLocation}
          activeOpacity={0.7}
          disabled={!autoLoggingEnabled && panelState === 'configured'}
        >
          <Ionicons name="locate" size={24} color={!autoLoggingEnabled && panelState === 'configured' ? colors.textMuted : colors.primary} />
        </TouchableOpacity>

        {/* DISABLED OVERLAY — freezes map when auto-logging is OFF */}
        {!autoLoggingEnabled && panelState === 'configured' && (
          <View style={mapOverlayStyles.disabledOverlay} pointerEvents="box-only">
            <View style={mapOverlayStyles.disabledBadge}>
              <Ionicons name="pause-circle" size={20} color={colors.textSecondary} />
              <Text style={mapOverlayStyles.disabledText}>Auto-logging paused</Text>
            </View>
          </View>
        )}
      </View>

      {/* ===== BOTTOM PANEL ===== */}
      <View style={styles.panel}>
        {/* Panel handle */}
        <View style={styles.panelHandle} />

        {isAddingMode ? (
          // STATE A: Adding new fence
          <View style={styles.panelContent}>
            <View>
              {/* Name input */}
              <Animated.View style={{ transform: [{ translateX: shakeAnimation }] }}>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.nameInput, fenceNameError && styles.nameInputError]}
                  placeholder="Location name (e.g. Studio, Home, Cafe)"
                  placeholderTextColor={colors.textSecondary}
                  value={fenceName}
                  onChangeText={(text) => {
                    setFenceName(text);
                    if (fenceNameError) setFenceNameError(false);
                  }}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={handleAddFence}
                />
              </Animated.View>

              {/* Radius chips */}
              <Text style={panelConfigStyles.radiusLabel}>Zone radius</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={panelConfigStyles.chipScroll} contentContainerStyle={panelConfigStyles.chipRow}>
                {RADIUS_CHIPS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[panelConfigStyles.chip, selectedRadius === r && panelConfigStyles.chipActive]}
                    onPress={() => setSelectedRadius(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={[panelConfigStyles.chipText, selectedRadius === r && panelConfigStyles.chipTextActive]}>{r}m</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Add button */}
            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.addButtonDisabled]}
              onPress={handleAddFence}
              disabled={isAdding}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.buttonPrimaryText} />
              <Text style={styles.addButtonText}>
                {isAdding ? 'Adding...' : 'Add Location'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          // STATE B: Fence configured
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.panelContent} bounces={false}>
            <View>
              {/* Fence name */}
              <Text style={styles.fenceName} numberOfLines={1}>
                {fence!.name}
              </Text>

              {/* Address */}
              {address ? (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.addressText} numberOfLines={1}>{address}</Text>
                </View>
              ) : null}

              {/* Auto-logging toggle with benefit copy */}
              <View style={panelConfigStyles.autoLogSection}>
                <View style={panelConfigStyles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={panelConfigStyles.toggleLabel}>Auto-logging</Text>
                    <Text style={panelConfigStyles.toggleHint}>
                      {autoLoggingEnabled
                        ? 'Your hours are logged automatically'
                        : 'Paused — log hours manually or turn on to resume'}
                    </Text>
                  </View>
                  <Switch
                    value={autoLoggingEnabled}
                    onValueChange={handleToggleAutoLogging}
                    disabled={isTogglingAutoLog}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={autoLoggingEnabled ? colors.primary : '#f4f3f4'}
                  />
                </View>

                {/* Permission warning — only when enabled but can't track */}
                {autoLoggingEnabled && !canTrackReliably && (
                  <TouchableOpacity style={panelConfigStyles.warningBox} onPress={openAppSettings} activeOpacity={0.7}>
                    <Ionicons name="warning-outline" size={16} color={colors.amber} />
                    <Text style={panelConfigStyles.warningText}>
                      Allow location access "Always" so hours are logged even when the app is closed.
                    </Text>
                    <Text style={panelConfigStyles.warningLink}>Fix</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Radius chips — dimmed when auto-logging is off */}
              <View style={!autoLoggingEnabled ? { opacity: 0.4 } : undefined} pointerEvents={autoLoggingEnabled ? 'auto' : 'none'}>
                <Text style={[panelConfigStyles.radiusLabel, { marginTop: 10 }]}>Zone radius</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={panelConfigStyles.chipScroll} contentContainerStyle={panelConfigStyles.chipRow}>
                  {RADIUS_CHIPS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[panelConfigStyles.chip, fence!.radius === r && panelConfigStyles.chipActive]}
                      onPress={() => handleChangeRadius(r)}
                      activeOpacity={0.7}
                    >
                      <Text style={[panelConfigStyles.chipText, fence!.radius === r && panelConfigStyles.chipTextActive]}>{r}m</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Delete button */}
            <TouchableOpacity
              style={[styles.deleteButton, { marginTop: 12 }]}
              onPress={handleDeleteFence}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete Location</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const panelConfigStyles = StyleSheet.create({
  radiusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipScroll: {
    marginBottom: 10,
    marginHorizontal: -4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
  },
  autoLogSection: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: withOpacity(colors.amber, 0.08),
    marginTop: 10,
  },
  warningText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  warningLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.amber,
  },
});

const mapOverlayStyles = StyleSheet.create({
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
