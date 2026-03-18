/**
 * History Screen - OnSite Timekeeper
 *
 * Extracted from reports.tsx — Calendar, day modal, export, and date range functionality.
 * Warm amber design language.
 *
 * Does NOT include: timer modal, timer bar, hero styles.
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
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../../src/components/ui/Button';
import { colors, withOpacity, shadows } from '../../src/constants/colors';

import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { styles } from '../../src/screens/home/styles';
import { WEEKDAYS_SHORT, getDayKey } from '../../src/screens/home/helpers';
import { generateAndShareTimesheetPDF } from '../../src/lib/timesheetPdf';
import { getSessionBreakdown, type SessionSegment } from '../../src/lib/eventLog';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { logger } from '../../src/lib/logger';
import { Alert } from 'react-native';

// ============================================
// PRESSABLE OPACITY - Drop-in replacement for TouchableOpacity
// ============================================
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

// ============================================
// CALENDAR CONSTANTS
// ============================================
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_PADDING = 32;
const CALENDAR_GAP = 2;
const DAYS_PER_WEEK = 7;
const CALENDAR_WIDTH = Platform.OS === 'web' ? Math.min(SCREEN_WIDTH, 500) : SCREEN_WIDTH;
const DAY_SIZE = Math.floor((CALENDAR_WIDTH - CALENDAR_PADDING - (CALENDAR_GAP * 6)) / DAYS_PER_WEEK);

// ============================================
// COMPACT DURATION FORMAT
// ============================================
function formatCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

// ============================================
// LAST 7 DAYS BAR CHART
// ============================================
function Last7DaysChart({ getSessionsForDay, getTotalMinutesForDay, isToday }: {
  getSessionsForDay: (date: Date) => any[];
  getTotalMinutesForDay: (date: Date) => number;
  isToday: (date: Date) => boolean;
}) {
  const days = useMemo(() => {
    const result = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      result.push(d);
    }
    return result;
  }, []);

  const maxMinutes = useMemo(() => {
    return Math.max(1, ...days.map(d => getTotalMinutesForDay(d)));
  }, [days, getTotalMinutesForDay]);

  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const BAR_HEIGHT = 80;

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>LAST 7 DAYS</Text>
      <View style={chartStyles.barsRow}>
        {days.map((day, i) => {
          const minutes = getTotalMinutesForDay(day);
          const barH = minutes > 0 ? Math.max(4, (minutes / maxMinutes) * BAR_HEIGHT) : 4;
          const isTodayDate = isToday(day);
          return (
            <View key={i} style={chartStyles.barCol}>
              {minutes > 0 && (
                <Text style={chartStyles.barValue}>{formatCompact(minutes)}</Text>
              )}
              <View style={[chartStyles.barBg, { height: BAR_HEIGHT }]}>
                <View style={[
                  chartStyles.bar,
                  { height: barH },
                  minutes === 0 && chartStyles.barEmpty,
                  isTodayDate && chartStyles.barToday,
                ]} />
              </View>
              <Text style={[
                chartStyles.dayLabel,
                isTodayDate && chartStyles.dayLabelToday,
              ]}>
                {WEEKDAYS[day.getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function HistoryScreen() {
  const router = useRouter();

  const {
    userName,
    userId,
    currentMonth,
    monthCalendarDays,
    monthTotalMinutes,

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
  const loadBusinessProfile = useBusinessProfileStore(s => s.loadProfile);
  useFocusEffect(
    useCallback(() => {
      goToCurrentMonth();
      onRefresh();
      setViewMode('month');
      if (userId) loadBusinessProfile(userId);
    }, [])
  );

  // ============================================
  // AM/PM STATE FOR MANUAL ENTRY MODAL
  // ============================================
  const [entryPeriod, setEntryPeriod] = useState<'AM' | 'PM'>('AM');
  const [exitPeriod, setExitPeriod] = useState<'AM' | 'PM'>('PM');

  // Shared hour handler - allows leading "0" for typing "02", converts 24h to 12h
  const handleHourChange = (
    cleaned: string,
    setHour: (h: string) => void,
    setPeriod: (p: 'AM' | 'PM') => void,
  ) => {
    const hour = parseInt(cleaned, 10);
    if (cleaned === '0') {
      setHour('0');
      return;
    }
    if (cleaned === '00') {
      setHour('12');
      setPeriod('AM');
      return;
    }
    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      setHour(String(hour - 12).padStart(2, '0'));
      setPeriod('PM');
      return;
    }
    if (!isNaN(hour) && hour === 12) {
      setHour('12');
      setPeriod('PM');
      return;
    }
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
  const get24Hour = (hour12: string, period: 'AM' | 'PM'): number => {
    const h = parseInt(hour12, 10) || 0;
    if (h >= 13 && h <= 23) {
      return h;
    }
    if (h === 0) {
      return 0;
    }
    if (period === 'AM') {
      return h === 12 ? 0 : h;
    } else {
      return h === 12 ? 12 : h + 12;
    }
  };

  // Wrapper for save that converts to 24h format
  const handleSaveManualWithAmPm = async () => {
    const entryH24 = get24Hour(manualEntryH, entryPeriod);
    const exitH24 = get24Hour(manualExitH, exitPeriod);
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
  const businessProfile = useBusinessProfileStore(s => s.profile);

  // Absence options toggle (for inline day card)
  const [showAbsenceOptions, setShowAbsenceOptions] = useState(false);

  // Details breakdown (shows entry/exit segments when gap detected)
  const [showDetails, setShowDetails] = useState(false);
  const [detailSegments, setDetailSegments] = useState<SessionSegment[]>([]);

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
      setRangeStartDate(date);
      setRangeEndDate(null);
      setRangeSessions([]);
    } else {
      let startDate = rangeStartDate;
      let endDate = date;

      if (date < rangeStartDate) {
        startDate = date;
        endDate = rangeStartDate;
      }

      setRangeStartDate(startDate);
      setRangeEndDate(endDate);

      const startTime = new Date(startDate);
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(endDate);
      endTime.setHours(23, 59, 59, 999);

      try {
        const sessions = await getSessionsByPeriod(startTime.toISOString(), endTime.toISOString());
        const completedSessions = sessions.filter((s: ComputedSession) => s.exit_at);
        logger.debug('ui', 'Date range sessions loaded', { total: String(sessions?.length || 0), completed: String(completedSessions.length) });
        setRangeSessions(completedSessions);

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

  // Build business profile options for export
  const getBusinessOptions = () => {
    if (!businessProfile) return {};
    const addressParts = [
      businessProfile.address_street,
      businessProfile.address_city,
      businessProfile.address_province,
      businessProfile.address_postal_code,
    ].filter(Boolean);
    return {
      businessName: businessProfile.business_name || undefined,
      businessAddress: addressParts.length > 0 ? addressParts.join(', ') : undefined,
      businessPhone: businessProfile.phone || undefined,
      businessEmail: businessProfile.email || undefined,
      businessNumber: businessProfile.business_number || undefined,
      gstHstNumber: businessProfile.gst_hst_number || undefined,
      hourlyRate: businessProfile.default_hourly_rate ?? undefined,
      taxRate: businessProfile.tax_rate ?? undefined,
    };
  };

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
      setIsExporting(true);
      setShowExportModal(false);

      await generateAndShareTimesheetPDF(sessions, {
        employeeName: userName || 'Employee',
        employeeId: userId || undefined,
        periodStart: rangeStartDate,
        periodEnd: rangeEndDate,
        ...getBusinessOptions(),
      });

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
      Animated.parallel([
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 35,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      modalScale.setValue(0);
      modalOpacity.setValue(0);
      setPressedDayKey(null);
      setShowDetails(false);
      setDetailSegments([]);
    }
  }, [showDayModal, modalScale, modalOpacity]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={historyStyles.container}>
      {/* CALENDAR CARD - Hidden in date range mode */}
      {!dateRangeMode && (
        <Card style={historyStyles.calendarCard}>
          <View style={styles.calendarHeader}>
            <PressableOpacity
              style={historyStyles.navBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            </PressableOpacity>

            <PressableOpacity
              onPress={goToCurrentMonth}
              style={styles.calendarCenter}
            >
              <Text style={historyStyles.calendarTitle}>
                {formatMonthYear(currentMonth)}
              </Text>
              <Text style={historyStyles.calendarTotal}>
                Monthly Total: {formatDuration(monthTotalMinutes)}
              </Text>
            </PressableOpacity>

            <PressableOpacity
              style={historyStyles.navBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </PressableOpacity>
          </View>
        </Card>
      )}

      {/* DATE RANGE MODE HEADER */}
      {dateRangeMode && (
        <View style={historyStyles.dateRangeHeader}>
          {/* Month navigation */}
          <View style={historyStyles.dateRangeMonthNav}>
            <PressableOpacity
              style={historyStyles.dateRangeNavBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </PressableOpacity>

            <Text style={historyStyles.dateRangeMonthName}>
              {formatMonthYear(currentMonth)}
            </Text>

            <PressableOpacity
              style={historyStyles.dateRangeNavBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.primary} />
            </PressableOpacity>
          </View>

          {/* Selection hint + cancel */}
          <View style={historyStyles.dateRangeHintRow}>
            <Ionicons name="calendar" size={16} color={colors.primary} />
            <Text style={historyStyles.dateRangeHintText}>
              {!rangeStartDate
                ? 'Tap start date'
                : !rangeEndDate
                ? 'Now tap end date'
                : 'Range selected!'}
            </Text>
            <PressableOpacity style={historyStyles.dateRangeCancelBtn} onPress={cancelDateRange}>
              <Text style={historyStyles.dateRangeCancelBtnText}>Cancel</Text>
            </PressableOpacity>
          </View>
        </View>
      )}

      {/* CALENDAR CONTENT AREA - Scrollable */}
      <ScrollView
        style={historyStyles.contentArea}
        contentContainerStyle={historyStyles.contentAreaScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          {/* MONTH VIEW */}
          <View>
              {/* Weekday headers */}
              <View style={historyStyles.monthHeader}>
                {WEEKDAYS_SHORT.map((d: string, i: number) => (
                  <View key={i} style={historyStyles.monthHeaderCell}>
                    <Text style={historyStyles.monthHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* Days grid - Always 6 weeks (42 days) for consistent height */}
              <View style={historyStyles.monthGrid}>
                {monthCalendarDays.map((date: Date, index: number) => {
                  const isCurrentMonthDay = date.getMonth() === currentMonth.getMonth() &&
                                            date.getFullYear() === currentMonth.getFullYear();

                  if (!isCurrentMonthDay) {
                    return (
                      <View
                        key={`ghost-${index}`}
                        style={[historyStyles.monthCell, historyStyles.monthDayGhost]}
                      >
                        <Text style={historyStyles.monthDayNumGhost}>
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

                  const rangePosition = dateRangeMode ? isInDateRange(date) : null;

                  return (
                    <PressableOpacity
                      key={dayKey}
                      activeOpacity={0.6}
                      style={[
                        historyStyles.monthCell,
                        historyStyles.monthDay,
                        isWeekend && historyStyles.monthDayWeekend,
                        isTodayDate && historyStyles.monthDayToday,
                        hasSessions && historyStyles.monthDayHasData,
                        rangePosition === 'start' && historyStyles.monthDayRangeStart,
                        rangePosition === 'end' && historyStyles.monthDayRangeEnd,
                        rangePosition === 'middle' && historyStyles.monthDayRangeMiddle,
                        rangePosition === 'single' && historyStyles.monthDayRangeSingle,
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
                        historyStyles.monthDayNum,
                        isTodayDate && historyStyles.monthDayNumToday,
                        (rangePosition === 'start' || rangePosition === 'end' || rangePosition === 'single') && { color: colors.white, fontWeight: '700' as const },
                      ]}>
                        {date.getDate()}
                      </Text>
                      {totalMinutes > 0 ? (
                        <Text style={[
                          historyStyles.monthDayHours,
                          isTodayDate && historyStyles.monthDayHoursToday,
                          (rangePosition === 'start' || rangePosition === 'end' || rangePosition === 'single') && { color: colors.white },
                        ]}>
                          {formatCompact(totalMinutes)}
                        </Text>
                      ) : (
                        <Text style={historyStyles.monthDayHoursEmpty}>-</Text>
                      )}
                    </PressableOpacity>
                  );
                })}
              </View>
            </View>

            {/* LAST 7 DAYS BAR CHART */}
            <Last7DaysChart
              getSessionsForDay={getSessionsForDay}
              getTotalMinutesForDay={getTotalMinutesForDay}
              isToday={isToday}
            />

            {/* Export My Hours button inside calendar scroll */}
            {!dateRangeMode && (
              <PressableOpacity
                style={historyStyles.exportBtn}
                activeOpacity={0.7}
                onPress={() => setDateRangeMode(true)}
              >
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={historyStyles.exportBtnText}>Export My Hours</Text>
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
            backgroundColor: colors.overlay,
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
            <View style={historyStyles.ucHeader}>
              <Text style={historyStyles.dayModalTitleV2}>
                {selectedDayForModal?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </Text>
              <PressableOpacity
                style={historyStyles.ucCloseBtn}
                onPress={closeDayModal}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </PressableOpacity>
            </View>

            {/* Action Buttons (below header) */}
            <View style={historyStyles.ucActionBar}>
              {isEditingInline ? (
                <>
                  <PressableOpacity style={historyStyles.ucFooterBtnSecondary} onPress={cancelInlineEdit}>
                    <Text style={historyStyles.ucFooterBtnSecondaryText}>Cancel</Text>
                  </PressableOpacity>
                  <PressableOpacity style={historyStyles.ucFooterBtnPrimary} onPress={handleSaveManualWithAmPm}>
                    <Text style={historyStyles.ucFooterBtnPrimaryText}>Save</Text>
                  </PressableOpacity>
                </>
              ) : daySession ? (
                <>
                  <PressableOpacity
                    style={historyStyles.ucFooterBtnSecondary}
                    onPress={() => startInlineEdit(daySession)}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.text} />
                    <Text style={historyStyles.ucFooterBtnSecondaryText}>Edit</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={historyStyles.ucFooterBtnDanger}
                    onPress={handleDeleteFromModal}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} />
                    <Text style={historyStyles.ucFooterBtnDangerText}>Delete</Text>
                  </PressableOpacity>
                </>
              ) : (
                <>
                  <PressableOpacity style={historyStyles.ucFooterBtnPrimary} onPress={startInlineAdd}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.buttonPrimaryText} />
                    <Text style={historyStyles.ucFooterBtnPrimaryText}>Add Hours</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={[historyStyles.ucFooterBtnSecondary, showAbsenceOptions && { borderColor: colors.primary }]}
                    onPress={() => setShowAbsenceOptions(!showAbsenceOptions)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={showAbsenceOptions ? colors.primary : colors.text} />
                    <Text style={[historyStyles.ucFooterBtnSecondaryText, showAbsenceOptions && { color: colors.primary }]}>
                      Log Absence
                    </Text>
                  </PressableOpacity>
                </>
              )}
            </View>

            {/* No break warning (view mode only) */}
            {!isEditingInline && daySession &&
              (daySession.pause_minutes || 0) === 0 && (
              <View style={historyStyles.noBreakBanner}>
                <Ionicons name="cafe-outline" size={16} color={colors.warning || '#F59E0B'} />
                <Text style={historyStyles.noBreakBannerText}>
                  Don't forget to include your break!
                </Text>
              </View>
            )}

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={historyStyles.ucScrollContent}
            >
              {isEditingInline ? (
                /* ===== EDIT MODE ===== */
                <View style={historyStyles.ucCard}>
                  {/* Location (auto-set from registered location) */}
                  <View style={historyStyles.ucLocationRow}>
                    <Ionicons name="location" size={18} color={colors.primary} />
                    {locations.length === 0 ? (
                      <PressableOpacity
                        style={historyStyles.noLocationsContainer}
                        onPress={() => {
                          closeDayModal();
                          router.push('/(tabs)/map');
                        }}
                      >
                        <Text style={historyStyles.noLocationsText}>Register a location first</Text>
                      </PressableOpacity>
                    ) : (
                      <View style={historyStyles.ucPickerWrap}>
                        <Text style={{ fontSize: 15, color: colors.text, paddingVertical: 8, paddingHorizontal: 4 }}>
                          {locations.find((l: any) => l.id === manualLocationId)?.name || locations[0]?.name || 'Unknown'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Time Inputs */}
                  <View style={historyStyles.ucTimesGrid}>
                    {/* Entry */}
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Entry</Text>
                      <View style={historyStyles.ucTimeInputRow}>
                        <View style={historyStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustHour(manualEntryH, 'up', setManualEntryH, entryPeriod, setEntryPeriod)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={historyStyles.ucTimeInput}
                            value={manualEntryH}
                            onChangeText={handleEntryHourChange}
                            keyboardType="number-pad"
                            placeholder="HH"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'historyTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustHour(manualEntryH, 'down', setManualEntryH, entryPeriod, setEntryPeriod)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                        <Text style={historyStyles.ucTimeSep}>:</Text>
                        <View style={historyStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustMinute(manualEntryM, 'up', setManualEntryM)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={historyStyles.ucTimeInput}
                            value={manualEntryM}
                            onChangeText={(t) => setManualEntryM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            placeholder="MM"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'historyTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustMinute(manualEntryM, 'down', setManualEntryM)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                      </View>
                      <View style={historyStyles.ucAmPmRow}>
                        <PressableOpacity
                          style={[historyStyles.ucAmPmBtn, entryPeriod === 'AM' && historyStyles.ucAmPmBtnActive]}
                          onPress={() => setEntryPeriod('AM')}
                        >
                          <Text style={[historyStyles.ucAmPmText, entryPeriod === 'AM' && historyStyles.ucAmPmTextActive]}>AM</Text>
                        </PressableOpacity>
                        <PressableOpacity
                          style={[historyStyles.ucAmPmBtn, entryPeriod === 'PM' && historyStyles.ucAmPmBtnActive]}
                          onPress={() => setEntryPeriod('PM')}
                        >
                          <Text style={[historyStyles.ucAmPmText, entryPeriod === 'PM' && historyStyles.ucAmPmTextActive]}>PM</Text>
                        </PressableOpacity>
                      </View>
                    </View>

                    {/* Exit */}
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Exit</Text>
                      <View style={historyStyles.ucTimeInputRow}>
                        <View style={historyStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustHour(manualExitH, 'up', setManualExitH, exitPeriod, setExitPeriod)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={historyStyles.ucTimeInput}
                            value={manualExitH}
                            onChangeText={handleExitHourChange}
                            keyboardType="number-pad"
                            placeholder="HH"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'historyTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustHour(manualExitH, 'down', setManualExitH, exitPeriod, setExitPeriod)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                        <Text style={historyStyles.ucTimeSep}>:</Text>
                        <View style={historyStyles.ucTimeInputWithArrows}>
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustMinute(manualExitM, 'up', setManualExitM)}>
                            <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                          <TextInput
                            style={historyStyles.ucTimeInput}
                            value={manualExitM}
                            onChangeText={(t) => setManualExitM(t.replace(/[^0-9]/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            placeholder="MM"
                            maxLength={2}
                            placeholderTextColor={colors.textMuted}
                            selectTextOnFocus
                            {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'historyTimeInputDone' } : {})}
                          />
                          <PressableOpacity style={historyStyles.ucArrowBtn} onPress={() => adjustMinute(manualExitM, 'down', setManualExitM)}>
                            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                          </PressableOpacity>
                        </View>
                      </View>
                      <View style={historyStyles.ucAmPmRow}>
                        <PressableOpacity
                          style={[historyStyles.ucAmPmBtn, exitPeriod === 'AM' && historyStyles.ucAmPmBtnActive]}
                          onPress={() => setExitPeriod('AM')}
                        >
                          <Text style={[historyStyles.ucAmPmText, exitPeriod === 'AM' && historyStyles.ucAmPmTextActive]}>AM</Text>
                        </PressableOpacity>
                        <PressableOpacity
                          style={[historyStyles.ucAmPmBtn, exitPeriod === 'PM' && historyStyles.ucAmPmBtnActive]}
                          onPress={() => setExitPeriod('PM')}
                        >
                          <Text style={[historyStyles.ucAmPmText, exitPeriod === 'PM' && historyStyles.ucAmPmTextActive]}>PM</Text>
                        </PressableOpacity>
                      </View>
                    </View>

                    {/* Break */}
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Break</Text>
                      <TextInput
                        style={historyStyles.ucBreakInput}
                        value={manualPause}
                        onChangeText={setManualPause}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'historyTimeInputDone' } : {})}
                      />
                      <Text style={historyStyles.ucBreakUnit}>min</Text>
                    </View>
                  </View>

                  {/* Live Total */}
                  <View style={historyStyles.ucTotalRow}>
                    <Text style={historyStyles.ucTotalLabel}>Total</Text>
                    <Text style={historyStyles.ucTotalValue}>{liveEditTotal}</Text>
                  </View>
                </View>
              ) : daySession ? (
                /* ===== VIEW MODE - HAS DATA ===== */
                <View style={historyStyles.ucCard}>
                  {/* Location */}
                  <View style={historyStyles.ucLocationRow}>
                    <View style={[historyStyles.ucLocationDot, { backgroundColor: daySession.color || colors.primary }]} />
                    <Text style={historyStyles.ucLocationName}>{daySession.location_name || 'Unknown'}</Text>
                    {(daySession.type === 'manual' || daySession.manually_edited === 1) && (
                      <Text style={historyStyles.ucEditedBadge}>Edited</Text>
                    )}
                  </View>

                  {/* Times Row */}
                  <View style={historyStyles.ucTimesGrid}>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Entry</Text>
                      <Text style={historyStyles.ucTimeValue}>{formatTimeAMPM(daySession.entry_at)}</Text>
                    </View>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Exit</Text>
                      <Text style={historyStyles.ucTimeValue}>{formatTimeAMPM(daySession.exit_at || daySession.entry_at)}</Text>
                    </View>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Break</Text>
                      <Text style={historyStyles.ucTimeValue}>
                        {(daySession.pause_minutes || 0) > 0 ? `${daySession.pause_minutes} min` : '--'}
                      </Text>
                    </View>
                  </View>

                  {/* Total */}
                  <View style={historyStyles.ucTotalRow}>
                    <Text style={historyStyles.ucTotalLabel}>Total</Text>
                    <Text style={historyStyles.ucTotalValue}>{formatDuration(daySession.duration_minutes)}</Text>
                  </View>

                  {/* Details button - only when elapsed time != total (gap detected) */}
                  {(() => {
                    if (!daySession.entry_at || !daySession.exit_at) return null;
                    const entryMs = new Date(daySession.entry_at).getTime();
                    const exitMs = new Date(daySession.exit_at).getTime();
                    const elapsedMin = Math.round((exitMs - entryMs) / 60000);
                    const gapMin = elapsedMin - daySession.duration_minutes - (daySession.pause_minutes || 0);
                    if (gapMin < 5) return null;
                    return (
                      <>
                        <PressableOpacity
                          style={historyStyles.detailsButton}
                          onPress={() => {
                            if (showDetails) {
                              setShowDetails(false);
                              return;
                            }
                            if (userId && selectedDayForModal) {
                              const dateStr = getDayKey(selectedDayForModal);
                              const segments = getSessionBreakdown(userId, dateStr);
                              setDetailSegments(segments);
                            }
                            setShowDetails(true);
                          }}
                        >
                          <Ionicons
                            name={showDetails ? 'chevron-up' : 'information-circle-outline'}
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={historyStyles.detailsButtonText}>
                            {showDetails ? 'Hide Details' : 'Details'}
                          </Text>
                        </PressableOpacity>

                        {showDetails && (
                          <View style={historyStyles.detailsSection}>
                            <Text style={historyStyles.detailsSectionTitle}>Session Breakdown</Text>
                            {detailSegments.length > 0 ? (
                              detailSegments.map((seg, i) => (
                                <View key={i} style={historyStyles.detailsSegmentRow}>
                                  <Text style={historyStyles.detailsSegmentIndex}>{i + 1}.</Text>
                                  <Text style={historyStyles.detailsSegmentTime}>
                                    {formatTimeAMPM(seg.startTime)} → {formatTimeAMPM(seg.endTime)}
                                  </Text>
                                  <Text style={historyStyles.detailsSegmentDuration}>
                                    {formatDuration(seg.durationMinutes)}
                                  </Text>
                                </View>
                              ))
                            ) : (
                              <Text style={historyStyles.detailsEmpty}>
                                No geofence events recorded for this day.
                              </Text>
                            )}
                            {detailSegments.length > 0 && (
                              <View style={historyStyles.detailsGapRow}>
                                <Text style={historyStyles.detailsGapLabel}>Gap (off-site)</Text>
                                <Text style={historyStyles.detailsGapValue}>{formatDuration(gapMin)}</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              ) : (
                /* ===== VIEW MODE - EMPTY DAY ===== */
                <View style={historyStyles.ucCard}>
                  <View style={historyStyles.ucLocationRow}>
                    <View style={[historyStyles.ucLocationDot, { backgroundColor: colors.textMuted }]} />
                    <Text style={historyStyles.ucLocationNameMuted}>--</Text>
                  </View>
                  <View style={historyStyles.ucTimesGrid}>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Entry</Text>
                      <Text style={historyStyles.ucTimeValueMuted}>--:--</Text>
                    </View>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Exit</Text>
                      <Text style={historyStyles.ucTimeValueMuted}>--:--</Text>
                    </View>
                    <View style={historyStyles.ucTimeCol}>
                      <Text style={historyStyles.ucTimeLabel}>Break</Text>
                      <Text style={historyStyles.ucTimeValueMuted}>--</Text>
                    </View>
                  </View>
                  <View style={historyStyles.ucTotalRow}>
                    <Text style={historyStyles.ucTotalLabel}>Total</Text>
                    <Text style={historyStyles.ucTotalValueMuted}>--</Text>
                  </View>
                </View>
              )}

              {/* Absence Options (toggled by Log Absence button) */}
              {showAbsenceOptions && !isEditingInline && (
                <View style={historyStyles.ucAbsenceSection}>
                  <Text style={historyStyles.ucAbsenceTitle}>Select Reason</Text>
                  {[
                    { key: 'rain', label: '🌧️ Rain Day' },
                    { key: 'snow', label: '❄️ Snow Day' },
                    { key: 'sick', label: '🤒 Sick Day' },
                    { key: 'day_off', label: '🏖️ Day Off' },
                    { key: 'holiday', label: '🎉 Holiday' },
                  ].map((option) => (
                    <PressableOpacity
                      key={option.key}
                      style={historyStyles.absenceOption}
                      onPress={async () => {
                        if (selectedDayForModal) {
                          await saveAbsenceForDate(selectedDayForModal, option.key);
                          setShowAbsenceOptions(false);
                        }
                      }}
                    >
                      <Text style={historyStyles.absenceOptionText}>{option.label}</Text>
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
        <View style={historyStyles.exportModalOverlay}>
          <View style={historyStyles.exportModalContent}>
            <View style={historyStyles.exportModalHandle} />

            {/* Header */}
            <View style={historyStyles.exportModalHeader}>
              <Text style={historyStyles.exportModalTitle}>Export My Hours</Text>
              <PressableOpacity
                style={historyStyles.exportModalClose}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </PressableOpacity>
            </View>

            {/* Date Range Display */}
            <View style={historyStyles.exportModalDateRange}>
              <View style={historyStyles.exportModalDateBox}>
                <Text style={historyStyles.exportModalDateLabel}>FROM</Text>
                <Text style={historyStyles.exportModalDateValue}>
                  {rangeStartDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '—'}
                </Text>
              </View>
              <View style={historyStyles.exportModalArrow}>
                <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
              </View>
              <View style={historyStyles.exportModalDateBox}>
                <Text style={historyStyles.exportModalDateLabel}>TO</Text>
                <Text style={historyStyles.exportModalDateValue}>
                  {rangeEndDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '—'}
                </Text>
              </View>
            </View>

            {/* Summary */}
            <View style={historyStyles.exportModalSummary}>
              <View style={historyStyles.exportModalSummaryRow}>
                <Text style={historyStyles.exportModalSummaryLabel}>Days Worked</Text>
                <Text style={historyStyles.exportModalSummaryValue}>{rangeDaysWorked} days</Text>
              </View>
              <View style={historyStyles.exportModalSummaryRow}>
                <Text style={historyStyles.exportModalSummaryLabel}>Sessions</Text>
                <Text style={historyStyles.exportModalSummaryValue}>{getSessionsInRange().length}</Text>
              </View>

              {/* Total Hours */}
              <View style={historyStyles.exportModalTotalRow}>
                <Text style={historyStyles.exportModalTotalLabel}>Total Hours</Text>
                <Text style={historyStyles.exportModalTotalValue}>{formatDuration(rangeTotalMinutes)}</Text>
              </View>

              {/* Rate & Tax info (if business profile set) */}
              {businessProfile?.default_hourly_rate ? (
                <View style={historyStyles.exportModalRateRow}>
                  <Text style={historyStyles.exportModalRateText}>
                    Rate: ${businessProfile.default_hourly_rate}/hr
                    {businessProfile.gst_hst_number && businessProfile.tax_rate
                      ? `  ·  Tax: ${businessProfile.tax_rate}% HST`
                      : ''}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Actions */}
            <View style={historyStyles.exportModalActions}>
              <PressableOpacity
                style={historyStyles.exportModalBtnSecondary}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
                disabled={isExporting}
              >
                <Ionicons name="close-outline" size={20} color={colors.text} />
                <Text style={historyStyles.exportModalBtnSecondaryText}>Cancel</Text>
              </PressableOpacity>
              <PressableOpacity
                style={[historyStyles.exportModalBtn, isExporting && { opacity: 0.7 }]}
                onPress={handleExportPDF}
                disabled={isExporting}
              >
                <Ionicons name={isExporting ? "hourglass-outline" : "document-text-outline"} size={20} color={colors.white} />
                <Text style={historyStyles.exportModalBtnText}>{isExporting ? 'Generating...' : 'Generate Invoice'}</Text>
              </PressableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS: Done button above number-pad keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="historyTimeInputDone">
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

// ============================================
// IOS KEYBOARD "DONE" BUTTON STYLES
// ============================================
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
// CHART STYLES (Last 7 Days Bar Chart)
// ============================================
const chartStyles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barValue: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  barBg: {
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    backgroundColor: colors.graphBar,
    borderRadius: 4,
  },
  barEmpty: {
    backgroundColor: colors.graphBarMuted,
  },
  barToday: {
    backgroundColor: colors.primaryStrong,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },
  dayLabelToday: {
    color: colors.primary,
    fontWeight: '700',
  },
});

// ============================================
// HISTORY STYLES (warm amber design)
// ============================================
const historyStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    ...(Platform.OS === 'web' ? { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number } : {}),
  },

  // Calendar Card
  calendarCard: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  navBtn: {
    width: 40,
    height: 40,
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
    color: colors.primary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Content Area - Scrollable
  contentArea: {
    flex: 1,
  },
  contentAreaScroll: {
    paddingBottom: 100,
  },

  // Month grid
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
    borderColor: colors.text,
    backgroundColor: colors.text,
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
    color: colors.white,
    fontWeight: '700',
  },
  monthDayHours: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  monthDayHoursToday: {
    color: colors.white,
  },
  monthDayHoursEmpty: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
  },

  // Ghost days (from adjacent months)
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

  // Export My Hours button
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  exportBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },

  // Date Range Mode Header
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

  // No break warning banner
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

  // Absence options
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
  absenceOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },

  // No locations
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
  exportModalRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    marginTop: 4,
  },
  exportModalRateText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
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
    borderRadius: 14,
    backgroundColor: colors.primary,
    minHeight: 52,
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
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
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
  dayModalTitleV2: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
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
  ucFooterBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.primary,
    minHeight: 52,
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
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
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
    borderRadius: 14,
    backgroundColor: withOpacity(colors.error || '#EF4444', 0.1),
    borderWidth: 1,
    borderColor: withOpacity(colors.error || '#EF4444', 0.3),
    minHeight: 52,
  },
  ucFooterBtnDangerText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.error || '#EF4444',
  },

  // Details breakdown
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: withOpacity(colors.primary, 0.08),
  },
  detailsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  detailsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  detailsSegmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  detailsSegmentIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    width: 18,
  },
  detailsSegmentTime: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  detailsSegmentDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  detailsEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  detailsGapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailsGapLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  detailsGapValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
});
