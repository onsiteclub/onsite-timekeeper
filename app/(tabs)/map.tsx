/**
 * Locations Screen - OnSite Timekeeper
 *
 * v2: Map (75%) + Bottom Panel (25%)
 * - Single fence limit (delete to add new)
 * - Bottom panel replaces modals
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
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, withOpacity } from '../../src/constants/colors';
import { useMapScreen } from '../../src/screens/map/hooks';
import { SearchBox } from '../../src/screens/map/SearchBox';
import { styles } from '../../src/screens/map/styles';
import { RadiusSlider } from '../../src/screens/map/RadiusSlider';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinIcon = require('../../assets/notification-icon.png');

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const {
    mapRef, nameInputRef, shakeAnimation,
    region, mapCenter,
    fence, panelState, address, isGeocoding,
    fenceName, setFenceName, fenceNameError, setFenceNameError,
    selectedRadius, setSelectedRadius, isAdding,
    currentLocation,
    autoLoggingEnabled, isTogglingAutoLog, handleToggleAutoLogging,
    triggerMode, handleTriggerModeChange,
    handleMapReady, handleMapPress, handleRegionChange,
    handleSelectSearchResult, handleGoToMyLocation,
    handleAddFence, handleDeleteFence, handleChangeRadius,
  } = useMapScreen();

  const isAddingMode = panelState === 'adding';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ===== AUTO-LOGGING INFO CARD ===== */}
      <View style={[autoLogStyles.card, { paddingTop: insets.top + 8 }]}>
        <View style={autoLogStyles.row}>
          <View style={autoLogStyles.iconCircle}>
            <Ionicons name="location-outline" size={20} color={colors.primary} />
          </View>
          <View style={autoLogStyles.textWrap}>
            <Text style={autoLogStyles.title}>Automatic Time Logging</Text>
            <Text style={autoLogStyles.subtitle}>
              {autoLoggingEnabled
                ? 'Recording arrival and departure at saved locations'
                : 'Optional. You can always log time manually.'}
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
      </View>

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

      {/* ===== BOTTOM PANEL (25%) ===== */}
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

              {/* Radius slider */}
              <RadiusSlider value={selectedRadius} onValueChange={setSelectedRadius} />
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
          <View style={styles.panelContent}>
            <View>
              {/* Fence name */}
              <Text style={styles.fenceName} numberOfLines={1}>
                {fence!.name}
              </Text>

              {/* Radius slider (saves immediately on change) */}
              <RadiusSlider value={fence!.radius} onValueChange={handleChangeRadius} />

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
            </View>

            {/* Delete button */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteFence}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete Location</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const autoLogStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 16,
  },
});
