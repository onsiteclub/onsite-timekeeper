/**
 * Home Screen - OnSite Timekeeper (formerly Reports)
 *
 * v2.0: Merged Home + Reports into single screen
 * - Compact timer at top
 * - Calendar with hours per day
 * - Editar + Exportar Horas buttons
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StatusBar,
  Dimensions,
  StyleSheet,
  TextInput,
  Animated,
  Platform,
  InputAccessoryView,
  Keyboard,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../../src/components/ui/Button';
import { colors, withOpacity, shadows } from '../../src/constants/colors';

// V3: ComputedSession now comes from hooks.ts (was removed from database)
import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { styles } from '../../src/screens/home/styles';
import { WEEKDAYS_SHORT, getDayKey } from '../../src/screens/home/helpers';
import { generateAndShareTimesheetPDF } from '../../src/lib/timesheetPdf';
import { logger } from '../../src/lib/logger';
import { Alert } from 'react-native';

// Drop-in replacement for TouchableOpacity using Pressable (new touch system).
// TouchableOpacity uses the legacy responder protocol which deadlocks inside
// GestureHandlerRootView when gesture handlers (FloatingMicButton) are active.
function PressableOpacity({
  style,
  activeOpacity = 0.2,
  children,
  ...props
}: React.ComponentProps<typeof Pressable> & { activeOpacity?: number }) {
  return (
    <Pressable
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: activeOpacity },
      ] as StyleProp<ViewStyle>}
      {...props}
    >
      {children}
    </Pressable>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_PADDING = 32;
const CALENDAR_GAP = 2;
const DAYS_PER_WEEK = 7;
// Cap calendar width to 500px on web to keep 7-column grid readable on desktop
const CALENDAR_WIDTH = Platform.OS === 'web' ? Math.min(SCREEN_WIDTH, 500) : SCREEN_WIDTH;
const DAY_SIZE = Math.floor((CALENDAR_WIDTH - CALENDAR_PADDING - (CALENDAR_GAP * 6)) / DAYS_PER_WEEK);

// Compact duration: "8h30" or "8h" or "45m" (no "min" suffix)
function formatCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsScreen() {
  const router = useRouter();
  const { viewDate } = useLocalSearchParams<{ viewDate?: string }>();

  const {
    userName,
    userId,
    currentMonth,
    monthCalendarDays,
    monthTotalMinutes,

    // Timer
    currentSession,
    activeLocation,
    canRestart,
    isGeofencingActive,
    timer,
    isPaused,
    pauseTimer,
    cooldownSeconds,
    handlePause,
    handleResume,
    handleStop,
    handleRestart,

    showDayModal,
    selectedDayForModal,
    dayModalSessions,
    closeDayModal,

    // Inline editing (unified day card)
    isEditingInline,
    setIsEditingInline,
    setManualDate,
    setEditingSessionId,
    saveAbsenceForDate,

    onRefresh,

    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,

    handleDayPress,
    openDayModal,
    getSessionsForDay,
    getTotalMinutesForDay,

    handleDeleteFromModal,

    // Manual entry form state (used inline in day card)
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
    setManualEntryMode,
    setManualAbsenceType,
    handleSaveManual,

    locations,
    formatMonthYear,
    formatTimeAMPM,
    formatDuration,
    isToday,
    getSessionsByPeriod,
    setViewMode,
  } = useHomeScreen();

  // ============================================
  // RELOAD DATA ON TAB FOCUS
  // ============================================
  // FIX: When navigating from Home to Reports, reload data to show new records
  // FIX: Always navigate to current month so chart shows current week
  useFocusEffect(
    useCallback(() => {
      setViewMode('month');
      goToCurrentMonth();
      onRefresh();
    }, []) // Empty deps - functions read from store directly
  );

  // Open day modal when navigated with viewDate param (e.g. from voice command)
  useEffect(() => {
    if (!viewDate) return;
    const [year, month, day] = viewDate.split('-').map(Number);
    if (!year || !month || !day) return;

    // Small delay to let data load after focus
    const timer = setTimeout(() => {
      openDayModal(new Date(year, month - 1, day));
      // Clear the param so it doesn't re-trigger
      router.setParams({ viewDate: undefined as unknown as string });
    }, 300);
    return () => clearTimeout(timer);
  }, [viewDate]);

  // ============================================
  // AM/PM STATE FOR MANUAL ENTRY MODAL
  // ============================================
  const [entryPeriod, setEntryPeriod] = useState<'AM' | 'PM'>('AM');
  const [exitPeriod, setExitPeriod] = useState<'AM' | 'PM'>('PM');

  // Shared hour handler - allows leading "0" for typing "02", converts 24h→12h
  const handleHourChange = (
    cleaned: string,
    setHour: (h: string) => void,
    setPeriod: (p: 'AM' | 'PM') => void,
  ) => {
    const hour = parseInt(cleaned, 10);
    // Allow single "0" so user can type "02", "07", etc.
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
    // 13-23 → auto-convert to 12h PM
    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      setHour(String(hour - 12).padStart(2, '0'));
      setPeriod('PM');
      return;
    }
    // 12 → set PM (noon)
    if (!isNaN(hour) && hour === 12) {
      setHour('12');
      setPeriod('PM');
      return;
    }
    // 1-11: keep as-is, user picks AM/PM manually
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

  // Arrow helpers for time adjustment
  const adjustHour = (current: string, dir: 'up' | 'down', setH: (h: string) => void, period: 'AM' | 'PM', setP: (p: 'AM' | 'PM') => void) => {
    let h = parseInt(current, 10) || 12;
    h = dir === 'up' ? h + 1 : h - 1;
    if (h > 12) { h = 1; }
    if (h < 1) { h = 12; }
    // Toggle AM/PM at 12 boundary
    if (h === 12 && dir === 'up') setP(period === 'AM' ? 'PM' : 'AM');
    if (h === 11 && dir === 'down') setP(period === 'AM' ? 'PM' : 'AM');
    setH(String(h).padStart(2, '0'));
  };

  const adjustMinute = (current: string, dir: 'up' | 'down', setM: (m: string) => void) => {
    let m = parseInt(current, 10) || 0;
    m = dir === 'up' ? m + 1 : m - 1;
    if (m >= 60) m = 0;
    if (m < 0) m = 59;
    setM(String(m).padStart(2, '0'));
  };

  // Convert 12h to 24h for saving
  // Also handles cases where user typed 24h format directly (13-23)
  const get24Hour = (hour12: string, period: 'AM' | 'PM'): number => {
    const h = parseInt(hour12, 10) || 0;

    // If hour is already in 24h format (13-23), return as-is
    if (h >= 13 && h <= 23) {
      return h;
    }
    // Handle 0 as midnight
    if (h === 0) {
      return 0;
    }

    // Standard 12h to 24h conversion
    if (period === 'AM') {
      return h === 12 ? 0 : h;
    } else {
      return h === 12 ? 12 : h + 12;
    }
  };

  // Wrapper for save that converts to 24h format
  // FIX: Pass 24h values directly to avoid stale closure issues
  const handleSaveManualWithAmPm = async () => {
    const entryH24 = get24Hour(manualEntryH, entryPeriod);
    const exitH24 = get24Hour(manualExitH, exitPeriod);

    // Pass 24h values directly - no setState race condition!
    await handleSaveManual({ entryH: entryH24, exitH: exitH24 });
  };

  // ============================================
  // INLINE EDIT HELPERS (unified day card)
  // ============================================

  const toDisplay12 = (h24: number) => {
    if (h24 === 0) return { h: '12', period: 'AM' as const };
    if (h24 === 12) return { h: '12', period: 'PM' as const };
    if (h24 > 12) return { h: String(h24 - 12).padStart(2, '0'), period: 'PM' as const };
    return { h: String(h24).padStart(2, '0'), period: 'AM' as const };
  };

  const startInlineAdd = () => {
    if (!selectedDayForModal) return;
    setManualDate(selectedDayForModal);
    setManualLocationId(locations[0]?.id || '');
    setManualEntryH('08');
    setManualEntryM('00');
    setManualExitH('05');
    setManualExitM('00');
    setManualPause('');
    setManualEntryMode('hours');
    setManualAbsenceType(null);
    setEditingSessionId(null);
    setEntryPeriod('AM');
    setExitPeriod('PM');
    setIsEditingInline(true);
    setShowAbsenceOptions(false);
  };

  const startInlineEdit = (session: ComputedSession) => {
    const entryDate = new Date(session.entry_at);
    const exitDate = session.exit_at ? new Date(session.exit_at) : new Date();

    setManualDate(entryDate);
    setManualLocationId(session.location_id || locations[0]?.id || '');

    const entry12 = toDisplay12(entryDate.getHours());
    const exit12 = toDisplay12(exitDate.getHours());

    setManualEntryH(entry12.h);
    setManualEntryM(String(entryDate.getMinutes()).padStart(2, '0'));
    setEntryPeriod(entry12.period);
    setManualExitH(exit12.h);
    setManualExitM(String(exitDate.getMinutes()).padStart(2, '0'));
    setExitPeriod(exit12.period);
    setManualPause(session.pause_minutes ? String(session.pause_minutes) : '');
    setManualEntryMode('hours');
    setManualAbsenceType(null);
    setEditingSessionId(session.id);
    setIsEditingInline(true);
    setShowAbsenceOptions(false);
  };

  const cancelInlineEdit = () => {
    setIsEditingInline(false);
    setEditingSessionId(null);
    setShowAbsenceOptions(false);
  };

  // Live total calculation while editing
  const liveEditTotal = useMemo(() => {
    if (!isEditingInline) return '';
    const entryH24 = get24Hour(manualEntryH, entryPeriod);
    const entryMins = parseInt(manualEntryM, 10) || 0;
    const exitH24 = get24Hour(manualExitH, exitPeriod);
    const exitMins = parseInt(manualExitM, 10) || 0;
    const pause = parseInt(manualPause, 10) || 0;

    const totalMins = (exitH24 * 60 + exitMins) - (entryH24 * 60 + entryMins) - pause;
    if (totalMins <= 0 || isNaN(totalMins)) return '--';
    return formatDuration(totalMins);
  }, [isEditingInline, manualEntryH, manualEntryM, manualExitH, manualExitM, manualPause, entryPeriod, exitPeriod]);

  // ============================================
  // AGGREGATE SESSIONS BY LOCATION FOR DAY MODAL
  // ============================================
  // 1 location per day → single completed session for day modal
  const daySession = useMemo((): ComputedSession | null => {
    const completed = dayModalSessions.filter(s => s.exit_at);
    return completed[0] || null;
  }, [dayModalSessions]);

  // Animation values for morph transition
  const modalScale = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const [, setPressedDayKey] = useState<string | null>(null);

  // PDF export loading state
  const [isExporting, setIsExporting] = useState(false);

  // Absence options toggle (for inline day card)
  const [showAbsenceOptions, setShowAbsenceOptions] = useState(false);

  // Date range selection state (Airbnb style)
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rangeSessions, setRangeSessions] = useState<ComputedSession[]>([]);

  // Handle date range selection (Airbnb style)
  const handleDateRangeSelect = async (date: Date) => {
    logger.debug('ui', 'handleDateRangeSelect called', {
      dateRangeMode: String(dateRangeMode),
      hasStart: String(!!rangeStartDate),
      hasEnd: String(!!rangeEndDate),
    });

    if (!dateRangeMode) {
      return;
    }

    if (!rangeStartDate || (rangeStartDate && rangeEndDate)) {
      // First selection or reset
      setRangeStartDate(date);
      setRangeEndDate(null);
      setRangeSessions([]);
    } else {
      // Second selection
      let startDate = rangeStartDate;
      let endDate = date;

      if (date < rangeStartDate) {
        // If selected date is before start, swap
        startDate = date;
        endDate = rangeStartDate;
      }

      setRangeStartDate(startDate);
      setRangeEndDate(endDate);

      // Fetch sessions for the entire range (may span multiple months)
      const startTime = new Date(startDate);
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(endDate);
      endTime.setHours(23, 59, 59, 999);

      try {
        const sessions = await getSessionsByPeriod(startTime.toISOString(), endTime.toISOString());
        const completedSessions = sessions.filter((s: ComputedSession) => s.exit_at);
        logger.debug('ui', 'Date range sessions loaded', { total: String(sessions?.length || 0), completed: String(completedSessions.length) });
        setRangeSessions(completedSessions);

        // Open export modal after selecting range
        setTimeout(() => setShowExportModal(true), 300);
      } catch (err) {
        logger.error('ui', 'Error fetching date range sessions', { error: String(err) });
      }
    }
  };

  // Check if date is in selected range
  const isInDateRange = (date: Date): 'start' | 'end' | 'middle' | 'single' | null => {
    if (!rangeStartDate) return null;

    const dateTime = date.setHours(0, 0, 0, 0);
    const startTime = new Date(rangeStartDate).setHours(0, 0, 0, 0);

    if (!rangeEndDate) {
      // Only start date selected
      if (dateTime === startTime) return 'single';
      return null;
    }

    const endTime = new Date(rangeEndDate).setHours(0, 0, 0, 0);

    if (dateTime === startTime && dateTime === endTime) return 'single';
    if (dateTime === startTime) return 'start';
    if (dateTime === endTime) return 'end';
    if (dateTime > startTime && dateTime < endTime) return 'middle';

    return null;
  };

  // Get sessions in date range for export (uses pre-fetched rangeSessions)
  const getSessionsInRange = (): ComputedSession[] => {
    if (!rangeStartDate || !rangeEndDate) return [];
    return rangeSessions;
  };

  // Calculate total hours in range (duration_minutes is already NET)
  const rangeTotalMinutes = useMemo(() => {
    return rangeSessions.reduce((total, s) => {
      return total + Math.max(0, s.duration_minutes);
    }, 0);
  }, [rangeSessions]);

  // Count days worked in range
  const rangeDaysWorked = useMemo(() => {
    const uniqueDays = new Set(rangeSessions.map(s => getDayKey(new Date(s.entry_at))));
    return uniqueDays.size;
  }, [rangeSessions]);

  // Cancel date range mode
  const cancelDateRange = () => {
    setDateRangeMode(false);
    setRangeStartDate(null);
    setRangeEndDate(null);
    setRangeSessions([]);
  };

  // Month navigation: arrows only (swipe removed — caused recurring touch deadlocks with GestureHandlerRootView)

  // Export to PDF - Professional Timesheet
  const handleExportPDF = async () => {
    const sessions = getSessionsInRange();
    if (sessions.length === 0) {
      Alert.alert('No Sessions', 'No completed sessions in the selected period.');
      return;
    }

    if (!rangeStartDate || !rangeEndDate) {
      Alert.alert('Error', 'Please select a date range first.');
      return;
    }

    try {
      // Show loading state
      setIsExporting(true);
      setShowExportModal(false);

      // Generate and share professional PDF timesheet
      await generateAndShareTimesheetPDF(sessions, {
        employeeName: userName || 'Employee',
        employeeId: userId || undefined,
        periodStart: rangeStartDate,
        periodEnd: rangeEndDate,
      });

      // Clear selection after successful export
      cancelDateRange();
    } catch (error: any) {
      Alert.alert('Export Error', error.message || 'Failed to generate PDF');
    } finally {
      setIsExporting(false);
    }
  };

  // Animate modal open with morph effect
  useEffect(() => {
    if (showDayModal) {
      // Smooth morph transition - day transforms into modal
      Animated.parallel([
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 35,      // Much lower = slower, more noticeable (was 50)
          friction: 12,     // Higher = more controlled (was 10)
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 400,    // Much longer fade (was 280ms)
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animation values when modal closes
      modalScale.setValue(0);
      modalOpacity.setValue(0);
      setPressedDayKey(null);
    }
  }, [showDayModal, modalScale, modalOpacity]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F4F6' }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <View style={reportStyles.container}>
      {/* TIMER HERO CARD */}
      {(() => {
        const isActive = !!currentSession && !isPaused;
        const isPausedState = !!currentSession && isPaused;
        const isReady = !currentSession && !!canRestart;
        const isLocked = !currentSession && !canRestart;

        const locationName = currentSession?.location_name
          || activeLocation?.name
          || null;

        return (
          <View style={[
            heroStyles.card,
            isActive && heroStyles.cardActive,
            isPausedState && heroStyles.cardPaused,
            isLocked && heroStyles.cardLocked,
          ]}>
            {/* Location chip */}
            <View style={[
              heroStyles.chip,
              isActive && heroStyles.chipActive,
              isPausedState && heroStyles.chipPaused,
              isLocked && heroStyles.chipLocked,
            ]}>
              <Ionicons
                name={isLocked ? 'lock-closed' : 'location'}
                size={13}
                color={isActive ? colors.green : isPausedState ? colors.amber : isReady ? colors.green : colors.iconMuted}
              />
              <Text style={[
                heroStyles.chipText,
                isActive && heroStyles.chipTextActive,
                isPausedState && heroStyles.chipTextPaused,
                isLocked && heroStyles.chipTextLocked,
              ]} numberOfLines={1}>
                {locationName || (isGeofencingActive ? 'Waiting for location...' : 'No location set')}
              </Text>
            </View>

            {/* Timer display */}
            <Text style={[
              heroStyles.timer,
              isActive && heroStyles.timerActive,
              isPausedState && heroStyles.timerPaused,
              isLocked && heroStyles.timerLocked,
            ]}>
              {currentSession ? timer : '00:00:00'}
            </Text>

            {/* Break line (only when active/paused) */}
            {currentSession && (
              <Text style={[
                heroStyles.breakText,
                isPausedState && heroStyles.breakTextPaused,
              ]}>
                {isPaused ? `☕ break: ${pauseTimer}` : `☕ ${pauseTimer}`}
              </Text>
            )}

            {/* Cooldown warning */}
            {cooldownSeconds > 0 && (
              <View style={heroStyles.cooldownRow}>
                <Ionicons name="warning" size={14} color={colors.amber} />
                <Text style={heroStyles.cooldownText}>
                  You left the jobsite. Return within {cooldownSeconds}s or tracking stops.
                </Text>
              </View>
            )}

            {/* Progress bar */}
            <View style={heroStyles.progressTrack}>
              {isActive && <View style={[heroStyles.progressFill, { width: '100%' }]} />}
              {isPausedState && <View style={[heroStyles.progressFillPaused, { width: '60%' }]} />}
            </View>

            {/* Action button */}
            {currentSession ? (
              <View style={heroStyles.actions}>
                {isPaused ? (
                  <PressableOpacity style={heroStyles.resumeBtn} onPress={handleResume} activeOpacity={0.8}>
                    <Ionicons name="play" size={18} color={colors.white} />
                    <Text style={heroStyles.btnTextLight}>RESUME</Text>
                  </PressableOpacity>
                ) : (
                  <PressableOpacity style={heroStyles.pauseBtn} onPress={handlePause} activeOpacity={0.8}>
                    <Ionicons name="pause" size={18} color={colors.white} />
                    <Text style={heroStyles.btnTextLight}>PAUSE</Text>
                  </PressableOpacity>
                )}
                <PressableOpacity style={heroStyles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                  <Ionicons name="stop" size={16} color={colors.error} />
                  <Text style={heroStyles.stopBtnText}>STOP</Text>
                </PressableOpacity>
              </View>
            ) : (
              <PressableOpacity
                style={[heroStyles.startBtn, isLocked && heroStyles.startBtnLocked]}
                onPress={isReady ? handleRestart : undefined}
                activeOpacity={isReady ? 0.8 : 1}
                disabled={isLocked}
              >
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'play'}
                  size={18}
                  color={isLocked ? colors.iconMuted : colors.white}
                />
                <Text style={[heroStyles.btnTextLight, isLocked && heroStyles.btnTextLocked]}>
                  START
                </Text>
              </PressableOpacity>
            )}
          </View>
        );
      })()}

      {/* CALENDAR CARD - Hidden in date range mode */}
      {!dateRangeMode && (
        <Card style={reportStyles.calendarCard}>
          <View style={styles.calendarHeader}>
            <PressableOpacity
              style={reportStyles.navBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            </PressableOpacity>

            <PressableOpacity
              onPress={goToCurrentMonth}
              style={styles.calendarCenter}
            >
              <Text style={reportStyles.calendarTitle}>
                {formatMonthYear(currentMonth)}
              </Text>
              <Text style={reportStyles.calendarTotal}>
                Monthly Total: {formatDuration(monthTotalMinutes)}
              </Text>
            </PressableOpacity>

            <PressableOpacity
              style={reportStyles.navBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </PressableOpacity>
          </View>

        </Card>
      )}

      {/* DATE RANGE MODE HEADER */}
      {dateRangeMode && (
        <View style={reportStyles.dateRangeHeader}>
          {/* Month navigation */}
          <View style={reportStyles.dateRangeMonthNav}>
            <PressableOpacity
              style={reportStyles.dateRangeNavBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </PressableOpacity>

            <Text style={reportStyles.dateRangeMonthName}>
              {formatMonthYear(currentMonth)}
            </Text>

            <PressableOpacity
              style={reportStyles.dateRangeNavBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.primary} />
            </PressableOpacity>
          </View>

          {/* Selection hint + cancel */}
          <View style={reportStyles.dateRangeHintRow}>
            <Ionicons name="calendar" size={16} color={colors.primary} />
            <Text style={reportStyles.dateRangeHintText}>
              {!rangeStartDate
                ? 'Tap start date'
                : !rangeEndDate
                ? 'Now tap end date'
                : 'Range selected!'}
            </Text>
            <PressableOpacity style={reportStyles.dateRangeCancelBtn} onPress={cancelDateRange}>
              <Text style={reportStyles.dateRangeCancelBtnText}>Cancel</Text>
            </PressableOpacity>
          </View>
        </View>
      )}

      {/* CALENDAR CONTENT AREA - Scrollable */}
      <ScrollView
        style={reportStyles.contentArea}
        contentContainerStyle={reportStyles.contentAreaScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          {/* MONTH VIEW - arrow navigation only (swipe removed: caused touch deadlock with GestureHandlerRootView) */}
          <View>
              {/* Weekday headers */}
              <View style={reportStyles.monthHeader}>
                {WEEKDAYS_SHORT.map((d: string, i: number) => (
                  <View key={i} style={reportStyles.monthHeaderCell}>
                    <Text style={reportStyles.monthHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* Days grid - Always 6 weeks (42 days) for consistent height */}
              <View style={reportStyles.monthGrid}>
                {monthCalendarDays.map((date: Date, index: number) => {
                  // Check if day belongs to current month or is a "ghost" from adjacent months
                  const isCurrentMonthDay = date.getMonth() === currentMonth.getMonth() &&
                                            date.getFullYear() === currentMonth.getFullYear();

                  // Ghost days from other months - just show faded number, no interaction
                  if (!isCurrentMonthDay) {
                    return (
                      <View
                        key={`ghost-${index}`}
                        style={[reportStyles.monthCell, reportStyles.monthDayGhost]}
                      >
                        <Text style={reportStyles.monthDayNumGhost}>
                          {date.getDate()}
                        </Text>
                      </View>
                    );
                  }

                  const dayKey = getDayKey(date);
                  const daySessions = getSessionsForDay(date);
                  const hasSessions = daySessions.length > 0;
                  const isTodayDate = isToday(date);
                  const totalMinutes = getTotalMinutesForDay(date);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  // Date range mode styling
                  const rangePosition = dateRangeMode ? isInDateRange(date) : null;

                  // Check if day has work but NO breaks registered
                  const completedSessions = daySessions.filter((s: ComputedSession) => s.exit_at);
                  const hasWorkNoBreak = completedSessions.length > 0 &&
                    completedSessions.every((s: ComputedSession) => !s.pause_minutes || s.pause_minutes === 0);

                  return (
                    <PressableOpacity
                      key={dayKey}
                      activeOpacity={0.6}
                      style={[
                        reportStyles.monthCell,
                        reportStyles.monthDay,
                        isWeekend && reportStyles.monthDayWeekend,
                        isTodayDate && reportStyles.monthDayToday,
                        hasSessions && reportStyles.monthDayHasData,
                        // Date range styles (Airbnb style) - applied on top of base styles
                        rangePosition === 'start' && reportStyles.monthDayRangeStart,
                        rangePosition === 'end' && reportStyles.monthDayRangeEnd,
                        rangePosition === 'middle' && reportStyles.monthDayRangeMiddle,
                        rangePosition === 'single' && reportStyles.monthDayRangeSingle,
                      ]}
                      onPress={() => {
                        if (dateRangeMode) {
                          handleDateRangeSelect(date);
                        } else {
                          handleDayPress(dayKey, hasSessions);
                        }
                      }}
                    >
                      <Text style={[
                        reportStyles.monthDayNum,
                        isTodayDate && reportStyles.monthDayNumToday,
                        (rangePosition === 'start' || rangePosition === 'end' || rangePosition === 'single') && { color: colors.white, fontWeight: '700' as const },
                      ]}>
                        {date.getDate()}
                      </Text>
                      {totalMinutes > 0 ? (
                        <Text style={[
                          reportStyles.monthDayHours,
                          isTodayDate && reportStyles.monthDayHoursToday,
                          (rangePosition === 'start' || rangePosition === 'end' || rangePosition === 'single') && { color: colors.white },
                        ]}>
                          {formatCompact(totalMinutes)}
                        </Text>
                      ) : (
                        <Text style={reportStyles.monthDayHoursEmpty}>-</Text>
                      )}
                    </PressableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Export button inside calendar scroll */}
            {!dateRangeMode && (
              <PressableOpacity
                style={reportStyles.exportInlineBtn}
                activeOpacity={0.7}
                onPress={() => setDateRangeMode(true)}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.white} />
                <Text style={reportStyles.exportInlineBtnText}>Select Dates to Export</Text>
              </PressableOpacity>
            )}

      </ScrollView>

      {/* DAY DETAIL MODAL */}
      <Modal
        visible={showDayModal}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeDayModal}
      >
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: 'rgba(16, 24, 40, 0.6)',
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
            paddingHorizontal: 16,
            opacity: modalOpacity,
          }}
        >
          <Animated.View
            style={{
              width: '100%',
              height: '65%',
              backgroundColor: colors.backgroundSecondary,
              borderRadius: 20,
              overflow: 'hidden' as const,
              transform: [{ scale: modalScale }],
            }}
          >
            {/* Header: Date + Close */}
            <View style={reportStyles.ucHeader}>
              <Text style={reportStyles.dayModalTitleV2}>
                {selectedDayForModal?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </Text>
              <PressableOpacity
                style={reportStyles.ucCloseBtn}
                onPress={closeDayModal}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </PressableOpacity>
            </View>

            {/* Action Buttons (below header) */}
            <View style={reportStyles.ucActionBar}>
              {isEditingInline ? (
                <>
                  <PressableOpacity style={reportStyles.ucFooterBtnSecondary} onPress={cancelInlineEdit}>
                    <Text style={reportStyles.ucFooterBtnSecondaryText}>Cancel</Text>
                  </PressableOpacity>
                  <PressableOpacity style={reportStyles.ucFooterBtnPrimary} onPress={handleSaveManualWithAmPm}>
                    <Text style={reportStyles.ucFooterBtnPrimaryText}>Save</Text>
                  </PressableOpacity>
                </>
              ) : daySession ? (
                <>
                  <PressableOpacity
                    style={reportStyles.ucFooterBtnSecondary}
                    onPress={() => startInlineEdit(daySession)}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.text} />
                    <Text style={reportStyles.ucFooterBtnSecondaryText}>Edit</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={reportStyles.ucFooterBtnDanger}
                    onPress={handleDeleteFromModal}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} />
                    <Text style={reportStyles.ucFooterBtnDangerText}>Delete</Text>
                  </PressableOpacity>
                </>
              ) : (
                <>
                  <PressableOpacity style={reportStyles.ucFooterBtnPrimary} onPress={startInlineAdd}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.buttonPrimaryText} />
                    <Text style={reportStyles.ucFooterBtnPrimaryText}>Add Hours</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={[reportStyles.ucFooterBtnSecondary, showAbsenceOptions && { borderColor: colors.primary }]}
                    onPress={() => setShowAbsenceOptions(!showAbsenceOptions)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={showAbsenceOptions ? colors.primary : colors.text} />
                    <Text style={[reportStyles.ucFooterBtnSecondaryText, showAbsenceOptions && { color: colors.primary }]}>
                      Log Absence
                    </Text>
                  </PressableOpacity>
                </>
              )}
            </View>

            {/* No break warning (view mode only) */}
            {!isEditingInline && daySession &&
              (daySession.pause_minutes || 0) === 0 && (
              <View style={reportStyles.noBreakBanner}>
                <Ionicons name="cafe-outline" size={16} color={colors.warning || '#F59E0B'} />
                <Text style={reportStyles.noBreakBannerText}>
                  Don't forget to include your break!
                </Text>
              </View>
            )}

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={reportStyles.ucScrollContent}
            >
              {isEditingInline ? (
                /* ===== EDIT MODE ===== */
                <View style={reportStyles.ucCard}>
                  {/* Location (auto-set from registered location) */}
                  <View style={reportStyles.ucLocationRow}>
                    <Ionicons name="location" size={18} color={colors.primary} />
                    {locations.length === 0 ? (
                      <PressableOpacity
                        style={reportStyles.noLocationsContainer}
                        onPress={() => {
                          closeDayModal();
                          router.push('/(tabs)/map');
                        }}
                      >
                        <Text style={reportStyles.noLocationsText}>Register a location first</Text>
                      </PressableOpacity>
                    ) : (
                      <View style={reportStyles.ucPickerWrap}>
                        <Text style={{ fontSize: 15, color: colors.text, paddingVertical: 8, paddingHorizontal: 4 }}>
                          {locations.find((l: any) => l.id === manualLocationId)?.name || locations[0]?.name || 'Unknown'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Time Inputs */}
                  <View style={reportStyles.ucTimesGrid}>
                    {/* Entry */}
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Entry</Text>
                      <View style={reportStyles.ucTimeInputRow}>
                        <View style={reportStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustHour(manualEntryH, 'up', setManualEntryH, entryPeriod, setEntryPeriod)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={reportStyles.ucTimeInput}
                            value={manualEntryH}
                            onChangeText={handleEntryHourChange}
                            keyboardType="number-pad"
                            placeholder="HH"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'reportTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustHour(manualEntryH, 'down', setManualEntryH, entryPeriod, setEntryPeriod)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                        <Text style={reportStyles.ucTimeSep}>:</Text>
                        <View style={reportStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustMinute(manualEntryM, 'up', setManualEntryM)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={reportStyles.ucTimeInput}
                            value={manualEntryM}
                            onChangeText={(t) => setManualEntryM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            placeholder="MM"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'reportTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustMinute(manualEntryM, 'down', setManualEntryM)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                      </View>
                      <View style={reportStyles.ucAmPmRow}>
                        <PressableOpacity
                          style={[reportStyles.ucAmPmBtn, entryPeriod === 'AM' && reportStyles.ucAmPmBtnActive]}
                          onPress={() => setEntryPeriod('AM')}
                        >
                          <Text style={[reportStyles.ucAmPmText, entryPeriod === 'AM' && reportStyles.ucAmPmTextActive]}>AM</Text>
                        </PressableOpacity>
                        <PressableOpacity
                          style={[reportStyles.ucAmPmBtn, entryPeriod === 'PM' && reportStyles.ucAmPmBtnActive]}
                          onPress={() => setEntryPeriod('PM')}
                        >
                          <Text style={[reportStyles.ucAmPmText, entryPeriod === 'PM' && reportStyles.ucAmPmTextActive]}>PM</Text>
                        </PressableOpacity>
                      </View>
                    </View>

                    {/* Exit */}
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Exit</Text>
                      <View style={reportStyles.ucTimeInputRow}>
                        <View style={reportStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustHour(manualExitH, 'up', setManualExitH, exitPeriod, setExitPeriod)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={reportStyles.ucTimeInput}
                            value={manualExitH}
                            onChangeText={handleExitHourChange}
                            keyboardType="number-pad"
                            placeholder="HH"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'reportTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustHour(manualExitH, 'down', setManualExitH, exitPeriod, setExitPeriod)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                        <Text style={reportStyles.ucTimeSep}>:</Text>
                        <View style={reportStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustMinute(manualExitM, 'up', setManualExitM)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={reportStyles.ucTimeInput}
                            value={manualExitM}
                            onChangeText={(t) => setManualExitM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            placeholder="MM"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'reportTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={reportStyles.ucArrowBtn} onPress={() => adjustMinute(manualExitM, 'down', setManualExitM)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                      </View>
                      <View style={reportStyles.ucAmPmRow}>
                        <PressableOpacity
                          style={[reportStyles.ucAmPmBtn, exitPeriod === 'AM' && reportStyles.ucAmPmBtnActive]}
                          onPress={() => setExitPeriod('AM')}
                        >
                          <Text style={[reportStyles.ucAmPmText, exitPeriod === 'AM' && reportStyles.ucAmPmTextActive]}>AM</Text>
                        </PressableOpacity>
                        <PressableOpacity
                          style={[reportStyles.ucAmPmBtn, exitPeriod === 'PM' && reportStyles.ucAmPmBtnActive]}
                          onPress={() => setExitPeriod('PM')}
                        >
                          <Text style={[reportStyles.ucAmPmText, exitPeriod === 'PM' && reportStyles.ucAmPmTextActive]}>PM</Text>
                        </PressableOpacity>
                      </View>
                    </View>

                    {/* Break */}
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Break</Text>
                      <TextInput
                        style={reportStyles.ucBreakInput}
                        value={manualPause}
                        onChangeText={setManualPause}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'reportTimeInputDone' } : {})}
                      />
                      <Text style={reportStyles.ucBreakUnit}>min</Text>
                    </View>
                  </View>

                  {/* Live Total */}
                  <View style={reportStyles.ucTotalRow}>
                    <Text style={reportStyles.ucTotalLabel}>Total</Text>
                    <Text style={reportStyles.ucTotalValue}>{liveEditTotal}</Text>
                  </View>
                </View>
              ) : daySession ? (
                /* ===== VIEW MODE - HAS DATA ===== */
                <View style={reportStyles.ucCard}>
                  {/* Location */}
                  <View style={reportStyles.ucLocationRow}>
                    <View style={[reportStyles.ucLocationDot, { backgroundColor: daySession.color || colors.primary }]} />
                    <Text style={reportStyles.ucLocationName}>{daySession.location_name || 'Unknown'}</Text>
                    {(daySession.type === 'manual' || daySession.manually_edited === 1) && (
                      <Text style={reportStyles.ucEditedBadge}>Edited</Text>
                    )}
                  </View>

                  {/* Times Row */}
                  <View style={reportStyles.ucTimesGrid}>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Entry</Text>
                      <Text style={reportStyles.ucTimeValue}>{formatTimeAMPM(daySession.entry_at)}</Text>
                    </View>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Exit</Text>
                      <Text style={reportStyles.ucTimeValue}>{formatTimeAMPM(daySession.exit_at || daySession.entry_at)}</Text>
                    </View>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Break</Text>
                      <Text style={reportStyles.ucTimeValue}>
                        {(daySession.pause_minutes || 0) > 0 ? `${daySession.pause_minutes} min` : '--'}
                      </Text>
                    </View>
                  </View>

                  {/* Total */}
                  <View style={reportStyles.ucTotalRow}>
                    <Text style={reportStyles.ucTotalLabel}>Total</Text>
                    <Text style={reportStyles.ucTotalValue}>{formatDuration(daySession.duration_minutes)}</Text>
                  </View>
                </View>
              ) : (
                /* ===== VIEW MODE - EMPTY DAY ===== */
                <View style={reportStyles.ucCard}>
                  <View style={reportStyles.ucLocationRow}>
                    <View style={[reportStyles.ucLocationDot, { backgroundColor: colors.textMuted }]} />
                    <Text style={reportStyles.ucLocationNameMuted}>--</Text>
                  </View>
                  <View style={reportStyles.ucTimesGrid}>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Entry</Text>
                      <Text style={reportStyles.ucTimeValueMuted}>--:--</Text>
                    </View>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Exit</Text>
                      <Text style={reportStyles.ucTimeValueMuted}>--:--</Text>
                    </View>
                    <View style={reportStyles.ucTimeCol}>
                      <Text style={reportStyles.ucTimeLabel}>Break</Text>
                      <Text style={reportStyles.ucTimeValueMuted}>--</Text>
                    </View>
                  </View>
                  <View style={reportStyles.ucTotalRow}>
                    <Text style={reportStyles.ucTotalLabel}>Total</Text>
                    <Text style={reportStyles.ucTotalValueMuted}>--</Text>
                  </View>
                </View>
              )}

              {/* Absence Options (toggled by Log Absence button) */}
              {showAbsenceOptions && !isEditingInline && (
                <View style={reportStyles.ucAbsenceSection}>
                  <Text style={reportStyles.ucAbsenceTitle}>Select Reason</Text>
                  {[
                    { key: 'rain', label: '🌧️ Rain Day' },
                    { key: 'snow', label: '❄️ Snow Day' },
                    { key: 'sick', label: '🤒 Sick Day' },
                    { key: 'day_off', label: '🏖️ Day Off' },
                    { key: 'holiday', label: '🎉 Holiday' },
                  ].map((option) => (
                    <PressableOpacity
                      key={option.key}
                      style={reportStyles.absenceOption}
                      onPress={async () => {
                        if (selectedDayForModal) {
                          await saveAbsenceForDate(selectedDayForModal, option.key);
                          setShowAbsenceOptions(false);
                        }
                      }}
                    >
                      <Text style={reportStyles.absenceOptionText}>{option.label}</Text>
                    </PressableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

          </Animated.View>
        </Animated.View>
      </Modal>

      {/* ============================================ */}
      {/* EXPORT DATE RANGE MODAL */}
      {/* ============================================ */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={reportStyles.exportModalOverlay}>
          <View style={reportStyles.exportModalContent}>
            <View style={reportStyles.exportModalHandle} />

            {/* Header */}
            <View style={reportStyles.exportModalHeader}>
              <Text style={reportStyles.exportModalTitle}>Export Timesheet</Text>
              <PressableOpacity
                style={reportStyles.exportModalClose}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </PressableOpacity>
            </View>

            {/* Date Range Display */}
            <View style={reportStyles.exportModalDateRange}>
              <View style={reportStyles.exportModalDateBox}>
                <Text style={reportStyles.exportModalDateLabel}>FROM</Text>
                <Text style={reportStyles.exportModalDateValue}>
                  {rangeStartDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '—'}
                </Text>
              </View>
              <View style={reportStyles.exportModalArrow}>
                <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
              </View>
              <View style={reportStyles.exportModalDateBox}>
                <Text style={reportStyles.exportModalDateLabel}>TO</Text>
                <Text style={reportStyles.exportModalDateValue}>
                  {rangeEndDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '—'}
                </Text>
              </View>
            </View>

            {/* Summary */}
            <View style={reportStyles.exportModalSummary}>
              <View style={reportStyles.exportModalSummaryRow}>
                <Text style={reportStyles.exportModalSummaryLabel}>Days Worked</Text>
                <Text style={reportStyles.exportModalSummaryValue}>{rangeDaysWorked} days</Text>
              </View>
              <View style={reportStyles.exportModalSummaryRow}>
                <Text style={reportStyles.exportModalSummaryLabel}>Sessions</Text>
                <Text style={reportStyles.exportModalSummaryValue}>{getSessionsInRange().length}</Text>
              </View>

              {/* Total Hours */}
              <View style={reportStyles.exportModalTotalRow}>
                <Text style={reportStyles.exportModalTotalLabel}>Total Hours</Text>
                <Text style={reportStyles.exportModalTotalValue}>{formatDuration(rangeTotalMinutes)}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={reportStyles.exportModalActions}>
              <PressableOpacity
                style={reportStyles.exportModalBtnSecondary}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
                disabled={isExporting}
              >
                <Ionicons name="close-outline" size={20} color={colors.text} />
                <Text style={reportStyles.exportModalBtnSecondaryText}>Cancel</Text>
              </PressableOpacity>
              <PressableOpacity
                style={[reportStyles.exportModalBtn, isExporting && { opacity: 0.7 }]}
                onPress={handleExportPDF}
                disabled={isExporting}
              >
                <Ionicons name={isExporting ? "hourglass-outline" : "document-text-outline"} size={20} color={colors.white} />
                <Text style={reportStyles.exportModalBtnText}>{isExporting ? 'Generating...' : 'Export PDF'}</Text>
              </PressableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS: Done button above number-pad keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="reportTimeInputDone">
          <View style={iosKbStyles.bar}>
            <View style={{ flex: 1 }} />
            <PressableOpacity onPress={() => Keyboard.dismiss()} style={iosKbStyles.doneBtn}>
              <Text style={iosKbStyles.doneText}>Done</Text>
            </PressableOpacity>
          </View>
        </InputAccessoryView>
      )}
      </View>
    </SafeAreaView>
  );
}

// iOS keyboard "Done" button styles
const iosKbStyles = StyleSheet.create({
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

// ============================================
// REPORT STYLES
// ============================================

const reportStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    // paddingTop handled by SafeAreaView wrapper
    paddingTop: 12,
    paddingBottom: 8,
    ...(Platform.OS === 'web' ? { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number } : {}),
  },
  header: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },

  // Calendar Card - smaller
  calendarCard: {
    padding: 12,       // Increased from 10
    marginBottom: 16,  // Increased from 8 for more spacing before calendar
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  navBtn: {
    width: 40,      // Increased from 30
    height: 40,     // Increased from 30
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  calendarTotal: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  viewToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,  // Increased from 8
    gap: 10,        // Increased from 6
  },
  viewToggleBtn: {
    paddingVertical: 8,    // Increased from 4
    paddingHorizontal: 20,  // Increased from 14
    borderRadius: 12,       // Increased from 10
    backgroundColor: colors.surfaceMuted,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.accent,
  },
  viewToggleText: {
    fontSize: 14,   // Increased from 11
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewToggleTextActive: {
    color: colors.white,
  },

  // Content Area - Scrollable
  contentArea: {
    flex: 1,
  },

  // Content Area Scroll - padding for scroll content
  contentAreaScroll: {
    paddingBottom: 100, // Extra padding for tab bar
  },

  weekDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekDayWeekend: {
    backgroundColor: withOpacity(colors.textMuted, 0.25),
  },
  weekDayToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  weekDaySelected: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderColor: colors.primary,
  },
  weekDayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekDayName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    width: 26,
  },
  weekDayNameToday: {
    color: colors.accent,
  },
  weekDayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDayCircleToday: {
    backgroundColor: colors.primary,
  },
  weekDayNum: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  weekDayNumToday: {
    color: colors.buttonPrimaryText,
  },
  weekDayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekDayHours: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  noBreakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error || '#EF4444',
  },
  noBreakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: withOpacity(colors.warning || '#F59E0B', 0.1),
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: withOpacity(colors.warning || '#F59E0B', 0.2),
  },
  noBreakBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.warning || '#F59E0B',
    flex: 1,
  },

  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    columnGap: CALENDAR_GAP,
    marginBottom: 4,
  },
  monthHeaderCell: {
    width: DAY_SIZE,
    alignItems: 'center',
  },
  monthHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: CALENDAR_GAP,
    rowGap: 3,
    marginBottom: 0,
  },
  monthCell: {
    width: DAY_SIZE,
    height: DAY_SIZE + 14,
  },
  monthDay: {
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 4,
  },
  monthDayWeekend: {
    backgroundColor: withOpacity(colors.textMuted, 0.35),
  },
  monthDayToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  monthDayHasData: {
    backgroundColor: withOpacity(colors.primary, 0.15),
  },
  monthDayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  monthDayNumToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  monthDayHours: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  monthDayHoursToday: {
    color: colors.accent,
  },
  monthDayHoursEmpty: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
  },

  // Ghost days (from adjacent months) - faded, non-interactive
  monthDayGhost: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
    paddingVertical: 4,
  },
  monthDayNumGhost: {
    fontSize: 13,
    fontWeight: '400',
    color: withOpacity(colors.textMuted, 0.4),
  },

  // Manual Entry Modal Styles
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.buttonPrimaryText,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timeInput: {
    width: 60,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 4,
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  pickerContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
    height: 44,
  },
  absenceContainer: {
    gap: 10,
  },
  absenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  absenceOptionSelected: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderColor: colors.primary,
  },
  absenceOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  manualModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manualModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  manualModalCancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  manualModalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  manualModalSaveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.buttonPrimaryText,
  },

  // Action Modal (Edit/Delete)
  // Day Modal Header V2 - Two lines
  dayModalHeaderV2: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayModalTitleV2: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  dayModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  dayModalActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    minWidth: 56,
  },
  dayModalActionBtnDisabled: {
    opacity: 0.4,
  },
  dayModalActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  dayModalActionLabelDisabled: {
    color: colors.textMuted,
  },
  dayModalActionBtnClose: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
    minWidth: 56,
  },
  dayModalActionLabelClose: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
    marginTop: 4,
  },

  // Selection hint bar
  selectionHintBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  selectionHintText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  selectionHintBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // Session item styles
  sessionItemSelected: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderColor: colors.primary,
  },
  sessionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  sessionCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sessionColorBar: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
    alignSelf: 'stretch',
  },
  // No locations message
  noLocationsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: 12,
  },
  noLocationsText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noLocationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  noLocationsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },

  // AM/PM Toggle Styles
  ampmToggle: {
    flexDirection: 'row',
    marginLeft: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ampmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
  },
  ampmBtnActive: {
    backgroundColor: colors.primary,
  },
  ampmText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ampmTextActive: {
    color: colors.buttonPrimaryText,
  },

  // Export Date Range Button
  exportRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  exportRangeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  exportInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  exportInlineBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },

  // Date Range Mode Header (with month navigation)
  dateRangeHeader: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  dateRangeMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateRangeNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withOpacity(colors.primary, 0.1),
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateRangeMonthName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  dateRangeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateRangeHintText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    flex: 1,
  },
  dateRangeCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
  },
  dateRangeCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Legacy date range banner (keeping for compatibility)
  dateRangeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dateRangeBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    flex: 1,
  },
  dateRangeBannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
  },
  dateRangeBannerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Date Range Selected Styles
  monthDayRangeStart: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  monthDayRangeEnd: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  monthDayRangeMiddle: {
    backgroundColor: withOpacity(colors.primary, 0.3),
    borderRadius: 0,
  },
  monthDayRangeSingle: {
    backgroundColor: colors.primary,
    borderRadius: 20,
  },

  // Export Modal
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  exportModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  exportModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  exportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exportModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  exportModalClose: {
    padding: 8,
  },
  exportModalDateRange: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceMuted,
  },
  exportModalDateBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportModalDateLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  exportModalDateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  exportModalArrow: {
    paddingHorizontal: 4,
  },
  exportModalSummary: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  exportModalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exportModalSummaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  exportModalSummaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  exportModalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  exportModalTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  exportModalTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  exportModalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  exportModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  exportModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  exportModalBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportModalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },

  // ============================================
  // UNIFIED DAY CARD STYLES (uc*)
  // ============================================

  ucHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ucCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ucScrollContent: {
    padding: 16,
    gap: 12,
  },
  ucCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ucLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  ucPickerWrap: {
    flexShrink: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  ucTimesGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  ucTimeCol: {
    flex: 1,
    alignItems: 'center',
  },
  ucTimeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  ucTimeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ucTimeInputWithArrows: {
    alignItems: 'center',
  },
  ucArrowBtn: {
    padding: 6,
    backgroundColor: `${colors.primary}12`,
    borderRadius: 6,
  },
  ucTimeInput: {
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
  ucTimeSep: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 2,
  },
  ucAmPmRow: {
    flexDirection: 'row',
    marginTop: 6,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ucAmPmBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  ucAmPmBtnActive: {
    backgroundColor: colors.primary,
  },
  ucAmPmText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ucAmPmTextActive: {
    color: colors.buttonPrimaryText,
  },
  ucBreakInput: {
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
  ucBreakUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },
  ucTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ucTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ucTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  ucTotalValueMuted: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textMuted,
  },
  ucLocationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ucLocationName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  ucLocationNameMuted: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    flex: 1,
  },
  ucEditedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: withOpacity(colors.textSecondary, 0.15),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  ucTimeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  ucTimeValueMuted: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  ucAbsenceSection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  ucAbsenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ucActionBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ucFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ucFooterBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  ucFooterBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
  ucFooterBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ucFooterBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  ucFooterBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: withOpacity(colors.error || '#EF4444', 0.1),
    borderWidth: 1,
    borderColor: withOpacity(colors.error || '#EF4444', 0.3),
  },
  ucFooterBtnDangerText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.error || '#EF4444',
  },
});

// ============================================
// TIMER HERO STYLES
// ============================================

const heroStyles = StyleSheet.create({
  // Card states
  card: {
    marginBottom: 8,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    // Elevated shadow for visual separation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  cardActive: {
    borderColor: withOpacity(colors.green, 0.25),
  },
  cardPaused: {
    borderColor: withOpacity(colors.amber, 0.25),
  },
  cardLocked: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderLight,
  },

  // Location chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: withOpacity(colors.green, 0.08),
    marginBottom: 10,
    maxWidth: '90%',
  },
  chipActive: {
    backgroundColor: withOpacity(colors.green, 0.12),
  },
  chipPaused: {
    backgroundColor: withOpacity(colors.amber, 0.12),
  },
  chipLocked: {
    backgroundColor: withOpacity(colors.iconMuted, 0.1),
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.green,
  },
  chipTextActive: {
    color: colors.green,
  },
  chipTextPaused: {
    color: colors.amber,
  },
  chipTextLocked: {
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Timer display
  timer: {
    fontSize: 42,
    fontWeight: '300',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    marginBottom: 4,
  },
  timerActive: {
    fontWeight: '300',
    color: colors.green,
  },
  timerPaused: {
    color: colors.amber,
    opacity: 0.85,
  },
  timerLocked: {
    color: colors.iconMuted,
    opacity: 0.4,
  },

  // Break info
  breakText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  breakTextPaused: {
    color: colors.amber,
  },

  // Cooldown warning
  cooldownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 8,
  },
  cooldownText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.amber,
  },

  // Progress bar
  progressTrack: {
    width: '80%',
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.green,
  },
  progressFillPaused: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.amber,
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.green,
    borderRadius: 14,
  },
  startBtnLocked: {
    backgroundColor: colors.buttonDisabled,
  },
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: colors.green,
    borderRadius: 14,
  },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: colors.amber,
    borderRadius: 14,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
    paddingHorizontal: 20,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withOpacity(colors.error, 0.2),
  },
  stopBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },
  btnTextLight: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  btnTextLocked: {
    color: colors.iconMuted,
  },

});
