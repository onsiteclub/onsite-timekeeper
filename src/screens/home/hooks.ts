/**
 * Home Screen Hook - OnSite Timekeeper
 * 
 * Custom hook that encapsulates all HomeScreen logic:
 * - States
 * - Effects
 * - Handlers
 * - Computed values
 * 
 * REFACTORED: All PT names removed, updated to use EN stores/methods
 * UPDATED: Removed session finished modal, added day detail modal with session selection
 * UPDATED: Added pending export handling for notification flow
 * FIX: Now uses currentFenceId instead of lastGeofenceEvent for START button (fixes button not appearing)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Share, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useAuthStore } from '../../stores/authStore';
import {
  useLocationStore,
  selectLocations,
  selectActiveGeofence,
  selectIsGeofencingActive,
  selectCurrentFenceId,
} from '../../stores/locationStore';
import { useDailyLogStore } from '../../stores/dailyLogStore';
import { useSyncStore } from '../../stores/syncStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDuration, getDailyHoursByPeriod, upsertDailyHours, updateDailyHours, deleteDailyHours, deleteDailyHoursById, getToday } from '../../lib/database';
import type { DailyHoursEntry } from '../../lib/database/daily';
import { getActiveTrackingState, type ActiveTracking } from '../../lib/exitHandler';
import { generateCompleteReport } from '../../lib/reports';

import {
  WEEKDAYS,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getMonthCalendarDays,
  formatDateRange,
  formatMonthYear,
  formatTimeAMPM,
  isSameDay,
  isToday,
  isFutureDay,
  isWeekend,
  getDayKey,
  DAY_TAGS,
  type CalendarDay,
  type DayTagType,
} from './helpers';

// ============================================
// V3: ComputedSession replaced by DailyHoursEntry
// LegacySession provides backward compatibility for UI
// ============================================

export interface LegacySession {
  id: string;
  location_id: string;
  location_name: string | null;
  entry_at: string;
  exit_at: string | null;
  duration_minutes: number;
  pause_minutes: number;
  status: 'active' | 'finished';
  type: 'automatic' | 'manual';
  // V3 additions for full Reports compatibility
  color?: string;
  manually_edited?: number;
  edit_reason?: string;
}

// Export alias for files that still use ComputedSession name
export type ComputedSession = LegacySession;

// Helper to convert DailyHoursEntry to legacy session format for UI compatibility
function dailyToLegacySession(entry: DailyHoursEntry, locationColor?: string): LegacySession {
  const entryTime = entry.first_entry
    ? new Date(`${entry.date}T${entry.first_entry}:00`).toISOString()
    : new Date(`${entry.date}T09:00:00`).toISOString();
  const exitTime = entry.last_exit
    ? new Date(`${entry.date}T${entry.last_exit}:00`).toISOString()
    : null;

  return {
    id: entry.id,
    location_id: entry.location_id || '',
    location_name: entry.location_name,
    entry_at: entryTime,
    exit_at: exitTime,
    duration_minutes: entry.total_minutes,
    pause_minutes: entry.break_minutes,
    status: exitTime ? 'finished' : 'active',
    type: entry.source === 'gps' ? 'automatic' : 'manual',
    color: locationColor,
    manually_edited: entry.source === 'edited' || entry.source === 'manual' ? 1 : 0,
    edit_reason: entry.notes || undefined,
  };
}




// ============================================
// HOOK
// ============================================

export function useHomeScreen() {
  // ============================================
  // STORES
  // ============================================
  
  const userName = useAuthStore(s => s.getUserName());
  const userId = useAuthStore(s => s.getUserId());
  
  // Using selectors for locationStore (proper Zustand pattern)
  const locations = useLocationStore(selectLocations);
  const activeGeofence = useLocationStore(selectActiveGeofence);
  const isGeofencingActive = useLocationStore(selectIsGeofencingActive);
  // NEW: Use currentFenceId instead of lastGeofenceEvent
  const currentFenceId = useLocationStore(selectCurrentFenceId);



  
  // V3: Use dailyLogStore and locationStore instead of recordStore
  const { reloadToday, todayLog } = useDailyLogStore();
  const { handleManualEntry, handleManualExit } = useLocationStore();

  // V3: Get current session from active_tracking
  const activeTracking = getActiveTrackingState();
  const currentSession = activeTracking
    ? {
        id: 'active',
        location_id: activeTracking.location_id,
        location_name: activeTracking.location_name,
        entry_at: activeTracking.enter_at,
        exit_at: null,
        duration_minutes: 0,
        pause_minutes: 0,
        status: 'active' as const,
        type: 'automatic' as const,
      }
    : null;

  // V3: Wrapper functions for backward compatibility
  const reloadData = async () => reloadToday();
  const registerExit = async (locationId: string) => handleManualExit(locationId);
  const registerEntry = async (locationId: string, _locationName: string) => handleManualEntry(locationId);

  // V3: Get sessions by period using daily_hours
  // FIX: Must be memoized - without useCallback, new function ref each render
  // causes loadMonthSessions → useEffect → setMonthSessions → re-render → infinite loop
  const getSessionsByPeriod = useCallback(async (startDate: string, endDate: string): Promise<ComputedSession[]> => {
    if (!userId) return [];
    const start = startDate.split('T')[0];
    const end = endDate.split('T')[0];
    const entries = getDailyHoursByPeriod(userId, start, end);
    // Map entries with location colors
    return entries.map(entry => {
      const location = locations.find(l => l.id === entry.location_id);
      return dailyToLegacySession(entry, location?.color);
    });
  }, [userId, locations]);

  // V3: Create manual record using daily_hours
  const createManualRecord = async (params: {
    locationId: string;
    locationName: string;
    entry: string;
    exit: string;
    pauseMinutes?: number;
    absenceType?: string;
  }) => {
    if (!userId) throw new Error('User not authenticated');

    const date = params.entry.split('T')[0];
    const entryTime = new Date(params.entry);
    const exitTime = new Date(params.exit);
    const durationMs = exitTime.getTime() - entryTime.getTime();
    const durationMinutes = Math.max(0, Math.round(durationMs / 60000) - (params.pauseMinutes || 0));

    const firstEntry = `${entryTime.getHours().toString().padStart(2, '0')}:${entryTime.getMinutes().toString().padStart(2, '0')}`;
    const lastExit = `${exitTime.getHours().toString().padStart(2, '0')}:${exitTime.getMinutes().toString().padStart(2, '0')}`;

    upsertDailyHours({
      userId,
      date,
      totalMinutes: durationMinutes,
      breakMinutes: params.pauseMinutes || 0,
      locationName: params.locationName,
      locationId: params.locationId,
      verified: false,
      source: 'manual',
      firstEntry,
      lastExit,
      notes: params.absenceType || undefined,
    });

    reloadToday();
  };

  // V3: Edit record using daily_hours
  const editRecord = async (
    _sessionId: string,
    updates: {
      entry_at?: string;
      exit_at?: string;
      pause_minutes?: number;
      manually_edited?: number;
      edit_reason?: string;
    }
  ) => {
    if (!userId) throw new Error('User not authenticated');
    // For V3, we update today's entry since we don't have session IDs
    const today = getToday();
    updateDailyHours(userId, today, {
      breakMinutes: updates.pause_minutes,
      source: 'edited',
    });
    reloadToday();
  };

  // V3: Delete record (deletes the daily entry by date or UUID)
  const deleteRecord = async (sessionId: string) => {
    if (!userId) throw new Error('User not authenticated');
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(sessionId);
    if (isDate) {
      deleteDailyHours(userId, sessionId);
    } else {
      deleteDailyHoursById(userId, sessionId);
    }
    reloadToday();
  };


   


  const { syncNow } = useSyncStore();

  // Pending export from notification
  const pendingReportExport = useSettingsStore(s => s.pendingReportExport);
  const clearPendingReportExport = useSettingsStore(s => s.clearPendingReportExport);

  // ============================================
  // STATES
  // ============================================
  
  const [refreshing, setRefreshing] = useState(false);
  const [timer, setTimer] = useState('00:00:00');
  const [isPaused, setIsPaused] = useState(false);

  // Pause timer
  const [accumulatedPauseSeconds, setAccumulatedPauseSeconds] = useState(0);
  const [pauseTimer, setPauseTimer] = useState('00:00:00');
  const [pauseStartTimestamp, setPauseStartTimestamp] = useState<number | null>(null);
  const [frozenTime, setFrozenTime] = useState<string | null>(null);

  // Calendar view mode
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  
  // Week view
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [weekSessions, setWeekSessions] = useState<ComputedSession[]>([]);
  
  // Month view
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthSessions, setMonthSessions] = useState<ComputedSession[]>([]);
  
  // Expanded day (for week view inline - DEPRECATED, keeping for compatibility)
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  

  // NEW: Day Detail Modal
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);
  
  // NEW: Session selection (inside day modal)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  // NEW: Session action modal (Edit/Delete on long press)
  const [showActionModal, setShowActionModal] = useState(false);
  const [sessionForAction, setSessionForAction] = useState<ComputedSession | null>(null);

  // NEW: Edit mode tracking
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // NEW: Inline editing mode (unified day card)
  const [isEditingInline, setIsEditingInline] = useState(false);

  // NEW: Export modal (for notification-triggered export)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalSessions, setExportModalSessions] = useState<ComputedSession[]>([]);
  const [exportModalPeriod, setExportModalPeriod] = useState<string>('');

  // Manual entry modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualDate, setManualDate] = useState<Date>(new Date());
  const [manualLocationId, setManualLocationId] = useState<string>('');
  // Separate fields HH:MM for better UX
  const [manualEntryH, setManualEntryH] = useState('');
  const [manualEntryM, setManualEntryM] = useState('');
  const [manualExitH, setManualExitH] = useState('');
  const [manualExitM, setManualExitM] = useState('');
  const [manualPause, setManualPause] = useState('');
  
  // Manual entry mode: 'hours' or 'absence'
  const [manualEntryMode, setManualEntryMode] = useState<'hours' | 'absence'>('hours');
  const [manualAbsenceType, setManualAbsenceType] = useState<string | null>(null);

  // Day Tags (Rain, Snow, Day Off, etc.)
  const [dayTags, setDayTags] = useState<Record<string, DayTagType>>({});
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagModalDate, setTagModalDate] = useState<Date | null>(null);

  // REMOVED: showSessionFinishedModal - was causing confusion

  // ============================================
  // DERIVED STATE
  // ============================================

  // FIX: Simplified logic using currentFenceId from store
  // currentFenceId already tracks which fence user is physically inside,
  // independent of whether there's an active session
  const activeLocation = currentFenceId ? locations.find(l => l.id === currentFenceId) : null;
  const canRestart = activeLocation && !currentSession;
  
  const sessions = viewMode === 'week' ? weekSessions : monthSessions;
  const weekStart = getWeekStart(currentWeek);
  const weekEnd = getWeekEnd(currentWeek);

  // Sessions for day modal
  const dayModalSessions = useMemo(() => {
    if (!selectedDayForModal) return [];
    return sessions.filter(s => {
      const sessionDate = new Date(s.entry_at);
      return isSameDay(sessionDate, selectedDayForModal);
    });
  }, [selectedDayForModal, sessions]);

  // ============================================
  // LOCATION CARDS DATA
  // ============================================
  
  // Active locations only (not deleted)
  const activeLocations = useMemo(() => {
    return locations.filter(l => l.status === 'active' && !l.deleted_at);
  }, [locations]);

  // Compute data for each location card
  const locationCardsData = useMemo(() => {
    // Use TODAY's sessions only for the carousel
    const todaySessions = weekSessions.filter(s => {
      const sessionDate = new Date(s.entry_at);
      return isToday(sessionDate) && s.exit_at;
    });

    const cards = activeLocations.map(location => {
      // Check if this location has active session
      const hasActiveSession = currentSession?.location_id === location.id;
      const activeSessionEntry = hasActiveSession ? currentSession?.entry_at : null;

      // Calculate total hours for this location TODAY
      const locationSessions = todaySessions.filter(s => s.location_id === location.id);
      const totalMinutes = locationSessions.reduce((acc, s) => {
        const pauseMin = s.pause_minutes || 0;
        return acc + Math.max(0, s.duration_minutes - pauseMin);
      }, 0);

      // Format coordinates as short string
      const coordsText = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;

      // Last check-in (most recent session for this location)
      const lastSession = [...sessions]
        .filter(s => s.location_id === location.id && s.exit_at)
        .sort((a, b) => new Date(b.entry_at).getTime() - new Date(a.entry_at).getTime())[0];
      
      let lastCheckIn = 'Never';
      if (lastSession) {
        const lastDate = new Date(lastSession.entry_at);
        if (isToday(lastDate)) {
          lastCheckIn = `Today, ${formatTimeAMPM(lastSession.entry_at)}`;
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (isSameDay(lastDate, yesterday)) {
            lastCheckIn = `Yesterday, ${formatTimeAMPM(lastSession.entry_at)}`;
          } else {
            lastCheckIn = lastDate.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            }) + `, ${formatTimeAMPM(lastSession.entry_at)}`;
          }
        }
      }

      return {
        id: location.id,
        name: location.name,
        color: location.color,
        coords: coordsText,
        hasActiveSession,
        activeSessionEntry: activeSessionEntry ? formatTimeAMPM(activeSessionEntry) : null,
        totalMinutes,
        totalFormatted: formatDuration(totalMinutes),
        lastCheckIn,
        sessionsCount: locationSessions.length,
      };
    });

    // Sort by: 1) Active session first, 2) Total minutes today (desc), 3) Alphabetical
    return cards.sort((a, b) => {
      // Active session always comes first
      if (a.hasActiveSession && !b.hasActiveSession) return -1;
      if (!a.hasActiveSession && b.hasActiveSession) return 1;

      // Sort by total minutes today (descending)
      if (a.totalMinutes !== b.totalMinutes) {
        return b.totalMinutes - a.totalMinutes;
      }

      // Alphabetical as tiebreaker
      return a.name.localeCompare(b.name);
    });
  }, [activeLocations, weekSessions, currentSession]);

  // ============================================
  // AUTO-POPULATE FORM FROM TODAY'S DATA
  // ============================================
  // When todayLog updates (e.g., geofence exit), populate the read-only viewer
  // Only when viewing today and not actively editing a session

  useEffect(() => {
    if (!todayLog || editingSessionId) return;

    // Only auto-populate when form is showing today
    if (!isToday(manualDate)) return;

    // Populate entry time from todayLog
    if (todayLog.firstEntry) {
      const [h, m] = todayLog.firstEntry.split(':');
      if (h && m) {
        setManualEntryH(h);
        setManualEntryM(m);
      }
    }

    // Populate exit time from todayLog
    if (todayLog.lastExit) {
      const [h, m] = todayLog.lastExit.split(':');
      if (h && m) {
        setManualExitH(h);
        setManualExitM(m);
      }
    }

    // Populate break
    if (todayLog.breakMinutes > 0) {
      setManualPause(String(todayLog.breakMinutes));
    }

    // Populate location
    if (todayLog.locationId) {
      setManualLocationId(todayLog.locationId);
    }
  }, [todayLog, editingSessionId, manualDate]);

  // ============================================
  // PENDING EXPORT EFFECT (from notification)
  // ============================================

  useEffect(() => {
    if (pendingReportExport) {
      handlePendingExport();
    }
  }, [pendingReportExport]);

  const handlePendingExport = async () => {
    if (!pendingReportExport) return;

    // Determine period
    let periodStart: Date;
    let periodEnd: Date;

    if (pendingReportExport.periodStart && pendingReportExport.periodEnd) {
      periodStart = new Date(pendingReportExport.periodStart);
      periodEnd = new Date(pendingReportExport.periodEnd);
    } else {
      // Default to current week
      periodStart = getWeekStart(new Date());
      periodEnd = getWeekEnd(new Date());
    }

    // Fetch sessions for the period
    const sessionsForPeriod = await getSessionsByPeriod(
      periodStart.toISOString(),
      periodEnd.toISOString()
    );

    const finishedSessions = sessionsForPeriod.filter(s => s.exit_at);

    if (finishedSessions.length === 0) {
      Alert.alert('No Sessions', 'No completed sessions found for this period.');
      clearPendingReportExport();
      return;
    }

    // Calculate total hours
    const totalMinutes = finishedSessions.reduce((acc, s) => {
      const pauseMin = s.pause_minutes || 0;
      return acc + Math.max(0, s.duration_minutes - pauseMin);
    }, 0);

    // Set export modal data
    setExportModalSessions(finishedSessions);
    setExportModalPeriod(formatDateRange(periodStart, periodEnd));

    // Clear the pending flag
    clearPendingReportExport();

    // Show export options
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: '💬 Share', onPress: () => exportAsText(finishedSessions) },
      { text: '📄 Save File', onPress: () => exportAsFile(finishedSessions) },
    ];

    Alert.alert(
      '📊 Weekly Report',
      `${formatDuration(totalMinutes)} worked\n${formatDateRange(periodStart, periodEnd)}\n\n${finishedSessions.length} session(s)`,
      options
    );
  };

  // ============================================
  // TIMER EFFECT
  // ============================================

  useEffect(() => {
    if (!currentSession || currentSession.status !== 'active') {
      setTimer('00:00:00');
      setIsPaused(false);
      setAccumulatedPauseSeconds(0);
      setPauseTimer('00:00:00');
      setPauseStartTimestamp(null);
      setFrozenTime(null);
      return;
    }

    // If paused, show frozen time and don't update
    if (isPaused) {
      if (frozenTime) {
        setTimer(frozenTime);
      }
      return;
    }

    const updateTimer = () => {
      const start = new Date(currentSession.entry_at).getTime();
      const now = Date.now();
      // Subtract total pause time from calculation
      const diffMs = now - start - (accumulatedPauseSeconds * 1000);
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      
      const newTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      setTimer(newTime);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentSession, isPaused, frozenTime, accumulatedPauseSeconds]);

  // Pause timer effect
  useEffect(() => {
    if (!currentSession || currentSession.status !== 'active') return;

    const updatePauseTimer = () => {
      let totalPauseSeconds = accumulatedPauseSeconds;
      
      if (isPaused && pauseStartTimestamp) {
        totalPauseSeconds += Math.floor((Date.now() - pauseStartTimestamp) / 1000);
      }
      
      const hours = Math.floor(totalPauseSeconds / 3600);
      const mins = Math.floor((totalPauseSeconds % 3600) / 60);
      const secs = totalPauseSeconds % 60;
      
      setPauseTimer(
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    };

    updatePauseTimer();
    const interval = setInterval(updatePauseTimer, 1000);
    return () => clearInterval(interval);
  }, [isPaused, pauseStartTimestamp, accumulatedPauseSeconds, currentSession]);

  // REMOVED: Session finished modal effect - was causing confusion

  // ============================================
  // LOAD DATA
  // ============================================

  const loadWeekSessions = useCallback(async () => {
    const start = getWeekStart(currentWeek);
    const end = getWeekEnd(currentWeek);
    const result = await getSessionsByPeriod(start.toISOString(), end.toISOString());
    setWeekSessions(result);
  }, [currentWeek, getSessionsByPeriod]);

  const loadMonthSessions = useCallback(async () => {
    const start = getMonthStart(currentMonth);
    const end = getMonthEnd(currentMonth);
    const result = await getSessionsByPeriod(start.toISOString(), end.toISOString());
    setMonthSessions(result);
  }, [currentMonth, getSessionsByPeriod]);

  useEffect(() => {
    if (viewMode === 'week') {
      loadWeekSessions();
    } else {
      loadMonthSessions();
    }
  }, [viewMode, currentWeek, currentMonth, loadWeekSessions, loadMonthSessions]);

  // Note: Removed useEffect[currentSession] - was causing memory issues
  // The effect above already handles all necessary reloads

  // ============================================
  // REFRESH
  // ============================================

  const onRefresh = async () => {
    setRefreshing(true);
    await reloadData();
    if (viewMode === 'week') {
      await loadWeekSessions();
    } else {
      await loadMonthSessions();
    }
    await syncNow();
    setRefreshing(false);
  };

  // ============================================
  // TIMER ACTIONS
  // ============================================

  const handlePause = () => {
    // Freeze current time before pausing
    setFrozenTime(timer);
    setIsPaused(true);
    setPauseStartTimestamp(Date.now());
  };

  const handleResume = () => {
    if (pauseStartTimestamp) {
      const pauseDuration = Math.floor((Date.now() - pauseStartTimestamp) / 1000);
      setAccumulatedPauseSeconds(prev => prev + pauseDuration);
    }
    setPauseStartTimestamp(null);
    setFrozenTime(null); // Release to resume counting
    setIsPaused(false);
  };

  const handleStop = () => {
    if (!currentSession) return;
    
    let totalPauseSeconds = accumulatedPauseSeconds;
    if (isPaused && pauseStartTimestamp) {
      totalPauseSeconds += Math.floor((Date.now() - pauseStartTimestamp) / 1000);
    }
    const totalPauseMinutes = Math.floor(totalPauseSeconds / 60);

    Alert.alert(
      '⏹️ Stop Timer',
      `End current session?${totalPauseMinutes > 0 ? `\n\nTotal break: ${totalPauseMinutes} minutes` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            try {
              await registerExit(currentSession.location_id);
              
              if (totalPauseMinutes > 0) {
                await editRecord(currentSession.id, {
                  pause_minutes: totalPauseMinutes,
                  manually_edited: 1,
                  edit_reason: 'Break recorded automatically',
                });
              }
              
              setIsPaused(false);
              setAccumulatedPauseSeconds(0);
              setPauseStartTimestamp(null);
              setPauseTimer('00:00:00');
              
              // Reload data to show the finished session
              loadWeekSessions();
              loadMonthSessions();
              
              // REMOVED: No longer showing session finished modal
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Could not stop session');
            }
          },
        },
      ]
    );
  };

  const handleRestart = async () => {
    if (!activeLocation) return;
    Alert.alert(
      '▶️ Start New Session',
      `Start timer at "${activeLocation.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              await registerEntry(activeLocation.id, activeLocation.name);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Could not start');
            }
          },
        },
      ]
    );
  };

  // ============================================
  // CALENDAR DATA
  // ============================================

  const weekCalendarDays: CalendarDay[] = useMemo(() => {
    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);

      const daySessions = weekSessions.filter(s => {
        const sessionDate = new Date(s.entry_at);
        return isSameDay(sessionDate, date);
      });

      const totalMinutes = daySessions
        .filter(s => s.exit_at)
        .reduce((acc, s) => {
          const pauseMin = s.pause_minutes || 0;
          return acc + Math.max(0, s.duration_minutes - pauseMin);
        }, 0);

      days.push({
        date,
        weekday: WEEKDAYS[date.getDay()],
        dayNumber: date.getDate(),
        sessions: daySessions,
        totalMinutes,
      });
    }
    return days;
  }, [weekStart, weekSessions]);

  const monthCalendarDays = useMemo(() => {
    return getMonthCalendarDays(currentMonth);
  }, [currentMonth]);

  const getSessionsForDay = useCallback((date: Date): ComputedSession[] => {
    return sessions.filter(s => {
      const sessionDate = new Date(s.entry_at);
      return isSameDay(sessionDate, date);
    });
  }, [sessions]);

  const getTotalMinutesForDay = useCallback((date: Date): number => {
    const daySessions = getSessionsForDay(date);
    return daySessions
      .filter(s => s.exit_at)
      .reduce((acc, s) => {
        const pauseMin = s.pause_minutes || 0;
        return acc + Math.max(0, s.duration_minutes - pauseMin);
      }, 0);
  }, [getSessionsForDay]);

  const weekTotalMinutes = weekSessions
    .filter(s => s.exit_at)
    .reduce((acc, s) => {
      const pauseMin = s.pause_minutes || 0;
      return acc + Math.max(0, s.duration_minutes - pauseMin);
    }, 0);

  const monthTotalMinutes = monthSessions
    .filter(s => s.exit_at)
    .reduce((acc, s) => {
      const pauseMin = s.pause_minutes || 0;
      return acc + Math.max(0, s.duration_minutes - pauseMin);
    }, 0);

  // ============================================
  // NAVIGATION
  // ============================================

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeek(newDate);
    setExpandedDay(null);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeek(newDate);
    setExpandedDay(null);
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(new Date());
    setExpandedDay(null);
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setDate(1); // Set to 1st to avoid month overflow (e.g., Jan 31 → Feb 31 → March 3)
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
    setExpandedDay(null);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setDate(1); // Set to 1st to avoid month overflow
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
    setExpandedDay(null);
  };

  const goToCurrentMonth = () => {
    setCurrentMonth(new Date());
    setExpandedDay(null);
  };

  // ============================================
  // DAY PRESS HANDLERS
  // ============================================

  const handleDayPress = (dayKey: string, hasSessions: boolean) => {
    // Parse date safely (YYYY-MM-DD)
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Block future days
    if (isFutureDay(date)) {
      Alert.alert(
        '⚠️ Future Date',
        'Cannot log hours for future dates',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      return;
    }

    // Open day modal
    openDayModal(date);
  };

  // ============================================
  // DAY MODAL (NEW!)
  // ============================================

  const openDayModal = (date: Date) => {
    setSelectedDayForModal(date);
    setSelectedSessions(new Set());
    setShowDayModal(true);
  };

  const closeDayModal = () => {
    setShowDayModal(false);
    setSelectedDayForModal(null);
    setSelectedSessions(new Set());
    setIsEditingInline(false);
    setEditingSessionId(null);
  };

  // ============================================
  // SESSION SELECTION (NEW!)
  // ============================================

  const toggleSelectSession = (sessionId: string) => {
    const newSet = new Set(selectedSessions);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    setSelectedSessions(newSet);
  };

  const selectAllSessions = () => {
    const finishedSessions = dayModalSessions.filter(s => s.exit_at);
    setSelectedSessions(new Set(finishedSessions.map(s => s.id)));
  };

  const deselectAllSessions = () => {
    setSelectedSessions(new Set());
  };

  // ============================================
  // DAY TAGS (Rain, Snow, Day Off, etc.)
  // ============================================

  const openTagModal = (date: Date) => {
    // Block future days
    if (isFutureDay(date)) return;
    
    setTagModalDate(date);
    setShowTagModal(true);
  };

  const closeTagModal = () => {
    setShowTagModal(false);
    setTagModalDate(null);
  };

  const setDayTag = (date: Date, tagType: DayTagType | null) => {
    const dayKey = getDayKey(date);
    setDayTags(prev => {
      const newTags = { ...prev };
      if (tagType === null) {
        delete newTags[dayKey];
      } else {
        newTags[dayKey] = tagType;
      }
      return newTags;
    });
    closeTagModal();
  };

  const getDayTag = (date: Date): DayTagType | null => {
    const dayKey = getDayKey(date);
    return dayTags[dayKey] || null;
  };

  // ============================================
  // SESSION ACTION MODAL (Edit/Delete on long press)
  // ============================================

  const openActionModal = (session: ComputedSession) => {
    setSessionForAction(session);
    setShowActionModal(true);
  };

  const closeActionModal = () => {
    setShowActionModal(false);
    setSessionForAction(null);
  };

  /**
   * Open edit modal pre-populated with session data
   */
  const openEditSession = (session: ComputedSession) => {
    closeActionModal();

    // Parse session times
    const entryDate = new Date(session.entry_at);
    const exitDate = session.exit_at ? new Date(session.exit_at) : new Date();

    // Set all form fields
    setManualDate(entryDate);
    setManualLocationId(session.location_id);
    setManualEntryH(String(entryDate.getHours()).padStart(2, '0'));
    setManualEntryM(String(entryDate.getMinutes()).padStart(2, '0'));
    setManualExitH(String(exitDate.getHours()).padStart(2, '0'));
    setManualExitM(String(exitDate.getMinutes()).padStart(2, '0'));
    setManualPause(session.pause_minutes ? String(session.pause_minutes) : '');
    setManualEntryMode('hours');
    setManualAbsenceType(null);

    // Track that we're editing (not creating)
    setEditingSessionId(session.id);

    // Open the manual modal
    setShowManualModal(true);
    // Close day modal
    setShowDayModal(false);
  };

  /**
   * Handle delete from action modal
   */
  const handleDeleteFromAction = () => {
    if (!sessionForAction) return;
    closeActionModal();
    deleteSessionsByIds([sessionForAction.id], { closeModal: false });
  };

  // ============================================
  // MANUAL ENTRY
  // ============================================

  const openManualEntry = (date: Date) => {
    // Block future days
    if (isFutureDay(date)) {
      Alert.alert(
        '⚠️ Future Date',
        'Cannot log hours for future dates',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      return;
    }

    setManualDate(date);
    setManualLocationId(locations[0]?.id || '');
    // Default values: 08:00 and 17:00
    setManualEntryH('08');
    setManualEntryM('00');
    setManualExitH('17');
    setManualExitM('00');
    setManualPause('');
    // Reset entry mode
    setManualEntryMode('hours');
    setManualAbsenceType(null);
    // Clear edit mode - this is a new entry
    setEditingSessionId(null);
    setShowManualModal(true);
    // Close day modal if open
    setShowDayModal(false);
  };

  /**
   * Save manual entry
   * @param overrides - Optional 24h format overrides to avoid stale closure issues with AM/PM conversion
   */
  const handleSaveManual = async (overrides?: { entryH?: number; exitH?: number }) => {
    // Handle absence mode
    if (manualEntryMode === 'absence') {
      if (!manualAbsenceType) {
        Alert.alert('Error', 'Select an absence reason');
        return;
      }

      // For absence, we don't need location but use first one as placeholder
      const location = locations[0];
      if (!location) {
        Alert.alert('Error', 'No location configured');
        return;
      }

      // Create a record with entry = exit (0 duration)
      const absenceDate = new Date(manualDate);
      absenceDate.setHours(0, 0, 0, 0);
      const isoDate = absenceDate.toISOString();

      try {
        await createManualRecord({
          locationId: location.id,
          locationName: location.name,
          entry: isoDate,
          exit: isoDate,
          pauseMinutes: 0,
          absenceType: manualAbsenceType,
        });

        const absenceLabels: Record<string, string> = {
          rain: 'Rain Day',
          snow: 'Snow Day',
          sick: 'Sick Day',
          day_off: 'Day Off',
          holiday: 'Holiday',
        };
        Alert.alert('✅ Success', `${absenceLabels[manualAbsenceType]} recorded!`);

        setShowManualModal(false);
        setIsEditingInline(false);
        setManualAbsenceType(null);
        setManualEntryMode('hours');

        // Reload sessions to show the new record
        await loadWeekSessions();
        await loadMonthSessions();
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Could not save');
      }
      return;
    }

    // Handle hours mode (original logic)
    if (!manualLocationId) {
      Alert.alert('Error', 'Select a location');
      return;
    }
    if (!manualEntryH || !manualEntryM || !manualExitH || !manualExitM) {
      Alert.alert('Error', 'Fill in entry and exit times');
      return;
    }

    // Use overrides if provided (from AM/PM conversion), otherwise parse from state
    const entryH = overrides?.entryH ?? parseInt(manualEntryH, 10);
    const entryM = parseInt(manualEntryM, 10);
    const exitH = overrides?.exitH ?? parseInt(manualExitH, 10);
    const exitM = parseInt(manualExitM, 10);

    if (isNaN(entryH) || isNaN(entryM) || isNaN(exitH) || isNaN(exitM)) {
      Alert.alert('Error', 'Invalid time format');
      return;
    }
    
    // Range validation
    if (entryH < 0 || entryH > 23 || entryM < 0 || entryM > 59 ||
        exitH < 0 || exitH > 23 || exitM < 0 || exitM > 59) {
      Alert.alert('Error', 'Invalid time values');
      return;
    }

    const entryDate = new Date(manualDate);
    entryDate.setHours(entryH, entryM, 0, 0);

    const exitDate = new Date(manualDate);
    exitDate.setHours(exitH, exitM, 0, 0);

    if (exitDate <= entryDate) {
      Alert.alert('Error', 'Exit must be after entry');
      return;
    }

    const pauseMinutes = manualPause ? parseInt(manualPause, 10) : 0;

    try {
      if (editingSessionId) {
        // EDIT MODE: Update existing session
        await editRecord(editingSessionId, {
          entry_at: entryDate.toISOString(),
          exit_at: exitDate.toISOString(),
          pause_minutes: pauseMinutes,
          manually_edited: 1,
          edit_reason: 'Edited manually by user',
        });
        setEditingSessionId(null);
      } else {
        // CREATE MODE: New session
        const location = locations.find(l => l.id === manualLocationId);
        const locationName = location?.name || 'Location';

        // Check for existing sessions on the same day for the same location
        const sameDaySessions = sessions.filter(s => {
          const sessionDate = new Date(s.entry_at);
          return (
            s.location_id === manualLocationId &&
            isSameDay(sessionDate, entryDate) &&
            s.exit_at // Only completed sessions
          );
        });

        if (sameDaySessions.length > 0) {
          // Show confirmation dialog to replace existing sessions
          return new Promise<void>((resolve) => {
            Alert.alert(
              'Existing Sessions',
              `There are ${sameDaySessions.length} existing record(s) for "${locationName}" on this day. Would you like to replace them?`,
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => resolve(),
                },
                {
                  text: 'Add',
                  onPress: async () => {
                    // Add alongside existing
                    await createManualRecord({
                      locationId: manualLocationId,
                      locationName,
                      entry: entryDate.toISOString(),
                      exit: exitDate.toISOString(),
                      pauseMinutes: pauseMinutes,
                    });
                    setShowManualModal(false);
                    setIsEditingInline(false);
                    setManualPause('');
                    await loadWeekSessions();
                    await loadMonthSessions();
                    resolve();
                  },
                },
                {
                  text: 'Replace',
                  style: 'destructive',
                  onPress: async () => {
                    // Delete existing sessions first
                    for (const s of sameDaySessions) {
                      try {
                        await deleteRecord(s.id);
                      } catch (e) {
                        // Ignore errors
                      }
                    }
                    // Create new manual entry
                    await createManualRecord({
                      locationId: manualLocationId,
                      locationName,
                      entry: entryDate.toISOString(),
                      exit: exitDate.toISOString(),
                      pauseMinutes: pauseMinutes,
                    });
                    setShowManualModal(false);
                    setIsEditingInline(false);
                    setManualPause('');
                    await loadWeekSessions();
                    await loadMonthSessions();
                    resolve();
                  },
                },
              ]
            );
          });
        } else {
          // No existing sessions - just create new
          await createManualRecord({
            locationId: manualLocationId,
            locationName,
            entry: entryDate.toISOString(),
            exit: exitDate.toISOString(),
            pauseMinutes: pauseMinutes,
          });
        }
      }

      setShowManualModal(false);
      setIsEditingInline(false);
      setManualPause('');

      // Reload sessions to show the new/updated record
      await loadWeekSessions();
      await loadMonthSessions();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not save');
    }
  };

  // ============================================
  // DELETE - UNIFIED ARCHITECTURE
  // ============================================

  /**
   * Core delete function - single source of truth
   * All delete operations go through here
   */
  const deleteSessionsByIds = async (
    sessionIds: string[],
    options: {
      closeModal?: boolean;
      silent?: boolean;
    } = {}
  ) => {
    const { closeModal = false, silent = false } = options;

    if (sessionIds.length === 0) {
      if (!silent) {
        Alert.alert('Nothing to delete', 'No sessions found.');
      }
      return;
    }

    const confirmDelete = async () => {
      let deleted = 0;
      for (const id of sessionIds) {
        try {
          await deleteRecord(id);
          deleted++;
        } catch (e: any) {
          // Ignore "not found" - already deleted
          if (!e?.message?.includes('not found')) {
            console.warn('Delete error:', e);
          }
        }
      }

      // Always reload fresh data
      await reloadData();
      // Always reload weekSessions (used by Home screen for auto-fill)
      loadWeekSessions();
      loadMonthSessions();

      // Clear states
      setSelectedSessions(new Set());

      if (closeModal) {
        closeDayModal();
      }

      if (deleted > 0 && !silent) {
        Alert.alert('✅ Deleted', `${deleted} session(s) deleted.`);
      }
    };

    Alert.alert(
      '🗑️ Delete Sessions',
      `Delete ${sessionIds.length} session(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]
    );
  };

  /**
   * Delete from Day Modal - uses selected or all sessions
   */
  const handleDeleteFromModal = () => {
    const finishedSessions = dayModalSessions.filter(s => s.exit_at);
    
    let idsToDelete: string[];
    if (selectedSessions.size > 0) {
      // Delete only selected
      idsToDelete = Array.from(selectedSessions);
    } else {
      // Delete all from day
      idsToDelete = finishedSessions.map(s => s.id);
    }
    
    deleteSessionsByIds(idsToDelete, { closeModal: true });
  };

  /**
   * Delete single session (long press on session item)
   */
  const handleDeleteSession = (session: ComputedSession) => {
    deleteSessionsByIds([session.id], { closeModal: false });
  };

  /**
   * Delete selected sessions inside modal
   */
  const handleDeleteSelectedSessions = () => {
    if (selectedSessions.size === 0) return;
    const ids = Array.from(selectedSessions);
    deleteSessionsByIds(ids, { closeModal: false });
  };

  // Keep for backward compatibility
  const handleDeleteDay = (_dayKey: string, daySessions: ComputedSession[]) => {
    const ids = daySessions.filter(s => s.exit_at).map(s => s.id);
    deleteSessionsByIds(ids, { closeModal: true });
  };

  // ============================================
  // EXPORT
  // ============================================

  const exportAsText = async (sessionsToExport: ComputedSession[]) => {
    const txt = generateCompleteReport(sessionsToExport, userName || undefined, userId || undefined);

    try {
      await Share.share({ message: txt, title: 'Work Report' });
      closeDayModal();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const exportAsFile = async (sessionsToExport: ComputedSession[]) => {
    const txt = generateCompleteReport(sessionsToExport, userName || undefined, userId || undefined);

    try {
      const now = new Date();
      const fileName = `report_${getToday()}.txt`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, txt, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/plain',
          dialogTitle: 'Save Report',
        });
      }

      closeDayModal();
    } catch (error) {
      console.error('Error exporting file:', error);
      Alert.alert('Error', 'Could not create file');
    }
  };

  // Export from main calendar (full period)
  const handleExport = async () => {
    const finishedSessions = sessions.filter(s => s.exit_at);

    if (finishedSessions.length === 0) {
      Alert.alert('Warning', 'No completed sessions to export');
      return;
    }

    Alert.alert(
      '📤 Export Report',
      'How would you like to export?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '💬 Share', onPress: () => exportAsText(finishedSessions) },
        { text: '📄 File', onPress: () => exportAsFile(finishedSessions) },
      ]
    );
  };

  // NEW: Export from day modal (specific sessions)
  const handleExportFromModal = async () => {
    if (!selectedDayForModal) return;

    const finishedSessions = dayModalSessions.filter(s => s.exit_at);

    let sessionsToExport: ComputedSession[];

    if (selectedSessions.size > 0) {
      // Export only selected sessions
      sessionsToExport = finishedSessions.filter(s => selectedSessions.has(s.id));
    } else {
      // Export all sessions from the day
      sessionsToExport = finishedSessions;
    }

    if (sessionsToExport.length === 0) {
      Alert.alert('Warning', 'No sessions to export');
      return;
    }

    const exportLabel = selectedSessions.size > 0
      ? `Export ${selectedSessions.size} session(s)?`
      : `Export all ${sessionsToExport.length} session(s) from this day?`;

    Alert.alert('📤 Export', exportLabel, [
      { text: 'Cancel', style: 'cancel' },
      { text: '💬 Share', onPress: () => exportAsText(sessionsToExport) },
      { text: '📄 File', onPress: () => exportAsFile(sessionsToExport) },
    ]);
  };

/**
 * PATCH: hooks.ts
 * 
 * ADD this function BEFORE the return statement (around line 1280)
 * 
 * This provides suggested entry/exit times based on geofence sessions.
 */

// ============================================
// SUGGESTED TIMES (for manual entry)
// ============================================

/**
 * Get suggested entry/exit times for a location
 * 
 * Logic:
 * 1. Check if there's a geofence session today for this location
 * 2. If yes, use those times (rounded to half hour)
 * 3. If no, use default 09:00 - 15:00
 */
const getSuggestedTimes = useCallback((locationId: string) => {
  // Helper to round to nearest half hour
  const roundToHalfHour = (hours: number, minutes: number) => {
    let h = hours;
    let m = '00';
    
    if (minutes < 15) {
      m = '00';
    } else if (minutes < 45) {
      m = '30';
    } else {
      h = hours + 1;
      m = '00';
    }
    
    // Handle overflow
    if (h >= 24) h = 23;
    
    return {
      h: String(h).padStart(2, '0'),
      m,
    };
  };

  // Find today's sessions for this location (from geofence)
  const today = new Date();
  const todaySessions = weekSessions.filter((s: ComputedSession) => {
    const sessionDate = new Date(s.entry_at);
    const isSessionToday = isSameDay(sessionDate, today);
    const isCorrectLocation = s.location_id === locationId;
    // Only auto sessions (from geofence)
    const isAutoSession = s.type !== 'manual';
    
    return isSessionToday && isCorrectLocation && isAutoSession;
  });

  if (todaySessions.length > 0) {
    // Use the most recent session's times
    const session = todaySessions[todaySessions.length - 1];
    const entryDate = new Date(session.entry_at);
    const exitDate = session.exit_at ? new Date(session.exit_at) : new Date();
    
    const entry = roundToHalfHour(entryDate.getHours(), entryDate.getMinutes());
    const exit = roundToHalfHour(exitDate.getHours(), exitDate.getMinutes());
    
    return {
      entryH: entry.h,
      entryM: entry.m,
      exitH: exit.h,
      exitM: exit.m,
    };
  }
  
  // Default times: 09:00 - 15:00
  return {
    entryH: '09',
    entryM: '00',
    exitH: '15',
    exitM: '00',
  };
}, [weekSessions, isSameDay]);


// ============================================
// UPDATE RETURN STATEMENT
// ============================================

// ADD to the return object:
//
//     // NEW: Suggested times for manual entry
//     getSuggestedTimes,
//     weekSessions,
  
  // ============================================
  // ABSENCE FOR DATE (inline save)
  // ============================================

  const saveAbsenceForDate = async (date: Date, absenceType: string) => {
    const location = locations[0];
    if (!location) {
      Alert.alert('Error', 'No location configured');
      return;
    }

    const absenceDate = new Date(date);
    absenceDate.setHours(0, 0, 0, 0);
    const isoDate = absenceDate.toISOString();

    try {
      await createManualRecord({
        locationId: location.id,
        locationName: location.name,
        entry: isoDate,
        exit: isoDate,
        pauseMinutes: 0,
        absenceType,
      });

      const absenceLabels: Record<string, string> = {
        rain: 'Rain Day',
        snow: 'Snow Day',
        sick: 'Sick Day',
        day_off: 'Day Off',
        holiday: 'Holiday',
      };
      Alert.alert('✅ Success', `${absenceLabels[absenceType]} recorded!`);

      // Reload sessions
      await loadWeekSessions();
      await loadMonthSessions();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not save');
    }
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    // Data
    userName,
    userId,
    locations,
    currentSession,
    activeLocation,
    canRestart,
    isGeofencingActive,
    
    // Timer
    timer,
    isPaused,
    pauseTimer,
    
    // Calendar
    viewMode,
    setViewMode,
    currentMonth,
    weekStart,
    weekEnd,
    sessions,
    weekCalendarDays,
    monthCalendarDays,
    weekTotalMinutes,
    monthTotalMinutes,
    expandedDay, // Keep for backward compat, but not used in new UI

    // Day Modal
    showDayModal,
    selectedDayForModal,
    dayModalSessions,
    openDayModal,
    closeDayModal,
    
    // NEW: Location Cards
    activeLocations,
    locationCardsData,
    
    // NEW: Session selection
    selectedSessions,
    toggleSelectSession,
    selectAllSessions,
    deselectAllSessions,

    // NEW: Session action modal (Edit/Delete)
    showActionModal,
    sessionForAction,
    openActionModal,
    closeActionModal,
    openEditSession,
    handleDeleteFromAction,
    editingSessionId,

    // NEW: Inline editing (unified day card)
    isEditingInline,
    setIsEditingInline,
    setManualDate,
    setEditingSessionId,
    saveAbsenceForDate,

    // NEW: Export modal (notification triggered)
    showExportModal,
    exportModalSessions,
    exportModalPeriod,
    
    // Manual entry modal
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
    
    // Refresh
    refreshing,
    onRefresh,
    
    // Timer handlers
    handlePause,
    handleResume,
    handleStop,
    handleRestart,
    
    // Navigation handlers
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    
    // Day handlers
    handleDayPress,
    getSessionsForDay,
    getTotalMinutesForDay,
    
    // Modal handlers
    openManualEntry,
    handleSaveManual,
    handleDeleteDay,
    handleDeleteSession,
    handleDeleteSelectedSessions,
    handleDeleteFromModal,
    handleExport,
    handleExportFromModal,

    // Day Tags
    dayTags,
    showTagModal,
    tagModalDate,
    openTagModal,
    closeTagModal,
    setDayTag,
    getDayTag,
    
    // Helpers (re-export for JSX)
    formatDateRange,
    formatMonthYear,
    formatTimeAMPM,
    formatDuration,
    isToday,
    isFutureDay,
    isWeekend,
    getDayKey,
    isSameDay,
    DAY_TAGS,
    getSuggestedTimes,
    weekSessions,
    monthSessions,
    getSessionsByPeriod,
  };
}

// Export type for use in component
export type UseHomeScreenReturn = ReturnType<typeof useHomeScreen>;
