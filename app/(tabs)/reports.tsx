/**
 * Reports Screen - OnSite Timekeeper
 *
 * v1.3: Fixed layout + Weekly Bar Chart restored
 * - No main scroll, fits on screen
 * - WeeklyBarChart at bottom (scrollable horizontally)
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StatusBar,
  Dimensions,
  StyleSheet,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';

import { Card } from '../../src/components/ui/Button';
import { colors, withOpacity, shadows } from '../../src/constants/colors';

// V3: ComputedSession now comes from hooks.ts (was removed from database)
import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { styles } from '../../src/screens/home/styles';
import { WEEKDAYS_SHORT, getDayKey, isSameDay } from '../../src/screens/home/helpers';
import { generateAndShareTimesheetPDF } from '../../src/lib/timesheetPdf';
import { logger } from '../../src/lib/logger';
import { Alert } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_PADDING = 32;
const CALENDAR_GAP = 2;
const DAYS_PER_WEEK = 7;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - CALENDAR_PADDING - (CALENDAR_GAP * 6)) / DAYS_PER_WEEK);

// ============================================
// AGGREGATED LOCATION INTERFACE
// ============================================

interface AggregatedLocation {
  locationId: string;
  locationName: string;
  color: string;
  firstEntry: string;
  lastExit: string;
  totalMinutes: number;
  totalBreakMinutes: number;
  sessionsCount: number;
  isEdited: boolean;
  sessions: ComputedSession[]; // Keep original sessions for editing
}

// ============================================
// WEEKLY BAR CHART COMPONENT
// ============================================

interface WeekData {
  weekStart: Date;
  days: { date: Date; minutes: number; dayName: string }[];
  totalMinutes: number;
}

function WeeklyBarChart({
  sessions,
  currentDate
}: {
  sessions: ComputedSession[];
  currentDate: Date;
}) {
  const scrollViewRef = useRef<ScrollView>(null);

  // Generate weeks for the selected month
  const weeksData = useMemo(() => {
    const weeks: WeekData[] = [];

    // Get first and last day of the month
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Find the Sunday that starts the first week containing this month
    const firstWeekStart = new Date(firstDayOfMonth);
    firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

    // Generate weeks until we pass the end of the month
    let weekStart = new Date(firstWeekStart);

    while (weekStart <= lastDayOfMonth) {
      const days: WeekData['days'] = [];
      let totalMinutes = 0;

      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);

        // Sum minutes for this day
        const dayMinutes = sessions
          .filter(s => s.exit_at && isSameDay(new Date(s.entry_at), date))
          .reduce((sum, s) => {
            const pause = s.pause_minutes || 0;
            return sum + Math.max(0, s.duration_minutes - pause);
          }, 0);

        days.push({
          date,
          minutes: dayMinutes,
          dayName: WEEKDAYS_SHORT[date.getDay()],
        });

        totalMinutes += dayMinutes;
      }

      weeks.push({ weekStart: new Date(weekStart), days, totalMinutes });

      // Move to next week
      weekStart.setDate(weekStart.getDate() + 7);
    }

    return weeks;
  }, [sessions, currentDate]);

  // Find max for scaling
  const maxMinutes = Math.max(
    ...weeksData.flatMap(w => w.days.map(d => d.minutes)),
    60 // Minimum scale of 1 hour
  );

  const formatHours = (min: number) => {
    if (min === 0) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
  };

  const formatWeekLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Auto-scroll to the week containing today (or last week if not in this month)
  useEffect(() => {
    if (scrollViewRef.current && weeksData.length > 0) {
      const today = new Date();
      let targetIndex = weeksData.length - 1; // default: last week

      // Find which week contains today
      for (let i = 0; i < weeksData.length; i++) {
        if (weeksData[i].days.some(d => isSameDay(d.date, today))) {
          targetIndex = i;
          break;
        }
      }

      const cardWidth = SCREEN_WIDTH - 64 + 12; // weekCard width + marginRight
      const scrollTo = targetIndex * cardWidth;

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: scrollTo, animated: true });
      }, 100);
    }
  }, [weeksData]); // Re-scroll when data or month changes

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>Weekly Hours</Text>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chartStyles.scrollContent}
      >
        {weeksData.map((week, weekIndex) => (
          <View key={weekIndex} style={chartStyles.weekCard}>
            <Text style={chartStyles.weekLabel}>
              {formatWeekLabel(week.weekStart)}
            </Text>
            
            <View style={chartStyles.barsRow}>
              {week.days.map((day, dayIndex) => {
                const barHeight = maxMinutes > 0 
                  ? Math.max(4, (day.minutes / maxMinutes) * 100) 
                  : 4;
                const isTodayDay = isSameDay(day.date, new Date());
                
                return (
                  <View key={dayIndex} style={chartStyles.barColumn}>
                    <Text style={chartStyles.barValue}>{formatHours(day.minutes)}</Text>
                    <View style={chartStyles.barBg}>
                      <View 
                        style={[
                          chartStyles.bar,
                          { height: `${barHeight}%` },
                          isTodayDay && chartStyles.barToday,
                          day.minutes === 0 && chartStyles.barEmpty,
                        ]} 
                      />
                    </View>
                    <Text style={[
                      chartStyles.dayLabel,
                      isTodayDay && chartStyles.dayLabelToday
                    ]}>
                      {day.dayName}
                    </Text>
                  </View>
                );
              })}
            </View>
            
            <Text style={chartStyles.weekTotal}>
              {formatHours(week.totalMinutes)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={chartStyles.footer}>
        <Text style={chartStyles.footerText}>Weekly Activity Log</Text>
      </View>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsScreen() {
  const router = useRouter();

  const {
    userName,
    userId,
    currentMonth,
    monthCalendarDays,
    monthTotalMinutes,
    monthSessions,

    showDayModal,
    selectedDayForModal,
    dayModalSessions,
    closeDayModal,

    selectedSessions,
    toggleSelectSession,
    selectAllSessions,
    deselectAllSessions,

    // Session editing
    openEditSession,
    editingSessionId,

    refreshing,
    onRefresh,

    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,

    handleDayPress,
    getSessionsForDay,
    getTotalMinutesForDay,

    openManualEntry,
    handleDeleteFromModal,
    handleExport,
    handleExportFromModal,

    // Manual entry modal state
    showManualModal,
    setShowManualModal,
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
    manualEntryMode,
    setManualEntryMode,
    manualAbsenceType,
    setManualAbsenceType,
    handleSaveManual,

    locations,
    formatDateRange,
    formatMonthYear,
    formatTimeAMPM,
    formatDuration,
    isToday,
    getSessionsByPeriod,
  } = useHomeScreen();

  // ============================================
  // RELOAD DATA ON TAB FOCUS
  // ============================================
  // FIX: When navigating from Home to Reports, reload data to show new records
  // FIX: Always navigate to current month so chart shows current week
  useFocusEffect(
    useCallback(() => {
      goToCurrentMonth();
      onRefresh();
    }, []) // Empty deps - functions read from store directly
  );

  // Sessions for chart - always use month sessions
  const allSessions = monthSessions || [];

  // ============================================
  // AM/PM STATE FOR MANUAL ENTRY MODAL
  // ============================================
  const [entryPeriod, setEntryPeriod] = useState<'AM' | 'PM'>('AM');
  const [exitPeriod, setExitPeriod] = useState<'AM' | 'PM'>('PM');

  // Smart time handlers - convert 24h to 12h automatically
  const handleEntryHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    const hour = parseInt(cleaned, 10);
    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      // 13-23 → convert to 12h PM
      setManualEntryH(String(hour - 12).padStart(2, '0'));
      setEntryPeriod('PM');
    } else if (!isNaN(hour) && hour === 12) {
      setManualEntryH('12');
      setEntryPeriod('PM');
    } else if (!isNaN(hour) && hour === 0) {
      // 0 → 12 AM
      setManualEntryH('12');
      setEntryPeriod('AM');
    } else {
      setManualEntryH(cleaned);
    }
  };

  const handleExitHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    const hour = parseInt(cleaned, 10);
    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      setManualExitH(String(hour - 12).padStart(2, '0'));
      setExitPeriod('PM');
    } else if (!isNaN(hour) && hour === 12) {
      setManualExitH('12');
      setExitPeriod('PM');
    } else if (!isNaN(hour) && hour === 0) {
      setManualExitH('12');
      setExitPeriod('AM');
    } else {
      setManualExitH(cleaned);
    }
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
  // AGGREGATE SESSIONS BY LOCATION FOR DAY MODAL
  // ============================================
  const aggregatedLocations = useMemo((): AggregatedLocation[] => {
    const completedSessions = dayModalSessions.filter(s => s.exit_at);
    if (completedSessions.length === 0) return [];

    // Group sessions by location_id
    const groupedByLocation = new Map<string, ComputedSession[]>();

    for (const session of completedSessions) {
      const existing = groupedByLocation.get(session.location_id) || [];
      existing.push(session);
      groupedByLocation.set(session.location_id, existing);
    }

    // Create aggregated entries
    const aggregated: AggregatedLocation[] = [];

    for (const [locationId, sessions] of groupedByLocation.entries()) {
      // Sort by entry time
      const sorted = [...sessions].sort((a, b) =>
        new Date(a.entry_at).getTime() - new Date(b.entry_at).getTime()
      );

      const firstEntry = sorted[0].entry_at;
      const lastExit = sorted[sorted.length - 1].exit_at || sorted[sorted.length - 1].entry_at;

      let totalMinutes = 0;
      let totalBreakMinutes = 0;
      let isEdited = false;

      for (const s of sessions) {
        const pauseMin = s.pause_minutes || 0;
        totalMinutes += Math.max(0, s.duration_minutes - pauseMin);
        totalBreakMinutes += pauseMin;
        if (s.type === 'manual' || s.manually_edited === 1) {
          isEdited = true;
        }
      }

      aggregated.push({
        locationId,
        locationName: sessions[0].location_name || 'Unknown',
        color: sessions[0].color || colors.primary,
        firstEntry,
        lastExit,
        totalMinutes,
        totalBreakMinutes,
        sessionsCount: sessions.length,
        isEdited,
        sessions: sorted,
      });
    }

    // Sort by first entry time
    return aggregated.sort((a, b) =>
      new Date(a.firstEntry).getTime() - new Date(b.firstEntry).getTime()
    );
  }, [dayModalSessions]);

  // Animation values for morph transition
  const modalScale = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const [pressedDayKey, setPressedDayKey] = useState<string | null>(null);

  // PDF export loading state
  const [isExporting, setIsExporting] = useState(false);

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

  // Calculate total hours in range
  const rangeTotalMinutes = useMemo(() => {
    return rangeSessions.reduce((total, s) => {
      const pause = s.pause_minutes || 0;
      return total + Math.max(0, s.duration_minutes - pause);
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

  // ============================================
  // SWIPE GESTURE FOR MONTH NAVIGATION
  // ============================================
  // Use refs to avoid stale closures in PanResponder
  const goToNextMonthRef = useRef(goToNextMonth);
  const goToPreviousMonthRef = useRef(goToPreviousMonth);

  // Keep refs updated when functions change
  useEffect(() => {
    goToNextMonthRef.current = goToNextMonth;
    goToPreviousMonthRef.current = goToPreviousMonth;
  }, [goToNextMonth, goToPreviousMonth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (dx > dy)
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx } = gestureState;
        const SWIPE_THRESHOLD = 50;

        if (dx < -SWIPE_THRESHOLD) {
          // Swipe left → next month
          goToNextMonthRef.current();
        } else if (dx > SWIPE_THRESHOLD) {
          // Swipe right → previous month
          goToPreviousMonthRef.current();
        }
      },
    })
  ).current;

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
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      {/* Status bar strip - gray background behind system status bar */}
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Constants.statusBarHeight || 28,
          backgroundColor: '#F3F4F6',
          zIndex: 1,
        }}
      />

      <View style={reportStyles.container}>
        {/* HEADER */}
        <View style={reportStyles.header}>
          <Text style={reportStyles.headerTitle}>Reports</Text>
        </View>

      {/* CALENDAR CARD - Hidden in date range mode */}
      {!dateRangeMode && (
        <Card style={reportStyles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              style={reportStyles.navBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goToCurrentMonth}
              style={styles.calendarCenter}
            >
              <Text style={reportStyles.calendarTitle}>
                {formatMonthYear(currentMonth)}
              </Text>
              <Text style={reportStyles.calendarTotal}>
                {formatDuration(monthTotalMinutes)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={reportStyles.navBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Export Date Range Button */}
          <TouchableOpacity
            style={reportStyles.exportRangeBtn}
            activeOpacity={0.7}
            onPress={() => {
              setDateRangeMode(true);
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.white} />
            <Text style={reportStyles.exportRangeBtnText}>Select Dates to Export</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* DATE RANGE MODE HEADER */}
      {dateRangeMode && (
        <View style={reportStyles.dateRangeHeader}>
          {/* Month navigation */}
          <View style={reportStyles.dateRangeMonthNav}>
            <TouchableOpacity
              style={reportStyles.dateRangeNavBtn}
              onPress={goToPreviousMonth}
            >
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </TouchableOpacity>

            <Text style={reportStyles.dateRangeMonthName}>
              {formatMonthYear(currentMonth)}
            </Text>

            <TouchableOpacity
              style={reportStyles.dateRangeNavBtn}
              onPress={goToNextMonth}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.primary} />
            </TouchableOpacity>
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
            <TouchableOpacity style={reportStyles.dateRangeCancelBtn} onPress={cancelDateRange}>
              <Text style={reportStyles.dateRangeCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
          {/* MONTH VIEW - with swipe gesture */}
          <View {...panResponder.panHandlers}>
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
                    <TouchableOpacity
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
                      <View style={reportStyles.monthDayDots}>
                        {hasSessions && totalMinutes > 0 && (
                          <View style={reportStyles.monthDayDot} />
                        )}
                        {hasWorkNoBreak && (
                          <View style={reportStyles.monthDayNoBreakDot} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

        {/* WEEKLY BAR CHART - Follows calendar */}
        <View style={reportStyles.chartArea}>
          <WeeklyBarChart sessions={allSessions} currentDate={currentMonth} />
        </View>
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
          style={[
            styles.dayModalOverlay,
            { opacity: modalOpacity }
          ]}
        >
          <Animated.View
            style={[
              styles.dayModalContainer,
              {
                transform: [
                  { scale: modalScale },
                ],
              }
            ]}
          >
            {/* Header - Two lines: Date on top, action icons below */}
            <View style={reportStyles.dayModalHeaderV2}>
              <Text style={reportStyles.dayModalTitleV2}>
                {selectedDayForModal?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </Text>
              <View style={reportStyles.dayModalActionsRow}>
                {/* Add */}
                <TouchableOpacity
                  style={reportStyles.dayModalActionBtn}
                  onPress={() => selectedDayForModal && openManualEntry(selectedDayForModal)}
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.success || '#22C55E'} />
                  <Text style={reportStyles.dayModalActionLabel}>Add</Text>
                </TouchableOpacity>
                {/* Edit */}
                <TouchableOpacity
                  style={[reportStyles.dayModalActionBtn, selectedSessions.size !== 1 && reportStyles.dayModalActionBtnDisabled]}
                  onPress={() => {
                    if (selectedSessions.size === 1) {
                      const sessionId = Array.from(selectedSessions)[0];
                      const session = dayModalSessions.find(s => s.id === sessionId);
                      if (session) openEditSession(session);
                    }
                  }}
                  disabled={selectedSessions.size !== 1}
                >
                  <Ionicons name="pencil-outline" size={26} color={selectedSessions.size !== 1 ? colors.textMuted : colors.primary} />
                  <Text style={[reportStyles.dayModalActionLabel, selectedSessions.size !== 1 && reportStyles.dayModalActionLabelDisabled]}>Edit</Text>
                </TouchableOpacity>
                {/* Delete */}
                <TouchableOpacity
                  style={[reportStyles.dayModalActionBtn, selectedSessions.size === 0 && reportStyles.dayModalActionBtnDisabled]}
                  onPress={handleDeleteFromModal}
                  disabled={selectedSessions.size === 0}
                >
                  <Ionicons name="trash-outline" size={26} color={selectedSessions.size === 0 ? colors.textMuted : colors.error || '#EF4444'} />
                  <Text style={[reportStyles.dayModalActionLabel, selectedSessions.size === 0 && reportStyles.dayModalActionLabelDisabled]}>Delete</Text>
                </TouchableOpacity>
                {/* Close */}
                <TouchableOpacity
                  style={reportStyles.dayModalActionBtnClose}
                  onPress={closeDayModal}
                >
                  <Ionicons name="close" size={26} color={colors.white} />
                  <Text style={reportStyles.dayModalActionLabelClose}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* No break warning banner */}
            {aggregatedLocations.length >= 1 &&
              aggregatedLocations.every(agg => agg.totalBreakMinutes === 0) && (
              <View style={reportStyles.noBreakBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error || '#EF4444'} />
                <Text style={reportStyles.noBreakBannerText}>
                  No break registered for this day
                </Text>
              </View>
            )}

            {/* Selection hint */}
            {aggregatedLocations.length >= 1 && (
              <View style={reportStyles.selectionHintBar}>
                <Text style={reportStyles.selectionHintText}>
                  {selectedSessions.size > 0
                    ? `${selectedSessions.size} selected`
                    : 'Tap to select'}
                </Text>
                {selectedSessions.size > 0 ? (
                  <TouchableOpacity onPress={deselectAllSessions}>
                    <Text style={reportStyles.selectionHintBtn}>Clear</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={selectAllSessions}>
                    <Text style={reportStyles.selectionHintBtn}>Select All</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <ScrollView
              style={styles.dayModalSessionsList}
              contentContainerStyle={styles.dayModalSessionsContent}
            >
              {aggregatedLocations.length === 0 ? (
                <View style={styles.dayModalEmpty}>
                  <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.dayModalEmptyText}>No completed sessions</Text>
                  <TouchableOpacity
                    style={styles.dayModalAddBtn}
                    onPress={() => selectedDayForModal && openManualEntry(selectedDayForModal)}
                  >
                    <Text style={styles.dayModalAddBtnText}>Add Manual Entry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                aggregatedLocations.map((agg: AggregatedLocation) => {
                  // Check if all sessions in this location are selected
                  const allSelected = agg.sessions.every(s => selectedSessions.has(s.id));
                  const someSelected = agg.sessions.some(s => selectedSessions.has(s.id));

                  return (
                    <TouchableOpacity
                      key={agg.locationId}
                      style={[
                        styles.dayModalSession,
                        someSelected && reportStyles.sessionItemSelected
                      ]}
                      onPress={() => {
                        // Toggle selection for all sessions in this location
                        for (const s of agg.sessions) {
                          toggleSelectSession(s.id);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        reportStyles.sessionCheckbox,
                        allSelected && reportStyles.sessionCheckboxSelected
                      ]}>
                        {allSelected && <Ionicons name="checkmark" size={18} color={colors.white} />}
                      </View>
                      <View style={[reportStyles.sessionColorBar, { backgroundColor: agg.color }]} />
                      <View style={styles.dayModalSessionInfo}>
                        <View style={styles.dayModalSessionHeader}>
                          <Text style={styles.dayModalSessionLocation}>{agg.locationName}</Text>
                          {agg.sessionsCount > 1 && (
                            <View style={reportStyles.sessionCountBadge}>
                              <Text style={reportStyles.sessionCountText}>{agg.sessionsCount}x</Text>
                            </View>
                          )}
                        </View>

                        <Text style={[
                          styles.dayModalSessionTime,
                          agg.isEdited && styles.dayModalSessionTimeEdited
                        ]}>
                          {agg.isEdited ? '✏️ ' : ''}
                          {formatTimeAMPM(agg.firstEntry)} → {formatTimeAMPM(agg.lastExit)}
                        </Text>

                        {agg.totalBreakMinutes > 0 && (
                          <Text style={styles.dayModalSessionPause}>☕ {agg.totalBreakMinutes}min break</Text>
                        )}

                        <Text style={styles.dayModalSessionTotal}>{formatDuration(agg.totalMinutes)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {aggregatedLocations.length > 0 && (
              <View style={styles.dayModalTotalBar}>
                <Text style={styles.dayModalTotalLabel}>Day Total</Text>
                <Text style={styles.dayModalTotalValue}>
                  {formatDuration(
                    aggregatedLocations.reduce((acc, agg) => acc + agg.totalMinutes, 0)
                  )}
                </Text>
              </View>
            )}

          </Animated.View>
        </Animated.View>
      </Modal>

      {/* ============================================ */}
      {/* MANUAL ENTRY MODAL */}
      {/* ============================================ */}
      <Modal
        visible={showManualModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowManualModal(false)}
      >
        <View style={styles.dayModalContainer}>
          <View style={styles.dayModalContent}>
            {/* Header */}
            <View style={styles.dayModalHeader}>
              <Text style={styles.dayModalTitle}>
                {editingSessionId ? 'Edit Entry' : 'Add Manual Entry'}
              </Text>
              <Text style={styles.dayModalSubtitle}>
                {manualDate ? formatDateRange(manualDate, manualDate) : ''}
              </Text>
              <View style={styles.dayModalHeaderBtns}>
                <TouchableOpacity
                  style={[styles.dayModalHeaderBtn, styles.dayModalCloseHeaderBtn]}
                  onPress={() => setShowManualModal(false)}
                >
                  <Ionicons name="close" size={22} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.dayModalScroll}>
              {/* Mode Toggle */}
              <View style={reportStyles.modeToggle}>
                <TouchableOpacity
                  style={[
                    reportStyles.modeButton,
                    manualEntryMode === 'hours' && reportStyles.modeButtonActive,
                  ]}
                  onPress={() => setManualEntryMode('hours')}
                >
                  <Text style={[
                    reportStyles.modeButtonText,
                    manualEntryMode === 'hours' && reportStyles.modeButtonTextActive,
                  ]}>Log Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    reportStyles.modeButton,
                    manualEntryMode === 'absence' && reportStyles.modeButtonActive,
                  ]}
                  onPress={() => setManualEntryMode('absence')}
                >
                  <Text style={[
                    reportStyles.modeButtonText,
                    manualEntryMode === 'absence' && reportStyles.modeButtonTextActive,
                  ]}>Absence</Text>
                </TouchableOpacity>
              </View>

              {manualEntryMode === 'hours' ? (
                <>
                  {/* Location Picker */}
                  <View style={reportStyles.inputGroup}>
                    <Text style={reportStyles.inputLabel}>Location</Text>
                    {locations.length === 0 ? (
                      <TouchableOpacity
                        style={reportStyles.noLocationsContainer}
                        onPress={() => {
                          setShowManualModal(false);
                          router.push('/(tabs)/map');
                        }}
                      >
                        <Ionicons name="location-outline" size={24} color={colors.textMuted} />
                        <Text style={reportStyles.noLocationsText}>Register a location first</Text>
                        <View style={reportStyles.noLocationsBtn}>
                          <Ionicons name="add" size={20} color={colors.white} />
                          <Text style={reportStyles.noLocationsBtnText}>Go to Locations</Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <View style={reportStyles.pickerContainer}>
                        <Picker
                          selectedValue={manualLocationId}
                          onValueChange={setManualLocationId}
                          style={reportStyles.picker}
                        >
                          {locations.map((loc: any) => (
                            <Picker.Item key={loc.id} label={loc.name} value={loc.id} />
                          ))}
                        </Picker>
                      </View>
                    )}
                  </View>

                  {/* Entry Time */}
                  <View style={reportStyles.inputGroup}>
                    <Text style={reportStyles.inputLabel}>Entry Time</Text>
                    <View style={reportStyles.timeRow}>
                      <TextInput
                        style={reportStyles.timeInput}
                        value={manualEntryH}
                        onChangeText={handleEntryHourChange}
                        keyboardType="number-pad"
                        placeholder="HH"
                        maxLength={2}
                        placeholderTextColor={colors.textMuted}
                      />
                      <Text style={reportStyles.timeSeparator}>:</Text>
                      <TextInput
                        style={reportStyles.timeInput}
                        value={manualEntryM}
                        onChangeText={setManualEntryM}
                        keyboardType="number-pad"
                        placeholder="MM"
                        maxLength={2}
                        placeholderTextColor={colors.textMuted}
                      />
                      <View style={reportStyles.ampmToggle}>
                        <TouchableOpacity
                          style={[reportStyles.ampmBtn, entryPeriod === 'AM' && reportStyles.ampmBtnActive]}
                          onPress={() => setEntryPeriod('AM')}
                        >
                          <Text style={[reportStyles.ampmText, entryPeriod === 'AM' && reportStyles.ampmTextActive]}>AM</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[reportStyles.ampmBtn, entryPeriod === 'PM' && reportStyles.ampmBtnActive]}
                          onPress={() => setEntryPeriod('PM')}
                        >
                          <Text style={[reportStyles.ampmText, entryPeriod === 'PM' && reportStyles.ampmTextActive]}>PM</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Exit Time */}
                  <View style={reportStyles.inputGroup}>
                    <Text style={reportStyles.inputLabel}>Exit Time</Text>
                    <View style={reportStyles.timeRow}>
                      <TextInput
                        style={reportStyles.timeInput}
                        value={manualExitH}
                        onChangeText={handleExitHourChange}
                        keyboardType="number-pad"
                        placeholder="HH"
                        maxLength={2}
                        placeholderTextColor={colors.textMuted}
                      />
                      <Text style={reportStyles.timeSeparator}>:</Text>
                      <TextInput
                        style={reportStyles.timeInput}
                        value={manualExitM}
                        onChangeText={setManualExitM}
                        keyboardType="number-pad"
                        placeholder="MM"
                        maxLength={2}
                        placeholderTextColor={colors.textMuted}
                      />
                      <View style={reportStyles.ampmToggle}>
                        <TouchableOpacity
                          style={[reportStyles.ampmBtn, exitPeriod === 'AM' && reportStyles.ampmBtnActive]}
                          onPress={() => setExitPeriod('AM')}
                        >
                          <Text style={[reportStyles.ampmText, exitPeriod === 'AM' && reportStyles.ampmTextActive]}>AM</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[reportStyles.ampmBtn, exitPeriod === 'PM' && reportStyles.ampmBtnActive]}
                          onPress={() => setExitPeriod('PM')}
                        >
                          <Text style={[reportStyles.ampmText, exitPeriod === 'PM' && reportStyles.ampmTextActive]}>PM</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Break Time */}
                  <View style={reportStyles.inputGroup}>
                    <Text style={reportStyles.inputLabel}>Break (minutes)</Text>
                    <TextInput
                      style={reportStyles.input}
                      value={manualPause}
                      onChangeText={setManualPause}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </>
              ) : (
                /* Absence Mode */
                <View style={reportStyles.absenceContainer}>
                  <Text style={reportStyles.inputLabel}>Select Reason</Text>
                  {[
                    { key: 'rain', label: '🌧️ Rain Day', icon: 'rainy' },
                    { key: 'snow', label: '❄️ Snow Day', icon: 'snow' },
                    { key: 'sick', label: '🤒 Sick Day', icon: 'medical' },
                    { key: 'day_off', label: '🏖️ Day Off', icon: 'calendar' },
                    { key: 'holiday', label: '🎉 Holiday', icon: 'gift' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        reportStyles.absenceOption,
                        manualAbsenceType === option.key && reportStyles.absenceOptionSelected,
                      ]}
                      onPress={() => setManualAbsenceType(option.key)}
                    >
                      <Text style={reportStyles.absenceOptionText}>{option.label}</Text>
                      {manualAbsenceType === option.key && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Footer Buttons */}
            <View style={reportStyles.manualModalFooter}>
              <TouchableOpacity
                style={reportStyles.manualModalCancelBtn}
                onPress={() => setShowManualModal(false)}
              >
                <Text style={reportStyles.manualModalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={reportStyles.manualModalSaveBtn}
                onPress={handleSaveManualWithAmPm}
              >
                <Text style={reportStyles.manualModalSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
              <TouchableOpacity
                style={reportStyles.exportModalClose}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={reportStyles.exportModalBtnSecondary}
                onPress={() => {
                  setShowExportModal(false);
                  cancelDateRange();
                }}
                disabled={isExporting}
              >
                <Ionicons name="close-outline" size={20} color={colors.text} />
                <Text style={reportStyles.exportModalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[reportStyles.exportModalBtn, isExporting && { opacity: 0.7 }]}
                onPress={handleExportPDF}
                disabled={isExporting}
              >
                <Ionicons name={isExporting ? "hourglass-outline" : "document-text-outline"} size={20} color={colors.white} />
                <Text style={reportStyles.exportModalBtnText}>{isExporting ? 'Generating...' : 'Export PDF'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </View>
    </View>
  );
}

// ============================================
// REPORT STYLES
// ============================================

const reportStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    // Use same source as status bar strip for consistency
    paddingTop: (Constants.statusBarHeight || 28) + 12,
    paddingBottom: 8,
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
    fontSize: 13,   // Increased from 11
    fontWeight: '600',  // Increased from 500
    color: colors.textSecondary,
    textAlign: 'center',
  },
  calendarTotal: {
    fontSize: 24,   // Increased from 18
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
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

  // Chart Area - Follows calendar
  chartArea: {
    marginTop: 16,
    paddingBottom: 16,
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
    backgroundColor: withOpacity(colors.error || '#EF4444', 0.1),
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: withOpacity(colors.error || '#EF4444', 0.3),
  },
  noBreakBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.error || '#EF4444',
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
    marginBottom: 0,
  },
  monthCell: {
    width: DAY_SIZE,
    height: DAY_SIZE + 16, // Rectangular shape (taller for better visibility)
    marginBottom: 8,
  },
  monthDay: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
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
    fontSize: 11,
    fontWeight: '500',
    color: colors.text,
  },
  monthDayNumToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  monthDayDots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 1,
  },
  monthDayDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.accent,
  },
  monthDayNoBreakDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.error || '#EF4444',
  },

  // Ghost days (from adjacent months) - faded, non-interactive
  monthDayGhost: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  monthDayNumGhost: {
    fontSize: 11,
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
  sessionCountBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  sessionCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
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
});

// ============================================
// CHART STYLES - Compact
// ============================================

const chartStyles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  scrollContent: {
    paddingRight: 16,
  },
  weekCard: {
    width: SCREEN_WIDTH - 64,
    marginRight: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  barValue: {
    fontSize: 7,
    color: colors.textSecondary,
    marginBottom: 1,
    height: 8,
  },
  barBg: {
    width: '100%',
    height: 60,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
    minHeight: 3,
  },
  barToday: {
    backgroundColor: colors.accent,
  },
  barEmpty: {
    backgroundColor: colors.border,
  },
  dayLabel: {
    fontSize: 8,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  dayLabelToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  weekTotal: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 4,
    textAlign: 'center',
  },
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
});
