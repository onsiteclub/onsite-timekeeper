/**
 * Jobsites Screen - OnSite Timekeeper
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
  TouchableOpacity,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { colors, withOpacity } from '../../src/constants/colors';
import { useMapScreen } from '../../src/screens/map/hooks';
import { SearchBox } from '../../src/screens/map/SearchBox';
import { styles } from '../../src/screens/map/styles';
import { RADIUS_OPTIONS } from '../../src/screens/map/constants';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';

export default function MapScreen() {
  const {
    mapRef, nameInputRef, shakeAnimation,
    region, mapCenter,
    fence, panelState, address, isGeocoding,
    fenceName, setFenceName, fenceNameError, setFenceNameError,
    selectedRadius, setSelectedRadius, isAdding,
    currentLocation,
    handleMapReady, handleMapPress, handleRegionChange,
    handleSelectSearchResult, handleGoToMyLocation,
    handleAddFence, handleDeleteFence, handleChangeRadius,
  } = useMapScreen();

  const isAddingMode = panelState === 'adding';

  return (
    <View style={styles.container}>
      {/* ===== MAP SECTION (75%) ===== */}
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

        {/* CROSSHAIR - Only in State A */}
        {isAddingMode && (
          <View style={styles.crosshairContainer} pointerEvents="none">
            <Ionicons name="location" size={36} color={colors.primary} style={{ marginTop: -36 }} />
            <View style={styles.crosshairDot} />
          </View>
        )}

        {/* SEARCH BOX */}
        <SearchBox
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
      <KeyboardAvoidingView
        style={styles.panel}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Panel handle */}
        <View style={styles.panelHandle} />

        {isAddingMode ? (
          // STATE A: Adding new fence
          <View style={styles.panelContent}>
            <View>
              {/* Address from reverse geocode */}
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.addressText} numberOfLines={1}>
                  {isGeocoding ? 'Looking up address...' : (address || 'Pan map to select location')}
                </Text>
              </View>

              {/* Name input */}
              <Animated.View style={{ transform: [{ translateX: shakeAnimation }] }}>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.nameInput, fenceNameError && styles.nameInputError]}
                  placeholder="Jobsite name (e.g. Main Office)"
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
              <View style={styles.radiusRow}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.radiusChip,
                      selectedRadius === r && styles.radiusChipActive,
                    ]}
                    onPress={() => setSelectedRadius(r)}
                  >
                    <Text style={[
                      styles.radiusChipText,
                      selectedRadius === r && styles.radiusChipTextActive,
                    ]}>
                      {r}m
                    </Text>
                  </TouchableOpacity>
                ))}
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
                {isAdding ? 'Adding...' : 'Add Jobsite'}
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

              {/* Address */}
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.addressText} numberOfLines={1}>
                  {isGeocoding ? 'Looking up address...' : (address || `${fence!.latitude.toFixed(4)}, ${fence!.longitude.toFixed(4)}`)}
                </Text>
              </View>

              {/* Radius chips (editable, saves immediately) */}
              <View style={styles.radiusRow}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.radiusChip,
                      fence!.radius === r && styles.radiusChipActive,
                    ]}
                    onPress={() => handleChangeRadius(r)}
                  >
                    <Text style={[
                      styles.radiusChipText,
                      fence!.radius === r && styles.radiusChipTextActive,
                    ]}>
                      {r}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Delete button */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteFence}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete Jobsite</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
