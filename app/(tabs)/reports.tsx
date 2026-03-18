/**
 * Log Screen - OnSite Timekeeper
 *
 * Clean, focused manual time entry form.
 * Replaces the old calendar-based Reports screen.
 *
 * Layout: Greeting -> Location -> Entry/Exit pickers -> Break -> Total -> Save
 * Bottom: Timer bar (tap to expand timer modal)
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  Platform,
  InputAccessoryView,
  Keyboard,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { colors, withOpacity, shadows } from '../../src/constants/colors';
import { useHomeScreen } from '../../src/screens/home/hooks';

// ============================================
// HELPERS
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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDateHeader(date: Date): string {
  return `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function formatTimeDisplay(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}

const BREAK_PRESETS = [
  { label: 'No break', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
];

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsScreen() {
  const router = useRouter();

  const {
    userName,
    userId,

    // Timer
    currentSession,
    activeLocation,
    timer,
    isPaused,
    pauseTimer,
    cooldownSeconds,
    handlePause,
    handleResume,
    handleStop,

    onRefresh,

    // Manual entry form state
    manualLocationId,
    setManualLocationId,
    setManualEntryH,
    setManualEntryM,
    setManualExitH,
    setManualExitM,
    setManualPause,
    setManualDate,
    setManualEntryMode,
    setManualAbsenceType,
    handleSaveManual,

    locations,
    formatDuration,
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
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [showExitPicker, setShowExitPicker] = useState(false);

  // Break
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [customBreakText, setCustomBreakText] = useState('');
  const [showCustomBreak, setShowCustomBreak] = useState(false);

  // Location selector
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Timer modal
  const [timerModalVisible, setTimerModalVisible] = useState(false);
  const userMinimizedRef = useRef(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // ============================================
  // EFFECTS
  // ============================================

  // Auto-open timer modal when session starts
  useEffect(() => {
    if (currentSession) {
      if (!userMinimizedRef.current) {
        setTimerModalVisible(true);
      }
    } else {
      setTimerModalVisible(false);
      userMinimizedRef.current = false;
    }
  }, [!!currentSession]);

  const minimizeTimer = useCallback(() => {
    userMinimizedRef.current = true;
    setTimerModalVisible(false);
  }, []);

  const expandTimer = useCallback(() => {
    userMinimizedRef.current = false;
    setTimerModalVisible(true);
  }, []);

  // Focus effect: reload data + auto-select location
  useFocusEffect(
    useCallback(() => {
      onRefresh();
      setManualDate(new Date());
      if (locations.length > 0 && !manualLocationId) {
        setManualLocationId(locations[0].id);
      }
    }, [])
  );

  // ============================================
  // COMPUTED
  // ============================================

  const totalMinutes = useMemo(() => {
    const entryMins = entryTime.getHours() * 60 + entryTime.getMinutes();
    const exitMins = exitTime.getHours() * 60 + exitTime.getMinutes();
    const total = exitMins - entryMins - breakMinutes;
    return total > 0 ? total : 0;
  }, [entryTime, exitTime, breakMinutes]);

  const selectedLocation = useMemo(() => {
    return locations.find(l => l.id === manualLocationId) || null;
  }, [locations, manualLocationId]);

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

  const handleEntryTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEntryPicker(false);
    }
    if (selectedDate) {
      setEntryTime(selectedDate);
    }
  };

  const handleExitTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowExitPicker(false);
    }
    if (selectedDate) {
      setExitTime(selectedDate);
    }
  };

  const handleSave = async () => {
    if (!manualLocationId) {
      const { Alert } = require('react-native');
      Alert.alert('No Location', 'Please select a work location first.');
      return;
    }

    if (totalMinutes <= 0) {
      const { Alert } = require('react-native');
      Alert.alert('Invalid Time', 'Exit time must be after entry time (accounting for break).');
      return;
    }

    setIsSaving(true);

    try {
      // Set all state values the hook expects
      setManualDate(new Date());
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

      // Pass 24h values directly to avoid state race condition
      await handleSaveManual({ entryH: eH, exitH: xH });
    } finally {
      setIsSaving(false);
    }
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

  // ============================================
  // RENDER
  // ============================================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={logStyles.container}>
        <ScrollView
          style={logStyles.scrollView}
          contentContainerStyle={logStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ===== GREETING HEADER ===== */}
          <View style={logStyles.header}>
            <View style={logStyles.headerLeft}>
              <Text style={logStyles.greeting}>
                {getGreeting()}, {userName || 'there'}
              </Text>
              <Text style={logStyles.dateText}>
                {formatDateHeader(new Date())}
              </Text>
            </View>
            <View style={logStyles.avatar}>
              <Text style={logStyles.avatarText}>
                {getInitials(userName || '')}
              </Text>
            </View>
          </View>

          {/* ===== LOCATION SELECTOR ===== */}
          <Text style={logStyles.sectionLabel}>WORK LOCATION</Text>
          {locations.length === 0 ? (
            <PressableOpacity
              style={logStyles.locationPill}
              onPress={() => router.push('/(tabs)/map')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[logStyles.locationPillText, { color: colors.primary }]}>
                Add a location
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </PressableOpacity>
          ) : locations.length === 1 ? (
            <View style={logStyles.locationPill}>
              <View style={[logStyles.locationDot, { backgroundColor: (locations[0] as any).color || colors.primary }]} />
              <Text style={logStyles.locationPillText} numberOfLines={1}>
                {locations[0].name}
              </Text>
            </View>
          ) : (
            <PressableOpacity
              style={logStyles.locationPill}
              onPress={() => setShowLocationPicker(true)}
              activeOpacity={0.7}
            >
              <View style={[logStyles.locationDot, { backgroundColor: (selectedLocation as any)?.color || colors.primary }]} />
              <Text style={logStyles.locationPillText} numberOfLines={1}>
                {selectedLocation?.name || 'Select location'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </PressableOpacity>
          )}

          {/* ===== TIME INPUTS ===== */}
          <View style={logStyles.timeRow}>
            {/* Entry */}
            <View style={logStyles.timeCol}>
              <Text style={logStyles.timeLabel}>ENTRY</Text>
              <PressableOpacity
                style={logStyles.timePill}
                onPress={() => setShowEntryPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={logStyles.timeValue}>
                  {formatTimeDisplay(entryTime)}
                </Text>
              </PressableOpacity>
              {showEntryPicker && (
                Platform.OS === 'ios' ? (
                  <View style={logStyles.pickerInline}>
                    <DateTimePicker
                      value={entryTime}
                      mode="time"
                      display="spinner"
                      onChange={handleEntryTimeChange}
                      minuteInterval={5}
                      style={{ height: 120 }}
                    />
                    <PressableOpacity
                      style={logStyles.pickerDoneBtn}
                      onPress={() => setShowEntryPicker(false)}
                    >
                      <Text style={logStyles.pickerDoneBtnText}>Done</Text>
                    </PressableOpacity>
                  </View>
                ) : (
                  <DateTimePicker
                    value={entryTime}
                    mode="time"
                    display="default"
                    onChange={handleEntryTimeChange}
                  />
                )
              )}
            </View>

            {/* Exit */}
            <View style={logStyles.timeCol}>
              <Text style={logStyles.timeLabel}>EXIT</Text>
              <PressableOpacity
                style={logStyles.timePill}
                onPress={() => setShowExitPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={logStyles.timeValue}>
                  {formatTimeDisplay(exitTime)}
                </Text>
              </PressableOpacity>
              {showExitPicker && (
                Platform.OS === 'ios' ? (
                  <View style={logStyles.pickerInline}>
                    <DateTimePicker
                      value={exitTime}
                      mode="time"
                      display="spinner"
                      onChange={handleExitTimeChange}
                      minuteInterval={5}
                      style={{ height: 120 }}
                    />
                    <PressableOpacity
                      style={logStyles.pickerDoneBtn}
                      onPress={() => setShowExitPicker(false)}
                    >
                      <Text style={logStyles.pickerDoneBtnText}>Done</Text>
                    </PressableOpacity>
                  </View>
                ) : (
                  <DateTimePicker
                    value={exitTime}
                    mode="time"
                    display="default"
                    onChange={handleExitTimeChange}
                  />
                )
              )}
            </View>
          </View>

          {/* ===== BREAK SELECTOR ===== */}
          <PressableOpacity
            style={logStyles.breakPill}
            onPress={() => setShowBreakPicker(true)}
            activeOpacity={0.7}
          >
            <View style={logStyles.breakLeft}>
              <Ionicons name="cafe-outline" size={18} color={colors.textSecondary} />
              <Text style={logStyles.breakLabelText}>Break</Text>
            </View>
            <View style={logStyles.breakRight}>
              <Text style={logStyles.breakValue}>{breakLabel}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
          </PressableOpacity>

          {/* ===== TOTAL ===== */}
          <View style={logStyles.totalPill}>
            <Text style={logStyles.totalLabel}>TOTAL</Text>
            <Text style={logStyles.totalValue}>
              {totalMinutes > 0 ? formatDuration(totalMinutes) : '--'}
            </Text>
          </View>

          {/* ===== SAVE BUTTON ===== */}
          <PressableOpacity
            style={[logStyles.saveBtn, isSaving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            <Text style={logStyles.saveBtnText}>
              {isSaving ? 'Saving...' : 'Save Hours'}
            </Text>
          </PressableOpacity>
        </ScrollView>

        {/* ===== LOCATION PICKER MODAL ===== */}
        <Modal
          visible={showLocationPicker}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setShowLocationPicker(false)}
        >
          <Pressable
            style={modalStyles.overlay}
            onPress={() => setShowLocationPicker(false)}
          >
            <View style={modalStyles.sheet}>
              <Text style={modalStyles.sheetTitle}>Select Location</Text>
              {locations.map((loc) => (
                <PressableOpacity
                  key={loc.id}
                  style={[
                    modalStyles.sheetOption,
                    loc.id === manualLocationId && modalStyles.sheetOptionSelected,
                  ]}
                  onPress={() => {
                    setManualLocationId(loc.id);
                    setShowLocationPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[modalStyles.sheetDot, { backgroundColor: (loc as any).color || colors.primary }]} />
                  <Text style={[
                    modalStyles.sheetOptionText,
                    loc.id === manualLocationId && modalStyles.sheetOptionTextSelected,
                  ]}>
                    {loc.name}
                  </Text>
                  {loc.id === manualLocationId && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </PressableOpacity>
              ))}
              <PressableOpacity
                style={modalStyles.sheetCancel}
                onPress={() => setShowLocationPicker(false)}
              >
                <Text style={modalStyles.sheetCancelText}>Cancel</Text>
              </PressableOpacity>
            </View>
          </Pressable>
        </Modal>

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
        </Modal>

        {/* ===== TIMER MODAL (overlay) ===== */}
        <Modal
          visible={timerModalVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={minimizeTimer}
        >
          <View style={timerModalStyles.overlay}>
            <View style={timerModalStyles.card}>
              {(() => {
                const isActive = !!currentSession && !isPaused;
                const isPausedState = !!currentSession && isPaused;
                const locationName = currentSession?.location_name || activeLocation?.name || null;

                return (
                  <>
                    {/* Location chip */}
                    <View style={[
                      heroStyles.chip,
                      isActive && heroStyles.chipActive,
                      isPausedState && heroStyles.chipPaused,
                    ]}>
                      <Ionicons
                        name="location"
                        size={13}
                        color={isActive ? colors.primary : isPausedState ? colors.amber : colors.iconMuted}
                      />
                      <Text style={[
                        heroStyles.chipText,
                        isActive && heroStyles.chipTextActive,
                        isPausedState && heroStyles.chipTextPaused,
                      ]} numberOfLines={1}>
                        {locationName || 'Timer'}
                      </Text>
                    </View>

                    {/* Timer display */}
                    <Text style={[
                      heroStyles.timer,
                      isActive && heroStyles.timerActive,
                      isPausedState && heroStyles.timerPaused,
                    ]}>
                      {currentSession ? timer : '00:00:00'}
                    </Text>

                    {/* Break line */}
                    {currentSession && (
                      <Text style={[
                        heroStyles.breakText,
                        isPausedState && heroStyles.breakTextPaused,
                      ]}>
                        {isPaused ? `break: ${pauseTimer}` : pauseTimer}
                      </Text>
                    )}

                    {/* Cooldown warning */}
                    {cooldownSeconds > 0 && (
                      <View style={heroStyles.cooldownRow}>
                        <Ionicons name="warning" size={14} color={colors.amber} />
                        <Text style={heroStyles.cooldownText}>
                          You left the location. Return within {cooldownSeconds}s or tracking stops.
                        </Text>
                      </View>
                    )}

                    {/* Progress bar */}
                    <View style={heroStyles.progressTrack}>
                      {isActive && <View style={[heroStyles.progressFill, { width: '100%' }]} />}
                      {isPausedState && <View style={[heroStyles.progressFillPaused, { width: '60%' }]} />}
                    </View>

                    {/* Action buttons */}
                    {currentSession && (
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
                    )}

                    {/* Minimize button */}
                    <PressableOpacity style={timerModalStyles.minimizeBtn} onPress={minimizeTimer} activeOpacity={0.7}>
                      <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                      <Text style={timerModalStyles.minimizeBtnText}>Minimize</Text>
                    </PressableOpacity>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* ===== TIMER BAR (bottom) ===== */}
        {(() => {
          const isActive = !!currentSession && !isPaused;
          const isPausedState = !!currentSession && isPaused;
          const locationName = currentSession?.location_name || activeLocation?.name || null;

          if (!currentSession) {
            return (
              <View style={timerBarStyles.bar}>
                <Ionicons name="time-outline" size={16} color={colors.iconMuted} />
                <Text style={timerBarStyles.inactiveText}>No active timer</Text>
              </View>
            );
          }

          return (
            <PressableOpacity style={timerBarStyles.bar} onPress={expandTimer} activeOpacity={0.7}>
              <View style={[
                timerBarStyles.dot,
                isActive && timerBarStyles.dotActive,
                isPausedState && timerBarStyles.dotPaused,
              ]} />
              <Text style={[
                timerBarStyles.timerText,
                isActive && timerBarStyles.timerTextActive,
                isPausedState && timerBarStyles.timerTextPaused,
              ]}>
                {timer}
              </Text>
              <Ionicons name="location" size={14} color={colors.textSecondary} />
              <Text style={timerBarStyles.locationText} numberOfLines={1}>
                {locationName || 'Timer'}
              </Text>
              <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
            </PressableOpacity>
          );
        })()}

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
      </View>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.darkSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  // Location pill
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
    ...shadows.sm,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  locationPillText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },

  // Time inputs
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  timePill: {
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    ...shadows.sm,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  pickerInline: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pickerDoneBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  pickerDoneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },

  // Break pill
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadows.sm,
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

  // Total pill
  totalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.darkSurface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: withOpacity(colors.white, 0.7),
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },

  // Save button
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...shadows.md,
  },
  saveBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
});

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
    fontWeight: '700',
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
  sheetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.darkSurface,
    borderTopWidth: 0,
  },
  inactiveText: {
    fontSize: 13,
    color: withOpacity(colors.white, 0.5),
    fontWeight: '500',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: withOpacity(colors.white, 0.4),
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  dotPaused: {
    backgroundColor: colors.amber,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    fontVariant: ['tabular-nums'] as any,
  },
  timerTextActive: {
    color: colors.primary,
  },
  timerTextPaused: {
    color: colors.amber,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: withOpacity(colors.white, 0.7),
    fontWeight: '500',
  },
});

// ============================================
// TIMER MODAL STYLES (overlay)
// ============================================

const timerModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    borderRadius: 24,
    gap: 8,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  minimizeBtnText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

// ============================================
// HERO STYLES (timer modal content)
// ============================================

const heroStyles = StyleSheet.create({
  // Location chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: withOpacity(colors.primary, 0.08),
    marginBottom: 10,
    maxWidth: '90%',
  },
  chipActive: {
    backgroundColor: withOpacity(colors.primary, 0.12),
  },
  chipPaused: {
    backgroundColor: withOpacity(colors.amber, 0.12),
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  chipTextActive: {
    color: colors.primary,
  },
  chipTextPaused: {
    color: colors.amber,
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
    color: colors.primary,
  },
  timerPaused: {
    color: colors.amber,
    opacity: 0.85,
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
    backgroundColor: colors.primary,
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
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: colors.primary,
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
});

// ============================================
// iOS KEYBOARD ACCESSORY
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
