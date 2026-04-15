/**
 * Log Screen - OnSite Timekeeper
 *
 * Clean, spacious manual time entry form for construction workers.
 * Large touch targets, big fonts, generous spacing.
 *
 * Layout: Location -> Date -> Entry/Exit -> Break -> Total -> Save
 * Bottom: Timer bar with inline play/pause/stop controls
 */

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  Switch,
  Platform,
  Dimensions,
  Animated,
  InputAccessoryView,
  Keyboard,
  Alert,
  KeyboardAvoidingView,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { colors, shadows, spacing, borderRadius } from '../../src/constants/colors';
import { getDailyHours, getDailyHoursByPeriod, deleteDailyHours } from '../../src/lib/database/daily';
import { toLocalDateString } from '../../src/lib/database/core';
import type { DailyHoursEntry } from '../../src/lib/database/daily';
import { setSentryContext } from '../../src/lib/sentry';
import { formatTimeDisplay, splitTimeDisplay, BREAK_PRESETS } from '../../src/lib/format';
import { PressableOpacity } from '../../src/components/ui/PressableOpacity';
import { AvatarCircle } from '../../src/components/ui/AvatarCircle';
import { useHomeScreen } from '../../src/screens/home/hooks';
import { useDailyLogStore } from '../../src/stores/dailyLogStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useAutoLogToggle } from '../../src/hooks/useAutoLogToggle';
import { useLocationStore } from '../../src/stores/locationStore';
import { Calendar } from '../../src/components/Calendar';
import { OnboardingTour } from '../../src/components/OnboardingTour';
import {
  isToday as isTodayHelper,
  isFutureDay,
} from '../../src/screens/home/helpers';

// ============================================
// GREETING
// ============================================

const GREETINGS = {
  morning: [
    'First one on site,',
    "Sun's up already,",
    'Early start today,',
    'Coffee kicked in yet,',
    'Ready to build,',
  ],
  afternoon: [
    'Still at it,',
    'Lunch break over,',
    'Halfway there,',
    'Keeping track,',
    "Afternoon's flying,",
  ],
  night: [
    'Late night,',
    "That's a wrap,",
    'Good one today,',
    'Rest up,',
    'Clock out,',
  ],
};

function getGreetingForNow(): string {
  const h = new Date().getHours();
  const bucket = h >= 6 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'night';
  const list = GREETINGS[bucket];
  return list[Math.floor(Math.random() * list.length)];
}

/** Track whether this is the first render since app launch (module-level) */
let _isFirstOpen = true;

// ============================================
// HELPERS
// ============================================


// ============================================
// CONSTANTS
// ============================================

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateCard(date: Date): string {
  return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`;
}


function sourceLabel(source: string | null): string {
  switch (source) {
    case 'manual': case 'edited': return 'manual entry';
    case 'gps': return 'auto-logged';
    default: return '';
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsScreen() {
  const router = useRouter();
  const { editDate } = useLocalSearchParams<{ editDate?: string }>();

  const {
    // User
    userId: hookUserId,

    // Timer
    currentSession,
    activeLocation,
    canRestart,
    isManuallyStopped,
    timer,
    isPaused,
    pauseTimer,
    handlePause,
    handleResume,
    handleStop,
    handleRestart,

    onRefresh,

    // Manual entry form state
    daySource,
    manualLocationId,
    setManualLocationId,
    setManualLocationName,
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
    setManualDate,
    setManualEntryMode,
    setManualAbsenceType,
    handleSaveManual,

    locations,
    recentNames,
    formatDuration,
    getTotalMinutesForDay,
  } = useHomeScreen();

  // ============================================
  // LOCAL STATE
  // ============================================

  // Time pickers
  const [entryTime, setEntryTime] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [exitTime, setExitTime] = useState(() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d;
  });
  const [activeTimePicker, setActiveTimePicker] = useState<'entry' | 'exit' | null>(null);

  // Break
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [customBreakText, setCustomBreakText] = useState('');
  const [showCustomBreak, setShowCustomBreak] = useState(false);

  // Notes
  const [notesText, setNotesText] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);

  // Location selector
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showTypeLocation, setShowTypeLocation] = useState(false);
  const [manualLocationText, setManualLocationText] = useState('');
  const { autoLoggingEnabled, isToggling: isTogglingAutoLog, handleToggle: handleAutoLogToggle } = useAutoLogToggle();

  // Greeting — random on first open, just first name after that
  const getUserName = useAuthStore(s => s.getUserName);
  const firstName = useMemo(() => {
    const name = getUserName();
    if (!name) return '';
    return name.split(' ')[0];
  }, [getUserName]);

  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    if (_isFirstOpen) {
      setGreeting(getGreetingForNow());
      _isFirstOpen = false;
    }
  }, []);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Date selection
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Day detail popup (Fix 1.2)
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null);
  const [dayDetailData, setDayDetailData] = useState<DailyHoursEntry | null>(null);

  // Past date computed (Fix 1.3)
  const isEditingPastDate = !isTodayHelper(selectedDate);

  // Edit mode — "Amber Envelope" pattern
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const cardBgAnim = useRef(new Animated.Value(0)).current;

  // Onboarding tour refs
  const dateChipRef = useRef<View>(null);
  const timeCardsRef = useRef<View>(null);
  const timerBarRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Animate card bg when entering/leaving edit mode
  useEffect(() => {
    Animated.timing(cardBgAnim, {
      toValue: isEditingPastDate ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isEditingPastDate]);

  const cardBgColor = cardBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, '#FFF8E7'],
  });

  // Locked field snackbar
  const [showLockedSnackbar, setShowLockedSnackbar] = useState(false);
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snackbarAnim = useRef(new Animated.Value(0)).current;

  const showLockedFieldFeedback = useCallback(() => {
    // Haptic buzz
    Vibration.vibrate(30);

    // Show snackbar (or reset timer if already showing)
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current);

    setShowLockedSnackbar(true);
    Animated.spring(snackbarAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    snackbarTimer.current = setTimeout(() => {
      Animated.timing(snackbarAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setShowLockedSnackbar(false));
    }, 3000);
  }, [snackbarAnim]);

  const dismissSnackbar = useCallback(() => {
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current);
    Animated.timing(snackbarAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowLockedSnackbar(false));
  }, [snackbarAnim]);

  // Timer bar needs todayLog; dataVersion triggers calendar refresh after save/delete/sync
  const todayLog = useDailyLogStore(s => s.todayLog);
  const dataVersion = useDailyLogStore(s => s.dataVersion);

  // SAFETY CHECK: If auto-log is OFF but currentSession still exists (race condition
  // from disableAutoLogging async flow), force cleanup. This is the redundancy layer —
  // even if disableAutoLogging() partially failed, the UI never shows active tracking
  // with the toggle off. Guard prevents re-fire if cleanup is already in progress.
  const disableAutoLogging = useLocationStore(s => s.disableAutoLogging);
  const safetyCleanupRef = useRef(false);
  useEffect(() => {
    if (!autoLoggingEnabled && currentSession && !safetyCleanupRef.current) {
      safetyCleanupRef.current = true;
      console.warn('[SAFETY] autoLoggingEnabled=false but currentSession exists — forcing cleanup');
      disableAutoLogging().finally(() => { safetyCleanupRef.current = false; });
    }
  }, [autoLoggingEnabled, currentSession, disableAutoLogging]);

  // ============================================
  // CALENDAR MINUTES CACHE (direct DB query per month)
  // ============================================
  const [calendarMinutesMap, setCalendarMinutesMap] = useState<Record<string, number>>({});
  const [calendarNotesMap, setCalendarNotesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hookUserId) return;
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const startStr = toLocalDateString(monthStart);
    const endStr = toLocalDateString(monthEnd);
    const entries = getDailyHoursByPeriod(hookUserId, startStr, endStr);
    const minutesMap: Record<string, number> = {};
    const notesMap: Record<string, string> = {};
    for (const e of entries) {
      if (e.total_minutes > 0) {
        minutesMap[e.date] = e.total_minutes;
      }
      if (e.notes) {
        notesMap[e.date] = e.notes;
      }
    }
    setCalendarMinutesMap(minutesMap);
    setCalendarNotesMap(notesMap);
  }, [hookUserId, calendarMonth, dataVersion]);

  const getCalendarDayMinutes = useCallback((date: Date): number => {
    const key = toLocalDateString(date);
    return calendarMinutesMap[key] || 0;
  }, [calendarMinutesMap]);

  const getCalendarDayHasNote = useCallback((date: Date): boolean => {
    const key = toLocalDateString(date);
    return !!calendarNotesMap[key];
  }, [calendarNotesMap]);

  // ============================================
  // EFFECTS
  // ============================================


  // Focus effect: reload data + reset date to today (or editDate from params)
  useFocusEffect(
    useCallback(() => {
      setSentryContext('daily-log');
      onRefresh();
      if (editDate) {
        // Coming from Invoice → "Edit on Log" link
        const [y, m, d] = editDate.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d);
        setSelectedDate(targetDate);
        setManualDate(targetDate);
        setCalendarMonth(targetDate);
        // Clear the param so it doesn't persist on re-focus
        router.setParams({ editDate: undefined as any });
      } else {
        const today = new Date();
        setSelectedDate(today);
        setManualDate(today);
        setCalendarMonth(today);
      }
      setManualLocationText('');
      if (locations.length > 0 && !manualLocationId) {
        setManualLocationId(locations[0].id);
      }
    }, [editDate])
  );

  // Auto-select first location when locations load (async from SQLite)
  useEffect(() => {
    if (locations.length > 0 && !manualLocationId) {
      setManualLocationId(locations[0].id);
    }
  }, [locations]);

  // Sync selectedDate → hook's manualDate (avoids closure race condition)
  useEffect(() => {
    setManualDate(selectedDate);
  }, [selectedDate, setManualDate]);

  // Load notes when selected date changes
  useEffect(() => {
    if (!hookUserId) return;
    const dateStr = toLocalDateString(selectedDate);
    const existing = getDailyHours(hookUserId, dateStr);
    if (existing?.notes) {
      setNotesText(existing.notes);
      setShowNotesInput(true);
    } else {
      setNotesText('');
      setShowNotesInput(false);
    }
  }, [selectedDate, hookUserId]);

  // Sync manual location text → hook's manualLocationName
  useEffect(() => {
    setManualLocationName(manualLocationText);
  }, [manualLocationText, setManualLocationName]);

  // Sync hook's time values → local Date state (when hook populates from existing data)
  useEffect(() => {
    if (manualEntryH && manualEntryM) {
      const d = new Date(selectedDate);
      d.setHours(parseInt(manualEntryH, 10), parseInt(manualEntryM, 10), 0, 0);
      setEntryTime(d);
    } else {
      // Empty — reset to null-like state (we'll show dashes in the UI)
      const d = new Date(selectedDate);
      d.setHours(0, 0, 0, 0);
      setEntryTime(d);
    }
    if (manualExitH && manualExitM) {
      const d = new Date(selectedDate);
      d.setHours(parseInt(manualExitH, 10), parseInt(manualExitM, 10), 0, 0);
      setExitTime(d);
    } else {
      const d = new Date(selectedDate);
      d.setHours(0, 0, 0, 0);
      setExitTime(d);
    }
    setBreakMinutes(manualPause ? parseInt(manualPause, 10) || 0 : 0);
  }, [manualEntryH, manualEntryM, manualExitH, manualExitM, manualPause, selectedDate]);

  // ============================================
  // COMPUTED
  // ============================================

  // Whether the form has time data (from existing record or user input)
  const hasEntryTime = !!(manualEntryH && manualEntryM);
  const hasExitTime = !!(manualExitH && manualExitM);

  const totalMinutes = useMemo(() => {
    const entryMins = entryTime.getHours() * 60 + entryTime.getMinutes();
    const exitMins = exitTime.getHours() * 60 + exitTime.getMinutes();
    const total = exitMins - entryMins - breakMinutes;
    return total > 0 ? total : 0;
  }, [entryTime, exitTime, breakMinutes]);

  const selectedLocation = useMemo(() => {
    return locations.find(l => l.id === manualLocationId) || null;
  }, [locations, manualLocationId]);

  // Convert timer "HH:MM:SS" string to minutes for display
  const timerMinutes = useMemo(() => {
    const parts = timer.split(':');
    return parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
  }, [timer]);

  // Convert pauseTimer "HH:MM:SS" to human-readable label for State C
  const pauseLabel = useMemo(() => {
    const parts = pauseTimer.split(':');
    const totalMin = parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
    const secs = parseInt(parts[2] || '0');
    if (totalMin === 0 && secs === 0) return 'No break';
    if (totalMin === 0) return `${secs}s`;
    if (totalMin === 60) return '1 hour';
    if (totalMin > 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${totalMin} min`;
  }, [pauseTimer]);

  const breakLabel = useMemo(() => {
    if (breakMinutes === 0) return 'No break';
    if (breakMinutes === 60) return '1 hour';
    if (breakMinutes > 60) {
      const h = Math.floor(breakMinutes / 60);
      const m = breakMinutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${breakMinutes} min`;
  }, [breakMinutes]);

  // ============================================
  // HANDLERS
  // ============================================

  // Android: imperative API — opens native dialog that's immune to React re-renders
  const openAndroidTimePicker = useCallback((picker: 'entry' | 'exit') => {
    DateTimePickerAndroid.open({
      value: picker === 'entry' ? entryTime : exitTime,
      mode: 'time',
      display: 'spinner',
      positiveButton: { label: 'OK', textColor: colors.white },
      negativeButton: { label: 'Cancel', textColor: colors.white },
      onChange: (event, selectedDate) => {
        if (event.type === 'set' && selectedDate) {
          const newTime = new Date();
          newTime.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
          const h = String(selectedDate.getHours()).padStart(2, '0');
          const m = String(selectedDate.getMinutes()).padStart(2, '0');
          if (picker === 'entry') {
            setEntryTime(newTime);
            setManualEntryH(h);
            setManualEntryM(m);
          } else {
            setExitTime(newTime);
            setManualExitH(h);
            setManualExitM(m);
          }
        }
      },
    });
  }, [entryTime, exitTime, setManualEntryH, setManualEntryM, setManualExitH, setManualExitM]);

  // iOS: spinner updates in real-time inside modal
  const handleTimePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      const h = String(selectedDate.getHours()).padStart(2, '0');
      const m = String(selectedDate.getMinutes()).padStart(2, '0');
      if (activeTimePicker === 'entry') {
        setEntryTime(selectedDate);
        setManualEntryH(h);
        setManualEntryM(m);
      } else if (activeTimePicker === 'exit') {
        setExitTime(selectedDate);
        setManualExitH(h);
        setManualExitM(m);
      }
    }
  };

  const handleSave = async () => {
    // Location is required when auto-log is ON (geofenced locations exist)
    // but optional when auto-log is OFF (manual-only mode, text input)
    if (autoLoggingEnabled && !manualLocationId && !manualLocationText.trim()) {
      Alert.alert('No Location', 'Please select or type a work location.');
      return;
    }

    if (totalMinutes <= 0) {
      Alert.alert('Invalid Time', 'Exit time must be after entry time (accounting for break).');
      return;
    }

    setIsSaving(true);

    try {
      // Set all state values the hook expects
      setManualEntryMode('hours');
      setManualAbsenceType(null);

      const eH = entryTime.getHours();
      const eM = entryTime.getMinutes();
      const xH = exitTime.getHours();
      const xM = exitTime.getMinutes();

      setManualEntryH(String(eH).padStart(2, '0'));
      setManualEntryM(String(eM).padStart(2, '0'));
      setManualExitH(String(xH).padStart(2, '0'));
      setManualExitM(String(xM).padStart(2, '0'));
      setManualPause(breakMinutes > 0 ? String(breakMinutes) : '');

      // Pass all values directly to avoid state race condition
      await handleSaveManual({ entryH: eH, entryM: eM, exitH: xH, exitM: xM, pauseMinutes: breakMinutes, notes: notesText.trim() || undefined, locationId: manualLocationId, locationName: manualLocationText.trim() });

      // Green flash + auto-return for past date edits
      if (isEditingPastDate) {
        const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        setSuccessMessage(`Hours updated for ${dateLabel}`);
        setShowSuccessBanner(true);

        // Return to today after brief delay
        setTimeout(() => {
          setSelectedDate(new Date());
          setCalendarMonth(new Date());
        }, 400);

        // Hide success banner after 2.5s
        setTimeout(() => {
          setShowSuccessBanner(false);
          setSuccessMessage('');
        }, 2500);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHours = () => {
    if (!hookUserId) return;
    const dateStr = toLocalDateString(selectedDate);
    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    Alert.alert(
      'Clear Hours?',
      `This will remove all hours for ${dateLabel}.\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            deleteDailyHours(hookUserId, dateStr);

            // Reset local form state
            setEntryTime(new Date(selectedDate.setHours(0, 0, 0, 0)));
            setExitTime(new Date(selectedDate.setHours(0, 0, 0, 0)));
            setBreakMinutes(0);
            setManualEntryH('');
            setManualEntryM('');
            setManualExitH('');
            setManualExitM('');
            setManualPause('');
            setNotesText('');
            setShowNotesInput(false);

            // Success feedback + return to today
            setSuccessMessage(`Hours cleared for ${dateLabel}`);
            setShowSuccessBanner(true);
            setTimeout(() => {
              setSelectedDate(new Date());
              setCalendarMonth(new Date());
            }, 400);
            setTimeout(() => {
              setShowSuccessBanner(false);
              setSuccessMessage('');
            }, 2500);
          },
        },
      ]
    );
  };

  const handleSelectBreak = (value: number) => {
    setBreakMinutes(value);
    setShowBreakPicker(false);
    setShowCustomBreak(false);
    setCustomBreakText('');
  };

  const handleCustomBreakSave = () => {
    const val = parseInt(customBreakText, 10);
    if (!isNaN(val) && val >= 0 && val <= 480) {
      setBreakMinutes(val);
    }
    setShowBreakPicker(false);
    setShowCustomBreak(false);
    setCustomBreakText('');
  };

  // Calendar navigation — tap day → show inline detail panel below grid
  const handleDateSelect = useCallback((date: Date) => {
    if (isFutureDay(date)) return;

    // Load day data for inline panel
    const data = hookUserId ? getDailyHours(hookUserId, toLocalDateString(date)) : null;
    setDayDetailDate(date);
    setDayDetailData(data && data.total_minutes > 0 ? data : null);
  }, [hookUserId]);


  // ============================================
  // RENDER
  // ============================================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <KeyboardAvoidingView
        style={logStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          style={logStyles.scrollView}
          contentContainerStyle={logStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ===== HEADER (logo + avatar) ===== */}
          <View style={logStyles.greetingRow}>
            <Image
              source={require('../../logo.png')}
              style={logStyles.greetingLogo}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }} />
            <AvatarCircle
              name={getUserName()}
              onPress={() => router.push('/(tabs)/settings')}
            />
          </View>

          {/* ===== CONTENT CARD ===== */}
          <Animated.View style={[logStyles.contentCard, { backgroundColor: cardBgColor }]}>

          {/* Edit mode banner — Amber Envelope (top of card) */}
          {isEditingPastDate && (
            <View style={logStyles.editBanner}>
              <View style={logStyles.editBannerAccent} />
              <Ionicons name="pencil" size={18} color="#92400E" />
              <Text style={logStyles.editBannerText}>
                Editing: {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <PressableOpacity
                style={logStyles.editBannerCloseBtn}
                onPress={() => { setSelectedDate(new Date()); setCalendarMonth(new Date()); }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#92400E" />
              </PressableOpacity>
            </View>
          )}

          {/* ===== TOP CHIPS ROW (Location + Date) ===== */}
          <View style={logStyles.topChipsRow}>
            {/* Location chip — behavior depends on auto-log state */}
            <View style={logStyles.chipHalf}>
            {!autoLoggingEnabled ? (
              /* AUTO-LOG OFF: Free text input for location name (optional) */
              <View style={logStyles.chip}>
                <Text style={logStyles.chipLabel}>LOCATION</Text>
                <View style={logStyles.chipContent}>
                  <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                  <TextInput
                    style={logStyles.chipInput}
                    placeholder="Location (optional)"
                    placeholderTextColor={colors.inputPlaceholder}
                    value={manualLocationText}
                    onChangeText={setManualLocationText}
                    maxLength={40}
                  />
                </View>
              </View>
            ) : showTypeLocation ? (
              <View style={[logStyles.chip, logStyles.chipActive]}>
                <Text style={logStyles.chipLabel}>LOCATION</Text>
                <View style={logStyles.chipContent}>
                  <Ionicons name="business-outline" size={20} color={colors.textSecondary} />
                  <TextInput
                    style={logStyles.chipInput}
                    placeholder="Location name..."
                    placeholderTextColor={colors.inputPlaceholder}
                    value={manualLocationText}
                    onChangeText={setManualLocationText}
                    onSubmitEditing={() => setShowTypeLocation(false)}
                    onBlur={() => setShowTypeLocation(false)}
                    maxLength={40}
                    autoFocus
                  />
                </View>
              </View>
            ) : locations.length === 0 && !manualLocationText ? (
              /* No locations — link to Locations tab */
              <PressableOpacity
                style={logStyles.chip}
                onPress={() => router.push('/(tabs)/map')}
                activeOpacity={0.7}
              >
                <Text style={logStyles.chipLabel}>LOCATION</Text>
                <View style={logStyles.chipContent}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={[logStyles.chipText, { color: colors.primary }]} numberOfLines={1}>Add jobsite</Text>
                </View>
              </PressableOpacity>
            ) : (
              <PressableOpacity
                style={[logStyles.chip, showLocationPicker && logStyles.chipActive]}
                onPress={() => {
                  if (currentSession) return; // Active session — locked to current location
                  if (locations.length <= 1 && !manualLocationText) return; // Single location — no dropdown
                  setShowLocationPicker(!showLocationPicker);
                }}
                activeOpacity={currentSession || (locations.length <= 1 && !manualLocationText) ? 1 : 0.7}
              >
                <Text style={logStyles.chipLabel}>LOCATION</Text>
                <View style={logStyles.chipContent}>
                  {currentSession ? (
                    <View style={[logStyles.locationDot, { backgroundColor: colors.success }]} />
                  ) : selectedLocation ? (
                    <View style={[logStyles.locationDot, { backgroundColor: (selectedLocation as any)?.color || colors.primary }]} />
                  ) : manualLocationText ? (
                    <Ionicons name="business-outline" size={20} color={colors.textSecondary} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.primary} />
                  )}
                  <Text style={logStyles.chipText} numberOfLines={1}>
                    {currentSession?.location_name || selectedLocation?.name || manualLocationText || 'Select'}
                  </Text>
                </View>
              </PressableOpacity>
            )}
            </View>

            {/* Date chip */}
            <View ref={dateChipRef} collapsable={false} style={logStyles.chipHalf}>
            <PressableOpacity
              style={logStyles.chip}
              onPress={() => {
                setShowLocationPicker(false);
                setCalendarMonth(selectedDate);
                setShowDatePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={logStyles.chipLabel}>DATE</Text>
              <View style={logStyles.chipContent}>
                <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                <Text style={logStyles.chipText} numberOfLines={1}>
                  {formatDateCard(selectedDate)}
                </Text>
              </View>
            </PressableOpacity>
            </View>
          </View>

          {/* ===== INLINE LOCATION DROPDOWN (only for 2+ locations, only when auto-log ON) ===== */}
          {autoLoggingEnabled && showLocationPicker && locations.length > 1 && (
            <View style={logStyles.dropdown}>
              {locations.map((loc) => (
                <PressableOpacity
                  key={loc.id}
                  style={[logStyles.dropdownItem, loc.id === manualLocationId && logStyles.dropdownItemSelected]}
                  onPress={() => {
                    setManualLocationId(loc.id);
                    setManualLocationText('');
                    setShowLocationPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[logStyles.dropdownDot, { backgroundColor: (loc as any).color || colors.primary }]} />
                  <Text style={logStyles.dropdownItemText} numberOfLines={1}>{loc.name}</Text>
                  {loc.id === manualLocationId && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </PressableOpacity>
              ))}
            </View>
          )}

          {/* Success banner — Green Flash after save */}
          {showSuccessBanner && (
            <View style={logStyles.successBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
              <Text style={logStyles.successBannerText}>{successMessage}</Text>
            </View>
          )}

          {currentSession && !isEditingPastDate && autoLoggingEnabled ? (
            /* ===== STATE C: Auto-logging Live Dashboard (only for today + auto-log ON) ===== */
            <>
              <Text style={logStyles.yourDayLabel}>YOUR DAY</Text>
              <View style={logStyles.timeCardsRow}>
                <PressableOpacity style={logStyles.timeCard} onPress={showLockedFieldFeedback} activeOpacity={0.85}>
                  <View style={logStyles.timeLabelRow}>
                    <Text style={[logStyles.timeLabel, { marginBottom: 0 }]}>IN</Text>
                    <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
                  </View>
                  <Text style={logStyles.timeValue}>
                    {splitTimeDisplay(new Date(currentSession.entry_at)).time}
                  </Text>
                  <Text style={logStyles.timePeriod}>
                    {splitTimeDisplay(new Date(currentSession.entry_at)).period}
                  </Text>
                </PressableOpacity>
                <Text style={logStyles.timeArrow}>{'\u2192'}</Text>
                <PressableOpacity style={[logStyles.timeCard, logStyles.timeCardMuted]} onPress={showLockedFieldFeedback} activeOpacity={0.85}>
                  <View style={logStyles.timeLabelRow}>
                    <Text style={[logStyles.timeLabel, { marginBottom: 0 }]}>OUT</Text>
                    <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
                  </View>
                  <Text style={logStyles.timeValueMuted}>{'\u2014'}</Text>
                  <Text style={logStyles.timeSubtext}>in progress</Text>
                </PressableOpacity>
              </View>

              {/* Locked field snackbar — inline below IN/OUT */}
              {showLockedSnackbar && (
                <Animated.View
                  style={[
                    snackbarStyles.inline,
                    {
                      opacity: snackbarAnim,
                      transform: [{ translateY: snackbarAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                    },
                  ]}
                >
                  <View style={snackbarStyles.content}>
                    <Ionicons name="lock-closed" size={14} color={colors.white} />
                    <Text style={snackbarStyles.text}>Auto-tracking active</Text>
                  </View>
                  <PressableOpacity
                    style={snackbarStyles.actionBtn}
                    onPress={() => { dismissSnackbar(); handleStop(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={snackbarStyles.actionText}>STOP TIMER</Text>
                  </PressableOpacity>
                </Animated.View>
              )}

              {/* Break — show accumulated pause */}
              <View style={logStyles.breakPill}>
                <View style={logStyles.breakLeft}>
                  <Text style={logStyles.breakLabelText}>Break</Text>
                </View>
                <View style={logStyles.breakRight}>
                  <Text style={logStyles.breakValue}>{pauseLabel}</Text>
                </View>
              </View>

              <View style={logStyles.totalHero}>
                <Text style={logStyles.totalHeroValue}>
                  {timerMinutes > 0 ? formatDuration(timerMinutes) : '0h'}
                </Text>
                <View style={logStyles.autoLogBadge}>
                  <View style={logStyles.autoLogDot} />
                  <Text style={logStyles.autoLogText}>auto-logging active</Text>
                </View>
              </View>

              <View style={logStyles.saveBtnDisabled}>
                <Text style={logStyles.saveBtnDisabledText}>Waiting for exit...</Text>
              </View>
            </>
          ) : (
            /* ===== MANUAL ENTRY FORM ===== */
            <>
              <Text style={logStyles.yourDayLabel}>YOUR DAY</Text>
              <View ref={timeCardsRef} collapsable={false} style={logStyles.timeCardsRow}>
                <PressableOpacity
                  style={logStyles.timeCard}
                  onPress={() => Platform.OS === 'android' ? openAndroidTimePicker('entry') : setActiveTimePicker('entry')}
                  activeOpacity={0.7}
                >
                  <Text style={logStyles.timeLabel}>IN</Text>
                  {hasEntryTime ? (
                    <>
                      <Text style={logStyles.timeValue}>
                        {splitTimeDisplay(entryTime).time}
                      </Text>
                      <Text style={logStyles.timePeriod}>
                        {splitTimeDisplay(entryTime).period}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={logStyles.timeValueMuted}>{'\u2014'}</Text>
                      <Text style={logStyles.timeSubtext}>tap to set</Text>
                    </>
                  )}
                </PressableOpacity>
                <Text style={logStyles.timeArrow}>{'\u2192'}</Text>
                <PressableOpacity
                  style={logStyles.timeCard}
                  onPress={() => Platform.OS === 'android' ? openAndroidTimePicker('exit') : setActiveTimePicker('exit')}
                  activeOpacity={0.7}
                >
                  <Text style={logStyles.timeLabel}>OUT</Text>
                  {hasExitTime ? (
                    <>
                      <Text style={logStyles.timeValue}>
                        {splitTimeDisplay(exitTime).time}
                      </Text>
                      <Text style={logStyles.timePeriod}>
                        {splitTimeDisplay(exitTime).period}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={logStyles.timeValueMuted}>{'\u2014'}</Text>
                      <Text style={logStyles.timeSubtext}>tap to set</Text>
                    </>
                  )}
                </PressableOpacity>
              </View>

              {/* Break */}
              <PressableOpacity
                style={logStyles.breakPill}
                onPress={() => setShowBreakPicker(true)}
                activeOpacity={0.7}
              >
                <View style={logStyles.breakLeft}>
                  <Text style={logStyles.breakLabelText}>Break</Text>
                </View>
                <View style={logStyles.breakRight}>
                  <Text style={logStyles.breakValue}>{breakLabel}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </View>
              </PressableOpacity>

              {/* Notes — collapsible inline input */}
              {showNotesInput ? (
                <View style={logStyles.notesPill}>
                  <View style={logStyles.notesHeader}>
                    <View style={logStyles.breakLeft}>
                      <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                      <Text style={logStyles.breakLabelText}>Note</Text>
                    </View>
                    <PressableOpacity
                      onPress={() => { setShowNotesInput(false); setNotesText(''); }}
                      activeOpacity={0.7}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close" size={16} color={colors.textMuted} />
                    </PressableOpacity>
                  </View>
                  <TextInput
                    style={logStyles.notesInput}
                    value={notesText}
                    onChangeText={setNotesText}
                    placeholder="Rain delay, concrete pour..."
                    placeholderTextColor={colors.inputPlaceholder}
                    multiline
                    numberOfLines={2}
                    maxLength={200}
                    textAlignVertical="top"
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'logBreakInputDone' } : {})}
                  />
                </View>
              ) : (
                <PressableOpacity
                  style={logStyles.notesLink}
                  onPress={() => setShowNotesInput(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
                  <Text style={logStyles.notesLinkText}>Add a note</Text>
                </PressableOpacity>
              )}

              {/* Total */}
              <View style={logStyles.totalHero}>
                <Text style={logStyles.totalHeroValue}>
                  {totalMinutes > 0 ? formatDuration(totalMinutes) : '0h'}
                </Text>
                <Text style={logStyles.totalHeroSub}>
                  {isEditingPastDate
                    ? (daySource ? `total \u00B7 ${sourceLabel(daySource)}` : 'total')
                    : (daySource ? `total today \u00B7 ${sourceLabel(daySource)}` : 'total today')}
                </Text>
              </View>

              {/* Save */}
              <PressableOpacity
                style={[logStyles.saveBtn, isSaving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                <Text style={logStyles.saveBtnText}>
                  {isSaving ? 'Saving...' : isEditingPastDate ? 'Update Hours' : 'Save Hours'}
                </Text>
              </PressableOpacity>

              {/* Clear hours — only when editing a past date */}
              {isEditingPastDate && (
                <PressableOpacity
                  style={logStyles.clearBtn}
                  onPress={handleClearHours}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={logStyles.clearBtnText}>Clear Hours</Text>
                </PressableOpacity>
              )}

              {/* Auto-log nudge moved to timer bar */}
            </>
          )}

          </Animated.View>
          {/* END CONTENT CARD */}

          {/* ===== TIMER BAR — 5 states, always visible except past dates ===== */}
          {!isEditingPastDate && (() => {
            const hasLocations = locations.length > 0;

            // State determination:
            // A = auto-log OFF (or ON with no locations — same visual)
            // B = ON + has locations + outside fence (waiting)
            // C = ON + inside fence + actively tracking
            // D = ON + inside fence + paused
            // E = ON + inside fence + manually stopped
            type TimerState = 'A' | 'B' | 'C' | 'D' | 'E';
            const timerState: TimerState = (() => {
              if (!autoLoggingEnabled || !hasLocations) return 'A';
              if (!currentSession && !isManuallyStopped) return 'B';
              if (currentSession && isPaused) return 'D';
              if (isManuallyStopped) return 'E';
              if (currentSession) return 'C';
              return 'B';
            })();

            const isLive = timerState === 'C';
            const showControls = timerState === 'C' || timerState === 'D' || timerState === 'E';
            const fenceName = activeLocation?.name || currentSession?.location_name || locations[0]?.name || 'location';

            return (
              <View ref={timerBarRef} collapsable={false} style={[timerBarStyles.card, { marginHorizontal: 0 }]}>
                {/* Row 1: Stopwatch + controls on the right */}
                <View style={timerBarStyles.stopwatchRow}>
                  <Text style={[
                    timerBarStyles.stopwatch,
                    !isLive && !(timerState === 'D' || timerState === 'E') && timerBarStyles.stopwatchMuted,
                  ]}>
                    {isLive ? timer : (timerState === 'D' || timerState === 'E') ? timer : '00:00:00'}
                  </Text>
                  {timerState === 'D' && (
                    <Text style={timerBarStyles.pausedLabel}>{'\u23F8'} paused</Text>
                  )}
                  {timerState === 'E' && (
                    <Text style={timerBarStyles.stoppedLabel}>{'\u25A0'} stopped</Text>
                  )}
                  {/* Controls inline — right side of stopwatch row */}
                  {showControls && (
                    <View style={timerBarStyles.controlsInline}>
                      {(timerState === 'D' || timerState === 'E') && (
                        <PressableOpacity
                          style={timerBarStyles.controlBtn}
                          onPress={timerState === 'D' ? handleResume : handleRestart}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="play" size={14} color="#FFFFFF" />
                        </PressableOpacity>
                      )}
                      {timerState === 'C' && (
                        <PressableOpacity
                          style={timerBarStyles.controlBtn}
                          onPress={handlePause}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pause" size={14} color="#FFFFFF" />
                        </PressableOpacity>
                      )}
                      {(timerState === 'C' || timerState === 'D') && (
                        <PressableOpacity
                          style={timerBarStyles.controlBtnStop}
                          onPress={handleStop}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="stop" size={14} color={colors.error} />
                        </PressableOpacity>
                      )}
                    </View>
                  )}
                </View>

                {/* Row 2: Toggle row — all states */}
                <View style={timerBarStyles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    {timerState === 'A' ? (
                      <>
                        <Text style={timerBarStyles.toggleLabel}>Enable auto-log?</Text>
                        <Text style={timerBarStyles.toggleSub}>
                          Your hours will be logged automatically
                        </Text>
                      </>
                    ) : timerState === 'B' ? (
                      <>
                        <Text style={timerBarStyles.toggleLabel}>Auto-log</Text>
                        <Text style={timerBarStyles.toggleSub}>
                          Waiting for arrival at {fenceName}
                        </Text>
                      </>
                    ) : timerState === 'C' || timerState === 'D' ? (
                      <>
                        <Text style={timerBarStyles.toggleLabel}>Auto-log</Text>
                        <View style={timerBarStyles.statusRow}>
                          <View style={timerBarStyles.greenDot} />
                          <Text style={timerBarStyles.statusActive}>
                            {timerState === 'D' ? `At ${fenceName}` : `Active at ${fenceName}`}
                          </Text>
                        </View>
                      </>
                    ) : (
                      /* State E */
                      <>
                        <Text style={timerBarStyles.toggleLabel}>Auto-log</Text>
                        <Text style={timerBarStyles.toggleSub}>Timer stopped manually</Text>
                      </>
                    )}
                  </View>
                  <Switch
                    value={autoLoggingEnabled}
                    onValueChange={(val) => {
                      if (val && !hasLocations) {
                        Alert.alert(
                          'Add a work location first',
                          'You need to add a location on the map so we know when to start the timer.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Go to Locations', onPress: () => router.push('/(tabs)/map') },
                          ]
                        );
                        handleAutoLogToggle(true);
                        return;
                      }
                      handleAutoLogToggle(val);
                    }}
                    disabled={isTogglingAutoLog}
                    trackColor={{ false: '#555', true: colors.primarySoft }}
                    thumbColor={autoLoggingEnabled ? colors.primary : '#f4f3f4'}
                  />
                </View>
              </View>
            );
          })()}

        </ScrollView>

        {/* ===== BREAK PICKER MODAL ===== */}
        <Modal
          visible={showBreakPicker}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setShowBreakPicker(false);
            setShowCustomBreak(false);
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
          <Pressable
            style={modalStyles.overlay}
            onPress={() => {
              setShowBreakPicker(false);
              setShowCustomBreak(false);
            }}
          >
            <View style={modalStyles.sheet}>
              <Text style={modalStyles.sheetTitle}>Break Duration</Text>
              {BREAK_PRESETS.map((preset) => (
                <PressableOpacity
                  key={preset.value}
                  style={[
                    modalStyles.sheetOption,
                    breakMinutes === preset.value && modalStyles.sheetOptionSelected,
                  ]}
                  onPress={() => handleSelectBreak(preset.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    modalStyles.sheetOptionText,
                    breakMinutes === preset.value && modalStyles.sheetOptionTextSelected,
                  ]}>
                    {preset.label}
                  </Text>
                  {breakMinutes === preset.value && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </PressableOpacity>
              ))}

              {/* Custom option */}
              {!showCustomBreak ? (
                <PressableOpacity
                  style={modalStyles.sheetOption}
                  onPress={() => setShowCustomBreak(true)}
                  activeOpacity={0.7}
                >
                  <Text style={modalStyles.sheetOptionText}>Custom...</Text>
                </PressableOpacity>
              ) : (
                <View style={modalStyles.customBreakRow}>
                  <TextInput
                    style={modalStyles.customBreakInput}
                    value={customBreakText}
                    onChangeText={(t) => setCustomBreakText(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="Minutes"
                    placeholderTextColor={colors.inputPlaceholder}
                    autoFocus
                    {...(Platform.OS === 'ios' ? { inputAccessoryViewID: 'logBreakInputDone' } : {})}
                  />
                  <PressableOpacity
                    style={modalStyles.customBreakSave}
                    onPress={handleCustomBreakSave}
                  >
                    <Text style={modalStyles.customBreakSaveText}>Set</Text>
                  </PressableOpacity>
                </View>
              )}

              <PressableOpacity
                style={modalStyles.sheetCancel}
                onPress={() => {
                  setShowBreakPicker(false);
                  setShowCustomBreak(false);
                }}
              >
                <Text style={modalStyles.sheetCancelText}>Cancel</Text>
              </PressableOpacity>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* ===== DATE PICKER MODAL (Calendar) ===== */}
        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => { setShowDatePicker(false); setDayDetailDate(null); setDayDetailData(null); }}
        >
          <Pressable
            style={[modalStyles.overlay, { justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => { setShowDatePicker(false); setDayDetailDate(null); setDayDetailData(null); }}
          >
            <Pressable style={calendarCenteredStyle} onPress={() => {}}>
              <PressableOpacity
                style={logStyles.calendarClose}
                onPress={() => { setShowDatePicker(false); setDayDetailDate(null); setDayDetailData(null); }}
                activeOpacity={0.6}
              >
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </PressableOpacity>
              <Calendar
                currentMonth={calendarMonth}
                onMonthChange={(m) => { setCalendarMonth(m); setDayDetailDate(null); setDayDetailData(null); }}
                mode="single"
                selectedDate={dayDetailDate || selectedDate}
                onDateSelect={handleDateSelect}
                getDayMinutes={getCalendarDayMinutes}
                getDayHasNote={getCalendarDayHasNote}
                disableFutureDates
                showTodayButton
                onTodayPress={() => handleDateSelect(new Date())}
                containerWidth={CALENDAR_MODAL_WIDTH}
              />

              {/* ===== INLINE DAY DETAIL PANEL ===== */}
              {dayDetailDate && (
                <View style={calendarDetailStyles.panel}>
                  <View style={calendarDetailStyles.separator} />
                  <Text style={calendarDetailStyles.title}>
                    {dayDetailDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </Text>

                  {dayDetailData ? (
                    <>
                      <View style={calendarDetailStyles.row}>
                        <Text style={calendarDetailStyles.label}>IN</Text>
                        <Text style={calendarDetailStyles.value}>{dayDetailData.first_entry || '\u2014'}</Text>
                      </View>
                      <View style={calendarDetailStyles.row}>
                        <Text style={calendarDetailStyles.label}>OUT</Text>
                        <Text style={calendarDetailStyles.value}>{dayDetailData.last_exit || '\u2014'}</Text>
                      </View>
                      <View style={calendarDetailStyles.row}>
                        <Text style={calendarDetailStyles.label}>Break</Text>
                        <Text style={calendarDetailStyles.value}>
                          {dayDetailData.break_minutes ? `${dayDetailData.break_minutes} min` : '\u2014'}
                        </Text>
                      </View>
                      {dayDetailData.notes ? (
                        <View style={calendarDetailStyles.row}>
                          <Text style={calendarDetailStyles.label}>Note</Text>
                          <Text style={calendarDetailStyles.noteValue} numberOfLines={1}>
                            {dayDetailData.notes}
                          </Text>
                        </View>
                      ) : null}
                      <View style={calendarDetailStyles.rowTotal}>
                        <Text style={calendarDetailStyles.totalLabel}>Total</Text>
                        <Text style={calendarDetailStyles.totalValue}>
                          {formatDuration(dayDetailData.total_minutes)}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Text style={calendarDetailStyles.emptyText}>No hours logged</Text>
                  )}

                  <View style={calendarDetailStyles.buttons}>
                    <PressableOpacity
                      style={calendarDetailStyles.editBtn}
                      onPress={() => {
                        setSelectedDate(dayDetailDate);
                        setCalendarMonth(dayDetailDate);
                        setShowDatePicker(false);
                        setDayDetailDate(null);
                        setDayDetailData(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.buttonPrimaryText} />
                      <Text style={calendarDetailStyles.editBtnText}>
                        {dayDetailData ? 'Edit this day' : 'Log hours'}
                      </Text>
                    </PressableOpacity>
                    <PressableOpacity
                      style={calendarDetailStyles.closeBtn}
                      onPress={() => { setDayDetailDate(null); setDayDetailData(null); }}
                      activeOpacity={0.7}
                    >
                      <Text style={calendarDetailStyles.closeBtnText}>Close</Text>
                    </PressableOpacity>
                  </View>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ===== TIME PICKER ===== */}
        {/* iOS time picker — Android uses imperative DateTimePickerAndroid.open() */}
        {Platform.OS === 'ios' && activeTimePicker !== null && (
          <Modal
            visible
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setActiveTimePicker(null)}
          >
            <Pressable
              style={modalStyles.overlay}
              onPress={() => setActiveTimePicker(null)}
            >
              <Pressable style={timePickerStyles.sheet}>
                <Text style={modalStyles.sheetTitle}>
                  {activeTimePicker === 'entry' ? 'Entry Time' : 'Exit Time'}
                </Text>
                <DateTimePicker
                  value={activeTimePicker === 'entry' ? entryTime : exitTime}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  onChange={handleTimePickerChange}
                  minuteInterval={5}
                  style={{ height: 180, width: '100%' }}
                />
                <PressableOpacity
                  style={timePickerStyles.doneBtn}
                  onPress={() => setActiveTimePicker(null)}
                  activeOpacity={0.8}
                >
                  <Text style={timePickerStyles.doneBtnText}>Done</Text>
                </PressableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* iOS: Done button above number-pad keyboard */}
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="logBreakInputDone">
            <View style={iosKbStyles.bar}>
              <View style={{ flex: 1 }} />
              <PressableOpacity onPress={() => Keyboard.dismiss()} style={iosKbStyles.doneBtn}>
                <Text style={iosKbStyles.doneText}>Done</Text>
              </PressableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </KeyboardAvoidingView>

      {/* Day detail popup removed — now inline inside calendar modal */}

      {/* ===== ONBOARDING TOUR (first-time only) ===== */}
      <OnboardingTour
        refs={{ dateChip: dateChipRef, timeCards: timeCardsRef, timerBar: timerBarRef }}
        scrollViewRef={scrollViewRef}
      />
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const logStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number } : {}),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Content card — wraps everything below greeting
  contentCard: {
    flex: 1,
    justifyContent: 'space-evenly',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    ...shadows.sm,
  },

  // Greeting header
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greetingLogo: {
    width: 80,
    height: 28,
  },
  greetingText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 10,
  },

  // Top chips row (location + date side by side)
  topChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chipHalf: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  chipActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  chipInput: {
    flex: 1,
    width: 0,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    paddingVertical: 0,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  todayBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  todayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  // Location text input (no locations + map locked)
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 4,
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    paddingVertical: 0,
  },
  locationHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
    marginHorizontal: 4,
    lineHeight: 18,
  },
  locationHintLink: {
    color: colors.primary,
    fontWeight: '600',
  },

  // YOUR DAY label
  yourDayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Time cards (two separate cards in a row)
  timeCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  // Time cards (white bg, dark text, subtle border)
  timeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  timeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  timeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'] as any,
  },
  timePeriod: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  timeArrow: {
    fontSize: 22,
    color: colors.textMuted,
    alignSelf: 'center',
  },
  // Muted card (State C: OUT "in progress")
  timeCardMuted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderLight,
  },
  timeValueMuted: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  timeSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },

  // Break — inline row (no card)
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  breakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakLabelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  breakRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },

  // Notes — collapsible inline input
  notesPill: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notesInput: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    minHeight: 44,
    maxHeight: 80,
  },
  notesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  notesLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },

  // Total — hero number (no card)
  totalHero: {
    paddingVertical: 2,
    alignItems: 'center',
    marginBottom: 10,
  },
  totalHeroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  totalHeroValue: {
    fontSize: 42,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'] as any,
  },

  totalHeroSub: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Auto-logging active badge (State C)
  autoLogBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  autoLogDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  autoLogText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },

  // Save button — amber
  saveBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnDisabledText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...shadows.md,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.error,
  },

  // Edit mode — Amber Envelope banner
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F2D28B',
    overflow: 'hidden',
  },
  editBannerAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#C58B1B',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  editBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  editBannerReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(146, 64, 14, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBannerReturnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  editBannerCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(146, 64, 14, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Success banner — Green Flash
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  successBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },

  // Inline location dropdown
  dropdown: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
    ...shadows.md,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  dropdownItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  dropdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },

  // Calendar modal close button
  calendarClose: {
    position: 'absolute' as const,
    top: 6,
    right: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.inputBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

// ============================================
// TIME PICKER MODAL STYLES
// ============================================

const timePickerStyles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
    width: '100%',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 12,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});

// Calendar modal sheet style (calendar grid comes from shared Calendar component)
const CALENDAR_MODAL_WIDTH = Math.min(Dimensions.get('window').width * 0.92, 400);
const calendarCenteredStyle = {
  backgroundColor: colors.white,
  borderRadius: 20,
  paddingTop: 44,
  paddingBottom: 20,
  paddingHorizontal: 16,
  width: CALENDAR_MODAL_WIDTH,
};

// Legacy — kept for reference
const calendarSheetStyle = calendarCenteredStyle;

// ============================================
// MODAL STYLES (location picker, break picker)
// ============================================

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  sheetOptionSelected: {
    backgroundColor: colors.primarySoft,
  },
  sheetOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  sheetOptionTextSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  sheetCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Custom break input
  customBreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  customBreakInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customBreakSave: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  customBreakSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});

// ============================================
// TIMER BAR STYLES (bottom strip)
// ============================================

const timerBarStyles = StyleSheet.create({
  // Dark card
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.charcoal,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Toggle row (all states)
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  toggleSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // Status row (States C/D)
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.successTeal,
    marginRight: 6,
  },
  statusActive: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.successTeal,
  },

  // Stopwatch row (top of card — timer left, controls right)
  stopwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopwatch: {
    fontSize: 24,
    fontWeight: '500',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: 1,
  },
  stopwatchMuted: {
    opacity: 0.3,
  },
  pausedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  stoppedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.error,
  },

  // Controls inline (right side of stopwatch row)
  controlsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  controlBtnStop: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
  },
});


// ============================================
// iOS KEYBOARD ACCESSORY
// ============================================

const iosKbStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
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
// DAY DETAIL POPUP (Fix 1.2)
// ============================================

const dayPopupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadows.lg,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 10,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sourceTag: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  editBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

// ============================================
// INLINE CALENDAR DETAIL PANEL STYLES
// ============================================

const calendarDetailStyles = StyleSheet.create({
  panel: {
    paddingTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  noteValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'right',
    marginLeft: 12,
  },
  rowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.buttonPrimary,
    borderRadius: 10,
    paddingVertical: 11,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

const snackbarStyles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
});
