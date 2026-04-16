/**
 * Locations Screen - OnSite Timekeeper
 *
 * v6: Two-step adding flow
 * - Step 1: Full map + floating SearchBox + Confirm button (pick location)
 * - Step 2: Naming modal slides up from bottom (name + save)
 * - Configured mode: compact detail panel (name/address/edit/delete)
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Switch,
  StyleSheet,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, withOpacity } from '../../src/constants/colors';
import { HeaderRow } from '../../src/components/ui/HeaderRow';
import { setSentryContext } from '../../src/lib/sentry';
import { useMapScreen } from '../../src/screens/map/hooks';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useAutoLogToggle } from '../../src/hooks/useAutoLogToggle';
import { SearchBox } from '../../src/screens/map/SearchBox';
import { styles, detailStyles } from '../../src/screens/map/styles';
import { MapPermissionBanner } from '../../src/components/PermissionBanner';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinIcon = require('../../assets/notification-icon.png');

// Google Maps style: soft grayscale with lightness adjustments
const grayscaleMapStyle = [
  { elementType: 'geometry', stylers: [{ saturation: -100 }, { lightness: 10 }] },
  { elementType: 'labels.text.fill', stylers: [{ saturation: -100 }, { lightness: 20 }] },
  { elementType: 'labels.text.stroke', stylers: [{ saturation: -100 }, { lightness: 40 }] },
  { featureType: 'road', stylers: [{ saturation: -100 }, { lightness: 15 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', stylers: [{ saturation: -100 }, { lightness: 30 }] },
  { featureType: 'landscape.man_made', stylers: [{ saturation: -100 }, { lightness: 20 }] },
  { featureType: 'road.highway', stylers: [{ saturation: -100 }, { lightness: 20 }] },
];

export default function MapScreen() {
  const {
    mapRef, nameInputRef, shakeAnimation,
    region, mapCenter,
    fence, panelState, address, isGeocoding,
    addingStep, confirmedAddress,
    fenceName, setFenceName, fenceNameError, setFenceNameError,
    isAdding,
    currentLocation,
    handleMapReady, handleMapPress, handleRegionChange,
    handleSelectSearchResult, handleGoToMyLocation,
    handleConfirmLocation, handleCancelNaming,
    handleAddFence, handleDeleteFence, handleRenameLocation,
    isMoving, handleStartMove, handleConfirmMove, handleCancelMove, handleMarkerDragEnd,
  } = useMapScreen();

  const defaultRadius = useSettingsStore(s => s.defaultRadius);
  const { autoLoggingEnabled, isToggling: isTogglingAutoLog, handleToggle: handleAutoLogToggle } = useAutoLogToggle();

  // Animate overlay opacity: muted (0.15) when OFF, full (1) when ON
  const overlayOpacity = React.useRef(new Animated.Value(autoLoggingEnabled ? 1 : 0.15)).current;
  React.useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: autoLoggingEnabled ? 1 : 0.15,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [autoLoggingEnabled]);

  const isDisabled = !autoLoggingEnabled;

  // Locations tooltip — shown once per user lifetime over the banner toggle
  const [showLocationsTip, setShowLocationsTip] = React.useState(false);
  const bannerRef = React.useRef<View>(null);
  React.useEffect(() => {
    AsyncStorage.getItem('@onsite:welcomeLocationsSeen').then((val) => {
      if (!val) {
        setShowLocationsTip(true);
      }
    });
  }, []);

  React.useEffect(() => { setSentryContext('location-tracking'); }, []);

  const isAddingMode = panelState === 'adding';

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = React.useState(false);
  const [renameText, setRenameText] = React.useState('');
  const renameInputRef = React.useRef<TextInput>(null);

  const handleEditName = () => {
    if (!fence) return;
    setRenameText(fence.name);
    setShowRenameModal(true);
  };

  const handleRenameSave = () => {
    if (renameText.trim()) {
      handleRenameLocation(renameText);
    }
    setShowRenameModal(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* ===== HEADER ===== */}
      <HeaderRow title="Locations" />

    {/* ===== MAP CONTENT ===== */}
    <View style={{ flex: 1 }} pointerEvents={isDisabled ? 'none' : 'auto'}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ===== MAP SECTION ===== */}
      <View style={styles.mapContainer}>
        {/* Map stays full opacity — grayscale tiles handle the "sleeping" look */}
        <MapView
          key={isDisabled ? 'grayscale' : 'color'}
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          customMapStyle={isDisabled ? grayscaleMapStyle : undefined}
          onMapReady={handleMapReady}
          onPress={handleMapPress}
          onRegionChangeComplete={handleRegionChange}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass
          loadingEnabled
          loadingIndicatorColor={colors.primary}
        >
          {/* Existing fence circle + marker */}
          {fence && (
            <React.Fragment>
              <Circle
                center={{ latitude: fence.latitude, longitude: fence.longitude }}
                radius={fence.radius}
                fillColor={isDisabled ? 'rgba(140,140,140,0.25)' : withOpacity(fence.color, 0.25)}
                strokeColor={isDisabled ? '#888' : fence.color}
                strokeWidth={2}
              />
              <Marker
                coordinate={{ latitude: fence.latitude, longitude: fence.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                draggable={!isDisabled && !isMoving}
                onDragEnd={(e) =>
                  handleMarkerDragEnd(
                    e.nativeEvent.coordinate.latitude,
                    e.nativeEvent.coordinate.longitude,
                  )
                }
              >
                <View style={styles.locationLabel}>
                  <View style={[styles.locationLabelDot, { backgroundColor: isDisabled ? '#999' : fence.color }]} />
                  <Text style={styles.locationLabelText} numberOfLines={1}>
                    {fence.name}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          )}

          {/* Preview circle in adding or moving mode (follows crosshair) */}
          {(isAddingMode || isMoving) && mapCenter && (
            <Circle
              center={{ latitude: mapCenter.lat, longitude: mapCenter.lng }}
              radius={isMoving && fence ? fence.radius : defaultRadius}
              fillColor={withOpacity(colors.primary, 0.12)}
              strokeColor={withOpacity(colors.primary, 0.4)}
              strokeWidth={1.5}
              lineDashPattern={[8, 4]}
            />
          )}
        </MapView>

        {/* UI OVERLAYS — muted when disabled */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]} pointerEvents={isDisabled ? 'none' : 'box-none'}>
          {/* BRANDED PIN - Always fixed at map center */}
          <View style={styles.pinWrapper} pointerEvents="none">
            <View style={styles.pinBubble}>
              <Image source={pinIcon} style={styles.pinImage} />
            </View>
            <View style={styles.pinNeedle} />
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
          >
            <Ionicons name="locate" size={24} color={colors.primary} />
          </TouchableOpacity>

          {/* SearchBox floating over map — picking (adding) or moving */}
          {((isAddingMode && addingStep === 'picking') || isMoving) && (
            <SearchBox
              address={address}
              isGeocoding={isGeocoding}
              latitude={mapCenter?.lat}
              longitude={mapCenter?.lng}
              currentLatitude={currentLocation?.latitude}
              currentLongitude={currentLocation?.longitude}
              onSelectResult={handleSelectSearchResult}
            />
          )}

          {/* Floating confirm area at bottom — add mode */}
          {isAddingMode && addingStep === 'picking' && (
            <View style={styles.confirmArea}>
              <Text style={styles.confirmHint}>Add your work location</Text>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmLocation}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.buttonPrimaryText} />
                <Text style={styles.confirmButtonText}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Floating confirm area at bottom — move mode */}
          {isMoving && (
            <View style={styles.confirmArea}>
              <Text style={styles.confirmHint} numberOfLines={1}>
                Move {fence?.name ? `"${fence.name}"` : 'location'} to new position
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    {
                      flex: 1,
                      backgroundColor: colors.backgroundTertiary,
                      borderWidth: 0.5,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={handleCancelMove}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.confirmButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, { flex: 2 }]}
                  onPress={handleConfirmMove}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-circle" size={20} color={colors.buttonPrimaryText} />
                  <Text style={styles.confirmButtonText}>Confirm Move</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </View>

      {/* ===== BOTTOM PANEL (configured mode only) — hidden during move, muted when disabled ===== */}
      {!isAddingMode && !isMoving && (
        <Animated.View style={{ opacity: overlayOpacity }}>
        <View style={styles.panel}>
          <View>
            {/* ── Header — only when a fence exists ── */}
            {fence && (
              <View style={detailStyles.headerSection}>
                <View style={detailStyles.nameRow}>
                  <View style={[detailStyles.nameDot, { backgroundColor: isDisabled ? '#999' : fence.color }]} />
                  <Text style={detailStyles.nameText} numberOfLines={1}>
                    {fence.name}
                  </Text>
                  <TouchableOpacity style={detailStyles.editButton} onPress={handleEditName} activeOpacity={0.6}>
                    <Ionicons name="pencil-outline" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>

                {address ? (
                  <View style={detailStyles.addressRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text style={detailStyles.addressText} numberOfLines={1}>{address}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── Action row: Move + Delete ── */}
            {fence && (
              <View style={detailStyles.actionRow}>
                <TouchableOpacity
                  style={detailStyles.actionButton}
                  onPress={handleStartMove}
                  activeOpacity={0.7}
                >
                  <Ionicons name="move-outline" size={15} color={colors.text} />
                  <Text style={detailStyles.moveText}>Move location</Text>
                </TouchableOpacity>

                <View style={detailStyles.actionDivider} />

                <TouchableOpacity
                  style={detailStyles.actionButton}
                  onPress={handleDeleteFence}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={15} color="#A32D2D" />
                  <Text style={detailStyles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
    </View>

      {/* ===== AUTO-LOG OFF: Banner at bottom ===== */}
      {!autoLoggingEnabled && (
        <View style={gateStyles.bannerWrapper}>
          <View ref={bannerRef} collapsable={false} style={gateStyles.banner}>
            <Text style={gateStyles.bannerText}>
              Enable auto-log to add{'\n'}your work locations
            </Text>
            <Switch
              value={false}
              onValueChange={() => {
                handleAutoLogToggle(true);
                if (showLocationsTip) {
                  setShowLocationsTip(false);
                  AsyncStorage.setItem('@onsite:welcomeLocationsSeen', 'true');
                }
              }}
              disabled={isTogglingAutoLog}
              trackColor={{ false: '#555', true: colors.primarySoft }}
              thumbColor="#f4f3f4"
            />
          </View>
        </View>
      )}

      {/* ===== FIRST-TIME TOOLTIP (one-time only, above banner) ===== */}
      {showLocationsTip && !autoLoggingEnabled && (
        <LocationsTooltip
          bannerRef={bannerRef}
          onDismiss={() => {
            setShowLocationsTip(false);
            AsyncStorage.setItem('@onsite:welcomeLocationsSeen', 'true');
          }}
        />
      )}

      {/* ===== RENAME MODAL ===== */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
        onShow={() => setTimeout(() => renameInputRef.current?.focus(), 100)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowRenameModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: colors.white,
              borderRadius: 14,
              width: '85%',
              maxWidth: 340,
              paddingTop: 20,
              paddingHorizontal: 20,
              paddingBottom: 14,
            }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
              Rename Location
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              Enter a new name for this location
            </Text>
            <TextInput
              ref={renameInputRef}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: Platform.OS === 'ios' ? 10 : 8,
                fontSize: 15,
                color: colors.text,
                backgroundColor: colors.backgroundTertiary,
              }}
              value={renameText}
              onChangeText={setRenameText}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleRenameSave}
              selectTextOnFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowRenameModal(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 15, color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRenameSave}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: colors.buttonPrimary,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.buttonPrimaryText }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== NAMING MODAL (Step 2 — name the location) ===== */}
      <Modal
        visible={isAddingMode && addingStep === 'naming'}
        transparent
        animationType="slide"
        onRequestClose={handleCancelNaming}
        onShow={() => setTimeout(() => nameInputRef.current?.focus(), 100)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
            onPress={handleCancelNaming}
          >
            <Pressable
              style={{
                backgroundColor: colors.white,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                paddingBottom: Platform.OS === 'ios' ? 34 : 20,
              }}
              onPress={() => {}}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
                Add Location
              </Text>

              {confirmedAddress ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }} numberOfLines={2}>
                    {confirmedAddress}
                  </Text>
                </View>
              ) : null}

              <Animated.View style={{ transform: [{ translateX: shakeAnimation }] }}>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.nameInput, fenceNameError && styles.nameInputError]}
                  placeholder="Location name (e.g. Studio, Home, Office)"
                  placeholderTextColor={colors.textSecondary}
                  value={fenceName}
                  onChangeText={(text) => {
                    setFenceName(text);
                    if (fenceNameError) setFenceNameError(false);
                  }}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={handleAddFence}
                  selectTextOnFocus
                />
              </Animated.View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={handleCancelNaming}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 15, color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddFence}
                  disabled={isAdding}
                  style={{
                    flex: 2,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: colors.buttonPrimary,
                    opacity: isAdding ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.buttonPrimaryText} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.buttonPrimaryText }}>
                    {isAdding ? 'Saving...' : 'Save Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// LOCATIONS TOOLTIP (first-time only)
// ============================================

const ARROW_SIZE = 10;
const FADE_MS = 200;
const { height: SCREEN_H } = Dimensions.get('window');

function LocationsTooltip({
  bannerRef,
  onDismiss,
}: {
  bannerRef: React.RefObject<any>;
  onDismiss: () => void;
}) {
  const [layout, setLayout] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const fade = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const measure = () => {
      bannerRef.current?.measureInWindow(
        (x: number, y: number, w: number, h: number) => {
          if (w === 0 && h === 0) {
            setTimeout(measure, 300);
            return;
          }
          setLayout({ x, y, w, h });
          Animated.timing(fade, {
            toValue: 1,
            duration: FADE_MS,
            useNativeDriver: true,
          }).start();
        },
      );
    };
    setTimeout(measure, 600);
  }, []);

  const dismiss = () => {
    Animated.timing(fade, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!layout) return null;

  const tooltipMargin = 12;
  const tooltipLeft = 20;
  const tooltipRight = 20;

  // Arrow points at the toggle (right side of banner)
  const arrowLeft = Math.min(layout.x + layout.w * 0.75 - tooltipLeft, Dimensions.get('window').width - tooltipLeft - tooltipRight - 36);

  return (
    <>
      {/* Overlay */}
      <Animated.View
        style={[tipStyles.overlay, { opacity: Animated.multiply(fade, 0.5) }]}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback onPress={dismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Highlight around banner */}
      <Animated.View
        style={[
          tipStyles.highlight,
          {
            top: layout.y - 4,
            left: layout.x - 4,
            width: layout.w + 8,
            height: layout.h + 8,
            opacity: fade,
          },
        ]}
        pointerEvents="none"
      />

      {/* Tooltip above the banner */}
      <Animated.View
        style={[
          tipStyles.tooltipWrap,
          {
            top: 0,
            left: tooltipLeft,
            right: tooltipRight,
            height: layout.y - tooltipMargin,
            justifyContent: 'flex-end',
            opacity: fade,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={tipStyles.body}>
          <Text style={tipStyles.text}>
            Turn this on to set up your work location. The app will automatically log your hours when you arrive and leave.
          </Text>
          <TouchableOpacity style={tipStyles.btn} onPress={dismiss} activeOpacity={0.7}>
            <Text style={tipStyles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
        <View style={[tipStyles.arrowDown, { left: Math.max(16, arrowLeft) }]} />
      </Animated.View>
    </>
  );
}

const tipStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 100,
  },
  highlight: {
    position: 'absolute',
    zIndex: 101,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: 'rgba(197, 139, 27, 0.7)',
    backgroundColor: 'transparent',
  },
  tooltipWrap: {
    position: 'absolute',
    zIndex: 102,
  },
  body: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  text: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
    marginBottom: 12,
  },
  btn: {
    alignSelf: 'flex-end',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C58B1B',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    zIndex: 103,
  },
});

// ============================================
// GATE STYLES (auto-log OFF state)
// ============================================

const gateStyles = StyleSheet.create({
  bannerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.charcoal,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 12,
    lineHeight: 20,
  },
});

