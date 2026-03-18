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
import { RADIUS_MIN, RADIUS_MAX, RADIUS_STEP } from '../../src/screens/map/constants';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';
import { usePermissionStatus } from '../../src/hooks/usePermissionStatus';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinIcon = require('../../assets/notification-icon.png');

export default function MapScreen() {
  const {
    mapRef, nameInputRef, shakeAnimation,
    region, mapCenter,
    fence, panelState, address, isGeocoding,
    fenceName, setFenceName, fenceNameError, setFenceNameError,
    selectedRadius, isAdding,
    currentLocation,
    autoLoggingEnabled, isTogglingAutoLog, handleToggleAutoLogging,
    triggerMode, handleTriggerModeChange,
    handleMapReady, handleMapPress, handleRegionChange,
    handleSelectSearchResult, handleGoToMyLocation,
    handleAddFence, handleDeleteFence,
    handleStepRadius, handleStepSelectedRadius,
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
          {/* Existing fence circle + marker (State B) */}
          {fence && (
            <React.Fragment>
              <Circle
                center={{ latitude: fence.latitude, longitude: fence.longitude }}
                radius={fence.radius}
                fillColor={withOpacity(fence.color, 0.25)}
                strokeColor={fence.color}
                strokeWidth={2}
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
        <SearchBox
          address={address}
          isGeocoding={isGeocoding}
          latitude={fence ? fence.latitude : mapCenter?.lat}
          longitude={fence ? fence.longitude : mapCenter?.lng}
          currentLatitude={currentLocation?.latitude}
          currentLongitude={currentLocation?.longitude}
          onSelectResult={handleSelectSearchResult}
        />

        {/* PERMISSION BANNER */}
        <View style={styles.permissionBannerWrapper} pointerEvents="box-none">
          <MapPermissionBanner />
        </View>

        {/* MY LOCATION BUTTON */}
        <TouchableOpacity
          style={[styles.myLocationButton, { elevation: 10, zIndex: 100 }]}
          onPress={handleGoToMyLocation}
          activeOpacity={0.7}
        >
          <Ionicons name="locate" size={24} color={colors.primary} />
        </TouchableOpacity>
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
                  placeholder="Location name (e.g. Main Office)"
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

              {/* Radius stepper */}
              <View style={panelConfigStyles.radiusRow}>
                <Text style={panelConfigStyles.radiusLabel}>Detection radius</Text>
                <View style={panelConfigStyles.stepper}>
                  <TouchableOpacity
                    style={[panelConfigStyles.stepperBtn, selectedRadius <= RADIUS_MIN && panelConfigStyles.stepperBtnDisabled]}
                    onPress={() => handleStepSelectedRadius(-RADIUS_STEP)}
                    disabled={selectedRadius <= RADIUS_MIN}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="remove" size={20} color={selectedRadius <= RADIUS_MIN ? colors.border : colors.text} />
                  </TouchableOpacity>
                  <Text style={panelConfigStyles.stepperValue}>{selectedRadius}m</Text>
                  <TouchableOpacity
                    style={[panelConfigStyles.stepperBtn, selectedRadius >= RADIUS_MAX && panelConfigStyles.stepperBtnDisabled]}
                    onPress={() => handleStepSelectedRadius(RADIUS_STEP)}
                    disabled={selectedRadius >= RADIUS_MAX}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="add" size={20} color={selectedRadius >= RADIUS_MAX ? colors.border : colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
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

              {/* Radius stepper */}
              <View style={panelConfigStyles.radiusRow}>
                <Text style={panelConfigStyles.radiusLabel}>Detection radius</Text>
                <View style={panelConfigStyles.stepper}>
                  <TouchableOpacity
                    style={[panelConfigStyles.stepperBtn, fence!.radius <= RADIUS_MIN && panelConfigStyles.stepperBtnDisabled]}
                    onPress={() => handleStepRadius(-RADIUS_STEP)}
                    disabled={fence!.radius <= RADIUS_MIN}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="remove" size={20} color={fence!.radius <= RADIUS_MIN ? colors.border : colors.text} />
                  </TouchableOpacity>
                  <Text style={panelConfigStyles.stepperValue}>{fence!.radius}m</Text>
                  <TouchableOpacity
                    style={[panelConfigStyles.stepperBtn, fence!.radius >= RADIUS_MAX && panelConfigStyles.stepperBtnDisabled]}
                    onPress={() => handleStepRadius(RADIUS_STEP)}
                    disabled={fence!.radius >= RADIUS_MAX}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="add" size={20} color={fence!.radius >= RADIUS_MAX ? colors.border : colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Auto-logging toggle */}
              <View style={panelConfigStyles.toggleRow}>
                <Text style={panelConfigStyles.toggleLabel}>Auto-logging</Text>
                <Switch
                  value={autoLoggingEnabled}
                  onValueChange={handleToggleAutoLogging}
                  disabled={isTogglingAutoLog}
                  trackColor={{ false: colors.border, true: colors.primarySoft }}
                  thumbColor={autoLoggingEnabled ? colors.primary : '#f4f3f4'}
                />
              </View>

              {/* Trigger mode radio buttons */}
              {autoLoggingEnabled && (
                <View style={styles.radioGroup}>
                  {([
                    { key: 'arrive' as const, label: 'When I arrive' },
                    { key: 'leave' as const, label: 'When I leave' },
                    { key: 'both' as const, label: 'Both' },
                  ]).map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      style={styles.radioRow}
                      onPress={() => handleTriggerModeChange(key)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.radioOuter,
                        triggerMode === key && styles.radioOuterSelected,
                      ]}>
                        {triggerMode === key && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[
                        styles.radioLabel,
                        triggerMode !== key && styles.radioLabelMuted,
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Permission warning */}
              {autoLoggingEnabled && !canTrackReliably && (
                <TouchableOpacity style={panelConfigStyles.warningBox} onPress={openAppSettings} activeOpacity={0.7}>
                  <Ionicons name="warning-outline" size={16} color={colors.amber} />
                  <Text style={panelConfigStyles.warningText}>
                    Background location is required for auto-logging to work.
                  </Text>
                  <Text style={panelConfigStyles.warningLink}>Settings</Text>
                </TouchableOpacity>
              )}
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
  radiusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  radiusLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    borderColor: colors.borderLight,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    minWidth: 60,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: withOpacity(colors.amber, 0.08),
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  warningLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.amber,
  },
});
