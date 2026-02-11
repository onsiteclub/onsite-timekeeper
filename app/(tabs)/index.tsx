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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker'; // Keep for date picker only

import { Card } from '../../src/components/ui/Button';
import { colors } from '../../src/constants/colors';
import type { WorkLocation } from '../../src/stores/locationStore';

// V3: ComputedSession now comes from hooks.ts (was removed from database)
import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { ShareModal } from '../../src/components/ShareModal';
import { styles, fixedStyles } from '../../src/screens/home/styles';
import { AnimatedRing } from '../../src/components/AnimatedRing';

// Helper to format date
function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
}

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

  // Date picker state (use hook's state for unified handling)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);


  // Break dropdown state
  const [showBreakDropdown, setShowBreakDropdown] = useState(false);
  const [showBreakCustomInput, setShowBreakCustomInput] = useState(false);

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
    userId,
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
    setManualDate,
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
    openEditSession,
    isSameDay,
    formatTimeAMPM,
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

  // Date selection handlers (using hook's manualDate for unified state)
  const handleDateSelect = (option: 'today' | 'yesterday' | 'custom') => {
    const newDate = new Date();
    if (option === 'yesterday') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (option === 'custom') {
      setShowDatePicker(true);
      setShowDateDropdown(false);
      return;
    }
    setManualDate(newDate);
    setShowDateDropdown(false);
  };

  const onDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date && event.type === 'set') {
      // Check if date is in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      if (date > today) {
        showToast('⚠️ Cannot log hours for future dates');
        return;
      }

      setManualDate(date);
    }
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

  const handleEntryHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    handleHourChange(cleaned, setManualEntryH, setEntryPeriod);
  };

  const handleExitHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    handleHourChange(cleaned, setManualExitH, setExitPeriod);
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
      m = m >= 59 ? 0 : m + 5;
      if (m > 59) m = 0;
    } else {
      m = m <= 0 ? 55 : m - 5;
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

  // Helper to format time for share modal
  const formatTimeForShare = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')} ${period}`;
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

      <View style={fixedStyles.container}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
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
            size={240}
            strokeWidth={12}
          >
            {currentSession ? (
              <View style={timerRingStyles.content}>
                {/* Status badge - soft tint + state color text */}
                <View style={[
                  timerRingStyles.statusBadge,
                  isPaused ? timerRingStyles.statusBadgePaused : timerRingStyles.statusBadgeActive
                ]}>
                  <Text style={[
                    timerRingStyles.statusBadgeText,
                    isPaused ? timerRingStyles.statusBadgeTextPaused : timerRingStyles.statusBadgeTextActive
                  ]}>
                    {isPaused ? 'Paused' : 'Active'} • {currentSession.location_name}
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
      <Card style={[fixedStyles.formSection, locations.length === 0 && onboardingStyles.formDisabled].filter(Boolean) as ViewStyle[]}>
        {/* Header with Edit button */}
        <View style={viewerStyles.header}>
          <View style={viewerStyles.headerLeft}>
            {hasGeofenceData && (
              <View style={geofenceIndicatorStyles.badge}>
                <Ionicons name="locate" size={10} color={colors.success} />
                <Text style={geofenceIndicatorStyles.text}>Auto</Text>
              </View>
            )}
            <Text style={viewerStyles.dateText}>{formatDateWithDay(manualDate)}</Text>
          </View>
          <View style={viewerStyles.headerButtons}>
            <TouchableOpacity
              style={viewerStyles.viewHoursBtn}
              onPress={() => router.push('/(tabs)/reports')}
            >
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={viewerStyles.viewHoursBtnText}>View Hours</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[viewerStyles.editBtn, isEditing && viewerStyles.editBtnActive]}
              onPress={() => setIsEditing(!isEditing)}
            >
              <Ionicons name={isEditing ? "close" : "pencil"} size={14} color={isEditing ? colors.white : colors.primary} />
              <Text style={[viewerStyles.editBtnText, isEditing && viewerStyles.editBtnTextActive]}>
                {isEditing ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* READ-ONLY VIEW (default) - same grid layout as edit mode */}
        {!isEditing ? (
          <View style={viewerStyles.readOnlyView}>
            <View style={ucStyles.timesGrid}>
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Entry</Text>
                <Text style={viewerStyles.timeBlockValue}>
                  {manualEntryH && manualEntryM ? `${manualEntryH}:${manualEntryM} ${entryPeriod}` : '--:--'}
                </Text>
              </View>
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Exit</Text>
                <Text style={viewerStyles.timeBlockValue}>
                  {manualExitH && manualExitM ? `${manualExitH}:${manualExitM} ${exitPeriod}` : '--:--'}
                </Text>
              </View>
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Break</Text>
                <Text style={viewerStyles.timeBlockValue}>{manualPause ? `${manualPause} min` : '--'}</Text>
              </View>
            </View>
            <View style={ucStyles.totalRow}>
              <Text style={ucStyles.totalLabel}>Total</Text>
              <Text style={ucStyles.totalValue}>{totalHours}</Text>
            </View>
          </View>
        ) : (
          <>
            {/* Date Selector - only visible when editing */}
            <TouchableOpacity
              style={fixedStyles.dateSelector}
              onPress={() => setShowDateDropdown(!showDateDropdown)}
            >
              <View style={fixedStyles.dateSelectorContent}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={fixedStyles.dateSelectorText}>{formatDateWithDay(manualDate)}</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Date Dropdown */}
            {showDateDropdown && (
              <View style={fixedStyles.dateDropdown}>
                <TouchableOpacity
                  style={fixedStyles.dateOption}
                  onPress={() => handleDateSelect('today')}
                >
                  <Ionicons name="today-outline" size={16} color={colors.text} />
                  <Text style={fixedStyles.dateOptionText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.dateOption}
                  onPress={() => handleDateSelect('yesterday')}
                >
                  <Ionicons name="arrow-back-outline" size={16} color={colors.text} />
                  <Text style={fixedStyles.dateOptionText}>Yesterday</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.dateOption}
                  onPress={() => handleDateSelect('custom')}
                >
                  <Ionicons name="calendar" size={16} color={colors.text} />
                  <Text style={fixedStyles.dateOptionText}>Choose date...</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Time Inputs - 3 column grid (same as Reports uc card) */}
            <View style={ucStyles.timesGrid}>
              {/* Entry */}
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Entry</Text>
                <View style={ucStyles.timeInputRow}>
                  <View style={ucStyles.timeInputWithArrows}>
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustHour(manualEntryH, 'up', setManualEntryH, entryPeriod, setEntryPeriod)}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={ucStyles.timeInput}
                      value={manualEntryH}
                      onChangeText={handleEntryHourChange}
                      keyboardType="number-pad"
                      placeholder="HH"
                      maxLength={2}
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                      {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                    />
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustHour(manualEntryH, 'down', setManualEntryH, entryPeriod, setEntryPeriod)}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={ucStyles.timeSep}>:</Text>
                  <View style={ucStyles.timeInputWithArrows}>
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustMinute(manualEntryM, 'up', setManualEntryM)}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={ucStyles.timeInput}
                      value={manualEntryM}
                      onChangeText={(t) => setManualEntryM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      placeholder="MM"
                      maxLength={2}
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                      {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                    />
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustMinute(manualEntryM, 'down', setManualEntryM)}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={ucStyles.amPmRow}>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtn, entryPeriod === 'AM' && ucStyles.amPmBtnActive]}
                    onPress={() => setEntryPeriod('AM')}
                  >
                    <Text style={[ucStyles.amPmText, entryPeriod === 'AM' && ucStyles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtn, entryPeriod === 'PM' && ucStyles.amPmBtnActive]}
                    onPress={() => setEntryPeriod('PM')}
                  >
                    <Text style={[ucStyles.amPmText, entryPeriod === 'PM' && ucStyles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Exit */}
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Exit</Text>
                <View style={ucStyles.timeInputRow}>
                  <View style={ucStyles.timeInputWithArrows}>
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustHour(manualExitH, 'up', setManualExitH, exitPeriod, setExitPeriod)}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={ucStyles.timeInput}
                      value={manualExitH}
                      onChangeText={handleExitHourChange}
                      keyboardType="number-pad"
                      placeholder="HH"
                      maxLength={2}
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                      {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                    />
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustHour(manualExitH, 'down', setManualExitH, exitPeriod, setExitPeriod)}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={ucStyles.timeSep}>:</Text>
                  <View style={ucStyles.timeInputWithArrows}>
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustMinute(manualExitM, 'up', setManualExitM)}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                      style={ucStyles.timeInput}
                      value={manualExitM}
                      onChangeText={(t) => setManualExitM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      placeholder="MM"
                      maxLength={2}
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                      {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'timeInputDone' } : {})}
                    />
                    <TouchableOpacity style={ucStyles.arrowBtn} onPress={() => adjustMinute(manualExitM, 'down', setManualExitM)}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={ucStyles.amPmRow}>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtn, exitPeriod === 'AM' && ucStyles.amPmBtnActive]}
                    onPress={() => setExitPeriod('AM')}
                  >
                    <Text style={[ucStyles.amPmText, exitPeriod === 'AM' && ucStyles.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ucStyles.amPmBtn, exitPeriod === 'PM' && ucStyles.amPmBtnActive]}
                    onPress={() => setExitPeriod('PM')}
                  >
                    <Text style={[ucStyles.amPmText, exitPeriod === 'PM' && ucStyles.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Break */}
              <View style={ucStyles.timeCol}>
                <Text style={ucStyles.timeLabel}>Break</Text>
                {showBreakCustomInput ? (
                  <>
                    <TextInput
                      style={ucStyles.breakInput}
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
                    <Text style={ucStyles.breakUnit}>min</Text>
                  </>
                ) : (
                  <TouchableOpacity
                    style={ucStyles.breakDropdownBtn}
                    onPress={() => setShowBreakDropdown(!showBreakDropdown)}
                  >
                    <Text style={ucStyles.breakDropdownText}>
                      {manualPause ? manualPause : '0'}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <Text style={ucStyles.breakUnit}>min</Text>
              </View>
            </View>

            {/* Break Dropdown Menu */}
            {showBreakDropdown && (
              <View style={fixedStyles.breakDropdownMenu}>
                <TouchableOpacity
                  style={fixedStyles.breakOption}
                  onPress={() => handleBreakSelect('0')}
                >
                  <Text style={fixedStyles.breakOptionText}>None</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.breakOption}
                  onPress={() => handleBreakSelect('15')}
                >
                  <Text style={fixedStyles.breakOptionText}>15 min</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.breakOption}
                  onPress={() => handleBreakSelect('30')}
                >
                  <Text style={fixedStyles.breakOptionText}>30 min</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.breakOption}
                  onPress={() => handleBreakSelect('45')}
                >
                  <Text style={fixedStyles.breakOptionText}>45 min</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={fixedStyles.breakOption}
                  onPress={() => handleBreakSelect('60')}
                >
                  <Text style={fixedStyles.breakOptionText}>60 min</Text>
                </TouchableOpacity>
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

      {/* Date Picker (keep this - only for date selection) */}
      {showDatePicker && (
        <DateTimePicker
          value={manualDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          maximumDate={new Date()}
        />
      )}
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
      </View>
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
    gap: 12,
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInputWithArrows: {
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 2,
  },
  timeInput: {
    width: 38,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSep: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 2,
  },
  amPmRow: {
    flexDirection: 'row',
    marginTop: 6,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  amPmBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  amPmBtnActive: {
    backgroundColor: colors.primary,
  },
  amPmText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  amPmTextActive: {
    color: colors.buttonPrimaryText,
  },
  breakInput: {
    width: 52,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  breakUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },
  breakDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakDropdownText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: 12,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,  // +40%
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateText: {
    fontSize: 15,  // Larger
    fontWeight: '600',
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewHoursBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: `${colors.textSecondary}15`,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.textSecondary}30`,
  },
  viewHoursBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  editBtnActive: {
    backgroundColor: colors.textSecondary,
    borderColor: colors.textSecondary,
  },
  editBtnText: {
    fontSize: 13,  // Larger
    fontWeight: '600',
    color: colors.primary,
  },
  editBtnTextActive: {
    color: colors.white,
  },
  readOnlyView: {
    alignItems: 'center',
    paddingVertical: 4,  // Add vertical padding
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
    fontSize: 18,  // Larger
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
    fontSize: 16,  // Larger
    fontWeight: '700',
    color: colors.primary,
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  statusBadgeActive: {
    backgroundColor: colors.greenSoft, // Soft green tint (#D1FAE5)
  },
  statusBadgePaused: {
    backgroundColor: colors.amberSoft, // Soft amber tint (#FFF3D6)
  },
  statusBadgeText: {
    fontSize: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface2,  // Neutral surface (#F2F4F7)
    marginBottom: 8,
  },
  statusBadgeTextIdle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.iconMuted,  // Neutral gray (#98A2B3)
    textAlign: 'center',
  },

  // Timer display
  timer: {
    fontSize: 44,
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
    fontSize: 40,
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
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 8,
  },

  // Idle hint
  idleHint: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,  // Muted (#667085)
    marginTop: 12,
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
