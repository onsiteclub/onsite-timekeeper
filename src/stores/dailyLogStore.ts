/**
 * Daily Log Store - OnSite Timekeeper (Caderneta Digital)
 *
 * Simplified store for the "Digital Notepad" model:
 * - Primary source: daily_hours table (1 record per day)
 * - Timer tracking state for UI visualization
 * - Manual entry support
 *
 * GPS audit trail kept in records/location_audit for proof.
 */

import { create } from 'zustand';
import { logger } from '../lib/logger';
import {
  getDailyHours,
  getDailyHoursByPeriod,
  upsertDailyHours,
  updateDailyHours,
  addMinutesToDay,
  deleteDailyHours,
  getToday,
  formatDuration,
  type DailyHoursDB,
} from '../lib/database';
import {
  formatTimeHHMM,
  getDateString,
  type DailyHoursEntry,
} from '../lib/database/daily';
import { useAuthStore } from './authStore';

// ============================================
// TYPES
// ============================================

export type DailyLogType = 'work' | 'rain' | 'snow' | 'sick' | 'dayoff' | 'holiday';

export interface DailyLog {
  date: string;
  totalMinutes: number;
  breakMinutes: number;
  locationName: string | null;
  locationId: string | null;
  verified: boolean;
  source: 'gps' | 'manual' | 'edited';
  type: DailyLogType;
  firstEntry: string | null;
  lastExit: string | null;
  notes: string | null;
}

export interface TrackingState {
  isTracking: boolean;
  locationId: string | null;
  locationName: string | null;
  startTime: Date | null;
}

interface DailyLogState {
  isInitialized: boolean;

  // Today's log (primary view)
  todayLog: DailyLog | null;

  // Current tracking state (for timer UI)
  tracking: TrackingState;

  // Week summary (for quick view)
  weekLogs: DailyLog[];

  // Actions
  initialize: () => Promise<void>;
  reloadToday: () => Promise<void>;
  reloadWeek: () => Promise<void>;

  // Timer actions
  startTracking: (locationId: string, locationName: string) => void;
  stopTracking: () => void;
  getElapsedMinutes: () => number;

  // Reset tracking state (called by exitHandler after it updates daily_hours)
  resetTracking: () => void;

  // Manual entry
  addManualHours: (params: {
    date: string;
    totalMinutes: number;
    breakMinutes?: number;
    locationName?: string;
    locationId?: string;
    type?: DailyLogType;
    notes?: string;
  }) => Promise<DailyLog | null>;

  // Edit existing
  updateDayLog: (
    date: string,
    updates: {
      totalMinutes?: number;
      breakMinutes?: number;
      notes?: string;
    }
  ) => Promise<DailyLog | null>;

  // Delete
  deleteDayLog: (date: string) => Promise<boolean>;

  // Query
  getLogsByPeriod: (startDate: string, endDate: string) => Promise<DailyLog[]>;
  getMonthSummary: (year: number, month: number) => Promise<{
    totalMinutes: number;
    totalDays: number;
    averageMinutes: number;
    logs: DailyLog[];
  }>;
}

// ============================================
// HELPERS
// ============================================

function entryToLog(entry: DailyHoursEntry): DailyLog {
  return {
    date: entry.date,
    totalMinutes: entry.total_minutes,
    breakMinutes: entry.break_minutes,
    locationName: entry.location_name,
    locationId: entry.location_id,
    verified: entry.verified,
    source: entry.source,
    type: entry.type || 'work',
    firstEntry: entry.first_entry,
    lastExit: entry.last_exit,
    notes: entry.notes,
  };
}

// ============================================
// STORE
// ============================================

export const useDailyLogStore = create<DailyLogState>((set, get) => ({
  isInitialized: false,
  todayLog: null,
  tracking: {
    isTracking: false,
    locationId: null,
    locationName: null,
    startTime: null,
  },
  weekLogs: [],

  // ============================================
  // INITIALIZE
  // ============================================
  initialize: async () => {
    if (get().isInitialized) return;

    try {
      logger.info('boot', '📖 Initializing daily log store...');

      await get().reloadToday();
      await get().reloadWeek();

      set({ isInitialized: true });
      logger.info('boot', '✅ Daily log store initialized');
    } catch (error) {
      logger.error('dailyLog', 'Error initializing', { error: String(error) });
      set({ isInitialized: true });
    }
  },

  // ============================================
  // RELOAD DATA
  // ============================================
  reloadToday: async () => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        set({ todayLog: null });
        return;
      }

      const today = getToday();
      const entry = getDailyHours(userId, today);

      set({ todayLog: entry ? entryToLog(entry) : null });

      logger.debug('dailyLog', 'Today reloaded', {
        hasLog: !!entry,
        minutes: entry?.total_minutes || 0,
      });
    } catch (error) {
      logger.error('dailyLog', 'Error reloading today', { error: String(error) });
    }
  },

  reloadWeek: async () => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        set({ weekLogs: [] });
        return;
      }

      // Get last 7 days
      const endDate = getToday();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 6);
      const startDateStr = getDateString(startDate);

      const entries = getDailyHoursByPeriod(userId, startDateStr, endDate);

      set({ weekLogs: entries.map(entryToLog) });

      logger.debug('dailyLog', 'Week reloaded', { days: entries.length });
    } catch (error) {
      logger.error('dailyLog', 'Error reloading week', { error: String(error) });
    }
  },

  // ============================================
  // TRACKING (for timer UI)
  // ============================================
  startTracking: (locationId, locationName) => {
    const { tracking } = get();

    if (tracking.isTracking) {
      logger.warn('dailyLog', 'Already tracking, ignoring startTracking');
      return;
    }

    set({
      tracking: {
        isTracking: true,
        locationId,
        locationName,
        startTime: new Date(),
      },
    });

    logger.info('dailyLog', `⏱️ Tracking started: ${locationName}`);
  },

  stopTracking: () => {
    const { tracking } = get();

    if (!tracking.isTracking || !tracking.startTime) {
      logger.warn('dailyLog', 'Not tracking, ignoring stopTracking');
      return;
    }

    const userId = useAuthStore.getState().getUserId();
    if (!userId) return;

    // Calculate elapsed minutes
    const now = new Date();
    const elapsed = Math.round((now.getTime() - tracking.startTime.getTime()) / 60000);

    // Update daily_hours
    const today = getToday();
    const exitTime = formatTimeHHMM(now);

    addMinutesToDay(userId, today, elapsed, exitTime);

    logger.info('dailyLog', `⏱️ Tracking stopped: +${elapsed}min`);

    // Reset tracking state
    set({
      tracking: {
        isTracking: false,
        locationId: null,
        locationName: null,
        startTime: null,
      },
    });

    // Reload data
    get().reloadToday();
    get().reloadWeek();
  },

  getElapsedMinutes: () => {
    const { tracking } = get();

    if (!tracking.isTracking || !tracking.startTime) {
      return 0;
    }

    return Math.round((Date.now() - tracking.startTime.getTime()) / 60000);
  },

  // Reset tracking state without updating database
  // Called by exitHandler after it already updated daily_hours
  resetTracking: () => {
    set({
      tracking: {
        isTracking: false,
        locationId: null,
        locationName: null,
        startTime: null,
      },
    });

    logger.debug('dailyLog', '⏱️ Tracking state reset');
  },

  // ============================================
  // MANUAL ENTRY
  // ============================================
  addManualHours: async (params) => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const result = upsertDailyHours({
        userId,
        date: params.date,
        totalMinutes: params.totalMinutes,
        breakMinutes: params.breakMinutes || 0,
        locationName: params.locationName,
        locationId: params.locationId,
        verified: false,
        source: 'manual',
        type: params.type || 'work',
        notes: params.notes,
      });

      if (!result) {
        throw new Error('Failed to add hours');
      }

      logger.info('dailyLog', `✏️ Manual hours added: ${params.date} - ${params.totalMinutes}min`);

      // Reload data
      await get().reloadToday();
      await get().reloadWeek();

      return entryToLog(result);
    } catch (error) {
      logger.error('dailyLog', 'Error adding manual hours', { error: String(error) });
      return null;
    }
  },

  // ============================================
  // UPDATE
  // ============================================
  updateDayLog: async (date, updates) => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const result = updateDailyHours(userId, date, {
        totalMinutes: updates.totalMinutes,
        breakMinutes: updates.breakMinutes,
        notes: updates.notes,
        source: 'edited',
      });

      if (!result) {
        throw new Error('Failed to update hours');
      }

      logger.info('dailyLog', `✏️ Day log updated: ${date}`);

      // Reload data
      await get().reloadToday();
      await get().reloadWeek();

      return entryToLog(result);
    } catch (error) {
      logger.error('dailyLog', 'Error updating day log', { error: String(error) });
      return null;
    }
  },

  // ============================================
  // DELETE
  // ============================================
  deleteDayLog: async (date) => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const success = deleteDailyHours(userId, date);

      if (success) {
        logger.info('dailyLog', `🗑️ Day log deleted: ${date}`);

        // Reload data
        await get().reloadToday();
        await get().reloadWeek();
      }

      return success;
    } catch (error) {
      logger.error('dailyLog', 'Error deleting day log', { error: String(error) });
      return false;
    }
  },

  // ============================================
  // QUERIES
  // ============================================
  getLogsByPeriod: async (startDate, endDate) => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) return [];

      const entries = getDailyHoursByPeriod(userId, startDate, endDate);
      return entries.map(entryToLog);
    } catch (error) {
      logger.error('dailyLog', 'Error getting logs by period', { error: String(error) });
      return [];
    }
  },

  getMonthSummary: async (year, month) => {
    try {
      const userId = useAuthStore.getState().getUserId();
      if (!userId) {
        return { totalMinutes: 0, totalDays: 0, averageMinutes: 0, logs: [] };
      }

      // Calculate date range for the month
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = getDateString(new Date(year, month + 1, 0));

      const entries = getDailyHoursByPeriod(userId, startDate, endDate);
      const logs = entries.map(entryToLog);

      const totalMinutes = logs.reduce((sum, log) => sum + log.totalMinutes, 0);
      const totalDays = logs.filter((log) => log.totalMinutes > 0).length;
      const averageMinutes = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;

      return {
        totalMinutes,
        totalDays,
        averageMinutes,
        logs,
      };
    } catch (error) {
      logger.error('dailyLog', 'Error getting month summary', { error: String(error) });
      return { totalMinutes: 0, totalDays: 0, averageMinutes: 0, logs: [] };
    }
  },
}));

// ============================================
// HELPER HOOKS
// ============================================

export function useFormattedDuration(minutes: number): string {
  return formatDuration(minutes);
}

export function useTodayTotalMinutes(): number {
  const todayLog = useDailyLogStore((s) => s.todayLog);
  const elapsedMinutes = useDailyLogStore((s) => s.getElapsedMinutes());
  return (todayLog?.totalMinutes || 0) + elapsedMinutes;
}
