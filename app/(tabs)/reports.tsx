/**
 * Reports Screen - OnSite Timekeeper
 *
 * v1.3: Fixed layout + Weekly Bar Chart restored
 * - No main scroll, fits on screen
 * - WeeklyBarChart at bottom (scrollable horizontally)
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
  Dimensions,
  StyleSheet,
  TextInput,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';

import { Card } from '../../src/components/ui/Button';
import { colors, withOpacity, shadows } from '../../src/constants/colors';
import type { ComputedSession } from '../../src/lib/database';

import { useHomeScreen } from '../../src/screens/home/hooks';
import { styles } from '../../src/screens/home/styles';
import { WEEKDAYS_SHORT, type CalendarDay, getDayKey, isSameDay } from '../../src/screens/home/helpers';

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

  // Generate last 4 weeks of data
  const weeksData = useMemo(() => {
    const weeks: WeekData[] = [];
    const today = new Date(currentDate);
    
    for (let w = 0; w < 4; w++) {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - (w * 7));
      
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      
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
      
      weeks.push({ weekStart, days, totalMinutes });
    }
    
    return weeks.reverse(); // Oldest first for scroll
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

  // Auto-scroll to last week (most recent) on mount
  useEffect(() => {
    if (scrollViewRef.current && weeksData.length > 0) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, []); // Only run on mount

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
              {formatHours(week.totalMinutes)} total
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsScreen() {
  const router = useRouter();

  const {
    viewMode,
    setViewMode,
    currentMonth,
    weekStart,
    weekEnd,
    weekCalendarDays,
    monthCalendarDays,
    weekTotalMinutes,
    monthTotalMinutes,
    weekSessions,
    monthSessions,

    selectionMode,
    selectedDays,
    cancelSelection,

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

    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,

    handleDayPress,
    handleDayLongPress,
    getSessionsForDay,
    getTotalMinutesForDay,

    openManualEntry,
    handleDeleteFromModal,
    handleExport,
    handleDeleteSelectedDays,
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
  } = useHomeScreen();

  // Sessions for chart - use appropriate data based on view mode
  const allSessions = viewMode === 'week' ? (weekSessions || []) : (monthSessions || []);

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
  const get24Hour = (hour12: string, period: 'AM' | 'PM'): number => {
    const h = parseInt(hour12, 10) || 0;
    if (period === 'AM') {
      return h === 12 ? 0 : h;
    } else {
      return h === 12 ? 12 : h + 12;
    }
  };

  // Wrapper for save that converts to 24h format
  const handleSaveManualWithAmPm = async () => {
    // Convert to 24h and update the state temporarily
    const entryH24 = get24Hour(manualEntryH, entryPeriod);
    const exitH24 = get24Hour(manualExitH, exitPeriod);

    // Temporarily set 24h values for save
    setManualEntryH(String(entryH24).padStart(2, '0'));
    setManualExitH(String(exitH24).padStart(2, '0'));

    // Small delay to ensure state updates
    setTimeout(async () => {
      await handleSaveManual();
    }, 50);
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
    <View style={reportStyles.container}>
      {/* HEADER */}
      <View style={reportStyles.header}>
        <Text style={reportStyles.headerTitle}>Reports</Text>
      </View>

      {/* CALENDAR CARD */}
      <Card style={reportStyles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={reportStyles.navBtn}
            onPress={viewMode === 'week' ? goToPreviousWeek : goToPreviousMonth}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={viewMode === 'week' ? goToCurrentWeek : goToCurrentMonth} 
            style={styles.calendarCenter}
          >
            <Text style={reportStyles.calendarTitle}>
              {viewMode === 'week' 
                ? formatDateRange(weekStart, weekEnd)
                : formatMonthYear(currentMonth)
              }
            </Text>
            <Text style={reportStyles.calendarTotal}>
              {formatDuration(viewMode === 'week' ? weekTotalMinutes : monthTotalMinutes)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={reportStyles.navBtn}
            onPress={viewMode === 'week' ? goToNextWeek : goToNextMonth}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* View mode toggle */}
        <View style={reportStyles.viewToggle}>
          <TouchableOpacity 
            style={[reportStyles.viewToggleBtn, viewMode === 'week' && reportStyles.viewToggleBtnActive]}
            onPress={() => setViewMode('week')}
          >
            <Text style={[reportStyles.viewToggleText, viewMode === 'week' && reportStyles.viewToggleTextActive]}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[reportStyles.viewToggleBtn, viewMode === 'month' && reportStyles.viewToggleBtnActive]}
            onPress={() => setViewMode('month')}
          >
            <Text style={[reportStyles.viewToggleText, viewMode === 'month' && reportStyles.viewToggleTextActive]}>Month</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* CALENDAR CONTENT AREA - Contains both calendar and chart */}
      <View style={reportStyles.contentArea}>
          {/* WEEK VIEW - Scrollable list */}
          {viewMode === 'week' && (
            <ScrollView
              style={reportStyles.calendarScroll}
              contentContainerStyle={reportStyles.calendarScrollContent}
              showsVerticalScrollIndicator={false}
            >
            <View>
              {weekCalendarDays.map((day: CalendarDay) => {
              const dayKey = getDayKey(day.date);
              const hasSessions = day.sessions.length > 0;
              const isTodayDate = isToday(day.date);
              const hasActive = day.sessions.some((s: ComputedSession) => !s.exit_at);
              const isSelected = selectedDays.has(dayKey);
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6; // Sunday or Saturday

              // Check if day has work but NO breaks registered
              const completedSessions = day.sessions.filter((s: ComputedSession) => s.exit_at);
              const hasWorkNoBreak = completedSessions.length > 0 &&
                completedSessions.every((s: ComputedSession) => !s.pause_minutes || s.pause_minutes === 0);

              return (
                <TouchableOpacity
                  key={dayKey}
                  style={[
                    reportStyles.weekDay,
                    isWeekend && reportStyles.weekDayWeekend,
                    isTodayDate && reportStyles.weekDayToday,
                    isSelected && reportStyles.weekDaySelected,
                  ]}
                  onPress={() => handleDayPress(dayKey, hasSessions)}
                  onLongPress={() => handleDayLongPress(dayKey, hasSessions)}
                  delayLongPress={400}
                  activeOpacity={0.7}
                >
                  <View style={reportStyles.weekDayLeft}>
                    <Text style={[reportStyles.weekDayName, isTodayDate && reportStyles.weekDayNameToday]}>
                      {day.weekday}
                    </Text>
                    <View style={[reportStyles.weekDayCircle, isTodayDate && reportStyles.weekDayCircleToday]}>
                      <Text style={[reportStyles.weekDayNum, isTodayDate && reportStyles.weekDayNumToday]}>
                        {day.dayNumber}
                      </Text>
                    </View>
                  </View>
                  <View style={reportStyles.weekDayRight}>
                    {hasWorkNoBreak && !hasActive && (
                      <View style={reportStyles.noBreakDot} />
                    )}
                    <Text style={[
                      reportStyles.weekDayHours,
                      hasActive && { color: colors.success }
                    ]}>
                      {hasActive ? 'Active' : hasSessions ? formatDuration(day.totalMinutes) : '—'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
            </ScrollView>
          )}

          {/* MONTH VIEW - Natural height (no scroll needed) */}
          {viewMode === 'month' && (
            <View>
              {/* Weekday headers */}
              <View style={reportStyles.monthHeader}>
                {WEEKDAYS_SHORT.map((d: string, i: number) => (
                  <View key={i} style={reportStyles.monthHeaderCell}>
                    <Text style={reportStyles.monthHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* Days grid */}
              <View style={reportStyles.monthGrid}>
                {monthCalendarDays.map((date: Date | null, index: number) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={reportStyles.monthCell} />;
                  }

                  const dayKey = getDayKey(date);
                  const daySessions = getSessionsForDay(date);
                  const hasSessions = daySessions.length > 0;
                  const isTodayDate = isToday(date);
                  const isSelected = selectedDays.has(dayKey);
                  const totalMinutes = getTotalMinutesForDay(date);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday

                  // Check if day has work but NO breaks registered
                  const completedSessions = daySessions.filter((s: ComputedSession) => s.exit_at);
                  const hasWorkNoBreak = completedSessions.length > 0 &&
                    completedSessions.every((s: ComputedSession) => !s.pause_minutes || s.pause_minutes === 0);

                  return (
                    <TouchableOpacity
                      key={dayKey}
                      style={[
                        reportStyles.monthCell,
                        reportStyles.monthDay,
                        isWeekend && reportStyles.monthDayWeekend,
                        isTodayDate && reportStyles.monthDayToday,
                        isSelected && reportStyles.monthDaySelected,
                        hasSessions && reportStyles.monthDayHasData,
                      ]}
                      onPress={() => handleDayPress(dayKey, hasSessions)}
                      onLongPress={() => handleDayLongPress(dayKey, hasSessions)}
                      delayLongPress={400}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        reportStyles.monthDayNum,
                        isTodayDate && reportStyles.monthDayNumToday,
                        isSelected && reportStyles.monthDayNumSelected,
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
          )}

        {/* BATCH ACTION BAR - Between calendar and chart */}
        {selectionMode && (
          <View style={reportStyles.batchBar}>
            <Text style={reportStyles.batchText}>{selectedDays.size} day(s) selected</Text>
            <View style={reportStyles.batchActions}>
              <TouchableOpacity style={reportStyles.batchBtn} onPress={handleDeleteSelectedDays}>
                <Ionicons name="trash-outline" size={22} color={colors.white} />
                <Text style={reportStyles.batchBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reportStyles.batchBtn} onPress={handleExport}>
                <Ionicons name="share-outline" size={22} color={colors.white} />
                <Text style={reportStyles.batchBtnText}>Export</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reportStyles.batchBtnCancel} onPress={cancelSelection}>
                <Ionicons name="close" size={22} color={colors.white} />
                <Text style={reportStyles.batchBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* WEEKLY BAR CHART - Sticky footer */}
        <View style={reportStyles.chartArea}>
          <WeeklyBarChart sessions={allSessions} currentDate={currentMonth} />
        </View>
      </View>

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
                <TouchableOpacity
                  style={[reportStyles.dayModalActionBtn, selectedSessions.size === 0 && reportStyles.dayModalActionBtnDisabled]}
                  onPress={handleDeleteFromModal}
                  disabled={selectedSessions.size === 0}
                >
                  <Ionicons name="trash-outline" size={26} color={selectedSessions.size === 0 ? colors.textMuted : colors.error || '#EF4444'} />
                  <Text style={[reportStyles.dayModalActionLabel, selectedSessions.size === 0 && reportStyles.dayModalActionLabelDisabled]}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[reportStyles.dayModalActionBtn, selectedSessions.size !== 1 && reportStyles.dayModalActionBtnDisabled]}
                  onPress={() => {
                    // Edit only works with single selection
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
                <TouchableOpacity
                  style={[reportStyles.dayModalActionBtn, selectedSessions.size === 0 && reportStyles.dayModalActionBtnDisabled]}
                  onPress={handleExportFromModal}
                  disabled={selectedSessions.size === 0}
                >
                  <Ionicons name="share-outline" size={26} color={selectedSessions.size === 0 ? colors.textMuted : colors.primary} />
                  <Text style={[reportStyles.dayModalActionLabel, selectedSessions.size === 0 && reportStyles.dayModalActionLabelDisabled]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={reportStyles.dayModalActionBtn}
                  onPress={() => selectedDayForModal && openManualEntry(selectedDayForModal)}
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.success || '#22C55E'} />
                  <Text style={reportStyles.dayModalActionLabel}>Add</Text>
                </TouchableOpacity>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 56,
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

  // Content Area - Holds calendar + chart
  contentArea: {
    flex: 1,
    overflow: 'hidden',
  },

  // Calendar Scroll - ScrollView that takes all available height above chart
  calendarScroll: {
    flex: 1,
  },

  // Calendar Scroll Content - Padding for ScrollView content
  calendarScrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },

  // Chart Area - Sticky footer pinned to bottom
  chartArea: {
    marginTop: 'auto',
    flexShrink: 0,
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
    justifyContent: 'space-between',
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
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  monthCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    marginBottom: 4,
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
  monthDaySelected: {
    backgroundColor: colors.accent,
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
  monthDayNumSelected: {
    color: colors.white,
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

  // Batch Action Bar - Between calendar and chart
  batchBar: {
    flexDirection: 'column',
    gap: 12,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 12,
    ...shadows.md,
  },
  batchText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
  batchActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  batchBtn: {
    flex: 1,
    flexDirection: 'column',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: withOpacity(colors.white, 0.2),
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 70,
  },
  batchBtnCancel: {
    flex: 1,
    flexDirection: 'column',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 70,
  },
  batchBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
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
});

// ============================================
// CHART STYLES - Compact
// ============================================

const chartStyles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  scrollContent: {
    paddingRight: 16,
  },
  weekCard: {
    width: SCREEN_WIDTH - 64,
    marginRight: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 70,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  barValue: {
    fontSize: 8,
    color: colors.textSecondary,
    marginBottom: 2,
    height: 10,
  },
  barBg: {
    width: '100%',
    height: 50,
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
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  dayLabelToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  weekTotal: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
});
