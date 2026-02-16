/**
 * Home Screen - OnSite Timekeeper
 *
 * v2.0: Enhanced manual entry UX
 * - Date picker with visual indicator
 * - Time picker modals (tap-to-select)
 * - Real-time total hours calculation
 * - Improved visual hierarchy
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ViewStyle,
  Image,
  Linking,
  ScrollView,
  Platform,
  Animated,
  StyleSheet,
  StatusBar,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Card } from '../../src/components/ui/Button';
import { colors } from '../../src/constants/colors';
import type { WorkLocation } from '../../src/stores/locationStore';

// V3: ComputedSession now comes from hooks.ts (was removed from database)
import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { ShareModal } from '../../src/components/ShareModal';
import { styles, fixedStyles } from '../../src/screens/home/styles';
import { AnimatedRing } from '../../src/components/AnimatedRing';

// Helper to format date with day
function formatDateWithDay(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Calculate total hours
function calculateTotalHours(entryH: string, entryM: string, exitH: string, exitM: string, pauseMin: string): string {
  const entryHour = parseInt(entryH) || 0;
  const entryMinute = parseInt(entryM) || 0;
  const exitHour = parseInt(exitH) || 0;
  const exitMinute = parseInt(exitM) || 0;
  const pause = parseInt(pauseMin) || 0;

  if (!entryH || !exitH) return '--';

  const entryTotal = entryHour * 60 + entryMinute;
  const exitTotal = exitHour * 60 + exitMinute;
  let worked = exitTotal - entryTotal;

  if (worked < 0) worked += 24 * 60; // Handle overnight shifts
  worked -= pause;

  if (worked < 0) return '--';

  const hours = Math.floor(worked / 60);
  const minutes = worked % 60;

  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [showLogoTooltip, setShowLogoTooltip] = useState(false);

  // Break dropdown state
  const [showBreakDropdown, setShowBreakDropdown] = useState(false);
  const [showBreakCustomInput, setShowBreakCustomInput] = useState(false);

  // Refs for auto-jump between time inputs
  const entryMRef = useRef<TextInput>(null);
  const exitHRef = useRef<TextInput>(null);
  const exitMRef = useRef<TextInput>(null);
  const breakRef = useRef<TextInput>(null);

  // AM/PM state for time inputs
  const [entryPeriod, setEntryPeriod] = useState<'AM' | 'PM'>('AM');
  const [exitPeriod, setExitPeriod] = useState<'PM' | 'AM'>('PM');

  // Share modal state (after save)
  const [showShareModal, setShowShareModal] = useState(false);
  const [sessionsToShare, setSessionsToShare] = useState<ComputedSession[]>([]);

  // Edit mode state - form is read-only by default
  const [isEditing, setIsEditing] = useState(false);

  // Toast notification for future dates
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const {
    userName,
    locations,
    currentSession,
    activeLocation,
    canRestart,
    isGeofencingActive,
    timer,
    isPaused,
    pauseTimer,
    activeLocations,
    locationCardsData,
    manualDate,
    manualLocationId,
    setManualLocationId,
    manualEntryH,
    setManualEntryH,
    manualEntryM,
    setManualEntryM,
    manualExitH,
    setManualExitH,
    manualExitM,
    setManualExitM,
    manualPause,
    setManualPause,
    handlePause,
    handleResume,
    handleStop,
    handleRestart,
    handleSaveManual,
    getSuggestedTimes,
    weekSessions,
    isSameDay,
  } = useHomeScreen();

  // Get today's completed sessions (from geofence)
  const todayGeofenceSessions = weekSessions.filter((s: ComputedSession) => {
    const sessionDate = new Date(s.entry_at);
    const today = new Date();
    return isSameDay(sessionDate, today) && s.exit_at && s.type !== 'manual';
  });

  // Get today's session for selected location (if any)
  const todaySessionForLocation = todayGeofenceSessions.find(
    (s: ComputedSession) => s.location_id === manualLocationId
  );

  // Check if form has geofence data to show
  const hasGeofenceData = !!todaySessionForLocation || !!currentSession;

  // Helper to set time with AM/PM from 24h format (memoized for stable reference)
  const setTimeWithAmPm = useCallback((
    hour24: string,
    setHour: (h: string) => void,
    setPeriod: (p: 'AM' | 'PM') => void
  ) => {
    const h = parseInt(hour24, 10);
    if (h >= 12) {
      setPeriod('PM');
      setHour(h === 12 ? '12' : String(h - 12).padStart(2, '0'));
    } else {
      setPeriod('AM');
      setHour(h === 0 ? '12' : String(h).padStart(2, '0'));
    }
  }, []);

  // Auto-fill from geofence when session starts (entry detected)
  useEffect(() => {
    if (currentSession && currentSession.location_id) {
      // Geofence detected entry - fill entry time
      const entryDate = new Date(currentSession.entry_at);
      setManualLocationId(currentSession.location_id);
      setTimeWithAmPm(String(entryDate.getHours()).padStart(2, '0'), setManualEntryH, setEntryPeriod);
      setManualEntryM(String(entryDate.getMinutes()).padStart(2, '0'));
      // Clear exit (not yet detected)
      setManualExitH('');
      setManualExitM('');
    }
  }, [currentSession?.id]);

  // Auto-fill from completed geofence session
  useEffect(() => {
    if (todaySessionForLocation) {
      const entryDate = new Date(todaySessionForLocation.entry_at);
      const exitDate = new Date(todaySessionForLocation.exit_at!);

      setTimeWithAmPm(String(entryDate.getHours()).padStart(2, '0'), setManualEntryH, setEntryPeriod);
      setManualEntryM(String(entryDate.getMinutes()).padStart(2, '0'));
      setTimeWithAmPm(String(exitDate.getHours()).padStart(2, '0'), setManualExitH, setExitPeriod);
      setManualExitM(String(exitDate.getMinutes()).padStart(2, '0'));

      if (todaySessionForLocation.pause_minutes) {
        setManualPause(String(todaySessionForLocation.pause_minutes));
      }
    }
  }, [todaySessionForLocation?.id, manualLocationId]);

  // Initialize location if not set
  useEffect(() => {
    if (locations.length > 0 && !manualLocationId) {
      const firstLocationId = locations[0].id;
      setManualLocationId(firstLocationId);
      const suggested = getSuggestedTimes?.(firstLocationId);
      if (suggested) {
        setTimeWithAmPm(suggested.entryH, setManualEntryH, setEntryPeriod);
        setManualEntryM(suggested.entryM);
        setTimeWithAmPm(suggested.exitH, setManualExitH, setExitPeriod);
        setManualExitM(suggested.exitM);
      } else {
        setManualEntryH('09');
        setManualEntryM('00');
        setEntryPeriod('AM');
        setManualExitH('05');
        setManualExitM('00');
        setExitPeriod('PM');
      }
    }
  }, [locations]);

  const handleLocationChange = (locationId: string) => {
    setManualLocationId(locationId);
    const suggested = getSuggestedTimes?.(locationId);
    if (suggested) {
      setTimeWithAmPm(suggested.entryH, setManualEntryH, setEntryPeriod);
      setManualEntryM(suggested.entryM);
      setTimeWithAmPm(suggested.exitH, setManualExitH, setExitPeriod);
      setManualExitM(suggested.exitM);
    }
  };

  const handleBreakSelect = (minutes: string) => {
    if (minutes === 'custom') {
      setShowBreakCustomInput(true);
      setShowBreakDropdown(false);
    } else {
      setManualPause(minutes);
      setShowBreakDropdown(false);
      setShowBreakCustomInput(false);
    }
  };

  const selectedLocation = locations.find((l: WorkLocation) => l.id === manualLocationId);

  // Show toast notification
  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(''));
  };

  // Smart time handlers - convert 24h to 12h automatically
  // Allows typing "0" then "2" to get "02" (2 AM/PM depending on toggle)
  // Only auto-converts when full 2-digit value is 13-23 or "00" (midnight)
  const handleHourChange = (
    cleaned: string,
    setHour: (h: string) => void,
    setPeriod: (p: 'AM' | 'PM') => void,
  ) => {
    const hour = parseInt(cleaned, 10);

    // Single digit "0" - let user continue typing (e.g., "02")
    if (cleaned === '0') {
      setHour('0');
      return;
    }

    // "00" = midnight → 12 AM
    if (cleaned === '00') {
      setHour('12');
      setPeriod('AM');
      return;
    }

    // 13-23 → convert to 12h PM
    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      setHour(String(hour - 12).padStart(2, '0'));
      setPeriod('PM');
      return;
    }

    // 12 → 12 PM
    if (!isNaN(hour) && hour === 12) {
      setHour('12');
      setPeriod('PM');
      return;
    }

    // 1-11 → keep as-is (user picks AM/PM with toggle)
    setHour(cleaned);
  };

  // Convert 12h to 24h for calculation and saving
  const get24Hour = (hour12: string, period: 'AM' | 'PM'): number => {
    const h = parseInt(hour12, 10) || 0;
    if (period === 'AM') {
      return h === 12 ? 0 : h;
    } else {
      return h === 12 ? 12 : h + 12;
    }
  };

  // Arrow button helpers for hour/minute increment/decrement
  const adjustHour = (
    current: string,
    direction: 'up' | 'down',
    setHour: (h: string) => void,
    period: 'AM' | 'PM',
    setPeriod: (p: 'AM' | 'PM') => void,
  ) => {
    let h = parseInt(current, 10) || 12;
    if (direction === 'up') {
      h = h >= 12 ? 1 : h + 1;
      // Toggle AM/PM when crossing 12
      if (h === 12) setPeriod(period === 'AM' ? 'PM' : 'AM');
    } else {
      h = h <= 1 ? 12 : h - 1;
      if (h === 11) setPeriod(period === 'AM' ? 'PM' : 'AM');
    }
    setHour(String(h).padStart(2, '0'));
  };

  const adjustMinute = (
    current: string,
    direction: 'up' | 'down',
    setMinute: (m: string) => void,
  ) => {
    let m = parseInt(current, 10) || 0;
    if (direction === 'up') {
      m = m >= 59 ? 0 : m + 1;
    } else {
      m = m <= 0 ? 59 : m - 1;
    }
    setMinute(String(m).padStart(2, '0'));
  };

  // Calculate total hours in real-time (using 24h internally)
  const entryH24 = get24Hour(manualEntryH, entryPeriod);
  const exitH24 = get24Hour(manualExitH, exitPeriod);
  const totalHours = calculateTotalHours(
    String(entryH24).padStart(2, '0'),
    manualEntryM,
    String(exitH24).padStart(2, '0'),
    manualExitM,
    manualPause
  );

  // Save with AM/PM conversion to 24h format
  // FIX: Pass 24h values directly to avoid stale closure issues
  const handleSaveManualWithAmPm = async () => {
    const entry24 = get24Hour(manualEntryH, entryPeriod);
    const exit24 = get24Hour(manualExitH, exitPeriod);

    // Pass 24h values directly - no setState race condition!
    await handleSaveManual({ entryH: entry24, exitH: exit24 });
  };

  // Handle save and open share modal
  const handleSaveAndShare = async () => {
    if (locations.length === 0) return;

    await handleSaveManualWithAmPm();

    // Create temporary session from form data for sharing
    const entry24 = get24Hour(manualEntryH, entryPeriod);
    const exit24 = get24Hour(manualExitH, exitPeriod);
    const pauseMin = parseInt(manualPause) || 0;

    const entryDate = new Date(manualDate);
    entryDate.setHours(entry24, parseInt(manualEntryM) || 0, 0, 0);

    const exitDate = new Date(manualDate);
    exitDate.setHours(exit24, parseInt(manualExitM) || 0, 0, 0);

    const durationMinutes = Math.round((exitDate.getTime() - entryDate.getTime()) / 60000);

    // V3: LegacySession format (simplified)
    const tempSession: ComputedSession = {
      id: 'temp-' + Date.now(),
      location_id: manualLocationId || '',
      location_name: selectedLocation?.name || 'Unknown Location',
      entry_at: entryDate.toISOString(),
      exit_at: exitDate.toISOString(),
      type: 'manual',
      manually_edited: 1,
      edit_reason: 'Manual entry by user',
      pause_minutes: pauseMin,
      duration_minutes: durationMinutes,
      status: 'finished',
      color: selectedLocation?.color || '#4A90D9',
    };

    setSessionsToShare([tempSession]);
    setShowShareModal(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F4F6' }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <KeyboardAvoidingView
        style={fixedStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
      {/* HEADER */}
      <View style={fixedStyles.header}>
        <TouchableOpacity
          style={styles.headerLogoContainer}
          onPress={() => setShowLogoTooltip(true)}
          activeOpacity={0.7}
        >
          <Image
            source={require('../../assets/logo_onsite.png')}
            style={fixedStyles.headerLogo}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.headerUserContainer}>
          <Text style={styles.headerUserName} numberOfLines={1}>
            {userName || 'User'}
          </Text>
          <View style={styles.headerUserAvatar}>
            <Ionicons name="person" size={14} color={colors.textSecondary} />
          </View>
        </View>
      </View>

      {/* PERMISSION BANNER - Removed: notifications are NOT required for geofencing.
         Only foreground service killed + location "Always" banners are useful.
         See PermissionBanner.tsx for the full component if needed. */}

      {/* LOGO TOOLTIP MODAL */}
      <Modal
        visible={showLogoTooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoTooltip(false)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowLogoTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipArrow} />
            <View style={styles.tooltipContent}>
              <Ionicons name="globe-outline" size={20} color={colors.primary} />
              <Text style={styles.tooltipText}>Visit our website</Text>
              <TouchableOpacity
                style={styles.tooltipButton}
                onPress={() => {
                  setShowLogoTooltip(false);
                  Linking.openURL('https://onsiteclub.com');
                }}
              >
                <Text style={styles.tooltipButtonText}>Open</Text>
                <Ionicons name="open-outline" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================ */}
      {/* LOCATION CARDS - Moved above form */}
      {/* ============================================ */}
      <View style={fixedStyles.locationsSection}>
        {activeLocations.length === 0 ? (
          <View>
            <TouchableOpacity
              style={fixedStyles.emptyLocations}
              onPress={() => router.push('/(tabs)/map')}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={fixedStyles.emptyLocationsText}>Add location</Text>
            </TouchableOpacity>
            <Text style={onboardingStyles.onboardingHint}>
              To start logging hours, first add a work location in the Locations tab
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={fixedStyles.locationCardsRow}
          >
            {locationCardsData.slice(0, 5).map(loc => (
              <TouchableOpacity
                key={loc.id}
                style={[
                  fixedStyles.locationCard,
                  manualLocationId === loc.id && fixedStyles.locationCardSelected
                ]}
                onPress={() => handleLocationChange(loc.id)}
                onLongPress={() => router.push(`/(tabs)/map?locationId=${loc.id}`)}
                activeOpacity={0.7}
              >
                <View style={fixedStyles.locationCardHeader}>
                  <Ionicons name="location" size={14} color={loc.color || colors.primary} />
                  <Text style={fixedStyles.locationCardName} numberOfLines={1}>{loc.name}</Text>
                </View>
                {loc.hasActiveSession ? (
                  <Text style={fixedStyles.locationCardActive}>● Active</Text>
                ) : (
                  <Text style={fixedStyles.locationCardTotal}>{loc.totalFormatted}</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Add location card */}
            <TouchableOpacity
              style={fixedStyles.addLocationCardInline}
              onPress={() => router.push('/(tabs)/map')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* ============================================ */}
      {/* MAIN CONTENT WRAPPER - Timer + Form with flex distribution */}
      {/* ============================================ */}
      <View style={fixedStyles.mainContentWrapper}>
        {/* TIMER - With Animated Ring */}
        <Card style={[
          fixedStyles.timerSection,
          currentSession && fixedStyles.timerSectionActive,
        ].filter(Boolean) as ViewStyle[]}>
          <AnimatedRing
            state={currentSession ? (isPaused ? 'paused' : 'active') : 'idle'}
            size={180}
            strokeWidth={10}
          >
            {currentSession ? (
              <View style={timerRingStyles.content}>
                {/* Status badge - soft tint + state color text */}
                <View style={[
                  timerRingStyles.statusBadge,
                  isPaused ? timerRingStyles.statusBadgePaused : timerRingStyles.statusBadgeActive
                ]}>
                  <Text
                    style={[
                      timerRingStyles.statusBadgeText,
                      isPaused ? timerRingStyles.statusBadgeTextPaused : timerRingStyles.statusBadgeTextActive
                    ]}
                    numberOfLines={1}
                  >
                    {isPaused ? 'Paused' : 'Active'} • {currentSession.location_name.length > 25 ? currentSession.location_name.slice(0, 25) + '…' : currentSession.location_name}
                  </Text>
                </View>

                {/* Main timer with HRS label */}
                <Text style={[
                  timerRingStyles.timer,
                  isPaused && timerRingStyles.timerPaused
                ]}>
                  {timer}
                </Text>
                <Text style={timerRingStyles.timerLabel}>HRS</Text>

                {/* Break time - simple text format */}
                <Text style={timerRingStyles.breakText}>
                  Break: {pauseTimer}
                </Text>
              </View>
            ) : canRestart ? (
              <View style={timerRingStyles.content}>
                {/* Idle badge */}
                <View style={timerRingStyles.statusBadgeIdle}>
                  <Text style={timerRingStyles.statusBadgeTextIdle}>
                    Ready • {activeLocation?.name}
                  </Text>
                </View>

                {/* Idle timer display */}
                <Text style={timerRingStyles.timerIdle}>00:00:00</Text>
                <Text style={timerRingStyles.timerLabelIdle}>HRS</Text>

                {/* Start instruction */}
                <Text style={timerRingStyles.idleHint}>Tap START to begin</Text>
              </View>
            ) : (
              <View style={timerRingStyles.content}>
                <Ionicons name="location-outline" size={32} color={colors.textMuted} />
                <Text style={timerRingStyles.waitingText}>
                  {isGeofencingActive ? 'Waiting for location...' : 'No location set'}
                </Text>
              </View>
            )}
          </AnimatedRing>

          {/* Action buttons OUTSIDE ring (like reference) */}
          {currentSession ? (
            <View style={timerRingStyles.actions}>
              {isPaused ? (
                <TouchableOpacity style={timerRingStyles.resumeBtn} onPress={handleResume}>
                  <Ionicons name="play" size={18} color={colors.white} />
                  <Text style={timerRingStyles.resumeBtnText}>RESUME</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={timerRingStyles.pauseBtn} onPress={handlePause}>
                  <Ionicons name="pause" size={18} color={colors.white} />
                  <Text style={timerRingStyles.pauseBtnText}>PAUSE</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={timerRingStyles.stopBtn} onPress={handleStop}>
                <Text style={timerRingStyles.stopBtnText}>STOP</Text>
                <Ionicons name="stop-circle-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : canRestart ? (
            <TouchableOpacity style={timerRingStyles.startBtn} onPress={handleRestart}>
              <Ionicons name="play" size={18} color={colors.white} />
              <Text style={timerRingStyles.startBtnText}>START</Text>
            </TouchableOpacity>
          ) : null}
        </Card>

      {/* ============================================ */}
      {/* LOG HOURS FORM - Read-only viewer (Edit to modify) */}
      {/* ============================================ */}
      <Card style={[isEditing ? fixedStyles.formSectionEditing : fixedStyles.formSection, locations.length === 0 && onboardingStyles.formDisabled].filter(Boolean) as ViewStyle[]}>
        {/* Header - action buttons */}
        <View style={viewerStyles.headerButtons}>
          <TouchableOpacity
            style={viewerStyles.viewHoursBtn}
            onPress={() => router.push('/(tabs)/reports')}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text style={viewerStyles.viewHoursBtnText}>View Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[viewerStyles.editBtn, isEditing && viewerStyles.editBtnActive]}
            onPress={() => setIsEditing(!isEditing)}
          >
            <Ionicons name={isEditing ? "close" : "pencil"} size={18} color={isEditing ? colors.white : colors.primary} />
            <Text style={[viewerStyles.editBtnText, isEditing && viewerStyles.editBtnTextActive]}>
              {isEditing ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date - always today (use Reports tab for other dates) */}
        <View style={viewerStyles.dateRow}>
          <View style={viewerStyles.dateRowLeft}>
            {hasGeofenceData && (
              <View style={geofenceIndicatorStyles.badge}>
                <Ionicons name="locate" size={10} color={colors.success} />
                <Text style={geofenceIndicatorStyles.text}>Auto</Text>
              </View>
            )}
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={viewerStyles.dateText}>Today, {formatDateWithDay(new Date())}</Text>
          </View>
        </View>

        {/* READ-ONLY VIEW (default) - Entry/Exit full width, Break below */}
        {!isEditing ? (
          <View style={viewerStyles.readOnlyView}>
            <View style={ucStyles.timesRowFull}>
              <View style={ucStyles.timeColHalf}>
                <Text style={ucStyles.timeLabel}>Entry</Text>
                <Text style={viewerStyles.timeBlockValueLarge}>
                  {manualEntryH && manualEntryM ? `${manualEntryH}:${manualEntryM} ${entryPeriod}` : '--:--'}
                </Text>
              </View>
              <View style={ucStyles.timeColHalf}>
                <Text style={ucStyles.timeLabel}>Exit</Text>
                <Text style={viewerStyles.timeBlockValueLarge}>
                  {manualExitH && manualExitM ? `${manualExitH}:${manualExitM} ${exitPeriod}` : '--:--'}
                </Text>
              </View>
            </View>
            <View style={ucStyles.breakRowReadOnly}>
              <Text style={ucStyles.breakLabelSmall}>Break</Text>
              <Text style={ucStyles.breakValueSmall}>{manualPause ? `${manualPause} min` : '0 min'}</Text>
            </View>
            <View style={ucStyles.totalRow}>
              <Text style={ucStyles.totalLabel}>Total</Text>
              <Text style={ucStyles.totalValue}>{totalHours}</Text>
            </View>
          </View>
        ) : (
          <>
            {/* ENTRY - Full width container */}
            <View style={ucStyles.fieldContainer}>
              <Text style={ucStyles.fieldContainerLabel}>Entry</Text>
              <View style={ucStyles.fieldContainerRow}>
                <View style={ucStyles.timeInputWithArrowsLg}>
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustHour(manualEntryH, 'up', setManualEntryH, entryPeriod, setEntryPeriod)}>
                    <Ionicons name="chevron-up" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TextInput
                    style={ucStyles.timeInputLg}
                    value={manualEntryH}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      handleHourChange(cleaned, setManualEntryH, setEntryPeriod);
                      if (cleaned.length === 2) entryMRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    placeholder="HH"
                    maxLength={2}
                    placeholderTextColor={colors.textMuted}
                    selectTextOnFocus
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                  />
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustHour(manualEntryH, 'down', setManualEntryH, entryPeriod, setEntryPeriod)}>
                    <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={ucStyles.timeSepLg}>:</Text>
                <View style={ucStyles.timeInputWithArrowsLg}>
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustMinute(manualEntryM, 'up', setManualEntryM)}>
                    <Ionicons name="chevron-up" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TextInput
                    ref={entryMRef}
                    style={ucStyles.timeInputLg}
                    value={manualEntryM}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      setManualEntryM(cleaned);
                      if (cleaned.length === 2) exitHRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    placeholder="MM"
                    maxLength={2}
                    placeholderTextColor={colors.textMuted}
                    selectTextOnFocus
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                  />
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustMinute(manualEntryM, 'down', setManualEntryM)}>
                    <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={ucStyles.amPmRowLg}>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtnLg, entryPeriod === 'AM' && ucStyles.amPmBtnActive]}
                    onPress={() => setEntryPeriod('AM')}
                  >
                    <Text style={[ucStyles.amPmTextLg, entryPeriod === 'AM' && ucStyles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtnLg, entryPeriod === 'PM' && ucStyles.amPmBtnActive]}
                    onPress={() => setEntryPeriod('PM')}
                  >
                    <Text style={[ucStyles.amPmTextLg, entryPeriod === 'PM' && ucStyles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* EXIT - Full width container */}
            <View style={ucStyles.fieldContainer}>
              <Text style={ucStyles.fieldContainerLabel}>Exit</Text>
              <View style={ucStyles.fieldContainerRow}>
                <View style={ucStyles.timeInputWithArrowsLg}>
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustHour(manualExitH, 'up', setManualExitH, exitPeriod, setExitPeriod)}>
                    <Ionicons name="chevron-up" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TextInput
                    ref={exitHRef}
                    style={ucStyles.timeInputLg}
                    value={manualExitH}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      handleHourChange(cleaned, setManualExitH, setExitPeriod);
                      if (cleaned.length === 2) exitMRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    placeholder="HH"
                    maxLength={2}
                    placeholderTextColor={colors.textMuted}
                    selectTextOnFocus
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                  />
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustHour(manualExitH, 'down', setManualExitH, exitPeriod, setExitPeriod)}>
                    <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={ucStyles.timeSepLg}>:</Text>
                <View style={ucStyles.timeInputWithArrowsLg}>
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustMinute(manualExitM, 'up', setManualExitM)}>
                    <Ionicons name="chevron-up" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TextInput
                    ref={exitMRef}
                    style={ucStyles.timeInputLg}
                    value={manualExitM}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      setManualExitM(cleaned);
                      if (cleaned.length === 2) breakRef.current?.focus();
                    }}
                    keyboardType="number-pad"
                    placeholder="MM"
                    maxLength={2}
                    placeholderTextColor={colors.textMuted}
                    selectTextOnFocus
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                  />
                  <TouchableOpacity style={ucStyles.arrowBtnLg} onPress={() => adjustMinute(manualExitM, 'down', setManualExitM)}>
                    <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={ucStyles.amPmRowLg}>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtnLg, exitPeriod === 'AM' && ucStyles.amPmBtnActive]}
                    onPress={() => setExitPeriod('AM')}
                  >
                    <Text style={[ucStyles.amPmTextLg, exitPeriod === 'AM' && ucStyles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtnLg, exitPeriod === 'PM' && ucStyles.amPmBtnActive]}
                    onPress={() => setExitPeriod('PM')}
                  >
                    <Text style={[ucStyles.amPmTextLg, exitPeriod === 'PM' && ucStyles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* BREAK - Smaller, below */}
            <View style={ucStyles.breakContainer}>
              <Text style={ucStyles.breakLabelSmall}>Break</Text>
              {showBreakCustomInput ? (
                <TextInput
                  ref={breakRef}
                  style={ucStyles.breakInputSm}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  value={manualPause}
                  onChangeText={(t) => setManualPause(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                  autoFocus
                  onBlur={() => setShowBreakCustomInput(false)}
                  {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                />
              ) : (
                <TouchableOpacity
                  style={ucStyles.breakDropdownBtnSm}
                  onPress={() => setShowBreakDropdown(!showBreakDropdown)}
                >
                  <Text style={ucStyles.breakDropdownTextSm}>{manualPause ? manualPause : '0'}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <Text style={ucStyles.breakUnitSm}>min</Text>
            </View>

            {/* Break Dropdown Menu */}
            {showBreakDropdown && (
              <View style={fixedStyles.breakDropdownMenu}>
                {['0', '15', '30', '45', '60'].map(v => (
                  <TouchableOpacity key={v} style={fixedStyles.breakOption} onPress={() => handleBreakSelect(v)}>
                    <Text style={fixedStyles.breakOptionText}>{v === '0' ? 'None' : `${v} min`}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[fixedStyles.breakOption, fixedStyles.breakOptionLast]}
                  onPress={() => handleBreakSelect('custom')}
                >
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={[fixedStyles.breakOptionText, { color: colors.primary }]}>Custom...</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Total */}
            <View style={ucStyles.totalRow}>
              <Text style={ucStyles.totalLabel}>Total</Text>
              <Text style={ucStyles.totalValue}>{totalHours}</Text>
            </View>

            {/* Save Changes Button */}
            <TouchableOpacity
              style={ucStyles.saveBtn}
              onPress={async () => {
                try {
                  await handleSaveAndShare();
                  setIsEditing(false);
                  showToast('Hours saved successfully!');
                } catch (e) {
                  // handleSaveManual shows its own Alert on error
                }
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.buttonPrimaryText} />
              <Text style={ucStyles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>
      </View>
      {/* END MAIN CONTENT WRAPPER */}

      </ScrollView>

      {/* ============================================ */}
      {/* SHARE MODAL (after save) */}
      {/* ============================================ */}
      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        sessions={sessionsToShare}
        title="Hours Saved!"
      />

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            toastStyles.toast,
            { opacity: toastOpacity }
          ]}
        >
          <Text style={toastStyles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* iOS: Done button above number-pad keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="timeInputDone">
          <View style={iosKeyboardStyles.bar}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={iosKeyboardStyles.doneBtn}>
              <Text style={iosKeyboardStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Toast notification styles
const toastStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: colors.error,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

// iOS keyboard "Done" button styles
const iosKeyboardStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  doneText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});

// Time input styles (simple text inputs instead of picker)
// Unified Card styles - mirrors Reports uc* styles exactly
const ucStyles = StyleSheet.create({
  timesGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInputWithArrows: {
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 8,
    backgroundColor: `${colors.primary}12`,
    borderRadius: 8,
  },
  timeInput: {
    width: 44,
    paddingVertical: 10,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSep: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 3,
  },
  amPmRow: {
    flexDirection: 'row',
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  amPmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  amPmBtnActive: {
    backgroundColor: colors.primary,
  },
  amPmText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  amPmTextActive: {
    color: colors.buttonPrimaryText,
  },
  breakInput: {
    width: 56,
    paddingVertical: 10,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
  },
  breakUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 6,
  },
  breakDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  breakDropdownText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: 14,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.buttonPrimaryText,
  },
  // Read-only: full-width Entry/Exit row
  timesRowFull: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  timeColHalf: {
    flex: 1,
    alignItems: 'center',
  },
  // Read-only: break row below
  breakRowReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  breakLabelSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakValueSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Edit: full-width field containers
  fieldContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldContainerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  // Edit: larger time inputs
  timeInputWithArrowsLg: {
    alignItems: 'center',
  },
  arrowBtnLg: {
    padding: 6,
    backgroundColor: `${colors.primary}12`,
    borderRadius: 8,
  },
  timeInputLg: {
    width: 52,
    paddingVertical: 10,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSepLg: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 2,
  },
  // Edit: larger AM/PM buttons
  amPmRowLg: {
    flexDirection: 'column',
    marginLeft: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  amPmBtnLg: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  amPmTextLg: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Edit: break container (smaller, inline)
  breakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  breakInputSm: {
    width: 48,
    paddingVertical: 6,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.text,
  },
  breakDropdownBtnSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  breakDropdownTextSm: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  breakUnitSm: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});

// Geofence data indicator styles
const geofenceIndicatorStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: `${colors.success}15`,
    borderRadius: 8,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.success,
  },
});

// Viewer styles - read-only form display
const viewerStyles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  viewHoursBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: `${colors.textSecondary}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.textSecondary}30`,
  },
  viewHoursBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  editBtnActive: {
    backgroundColor: colors.textSecondary,
    borderColor: colors.textSecondary,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  editBtnTextActive: {
    color: colors.white,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  dateRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  readOnlyView: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  timeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,  // More gap
    marginBottom: 14,  // More margin
  },
  timeBlock: {
    alignItems: 'center',
    minWidth: 70,  // Wider
  },
  timeBlockLabel: {
    fontSize: 11,  // Larger
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,  // More space
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeBlockValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  totalDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,  // Larger
    paddingHorizontal: 18,
    backgroundColor: `${colors.primary}10`,
    borderRadius: 24,
  },
  totalText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  // Read-only: larger time values
  timeBlockValueLarge: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});

// Onboarding styles for first-time users
const onboardingStyles = StyleSheet.create({
  onboardingHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  formDisabled: {
    opacity: 0.5,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonTextDisabled: {
    color: colors.textMuted,
  },
});

// Timer Ring Styles - State-based color system (v3.0)
// IDLE: neutral gray | RUNNING: green #0F766E | PAUSED: amber #C58B1B
const timerRingStyles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },

  // Status badge - soft tint background + state color text
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  statusBadgeActive: {
    backgroundColor: colors.greenSoft, // Soft green tint (#D1FAE5)
  },
  statusBadgePaused: {
    backgroundColor: colors.amberSoft, // Soft amber tint (#FFF3D6)
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusBadgeTextActive: {
    color: colors.green, // Green text (#0F766E)
  },
  statusBadgeTextPaused: {
    color: colors.amber, // Amber text (#C58B1B)
  },
  statusBadgeIdle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.surface2,  // Neutral surface (#F2F4F7)
    marginBottom: 4,
  },
  statusBadgeTextIdle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.iconMuted,  // Neutral gray (#98A2B3)
    textAlign: 'center',
  },

  // Timer display
  timer: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,  // Dark text (#101828)
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  timerPaused: {
    opacity: 0.7,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 2,
    letterSpacing: 2,
  },
  timerIdle: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.text,  // Dark text (#101828)
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  timerLabelIdle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 2,
    letterSpacing: 2,
  },

  // Break time - simple text
  breakText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 4,
  },

  // Idle hint
  idleHint: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 6,
  },

  // Action buttons - enterprise style
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    width: '100%',
    paddingHorizontal: 16,
  },
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.green,  // Green (#0F766E) - pause while running
    borderRadius: 10,
  },
  pauseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.amber,  // Amber (#C58B1B) - resume while paused
    borderRadius: 10,
  },
  resumeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  stopBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',  // Neutral border
  },
  stopBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,  // Dark text (#101828)
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: colors.buttonPrimary,  // Green (#0F766E)
    borderRadius: 10,
    marginTop: 8,
  },
  startBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },

  // Waiting state
  waitingText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.iconMuted,  // Muted gray (#98A2B3)
    marginTop: 12,
    textAlign: 'center',
  },
});
