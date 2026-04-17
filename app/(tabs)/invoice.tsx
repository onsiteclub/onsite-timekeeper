/**
 * Invoice Screen - OnSite Timekeeper
 *
 * Hub with two invoice types:
 * - Invoice by Hours → Calendar date range selection → PDF export
 * - Invoice by Services → Line items form → PDF export
 *
 * Calendar code is the same approved design from history.tsx.
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
  Dimensions,
  TextInput,
  Animated,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Card } from '../../src/components/ui/Button';
import { PressableOpacity } from '../../src/components/ui/PressableOpacity';
import { HeaderRow } from '../../src/components/ui/HeaderRow';
import { formatTimeDisplay, formatCompact, formatMoney, getInitials, BREAK_PRESETS } from '../../src/lib/format';
import { colors, withOpacity, shadows, spacing, borderRadius } from '../../src/constants/colors';

import { useHomeScreen, type ComputedSession } from '../../src/screens/home/hooks';
import { styles } from '../../src/screens/home/styles';
import { getDayKey } from '../../src/screens/home/helpers';
import { Calendar } from '../../src/components/Calendar';
import { getSessionBreakdown, type SessionSegment } from '../../src/lib/eventLog';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useInvoiceStore, type ClientAddress } from '../../src/stores/invoiceStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useDailyLogStore } from '../../src/stores/dailyLogStore';
import { CONSTRUCTION_PRESETS, applyJobSite } from '../../src/lib/constructionPresets';
import { formatInvoiceNumber, getInvoiceItems } from '../../src/lib/database/invoices';
import { getDailyHours, getDailyHoursByPeriod, upsertDailyHours, updateDailyHours, type DailyHoursEntry } from '../../src/lib/database/daily';
import { toLocalDateString } from '../../src/lib/database/core';
import type { InvoiceDB, InvoiceItemDB, DailyHoursDB } from '../../src/lib/database/core';
import { setSentryContext } from '../../src/lib/sentry';
import { logger } from '../../src/lib/logger';
import ServicesWizard from '../../src/screens/invoice/ServicesWizard';
import { InvoiceSummaryCard, type TimeTableDay, type InvoiceSummaryChanges } from '../../src/screens/invoice/InvoiceSummaryCard';
import { ClientEditSheet, type ClientFormData } from '../../src/screens/invoice/ClientEditSheet';
import { getClientByName } from '../../src/lib/database/clients';
import { useSnackbarStore } from '../../src/stores/snackbarStore';

// ============================================
// HELPERS
// ============================================

const INITIALS_COLORS = ['#C58B1B', '#2E7D32', '#1565C0', '#6A1B9A', '#C62828', '#00838F', '#E65100', '#4527A0'];
function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
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
// LINE ITEM TYPE
// ============================================
interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function newLineItem(): LineItem {
  return { id: Date.now().toString(), description: '', quantity: '1', unitPrice: '' };
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function InvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; openInvoiceId?: string }>();
  const showSnackbar = useSnackbarStore(s => s.show);

  // ===== AUTH =====
  const userId = useAuthStore((s) => s.getUserId());
  const userName = useAuthStore((s) => s.getUserName());

  // ===== INVOICE STORE =====
  const invoiceStore = useInvoiceStore();

  // ===== VIEW STATE =====
  const [activeView, setActiveView] = useState<'hub' | 'services'>('hub');

  // ===== INVOICE DETAIL MODAL STATE =====
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDB | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItemDB[]>([]);
  const [selectedInvoiceDays, setSelectedInvoiceDays] = useState<DailyHoursEntry[]>([]);
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState(false);

  // ===== CLIENT EDIT SHEET STATE (wizard only — detail flow uses /client-edit route) =====
  const [showWizardClientEdit, setShowWizardClientEdit] = useState(false);
  const [detailClientData, setDetailClientData] = useState<import('../../src/lib/database/core').ClientDB | null>(null);

  // (Edit mode state removed — now handled inside InvoiceSummaryCard v2)

  const openInvoiceDetail = useCallback((inv: InvoiceDB) => {
    setSelectedInvoice(inv);
    if (inv.type === 'products_services') {
      setSelectedInvoiceItems(getInvoiceItems(inv.id));
      setSelectedInvoiceDays([]);
    } else {
      setSelectedInvoiceItems([]);
      // Load daily hours for the period
      if (userId && inv.period_start && inv.period_end) {
        setSelectedInvoiceDays(getDailyHoursByPeriod(userId, inv.period_start, inv.period_end));
      } else {
        setSelectedInvoiceDays([]);
      }
    }
    // Look up full client data for address/phone/email display
    if (userId && inv.client_name) {
      setDetailClientData(getClientByName(userId, inv.client_name));
    } else {
      setDetailClientData(null);
    }
  }, [userId]);

  // Detail modal: edit client (TO card) → close modal, toast, route to /client-edit.
  // InvoiceSummaryCard has already persisted any pending draft before calling this.
  const handleEditClientFromDetail = useCallback(() => {
    if (!selectedInvoice) return;
    const invoice = selectedInvoice;
    setSelectedInvoice(null);
    showSnackbar(`Invoice ${invoice.invoice_number} saved`);
    router.push({
      pathname: '/client-edit',
      params: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName: invoice.client_name || '',
      },
    });
  }, [selectedInvoice, router, showSnackbar]);

  // Detail modal: edit business profile (FROM card) → close modal, toast, route to /business-profile.
  const handleEditFromDetail = useCallback(() => {
    if (!selectedInvoice) return;
    const invoice = selectedInvoice;
    setSelectedInvoice(null);
    showSnackbar(`Invoice ${invoice.invoice_number} saved`);
    router.push({
      pathname: '/business-profile',
      params: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      },
    });
  }, [selectedInvoice, router, showSnackbar]);

  // (enterEditMode, cancelEditMode, handleSaveEdit removed — now inside InvoiceSummaryCard v2)

  // ===== INLINE DAY EDIT (tap row in time table) =====
  const [dayEditEntry, setDayEditEntry] = useState<DailyHoursEntry | null>(null);
  const [dayEditIn, setDayEditIn] = useState('');
  const [dayEditOut, setDayEditOut] = useState('');
  const [dayEditBreak, setDayEditBreak] = useState('');
  const [dayEditSaving, setDayEditSaving] = useState(false);
  const [dayEditVersion, setDayEditVersion] = useState(0);

  const openDayEdit = useCallback((day: DailyHoursEntry) => {
    setDayEditEntry(day);
    setDayEditIn(day.first_entry || '');
    setDayEditOut(day.last_exit || '');
    setDayEditBreak(day.break_minutes > 0 ? String(day.break_minutes) : '');
  }, []);

  const closeDayEdit = useCallback(() => {
    setDayEditEntry(null);
  }, []);

  const handleSaveDayEdit = useCallback(async () => {
    if (!dayEditEntry || !userId) return;
    setDayEditSaving(true);
    try {
      // Parse entry/exit times to calculate total minutes
      const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const entryMin = dayEditIn ? parseTime(dayEditIn) : 0;
      const exitMin = dayEditOut ? parseTime(dayEditOut) : 0;
      const breakMin = parseInt(dayEditBreak) || 0;
      const grossMinutes = exitMin > entryMin ? exitMin - entryMin : 0;
      const totalMinutes = Math.max(0, grossMinutes - breakMin);

      // Update daily_hours in SQLite
      updateDailyHours(userId, dayEditEntry.date, {
        firstEntry: dayEditIn || undefined,
        lastExit: dayEditOut || undefined,
        breakMinutes: breakMin,
        totalMinutes,
      });

      // Recalculate invoice if we have one selected (detail view)
      if (selectedInvoice && selectedInvoice.period_start && selectedInvoice.period_end) {
        const updatedDays = getDailyHoursByPeriod(userId, selectedInvoice.period_start, selectedInvoice.period_end);
        setSelectedInvoiceDays(updatedDays);

        const newTotalMinutes = updatedDays.reduce((sum, d) => sum + d.total_minutes, 0);
        const hours = newTotalMinutes / 60;
        const rate = selectedInvoice.hourly_rate || 0;
        const subtotal = Math.round(hours * rate * 100) / 100;
        const taxAmount = Math.round(subtotal * (selectedInvoice.tax_rate / 100) * 100) / 100;
        const total = Math.round((subtotal + taxAmount) * 100) / 100;

        const updated = await invoiceStore.updateInvoice(userId, selectedInvoice.id, {
          subtotal,
          taxAmount,
          total,
        });
        if (updated) setSelectedInvoice(updated);
      }

      closeDayEdit();
      // Bump version so wizard summary reloads
      setDayEditVersion(v => v + 1);
    } finally {
      setDayEditSaving(false);
    }
  }, [dayEditEntry, userId, dayEditIn, dayEditOut, dayEditBreak, selectedInvoice, invoiceStore, closeDayEdit]);

  // ===== HOURLY WIZARD STATE =====
  const [showHourlyWizard, setShowHourlyWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardRateOverride, setWizardRateOverride] = useState<number | null>(null);

  // ===== BUSINESS PROFILE =====
  const loadBusinessProfile = useBusinessProfileStore(s => s.loadProfile);
  const businessProfile = useBusinessProfileStore(s => s.profile);

  // ===== DATA VERSION (triggers calendar reload) =====
  const reloadToday = useDailyLogStore(s => s.reloadToday);

  // ===== SERVICES FORM STATE =====
  const [svcClientName, setSvcClientName] = useState('');
  const [svcClientStreet, setSvcClientStreet] = useState('');
  const [svcClientCity, setSvcClientCity] = useState('');
  const [svcClientProvince, setSvcClientProvince] = useState('');
  const [svcClientPostal, setSvcClientPostal] = useState('');
  const [svcClientEmail, setSvcClientEmail] = useState('');
  const [svcClientPhone, setSvcClientPhone] = useState('');
  const [svcItems, setSvcItems] = useState<LineItem[]>([newLineItem()]);
  const [svcTaxRate, setSvcTaxRate] = useState('');
  const [svcNotes, setSvcNotes] = useState('');
  const [svcJobSite, setSvcJobSite] = useState('');
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [isGeneratingServices, setIsGeneratingServices] = useState(false);

  // ===== CALENDAR HOOKS (for hourly view) =====
  const {
    userName: hookUserName,
    userId: hookUserId,
    currentMonth,
    monthCalendarDays,
    monthTotalMinutes,
    showDayModal,
    selectedDayForModal,
    dayModalSessions,
    closeDayModal,
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
    manualLocationId,
    setManualLocationId,
    setManualEntryH,
    setManualEntryM,
    setManualExitH,
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
  // RELOAD ON TAB FOCUS
  // ============================================
  useFocusEffect(
    useCallback(() => {
      setSentryContext('invoice-create');
      setActiveView('hub');
      setViewMode('month');
      goToCurrentMonth();      // setCurrentMonth(new Date()) → triggers useEffect in hooks.ts
      reloadToday();           // bumps dataVersion → triggers useEffect to reload monthSessions
      if (userId) {
        loadBusinessProfile(userId);
        invoiceStore.loadDashboard(userId);
      }
    }, [userId])
  );

  // Auto-open wizard and day modal when navigated with ?date=YYYY-MM-DD
  useEffect(() => {
    if (params.date) {
      setShowHourlyWizard(true);
      setWizardStep(1);
      setDateRangeMode(true);
      reloadToday();
      // Auto-select last used client
      const lastClient = invoiceStore.clients[0];
      if (lastClient) {
        setHourlyClientName(lastClient.client_name);
        setHourlyClientPhone(lastClient.phone || '');
        setHourlyClientStreet(lastClient.address_street || '');
        setHourlyClientCity(lastClient.address_city || '');
        setHourlyClientProvince(lastClient.address_province || '');
        setHourlyClientPostal(lastClient.address_postal_code || '');
      }
      const [y, m, d] = params.date.split('-').map(Number);
      if (y && m && d) {
        const target = new Date(y, m - 1, d);
        openDayModal(target);
      }
      router.setParams({ date: undefined as any });
    }
  }, [params.date]);

  // Re-open invoice detail when returning from /client-edit or /business-profile
  // via the "View Invoice" snackbar action. The consumer route passes the invoice
  // id as ?openInvoiceId=X. We look it up in the (already refreshed) store and
  // open the detail modal, then clear the param so it doesn't fire again on
  // subsequent focuses.
  useEffect(() => {
    if (!params.openInvoiceId || !userId) return;
    const target = invoiceStore.recentInvoices.find(i => i.id === params.openInvoiceId);
    if (target) {
      openInvoiceDetail(target);
      router.setParams({ openInvoiceId: undefined as any });
    }
  }, [params.openInvoiceId, userId, invoiceStore.recentInvoices, openInvoiceDetail]);

  // Clear detail modal state when the tab tree unmounts (defensive cleanup).
  useEffect(() => {
    return () => {
      setSelectedInvoice(null);
      setSelectedInvoiceItems([]);
      setSelectedInvoiceDays([]);
      setDetailClientData(null);
    };
  }, []);

  // ============================================
  // TIME PICKER STATE (for calendar day modal)
  // ============================================
  const [entryTime, setEntryTime] = useState(() => {
    const d = new Date(); d.setHours(8, 0, 0, 0); return d;
  });
  const [exitTime, setExitTime] = useState(() => {
    const d = new Date(); d.setHours(17, 0, 0, 0); return d;
  });
  const [activeTimePicker, setActiveTimePicker] = useState<'entry' | 'exit' | null>(null);

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
          if (picker === 'entry') setEntryTime(newTime);
          else setExitTime(newTime);
        }
      },
    });
  }, [entryTime, exitTime]);

  const handleTimePickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      if (activeTimePicker === 'entry') setEntryTime(selectedDate);
      else if (activeTimePicker === 'exit') setExitTime(selectedDate);
    }
  };

  const handleSaveManualFromPicker = async () => {
    const eH = entryTime.getHours();
    const eM = entryTime.getMinutes();
    const xH = exitTime.getHours();
    const xM = exitTime.getMinutes();
    const pause = parseInt(manualPause, 10) || 0;
    setManualEntryH(String(eH).padStart(2, '0'));
    setManualEntryM(String(eM).padStart(2, '0'));
    setManualExitH(String(xH).padStart(2, '0'));
    setManualExitM(String(xM).padStart(2, '0'));
    await handleSaveManual({ entryH: eH, entryM: eM, exitH: xH, exitM: xM, pauseMinutes: pause });
  };

  // ============================================
  // INLINE EDIT HELPERS
  // ============================================
  const startInlineAdd = () => {
    if (!selectedDayForModal) return;
    setManualDate(selectedDayForModal);
    setManualLocationId(locations[0]?.id || '');
    const entry = new Date(); entry.setHours(8, 0, 0, 0);
    const exit = new Date(); exit.setHours(17, 0, 0, 0);
    setEntryTime(entry); setExitTime(exit);
    setManualEntryH('08'); setManualEntryM('00');
    setManualExitH('17'); setManualExitM('00');
    setManualPause('');
    setManualEntryMode('hours');
    setManualAbsenceType(null);
    setEditingSessionId(null);
    setIsEditingInline(true);
    setShowAbsenceOptions(false);
  };

  const startInlineEdit = (session: ComputedSession) => {
    const entryDate = new Date(session.entry_at);
    const exitDate = session.exit_at ? new Date(session.exit_at) : new Date();
    setManualDate(entryDate);
    setManualLocationId(session.location_id || locations[0]?.id || '');
    setEntryTime(entryDate); setExitTime(exitDate);
    setManualEntryH(String(entryDate.getHours()).padStart(2, '0'));
    setManualEntryM(String(entryDate.getMinutes()).padStart(2, '0'));
    setManualExitH(String(exitDate.getHours()).padStart(2, '0'));
    setManualExitM(String(exitDate.getMinutes()).padStart(2, '0'));
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

  const liveEditTotal = useMemo(() => {
    if (!isEditingInline) return '';
    const entryMins = entryTime.getHours() * 60 + entryTime.getMinutes();
    const exitMins = exitTime.getHours() * 60 + exitTime.getMinutes();
    const pause = parseInt(manualPause, 10) || 0;
    const totalMins = exitMins - entryMins - pause;
    if (totalMins <= 0 || isNaN(totalMins)) return '--';
    return formatDuration(totalMins);
  }, [isEditingInline, entryTime, exitTime, manualPause]);

  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showCustomBreak, setShowCustomBreak] = useState(false);
  const [customBreakText, setCustomBreakText] = useState('');

  const editBreakMinutes = parseInt(manualPause, 10) || 0;
  const editBreakLabel = useMemo(() => {
    const mins = parseInt(manualPause, 10) || 0;
    if (mins === 0) return 'No break';
    if (mins === 60) return '1 hour';
    if (mins > 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    return `${mins} min`;
  }, [manualPause]);

  const handleSelectBreak = (value: number) => {
    setManualPause(value > 0 ? String(value) : '');
    setShowBreakPicker(false);
    setShowCustomBreak(false);
    setCustomBreakText('');
  };

  const handleCustomBreakSave = () => {
    const val = parseInt(customBreakText, 10);
    if (!isNaN(val) && val >= 0 && val <= 480) {
      setManualPause(val > 0 ? String(val) : '');
    }
    setShowBreakPicker(false);
    setShowCustomBreak(false);
    setCustomBreakText('');
  };

  // ============================================
  // DAY MODAL STATE
  // ============================================
  const daySession = useMemo((): ComputedSession | null => {
    const completed = dayModalSessions.filter(s => s.exit_at);
    return completed[0] || null;
  }, [dayModalSessions]);

  const modalScale = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const [, setPressedDayKey] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  const [showAbsenceOptions, setShowAbsenceOptions] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailSegments, setDetailSegments] = useState<SessionSegment[]>([]);

  // Date range selection
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [rangeSessions, setRangeSessions] = useState<ComputedSession[]>([]);

  // Reload range sessions when a day is edited inline
  React.useEffect(() => {
    if (dayEditVersion === 0) return; // skip initial
    if (!rangeStartDate || !rangeEndDate) return;
    (async () => {
      const startTime = new Date(rangeStartDate); startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(rangeEndDate); endTime.setHours(23, 59, 59, 999);
      try {
        const sessions = await getSessionsByPeriod(startTime.toISOString(), endTime.toISOString());
        setRangeSessions(sessions.filter((s: ComputedSession) => s.exit_at));
      } catch { /* ignore */ }
    })();
  }, [dayEditVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Two-modal flow state (hourly invoice)
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Hourly invoice client
  const [hourlyClientName, setHourlyClientName] = useState('');
  const [hourlyClientStreet, setHourlyClientStreet] = useState('');
  const [hourlyClientCity, setHourlyClientCity] = useState('');
  const [hourlyClientProvince, setHourlyClientProvince] = useState('');
  const [hourlyClientPostal, setHourlyClientPostal] = useState('');
  const [hourlyClientPhone, setHourlyClientPhone] = useState('');

  const [showNewClientInput, setShowNewClientInput] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<{ number: string; pdfUri: string; total: number } | null>(null);
  // iOS: defer opening success modal until wizard's dismiss animation completes
  // (prevents UIKit double-modal race that freezes the tab)
  const [pendingSuccessModal, setPendingSuccessModal] = useState(false);

  // Inline hour entry state (Quick Add for empty days)
  const [inlineEntryDate, setInlineEntryDate] = useState<Date | null>(null);
  const [inlineIn, setInlineIn] = useState(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [inlineOut, setInlineOut] = useState(() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; });
  const [inlineBreak, setInlineBreak] = useState(0);
  const [inlineTimePicker, setInlineTimePicker] = useState<'in' | 'out' | null>(null);

  // Read-only detail view (for days WITH hours)
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [detailData, setDetailData] = useState<DailyHoursEntry | null>(null);

  // Manual hours fallback (when range has zero sessions)
  const [manualHoursText, setManualHoursText] = useState('');
  const [manualHoursConfirmed, setManualHoursConfirmed] = useState(false);

  // Zero-hours snackbar (auto-dismiss 3s)
  const [showZeroSnackbar, setShowZeroSnackbar] = useState(false);

  // Due date state (default: today + 30 days)
  const [hourlyDueDateObj, setHourlyDueDateObj] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [showHourlyDuePicker, setShowHourlyDuePicker] = useState(false);

  // Last invoice date per client name
  const lastInvoiceByClient = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inv of invoiceStore.recentInvoices) {
      if (inv.client_name && !map[inv.client_name]) {
        map[inv.client_name] = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    return map;
  }, [invoiceStore.recentInvoices]);

  const handleDateRangeSelect = async (date: Date) => {
    if (!dateRangeMode) return;
    if (!rangeStartDate || (rangeStartDate && rangeEndDate)) {
      // If range is complete, check tapped day behavior
      if (rangeStartDate && rangeEndDate) {
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        const s = new Date(rangeStartDate); s.setHours(0, 0, 0, 0);
        const e = new Date(rangeEndDate); e.setHours(0, 0, 0, 0);
        if (d >= s && d <= e) {
          const dayMinutes = getTotalMinutesForDay(date);
          if (dayMinutes === 0) {
            // Empty day → Quick Add hours
            openInlineEntry(date);
            return;
          } else {
            // Day WITH hours → read-only detail
            openDayDetail(date);
            return;
          }
        }
      }
      setRangeStartDate(date);
      setRangeEndDate(null);
      setRangeSessions([]);
      setManualHoursText('');
      setManualHoursConfirmed(false);
    } else {
      let startDate = rangeStartDate;
      let endDate = date;
      if (date < rangeStartDate) { startDate = date; endDate = rangeStartDate; }
      setRangeStartDate(startDate);
      setRangeEndDate(endDate);
      const startTime = new Date(startDate); startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(endDate); endTime.setHours(23, 59, 59, 999);
      try {
        const sessions = await getSessionsByPeriod(startTime.toISOString(), endTime.toISOString());
        const completedSessions = sessions.filter((s: ComputedSession) => s.exit_at);
        setRangeSessions(completedSessions);
      } catch (err) {
        logger.error('ui', 'Error fetching date range sessions', { error: String(err) });
      }
    }
  };

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

  const getSessionsInRange = (): ComputedSession[] => {
    if (!rangeStartDate || !rangeEndDate) return [];
    return rangeSessions;
  };

  const rangeTotalMinutes = useMemo(() => {
    return rangeSessions.reduce((total, s) => total + Math.max(0, s.duration_minutes), 0);
  }, [rangeSessions]);

  const rangeDaysWorked = useMemo(() => {
    const uniqueDays = new Set(rangeSessions.map(s => getDayKey(new Date(s.entry_at))));
    return uniqueDays.size;
  }, [rangeSessions]);

  const manualTotalMinutes = manualHoursConfirmed
    ? Math.round((parseFloat(manualHoursText.replace(',', '.')) || 0) * 60)
    : 0;

  // Build TimeTableDay[] for wizard Step 3
  const wizardDays: TimeTableDay[] = useMemo(() => {
    if (manualHoursConfirmed) return [];
    return rangeSessions.map(s => {
      const entryDate = new Date(s.entry_at);
      const exitDate = s.exit_at ? new Date(s.exit_at) : null;
      return {
        id: s.id,
        date: toLocalDateString(entryDate),
        dateLabel: entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        inLabel: entryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        outLabel: exitDate ? exitDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—',
        breakLabel: s.pause_minutes > 0 ? `${s.pause_minutes}m` : '—',
        totalLabel: formatDuration(Math.max(0, s.duration_minutes)),
        totalMinutes: Math.max(0, s.duration_minutes),
      };
    });
  }, [rangeSessions, manualHoursConfirmed, formatDuration]);

  // Build TimeTableDay[] for saved invoice detail
  const detailDays: TimeTableDay[] = useMemo(() => {
    return selectedInvoiceDays.map(day => ({
      id: day.id,
      date: day.date,
      dateLabel: new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      inLabel: day.first_entry || '—',
      outLabel: day.last_exit || '—',
      breakLabel: day.break_minutes > 0 ? `${day.break_minutes}m` : '—',
      totalLabel: formatDuration(day.total_minutes),
      totalMinutes: day.total_minutes,
      rawEntry: day,
    }));
  }, [selectedInvoiceDays, formatDuration]);

  const cancelDateRange = () => {
    setDateRangeMode(false);
    setRangeStartDate(null);
    setRangeEndDate(null);
    setRangeSessions([]);
    setHourlyClientName('');
    setHourlyClientStreet('');
    setHourlyClientCity('');
    setHourlyClientProvince('');
    setHourlyClientPostal('');
    setHourlyClientPhone('');
    setShowNewClientInput(false);
    setManualHoursText('');
    setManualHoursConfirmed(false);
  };

  interface RecipientOption {
    type: 'saved' | 'contact';
    name: string;
    subtitle: string;
    phone: string;
    clientData?: typeof invoiceStore.clients[0];
  }

  const handleSelectRecipient = (recipient: RecipientOption) => {
    setHourlyClientName(recipient.name);
    setHourlyClientPhone(recipient.phone);
    if (recipient.type === 'saved' && recipient.clientData) {
      setHourlyClientStreet(recipient.clientData.address_street || '');
      setHourlyClientCity(recipient.clientData.address_city || '');
      setHourlyClientProvince(recipient.clientData.address_province || '');
      setHourlyClientPostal(recipient.clientData.address_postal_code || '');
    } else {
      setHourlyClientStreet('');
      setHourlyClientCity('');
      setHourlyClientProvince('');
      setHourlyClientPostal('');
    }
  };

  const handleRecipientNext = () => {
    if (!hourlyClientName.trim()) {
      Alert.alert('Missing Recipient', 'Please enter or select a recipient name.');
      return;
    }
    setWizardStep(3);
  };

  const handleWizardBack = () => {
    if (wizardStep === 1) handleWizardClose();
    else setWizardStep((wizardStep - 1) as 1 | 2 | 3);
  };

  const handleWizardClose = () => {
    if (rangeStartDate || hourlyClientName) {
      Alert.alert('Discard this invoice?', 'Your progress will be lost.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => {
          cancelDateRange();
          setShowHourlyWizard(false);
          setWizardStep(1);
          setWizardRateOverride(null);

        }},
      ]);
    } else {
      cancelDateRange();
      setShowHourlyWizard(false);
      setWizardStep(1);
      setWizardRateOverride(null);
    }
  };

  const handleGenerateHourlyInvoice = async () => {
    if (!hookUserId || !rangeStartDate || !rangeEndDate) return;
    const sessions = getSessionsInRange();

    setIsExporting(true);
    try {
      // Save client
      if (hourlyClientName.trim()) {
        invoiceStore.saveClient({
          userId: hookUserId,
          clientName: hourlyClientName.trim(),
          addressStreet: hourlyClientStreet,
          addressCity: hourlyClientCity,
          addressProvince: hourlyClientProvince,
          addressPostalCode: hourlyClientPostal,
        });
      }

      // Get raw daily_hours records for invoice PDF
      const startStr = toLocalDateString(rangeStartDate);
      const endStr = toLocalDateString(rangeEndDate);

      const days = getDailyHoursByPeriod(hookUserId, startStr, endStr);

      const result = await invoiceStore.createHourlyInvoice({
        userId: hookUserId,
        clientName: hourlyClientName.trim() || 'Client',
        clientAddress: {
          street: hourlyClientStreet,
          city: hourlyClientCity,
          province: hourlyClientProvince,
          postalCode: hourlyClientPostal,
        },
        days: days as unknown as DailyHoursDB[],
        hourlyRate: wizardRateOverride ?? (businessProfile?.default_hourly_rate || 0),
        taxRate: businessProfile?.tax_rate || 0,
        periodStart: startStr,
        periodEnd: endStr,
        dueDate: toLocalDateString(hourlyDueDateObj),
      });

      if (result) {
        setSuccessInvoice({
          number: result.invoice_number,
          pdfUri: result.pdf_uri || '',
          total: result.total || 0,
        });
        setWizardStep(1);
        setWizardRateOverride(null);
        cancelDateRange();
        if (Platform.OS === 'ios') {
          // iOS: defer success modal open until wizard's onDismiss fires
          // (prevents UIKit double-modal race that freezes the tab)
          setPendingSuccessModal(true);
          setShowHourlyWizard(false);
        } else {
          // Android: onDismiss is iOS-only, so delay via setTimeout to let
          // the slide-down animation finish before opening the next modal.
          // Chaining both in the same tick locks up RN's modal stack.
          setShowHourlyWizard(false);
          setTimeout(() => setShowSuccessModal(true), 350);
        }
      } else {
        Alert.alert('Error', 'Failed to create invoice.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate invoice');
    } finally {
      setIsExporting(false);
    }
  };

  // (hourly view activation now handled by wizard modal open)

  useEffect(() => {
    if (showDayModal) {
      Animated.parallel([
        Animated.spring(modalScale, { toValue: 1, tension: 35, friction: 12, useNativeDriver: true }),
        Animated.timing(modalOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      modalScale.setValue(0);
      modalOpacity.setValue(0);
      setPressedDayKey(null);
      setShowDetails(false);
      setDetailSegments([]);
    }
  }, [showDayModal, modalScale, modalOpacity]);

  // ============================================
  // SERVICES FORM HELPERS
  // ============================================
  const resetServicesForm = () => {
    setSvcClientName('');
    setSvcClientStreet('');
    setSvcClientCity('');
    setSvcClientProvince('');
    setSvcClientPostal('');
    setSvcClientEmail('');
    setSvcClientPhone('');
    setSvcItems([newLineItem()]);
    setSvcTaxRate(businessProfile?.tax_rate ? String(businessProfile.tax_rate) : '');
    setSvcNotes('');
    setSvcJobSite('');
  };

  const filteredClients = useMemo(() => {
    if (!svcClientName || svcClientName.length < 2) return [];
    const lower = svcClientName.toLowerCase();
    return invoiceStore.clients.filter(c => c.client_name.toLowerCase().includes(lower));
  }, [svcClientName, invoiceStore.clients]);

  const selectClient = (client: typeof invoiceStore.clients[0]) => {
    setSvcClientName(client.client_name);
    setSvcClientStreet(client.address_street || '');
    setSvcClientCity(client.address_city || '');
    setSvcClientProvince(client.address_province || '');
    setSvcClientPostal(client.address_postal_code || '');
    setSvcClientEmail(client.email || '');
    setSvcClientPhone(client.phone || '');
    setShowClientSuggestions(false);
  };

  const addLineItem = () => {
    setSvcItems(prev => [...prev, newLineItem()]);
  };

  const removeLineItem = (id: string) => {
    setSvcItems(prev => prev.length <= 1 ? prev : prev.filter(i => i.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setSvcItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addPresetItem = (presetId: string) => {
    const preset = CONSTRUCTION_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const desc = svcJobSite ? applyJobSite(preset.template, svcJobSite) : preset.template;
    setSvcItems(prev => [...prev, { id: Date.now().toString(), description: desc, quantity: '1', unitPrice: '' }]);
    setShowPresetPicker(false);
  };

  const svcSubtotal = useMemo(() => {
    return svcItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [svcItems]);

  const svcTaxAmount = useMemo(() => {
    const rate = parseFloat(svcTaxRate) || 0;
    return Math.round(svcSubtotal * (rate / 100) * 100) / 100;
  }, [svcSubtotal, svcTaxRate]);

  const svcTotal = useMemo(() => {
    return Math.round((svcSubtotal + svcTaxAmount) * 100) / 100;
  }, [svcSubtotal, svcTaxAmount]);

  const handleGenerateServicesInvoice = async () => {
    if (!userId) return;
    if (!svcClientName.trim()) { Alert.alert('Missing Client', 'Please enter a client name.'); return; }
    const validItems = svcItems.filter(i => i.description.trim() && parseFloat(i.unitPrice) > 0);
    if (validItems.length === 0) { Alert.alert('No Items', 'Add at least one item with a description and price.'); return; }

    setIsGeneratingServices(true);
    try {
      const clientAddress: ClientAddress | null = svcClientStreet ? {
        street: svcClientStreet,
        city: svcClientCity,
        province: svcClientProvince,
        postalCode: svcClientPostal,
        email: svcClientEmail || null,
        phone: svcClientPhone || null,
      } : null;

      // Save client for future autocomplete
      if (svcClientName.trim()) {
        invoiceStore.saveClient({
          userId,
          clientName: svcClientName.trim(),
          addressStreet: svcClientStreet,
          addressCity: svcClientCity,
          addressProvince: svcClientProvince,
          addressPostalCode: svcClientPostal,
          email: svcClientEmail || null,
          phone: svcClientPhone || null,
        });
      }

      const result = await invoiceStore.createProductsInvoice({
        userId,
        clientName: svcClientName.trim(),
        clientAddress,
        items: validItems.map(i => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unitPrice: parseFloat(i.unitPrice) || 0,
        })),
        taxRate: parseFloat(svcTaxRate) || 0,
        notes: svcNotes || undefined,
      });

      if (result) {
        Alert.alert('Invoice Created', `Invoice ${result.invoice_number} generated successfully.`);
        resetServicesForm();
        setActiveView('hub');
        invoiceStore.loadDashboard(userId);
      } else {
        Alert.alert('Error', 'Failed to create invoice.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create invoice.');
    } finally {
      setIsGeneratingServices(false);
    }
  };

  // ============================================
  // WIZARD COMPUTED VALUES
  // ============================================
  const rangeStep = !rangeStartDate ? 'start' : !rangeEndDate ? 'end' : 'complete';
  const canGenerate = rangeStartDate && rangeEndDate;
  const hasZeroHours = rangeSessions.length === 0 && !manualHoursConfirmed;

  const emptyDaysInRange = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate) return 0;
    let count = 0;
    const d = new Date(rangeStartDate);
    const end = new Date(rangeEndDate);
    d.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (getTotalMinutesForDay(d) === 0) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }, [rangeStartDate, rangeEndDate, getTotalMinutesForDay]);

  const totalDaysInRange = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate) return 0;
    return Math.floor((rangeEndDate.getTime() - rangeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [rangeStartDate, rangeEndDate]);

  // Show zero-hours snackbar for 3s when range is complete with no sessions
  useEffect(() => {
    if (rangeStep === 'complete' && rangeSessions.length === 0 && !manualHoursConfirmed) {
      setShowZeroSnackbar(true);
      const timer = setTimeout(() => setShowZeroSnackbar(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowZeroSnackbar(false);
    }
  }, [rangeStep, rangeSessions.length, manualHoursConfirmed]);

  const handleInlineEntrySave = async () => {
    if (!inlineEntryDate || !hookUserId) return;
    const inMs = inlineIn.getHours() * 60 + inlineIn.getMinutes();
    const outMs = inlineOut.getHours() * 60 + inlineOut.getMinutes();
    const totalMinutes = Math.max(0, outMs - inMs - inlineBreak);
    if (totalMinutes <= 0) { Alert.alert('Invalid', 'Out time must be after In time.'); return; }

    const dateStr = toLocalDateString(inlineEntryDate);
    const firstEntry = `${String(inlineIn.getHours()).padStart(2, '0')}:${String(inlineIn.getMinutes()).padStart(2, '0')}`;
    const lastExit = `${String(inlineOut.getHours()).padStart(2, '0')}:${String(inlineOut.getMinutes()).padStart(2, '0')}`;

    upsertDailyHours({
      userId: hookUserId,
      date: dateStr,
      totalMinutes,
      breakMinutes: inlineBreak,
      firstEntry,
      lastExit,
      source: 'manual',
    });

    // Refresh range sessions
    if (rangeStartDate && rangeEndDate) {
      const startTime = new Date(rangeStartDate); startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(rangeEndDate); endTime.setHours(23, 59, 59, 999);
      try {
        const sessions = await getSessionsByPeriod(startTime.toISOString(), endTime.toISOString());
        setRangeSessions(sessions.filter((s: ComputedSession) => s.exit_at));
      } catch { /* ignore */ }
    }

    setInlineEntryDate(null);
    setInlineTimePicker(null);
  };

  const openInlineEntry = (date: Date) => {
    setInlineEntryDate(date);
    const d1 = new Date(); d1.setHours(8, 0, 0, 0);
    const d2 = new Date(); d2.setHours(17, 0, 0, 0);
    setInlineIn(d1);
    setInlineOut(d2);
    setInlineBreak(0);
    setInlineTimePicker(null);
  };

  const openDayDetail = (date: Date) => {
    if (!hookUserId) return;
    const dateStr = toLocalDateString(date);
    const entry = getDailyHours(hookUserId, dateStr);
    setDetailDate(date);
    setDetailData(entry);
  };

  const handleEditOnLog = () => {
    if (!detailDate) return;
    const dateStr = toLocalDateString(detailDate);
    setDetailDate(null);
    setDetailData(null);
    // Navigate to Log tab with date param
    router.push({ pathname: '/(tabs)/reports', params: { editDate: dateStr } });
  };

  const handleConfirmManualHours = () => {
    const parsed = parseFloat(manualHoursText.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid hours', 'Enter a number greater than 0.');
      return;
    }
    if (parsed > 999) {
      Alert.alert('Invalid hours', 'Please check your entry.');
      return;
    }
    setManualHoursConfirmed(true);
  };

  const formatDueDateDisplay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const openHourlyDueDatePicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: hourlyDueDateObj,
        mode: 'date',
        display: 'calendar',
        onChange: (_e: DateTimePickerEvent, date?: Date) => {
          if (date) setHourlyDueDateObj(date);
        },
      });
    } else {
      setShowHourlyDuePicker(true);
    }
  }, [hourlyDueDateObj]);

  // ============================================
  // HUB VIEW
  // ============================================
  if (activeView === 'hub') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ScrollView
          style={hubStyles.container}
          contentContainerStyle={hubStyles.content}
          showsVerticalScrollIndicator={false}
        >
          <HeaderRow title="Invoices" />

          {/* My Profile */}
          <PressableOpacity
            style={hubStyles.profileBtn}
            activeOpacity={0.7}
            onPress={() => router.navigate('/business-profile' as any)}
          >
            <Ionicons name="person-circle-outline" size={44} color={colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={hubStyles.profileBtnTitle}>My Profile</Text>
              {businessProfile?.business_name ? (
                <Text style={hubStyles.profileBtnSub}>{businessProfile.business_name}</Text>
              ) : (
                <Text style={hubStyles.profileBtnSub}>Set up your profile</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={withOpacity(colors.white, 0.6)} />
          </PressableOpacity>

          {/* Two Cards */}
          <View style={hubStyles.cardsRow}>
            <PressableOpacity
              style={hubStyles.typeCard}
              activeOpacity={0.7}
              onPress={() => {
                setShowHourlyWizard(true);
                setWizardStep(1);
                setDateRangeMode(true);
                setRangeStartDate(null);
                setRangeEndDate(null);
                setRangeSessions([]);
                setHourlyDueDateObj(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; });
                setShowHourlyDuePicker(false);
                reloadToday();
                // Auto-select last used client
                const lastClient = invoiceStore.clients[0];
                if (lastClient) {
                  setHourlyClientName(lastClient.client_name);
                  setHourlyClientPhone(lastClient.phone || '');
                  setHourlyClientStreet(lastClient.address_street || '');
                  setHourlyClientCity(lastClient.address_city || '');
                  setHourlyClientProvince(lastClient.address_province || '');
                  setHourlyClientPostal(lastClient.address_postal_code || '');
                }
              }}
            >
              <View style={[hubStyles.typeCardIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="time-outline" size={28} color={colors.primary} />
              </View>
              <Text style={hubStyles.typeCardTitle}>Invoice by Hours</Text>
              <Text style={hubStyles.typeCardSubtitle}>Select dates from calendar</Text>
            </PressableOpacity>

            <PressableOpacity
              style={hubStyles.typeCard}
              activeOpacity={0.7}
              onPress={() => {
                resetServicesForm();
                setActiveView('services');
              }}
            >
              <View style={[hubStyles.typeCardIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="list-outline" size={28} color={colors.accent} />
              </View>
              <Text style={hubStyles.typeCardTitle}>Invoice by Services</Text>
              <Text style={hubStyles.typeCardSubtitle}>Add line items manually</Text>
            </PressableOpacity>
          </View>

          {/* Recent Invoices — title always visible */}
          <View style={hubStyles.section}>
            <Text style={hubStyles.sectionTitle}>RECENT INVOICES</Text>
            {invoiceStore.recentInvoices.length === 0 ? (
              <View style={hubStyles.emptyState}>
                <Ionicons name="receipt-outline" size={20} color={colors.iconMuted} />
                <Text style={hubStyles.emptyText}>Your invoices will appear here</Text>
              </View>
            ) : (
              invoiceStore.recentInvoices.slice(0, 10).map((inv) => (
                <Swipeable
                  key={inv.id}
                  renderRightActions={() => (
                    <PressableOpacity
                      style={hubStyles.swipeDeleteBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        Alert.alert(
                          'Delete Invoice',
                          `Delete ${inv.invoice_number}? This cannot be undone.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                if (userId) invoiceStore.deleteInvoice(userId, inv.id);
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.white} />
                    </PressableOpacity>
                  )}
                  overshootRight={false}
                >
                  <PressableOpacity
                    style={hubStyles.invoiceRow}
                    activeOpacity={0.7}
                    onPress={() => openInvoiceDetail(inv)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={hubStyles.invoiceNumber}>{inv.invoice_number}</Text>
                      <Text style={hubStyles.invoiceClient}>{inv.client_name}</Text>
                    </View>
                    <Text style={hubStyles.invoiceTotal}>{formatMoney(inv.total)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.iconMuted} style={{ marginLeft: 6 }} />
                  </PressableOpacity>
                </Swipeable>
              ))
            )}
          </View>

        </ScrollView>

        {/* ============================================ */}
        {/* INVOICE DETAIL MODAL */}
        {/* ============================================ */}
        <Modal
          visible={!!selectedInvoice}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setSelectedInvoice(null)}
        >
          <View style={detailStyles.overlay}>
            <View style={detailStyles.sheet}>

              {selectedInvoice && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  {/* ========== INVOICE CARD (dual Read/Edit mode) ========== */}
                  <InvoiceSummaryCard
                    invoiceNumber={selectedInvoice.invoice_number}
                    createdAt={selectedInvoice.created_at}
                    onClose={() => setSelectedInvoice(null)}
                    clientName={selectedInvoice.client_name || ''}
                    clientPhone={detailClientData?.phone || undefined}
                    clientAddress={[detailClientData?.address_street, detailClientData?.address_city, detailClientData?.address_province, detailClientData?.address_postal_code].filter(Boolean).join(', ') || undefined}
                    clientEmail={detailClientData?.email || undefined}
                    onEditClient={handleEditClientFromDetail}
                    dueDate={selectedInvoice.due_date
                      ? new Date(selectedInvoice.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : undefined}
                    dueDateISO={selectedInvoice.due_date || undefined}
                    days={selectedInvoice.type === 'hourly' ? detailDays : []}
                    totalDays={selectedInvoiceDays.length}
                    totalMinutes={selectedInvoiceDays.reduce((sum, d) => sum + d.total_minutes, 0)}
                    totalLabel={formatDuration(selectedInvoiceDays.reduce((sum, d) => sum + d.total_minutes, 0))}
                    rate={selectedInvoice.hourly_rate || 0}
                    taxRate={selectedInvoice.tax_rate || 0}
                    taxLabel={selectedInvoice.tax_rate === 13 ? 'HST' : 'Tax'}
                    lineItems={selectedInvoice.type === 'products_services' ? selectedInvoiceItems.map(item => ({
                      id: item.id,
                      description: item.description,
                      quantity: item.quantity,
                      unitPrice: item.unit_price,
                      total: item.total,
                    })) : undefined}
                    notes={selectedInvoice.notes || undefined}
                    fromName={businessProfile?.business_name || undefined}
                    fromPhone={businessProfile?.phone || undefined}
                    fromAddress={[businessProfile?.address_street, businessProfile?.address_city, businessProfile?.address_province, businessProfile?.address_postal_code].filter(Boolean).join(', ') || undefined}
                    fromEmail={businessProfile?.email || undefined}
                    onEditFrom={handleEditFromDetail}
                    onSave={async (changes: InvoiceSummaryChanges) => {
                      if (!userId || !selectedInvoice) return;

                      // 1. Update day hours in SQLite
                      if (changes.dayUpdates) {
                        for (const du of changes.dayUpdates) {
                          updateDailyHours(userId, du.date, {
                            firstEntry: du.firstEntry || undefined,
                            lastExit: du.lastExit || undefined,
                            breakMinutes: du.breakMinutes,
                            totalMinutes: du.totalMinutes,
                          });
                        }
                      }

                      // 2. Recalculate totals
                      const newRate = changes.rate ?? selectedInvoice.hourly_rate ?? 0;
                      let subtotalVal: number;
                      let newItems: { description: string; quantity: number; unitPrice: number; total: number }[] | undefined;

                      if (changes.lineItems) {
                        newItems = changes.lineItems;
                        subtotalVal = newItems.reduce((sum, i) => sum + i.total, 0);
                      } else if (selectedInvoice.type === 'hourly' && (changes.dayUpdates || changes.rate !== undefined)) {
                        // Reload days and recalculate
                        const updatedDays = selectedInvoice.period_start && selectedInvoice.period_end
                          ? getDailyHoursByPeriod(userId, selectedInvoice.period_start, selectedInvoice.period_end)
                          : [];
                        setSelectedInvoiceDays(updatedDays);
                        const totalMins = updatedDays.reduce((sum, d) => sum + d.total_minutes, 0);
                        subtotalVal = Math.round((totalMins / 60) * newRate * 100) / 100;
                      } else {
                        subtotalVal = selectedInvoice.subtotal;
                      }

                      const taxRateVal = selectedInvoice.tax_rate;
                      const taxAmountVal = Math.round(subtotalVal * (taxRateVal / 100) * 100) / 100;
                      const totalVal = Math.round((subtotalVal + taxAmountVal) * 100) / 100;

                      // 3. Update invoice record
                      const updated = await invoiceStore.updateInvoice(userId, selectedInvoice.id, {
                        ...(changes.rate !== undefined && { hourlyRate: changes.rate }),
                        ...(changes.notes !== undefined && { notes: changes.notes || null }),
                        ...(changes.dueDate !== undefined && { dueDate: changes.dueDate }),
                        subtotal: subtotalVal,
                        taxAmount: taxAmountVal,
                        total: totalVal,
                      }, newItems);

                      if (updated) {
                        setSelectedInvoice(updated);
                        // Reload days if hourly
                        if (updated.type === 'hourly' && updated.period_start && updated.period_end) {
                          setSelectedInvoiceDays(getDailyHoursByPeriod(userId, updated.period_start, updated.period_end));
                        }
                        if (updated.type === 'products_services') {
                          setSelectedInvoiceItems(getInvoiceItems(updated.id));
                        }
                      }
                    }}
                  />

                  {/* Action buttons (Share + Delete only — Edit is now ✎ on card) */}
                  <View style={detailStyles.actionsSection}>
                    {/* Share PDF */}
                    <PressableOpacity
                      style={[detailStyles.shareBtn, isRegeneratingPdf && { opacity: 0.6 }]}
                      activeOpacity={0.7}
                      disabled={isRegeneratingPdf}
                      onPress={async () => {
                        if (!userId) return;
                        let pdfUri = selectedInvoice.pdf_uri;

                        // Check if cached PDF still exists on disk
                        if (pdfUri) {
                          try {
                            const info = await FileSystem.getInfoAsync(pdfUri);
                            if (!info.exists) pdfUri = null;
                          } catch {
                            pdfUri = null;
                          }
                        }

                        if (!pdfUri) {
                          setIsRegeneratingPdf(true);
                          try {
                            pdfUri = await invoiceStore.regeneratePdf(userId, selectedInvoice);
                          } catch (err) {
                            logger.error('invoice', 'PDF regeneration error', { error: String(err) });
                          } finally {
                            setIsRegeneratingPdf(false);
                          }
                        }

                        if (pdfUri) {
                          try {
                            await Sharing.shareAsync(pdfUri, {
                              mimeType: 'application/pdf',
                              dialogTitle: `Share ${selectedInvoice.invoice_number}`,
                            });
                          } catch {
                            // User cancelled share dialog
                          }
                        } else {
                          Alert.alert('Error', 'Could not generate PDF. Please try again.');
                        }
                      }}
                    >
                      <Ionicons name="share-outline" size={18} color={colors.white} />
                      <Text style={detailStyles.shareBtnText}>
                        {isRegeneratingPdf ? 'Generating PDF...' : 'Share PDF'}
                      </Text>
                    </PressableOpacity>

                    {/* Delete */}
                    <PressableOpacity
                      style={detailStyles.deleteBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        Alert.alert(
                          'Delete Invoice',
                          `Delete ${selectedInvoice.invoice_number}? This cannot be undone.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                if (userId) {
                                  invoiceStore.deleteInvoice(userId, selectedInvoice.id);
                                  setSelectedInvoice(null);
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                      <Text style={detailStyles.deleteBtnText}>Delete Invoice</Text>
                    </PressableOpacity>
                  </View>
                </ScrollView>
              )}

              {/* Close button now inside InvoiceSummaryCard header */}
            </View>
          </View>
        </Modal>

        {/* ============================================ */}
        {/* DAY EDIT MODAL (inline time table editing) */}
        {/* ============================================ */}
        <Modal
          visible={!!dayEditEntry}
          transparent
          animationType="fade"
          onRequestClose={closeDayEdit}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
              onPress={closeDayEdit}
            >
              <Pressable
                style={{
                  backgroundColor: colors.white,
                  borderRadius: 16,
                  width: '88%',
                  maxWidth: 360,
                  padding: 20,
                }}
                onPress={() => {}}
              >
                {dayEditEntry && (() => {
                  const d = new Date(dayEditEntry.date + 'T12:00:00');
                  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <>
                      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                        Edit Hours
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
                        {dateLabel}
                      </Text>

                      {/* Entry / Exit row */}
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={dayEditStyles.label}>ENTRY</Text>
                          <TextInput
                            style={dayEditStyles.input}
                            value={dayEditIn}
                            onChangeText={setDayEditIn}
                            placeholder="08:00"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={dayEditStyles.label}>EXIT</Text>
                          <TextInput
                            style={dayEditStyles.input}
                            value={dayEditOut}
                            onChangeText={setDayEditOut}
                            placeholder="17:00"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                          />
                        </View>
                      </View>

                      {/* Break */}
                      <View style={{ marginBottom: 16 }}>
                        <Text style={dayEditStyles.label}>BREAK (minutes)</Text>
                        <TextInput
                          style={dayEditStyles.input}
                          value={dayEditBreak}
                          onChangeText={setDayEditBreak}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                      </View>

                      {/* Live total preview */}
                      {(() => {
                        const parseT = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
                        const eMin = dayEditIn ? parseT(dayEditIn) : 0;
                        const xMin = dayEditOut ? parseT(dayEditOut) : 0;
                        const bMin = parseInt(dayEditBreak) || 0;
                        const net = Math.max(0, (xMin > eMin ? xMin - eMin : 0) - bMin);
                        return (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>TOTAL</Text>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{formatDuration(net)}</Text>
                          </View>
                        );
                      })()}

                      {/* Buttons */}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <PressableOpacity
                          onPress={closeDayEdit}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 15, color: colors.textSecondary }}>Cancel</Text>
                        </PressableOpacity>
                        <PressableOpacity
                          onPress={handleSaveDayEdit}
                          disabled={dayEditSaving}
                          style={{ flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, opacity: dayEditSaving ? 0.6 : 1 }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.white }}>
                            {dayEditSaving ? 'Saving...' : 'Save'}
                          </Text>
                        </PressableOpacity>
                      </View>
                    </>
                  );
                })()}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* ============================================ */}
        {/* HOURLY WIZARD MODAL (3-Step) */}
        {/* ============================================ */}
        <Modal
          visible={showHourlyWizard}
          transparent
          animationType="slide"
          onRequestClose={handleWizardClose}
          onDismiss={() => {
            // iOS only: fires AFTER dismiss animation completes
            if (pendingSuccessModal) {
              setPendingSuccessModal(false);
              setShowSuccessModal(true);
            }
          }}
        >
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={wizardStyles.overlay}>
            <View style={wizardStyles.sheet}>

              {/* Shared header: back + title + dots */}
              <View style={wizardStyles.header}>
                <PressableOpacity style={wizardStyles.backBtn} onPress={handleWizardBack}>
                  <Ionicons name="arrow-back" size={20} color={colors.text} />
                </PressableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={wizardStyles.headerTitle}>
                    {wizardStep === 1 ? 'Invoice by Hours' : wizardStep === 2 ? 'Send To' : 'Invoice Summary'}
                  </Text>
                </View>
                <View style={wizardStyles.dotsRow}>
                  {[1, 2, 3].map(i => (
                    <View key={i} style={[wizardStyles.dot, i <= wizardStep && wizardStyles.dotActive]} />
                  ))}
                </View>
                <PressableOpacity onPress={handleWizardClose} hitSlop={8} style={{ marginLeft: spacing.md }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </PressableOpacity>
              </View>

              {/* ===== STEP 1: Calendar ===== */}
              {wizardStep === 1 && (
                <>
                  <View style={wizardStyles.calendarNav}>
                    <PressableOpacity style={historyStyles.navBtn} onPress={goToPreviousMonth}>
                      <Ionicons name="chevron-back" size={22} color={colors.primary} />
                    </PressableOpacity>
                    <PressableOpacity onPress={goToCurrentMonth} style={styles.calendarCenter}>
                      <Text style={historyStyles.calendarTitle}>{formatMonthYear(currentMonth)}</Text>
                    </PressableOpacity>
                    <PressableOpacity style={historyStyles.navBtn} onPress={goToNextMonth}>
                      <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                    </PressableOpacity>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Instruction + DATE SELECTION CARDS (above calendar) */}
                    <Text style={datePickerStyles.sectionTitle}>
                      {rangeStep === 'complete'
                        ? 'Date range selected'
                        : 'Select the date range for this invoice'}
                    </Text>

                    <View style={datePickerStyles.dateCardsRow}>
                      <PressableOpacity
                        style={[
                          datePickerStyles.dateCard,
                          rangeStep === 'start' && datePickerStyles.dateCardActive,
                          rangeStartDate && datePickerStyles.dateCardFilled,
                        ]}
                        onPress={() => { setRangeStartDate(null); setRangeEndDate(null); setRangeSessions([]); }}
                      >
                        <Text style={datePickerStyles.dateCardLabel}>START</Text>
                        {rangeStartDate ? (
                          <Text style={[datePickerStyles.dateCardValue, datePickerStyles.dateCardValueFilled]}>
                            {rangeStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        ) : (
                          <Text style={datePickerStyles.dateCardPlaceholder}>Tap a day</Text>
                        )}
                      </PressableOpacity>

                      <View style={datePickerStyles.dateCardsArrow}>
                        <Ionicons name="arrow-forward" size={18} color={rangeStep === 'complete' ? colors.primary : colors.textMuted} />
                      </View>

                      <View
                        style={[
                          datePickerStyles.dateCard,
                          rangeStep === 'end' && datePickerStyles.dateCardActive,
                          rangeEndDate && datePickerStyles.dateCardFilled,
                        ]}
                      >
                        <Text style={datePickerStyles.dateCardLabel}>END</Text>
                        {rangeEndDate ? (
                          <Text style={[datePickerStyles.dateCardValue, datePickerStyles.dateCardValueFilled]}>
                            {rangeEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        ) : (
                          <Text style={datePickerStyles.dateCardPlaceholder}>
                            {rangeStartDate ? 'Tap end date' : '\u2014'}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Instruction hint */}
                    {rangeStep !== 'complete' && (
                      <View style={datePickerStyles.hintRow}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                        <Text style={datePickerStyles.hintText}>
                          {rangeStep === 'start' ? 'Tap a day on the calendar below' : 'Now tap a day to set the end date'}
                        </Text>
                      </View>
                    )}

                    {/* Calendar */}
                    <Calendar
                      currentMonth={currentMonth}
                      onMonthChange={() => {}}
                      mode={dateRangeMode ? 'range' : 'single'}
                      showHeader={false}
                      getRangePosition={dateRangeMode ? (date: Date) => isInDateRange(date) : undefined}
                      onRangeSelect={dateRangeMode ? handleDateRangeSelect : undefined}
                      onDayPress={!dateRangeMode ? (dayKey: string, hasData: boolean) => handleDayPress(dayKey, hasData) : undefined}
                      getDayMinutes={(date) => getTotalMinutesForDay(date)}
                      containerWidth={screenWidth - 20}
                    />

                    {/* Warning pill for SOME empty days (mix of filled and empty) */}
                    {rangeStep === 'complete' && emptyDaysInRange > 0 && rangeSessions.length > 0 && (
                      <View style={datePickerStyles.warningPill}>
                        <Ionicons name="alert-circle" size={16} color="#854F0B" />
                        <Text style={datePickerStyles.warningPillText}>
                          {emptyDaysInRange} day{emptyDaysInRange > 1 ? 's' : ''} with no hours — tap to add
                        </Text>
                      </View>
                    )}

                    {/* ====== ZERO HOURS SNACKBAR — auto-dismiss 3s ====== */}
                    {showZeroSnackbar && (
                      <View style={datePickerStyles.snackbar}>
                        <Ionicons name="information-circle-outline" size={16} color="#fff" />
                        <Text style={datePickerStyles.snackbarText}>
                          0 hours logged — invoice will be $0
                        </Text>
                      </View>
                    )}


                  </ScrollView>

                  {/* Step 1 Footer */}
                  <View style={wizardStyles.footer}>
                    <PressableOpacity
                      style={[wizardStyles.btnCharcoal, !canGenerate && wizardStyles.btnDisabled]}
                      activeOpacity={0.7}
                      onPress={() => setWizardStep(2)}
                      disabled={!canGenerate}
                    >
                      <Text style={[wizardStyles.btnCharcoalText, !canGenerate && wizardStyles.btnDisabledText]}>
                        {!rangeStartDate
                          ? 'Select dates first'
                          : !rangeEndDate
                            ? 'Select end date'
                            : hasZeroHours
                              ? 'Next (0 hours) \u2192'
                              : 'Next \u2192'
                        }
                      </Text>
                    </PressableOpacity>
                  </View>
                </>
              )}

              {/* ===== STEP 2: Send To ===== */}
              {wizardStep === 2 && (
                <View style={{ flex: 1 }}>
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
                    <View style={recipientStyles.card}>
                      <View style={recipientStyles.cardHeader}>
                        <View style={recipientStyles.stepCircle}>
                          <Text style={recipientStyles.stepCircleText}>1</Text>
                        </View>
                        <Text style={recipientStyles.cardTitle}>To</Text>
                      </View>

                      {invoiceStore.clients.slice(0, 2).map((c) => (
                        <PressableOpacity
                          key={c.id}
                          style={[recipientStyles.clientRow, hourlyClientName === c.client_name && recipientStyles.clientRowSelected]}
                          onPress={() => {
                            handleSelectRecipient({
                              type: 'saved', name: c.client_name,
                              subtitle: c.address_city || '', phone: c.phone || '',
                              clientData: c,
                            });
                          }}
                        >
                          <View style={[recipientStyles.avatar, { backgroundColor: withOpacity(getInitialsColor(c.client_name), 0.15) }]}>
                            <Text style={[recipientStyles.avatarText, { color: getInitialsColor(c.client_name) }]}>{getInitials(c.client_name)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={recipientStyles.clientName}>{c.client_name}</Text>
                            <Text style={recipientStyles.clientSub}>
                              {lastInvoiceByClient[c.client_name]
                                ? `Last invoice: ${lastInvoiceByClient[c.client_name]}`
                                : c.address_city || 'No invoices yet'}
                            </Text>
                          </View>
                          {hourlyClientName === c.client_name
                            ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                            : (
                              <PressableOpacity
                                onPress={() => userId && invoiceStore.removeClient(userId, c.id)}
                                style={recipientStyles.deleteClientBtn}
                                hitSlop={8}
                              >
                                <Ionicons name="close" size={16} color={colors.textMuted} />
                              </PressableOpacity>
                            )
                          }
                        </PressableOpacity>
                      ))}

                      {!showNewClientInput ? (
                        <PressableOpacity style={recipientStyles.newClientBtn} onPress={() => setShowNewClientInput(true)}>
                          <Ionicons name="add" size={20} color={colors.textSecondary} />
                          <Text style={recipientStyles.newClientBtnText}>New client</Text>
                        </PressableOpacity>
                      ) : (
                        <View style={recipientStyles.newClientInputRow}>
                          <TextInput
                            style={recipientStyles.newClientInput}
                            placeholder="Send to..."
                            placeholderTextColor={colors.textMuted}
                            value={hourlyClientName}
                            onChangeText={setHourlyClientName}
                            autoFocus
                          />
                          <PressableOpacity
                            style={recipientStyles.fullFormBtn}
                            onPress={() => setShowWizardClientEdit(true)}
                            activeOpacity={0.7}
                            accessibilityLabel="Open full client form"
                          >
                            <Ionicons name="person-add-outline" size={20} color={colors.text} />
                          </PressableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Due Date Card */}
                    <View style={[recipientStyles.card, { marginTop: 12 }]}>
                      <View style={recipientStyles.cardHeader}>
                        <View style={recipientStyles.stepCircle}>
                          <Text style={recipientStyles.stepCircleText}>2</Text>
                        </View>
                        <Text style={recipientStyles.cardTitle}>Due Date</Text>
                      </View>

                      <PressableOpacity
                        style={dueDateStyles.chip}
                        onPress={openHourlyDueDatePicker}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                        <Text style={dueDateStyles.chipText}>{formatDueDateDisplay(hourlyDueDateObj)}</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                      </PressableOpacity>

                      {/* iOS inline date picker */}
                      {Platform.OS === 'ios' && showHourlyDuePicker && (
                        <View style={dueDateStyles.iosPicker}>
                          <View style={dueDateStyles.iosPickerHeader}>
                            <Text style={dueDateStyles.iosPickerTitle}>Due Date</Text>
                            <PressableOpacity onPress={() => setShowHourlyDuePicker(false)}>
                              <Text style={dueDateStyles.iosPickerDone}>Done</Text>
                            </PressableOpacity>
                          </View>
                          <DateTimePicker
                            value={hourlyDueDateObj}
                            mode="date"
                            display="inline"
                            themeVariant="light"
                            onChange={(_e: DateTimePickerEvent, date?: Date) => { if (date) setHourlyDueDateObj(date); }}
                            style={{ height: 320 }}
                          />
                        </View>
                      )}
                    </View>

                  </ScrollView>

                  <View style={wizardStyles.footer}>
                    <PressableOpacity
                      style={[wizardStyles.btnCharcoal, !hourlyClientName.trim() && wizardStyles.btnDisabled]}
                      onPress={handleRecipientNext}
                      disabled={!hourlyClientName.trim()}
                    >
                      <Text style={[wizardStyles.btnCharcoalText, !hourlyClientName.trim() && wizardStyles.btnDisabledText]}>
                        {hourlyClientName.trim() ? 'Continue \u2192' : 'Select or type a name'}
                      </Text>
                    </PressableOpacity>
                  </View>
                </View>
              )}

              {/* ===== STEP 3: Invoice Summary ===== */}
              {wizardStep === 3 && (
                <>
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }} showsVerticalScrollIndicator={false}>
                    <InvoiceSummaryCard
                      clientName={hourlyClientName}
                      clientPhone={hourlyClientPhone}
                      clientAddress={[hourlyClientStreet, hourlyClientCity, hourlyClientProvince, hourlyClientPostal].filter(Boolean).join(', ') || undefined}
                      onEditClient={() => setShowWizardClientEdit(true)}
                      dueDate={formatDueDateDisplay(hourlyDueDateObj)}
                      days={wizardDays}
                      totalDays={rangeDaysWorked}
                      totalMinutes={rangeTotalMinutes}
                      totalLabel={formatDuration(rangeTotalMinutes)}
                      onDayPress={(day) => {
                        if (!userId) return;
                        const dayEntry = getDailyHours(userId, day.date);
                        if (dayEntry) openDayEdit(dayEntry);
                      }}
                      emptyAction={!manualHoursConfirmed && getSessionsInRange().length === 0 && rangeStartDate ? {
                        label: `Add hours for ${rangeStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                        onPress: () => openInlineEntry(rangeStartDate!),
                      } : undefined}
                      manualRow={manualHoursConfirmed ? { totalLabel: formatDuration(manualTotalMinutes) } : undefined}
                      rate={wizardRateOverride ?? (businessProfile?.default_hourly_rate || 0)}
                      onRateChange={(newRate) => setWizardRateOverride(newRate)}
                      taxRate={businessProfile?.tax_rate || 0}
                      taxLabel={businessProfile?.gst_hst_number ? 'HST' : 'Tax'}
                      showZeroWarning={hasZeroHours}
                      fromName={businessProfile?.business_name || undefined}
                      fromPhone={businessProfile?.phone || undefined}
                      fromAddress={[businessProfile?.address_street, businessProfile?.address_city, businessProfile?.address_province, businessProfile?.address_postal_code].filter(Boolean).join(', ') || undefined}
                      fromEmail={businessProfile?.email || undefined}
                      onEditFrom={() => router.navigate('/business-profile' as any)}
                    />
                  </ScrollView>

                  <View style={wizardStyles.footer}>
                    <PressableOpacity
                      style={[wizardStyles.btnAmber, isExporting && { opacity: 0.6 }]}
                      onPress={handleGenerateHourlyInvoice}
                      disabled={isExporting}
                    >
                      <Ionicons name={isExporting ? 'hourglass-outline' : 'document-text-outline'} size={20} color={colors.white} />
                      <Text style={wizardStyles.btnAmberText}>
                        {isExporting ? 'Generating...' : 'Generate invoice'}
                      </Text>
                    </PressableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
          </KeyboardAvoidingView>

          {/* Client Edit Sheet (wizard) — accessible from step 2 and step 3 */}
          <ClientEditSheet
            visible={showWizardClientEdit}
            onClose={() => setShowWizardClientEdit(false)}
            onSave={(data: ClientFormData) => {
              setHourlyClientName(data.name);
              setHourlyClientPhone(data.phone);
              setHourlyClientStreet(data.addressStreet);
              setHourlyClientCity(data.addressCity);
              setHourlyClientProvince(data.addressProvince);
              setHourlyClientPostal(data.addressPostalCode);
              setShowWizardClientEdit(false);
            }}
            initialData={{
              name: hourlyClientName,
              phone: hourlyClientPhone,
              addressStreet: hourlyClientStreet,
              addressCity: hourlyClientCity,
              addressProvince: hourlyClientProvince,
              addressPostalCode: hourlyClientPostal,
            }}
            savedClients={invoiceStore.clients}
          />
        </Modal>

        {/* DAY DETAIL MODAL */}
        <Modal visible={showDayModal} transparent animationType="none" statusBarTranslucent onRequestClose={closeDayModal}>
          <Animated.View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 16, opacity: modalOpacity }}>
            <Animated.View style={{ width: '100%', height: '65%', backgroundColor: colors.backgroundSecondary, borderRadius: 20, overflow: 'hidden' as const, transform: [{ scale: modalScale }] }}>
              <View style={historyStyles.ucHeader}>
                <Text style={historyStyles.dayModalTitleV2}>
                  {selectedDayForModal?.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
                <PressableOpacity style={historyStyles.ucCloseBtn} onPress={closeDayModal}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </PressableOpacity>
              </View>
              <View style={historyStyles.ucActionBar}>
                {isEditingInline ? (
                  <>
                    <PressableOpacity style={historyStyles.ucFooterBtnSecondary} onPress={cancelInlineEdit}>
                      <Text style={historyStyles.ucFooterBtnSecondaryText}>Cancel</Text>
                    </PressableOpacity>
                    <PressableOpacity style={historyStyles.ucFooterBtnPrimary} onPress={handleSaveManualFromPicker}>
                      <Text style={historyStyles.ucFooterBtnPrimaryText}>Save</Text>
                    </PressableOpacity>
                  </>
                ) : daySession ? (
                  <>
                    <PressableOpacity style={historyStyles.ucFooterBtnSecondary} onPress={() => startInlineEdit(daySession)}>
                      <Ionicons name="pencil-outline" size={18} color={colors.text} />
                      <Text style={historyStyles.ucFooterBtnSecondaryText}>Edit</Text>
                    </PressableOpacity>
                    <PressableOpacity style={historyStyles.ucFooterBtnDanger} onPress={handleDeleteFromModal}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
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
                      <Text style={[historyStyles.ucFooterBtnSecondaryText, showAbsenceOptions && { color: colors.primary }]}>Log Absence</Text>
                    </PressableOpacity>
                  </>
                )}
              </View>
              {!isEditingInline && daySession && (daySession.pause_minutes || 0) === 0 && (
                <View style={historyStyles.noBreakBanner}>
                  <Ionicons name="cafe-outline" size={16} color={colors.warning} />
                  <Text style={historyStyles.noBreakBannerText}>Don't forget to include your break!</Text>
                </View>
              )}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={historyStyles.ucScrollContent}>
                {isEditingInline ? (
                  <View style={historyStyles.ucCard}>
                    <View style={historyStyles.ucLocationRow}>
                      <Ionicons name="location" size={18} color={colors.primary} />
                      {locations.length === 0 ? (
                        <PressableOpacity style={historyStyles.noLocationsContainer} onPress={() => { closeDayModal(); router.push('/(tabs)/map'); }}>
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
                    <View style={editStyles.timeRow}>
                      <View style={editStyles.timeCol}>
                        <Text style={editStyles.timeLabel}>ENTRY</Text>
                        <PressableOpacity style={editStyles.timePill} onPress={() => Platform.OS === 'android' ? openAndroidTimePicker('entry') : setActiveTimePicker('entry')} activeOpacity={0.7}>
                          <Text style={editStyles.timeValue}>{formatTimeDisplay(entryTime)}</Text>
                        </PressableOpacity>
                      </View>
                      <View style={editStyles.timeCol}>
                        <Text style={editStyles.timeLabel}>EXIT</Text>
                        <PressableOpacity style={editStyles.timePill} onPress={() => Platform.OS === 'android' ? openAndroidTimePicker('exit') : setActiveTimePicker('exit')} activeOpacity={0.7}>
                          <Text style={editStyles.timeValue}>{formatTimeDisplay(exitTime)}</Text>
                        </PressableOpacity>
                      </View>
                    </View>
                    <PressableOpacity style={editStyles.breakPill} onPress={() => setShowBreakPicker(true)} activeOpacity={0.7}>
                      <View style={editStyles.breakLeft}>
                        <Ionicons name="cafe-outline" size={18} color={colors.textSecondary} />
                        <Text style={editStyles.breakLabelText}>Break</Text>
                      </View>
                      <View style={editStyles.breakRight}>
                        <Text style={editStyles.breakValue}>{editBreakLabel}</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                      </View>
                    </PressableOpacity>
                    <View style={editStyles.totalPill}>
                      <Text style={editStyles.totalLabel}>TOTAL</Text>
                      <Text style={editStyles.totalValue}>{liveEditTotal || '--'}</Text>
                    </View>
                  </View>
                ) : daySession ? (
                  <View style={historyStyles.ucCard}>
                    <View style={historyStyles.ucLocationRow}>
                      <View style={[historyStyles.ucLocationDot, { backgroundColor: daySession.color || colors.primary }]} />
                      <Text style={historyStyles.ucLocationName}>{daySession.location_name || 'Unknown'}</Text>
                      {(daySession.type === 'manual' || daySession.manually_edited === 1) && (
                        <Text style={historyStyles.ucEditedBadge}>Edited</Text>
                      )}
                    </View>
                    <View style={historyStyles.ucTimesGrid}>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Entry</Text><Text style={historyStyles.ucTimeValue}>{formatTimeAMPM(daySession.entry_at)}</Text></View>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Exit</Text><Text style={historyStyles.ucTimeValue}>{formatTimeAMPM(daySession.exit_at || daySession.entry_at)}</Text></View>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Break</Text><Text style={historyStyles.ucTimeValue}>{(daySession.pause_minutes || 0) > 0 ? `${daySession.pause_minutes} min` : '--'}</Text></View>
                    </View>
                    <View style={historyStyles.ucTotalRow}>
                      <Text style={historyStyles.ucTotalLabel}>Total</Text>
                      <Text style={historyStyles.ucTotalValue}>{formatDuration(daySession.duration_minutes)}</Text>
                    </View>
                    {(() => {
                      if (!daySession.entry_at || !daySession.exit_at) return null;
                      const entryMs = new Date(daySession.entry_at).getTime();
                      const exitMs = new Date(daySession.exit_at).getTime();
                      const elapsedMin = Math.round((exitMs - entryMs) / 60000);
                      const gapMin = elapsedMin - daySession.duration_minutes - (daySession.pause_minutes || 0);
                      if (gapMin < 5) return null;
                      return (
                        <>
                          <PressableOpacity style={historyStyles.detailsButton} onPress={() => {
                            if (showDetails) { setShowDetails(false); return; }
                            if (hookUserId && selectedDayForModal) {
                              const dateStr = getDayKey(selectedDayForModal);
                              const segments = getSessionBreakdown(hookUserId, dateStr);
                              setDetailSegments(segments);
                            }
                            setShowDetails(true);
                          }}>
                            <Ionicons name={showDetails ? 'chevron-up' : 'information-circle-outline'} size={16} color={colors.primary} />
                            <Text style={historyStyles.detailsButtonText}>{showDetails ? 'Hide Details' : 'Details'}</Text>
                          </PressableOpacity>
                          {showDetails && (
                            <View style={historyStyles.detailsSection}>
                              <Text style={historyStyles.detailsSectionTitle}>Session Breakdown</Text>
                              {detailSegments.length > 0 ? detailSegments.map((seg, i) => (
                                <View key={i} style={historyStyles.detailsSegmentRow}>
                                  <Text style={historyStyles.detailsSegmentIndex}>{i + 1}.</Text>
                                  <Text style={historyStyles.detailsSegmentTime}>{formatTimeAMPM(seg.startTime)} → {formatTimeAMPM(seg.endTime)}</Text>
                                  <Text style={historyStyles.detailsSegmentDuration}>{formatDuration(seg.durationMinutes)}</Text>
                                </View>
                              )) : (
                                <Text style={historyStyles.detailsEmpty}>No automatic entries recorded for this day.</Text>
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
                  <View style={historyStyles.ucCard}>
                    <View style={historyStyles.ucLocationRow}>
                      <View style={[historyStyles.ucLocationDot, { backgroundColor: colors.textMuted }]} />
                      <Text style={historyStyles.ucLocationNameMuted}>--</Text>
                    </View>
                    <View style={historyStyles.ucTimesGrid}>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Entry</Text><Text style={historyStyles.ucTimeValueMuted}>--:--</Text></View>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Exit</Text><Text style={historyStyles.ucTimeValueMuted}>--:--</Text></View>
                      <View style={historyStyles.ucTimeCol}><Text style={historyStyles.ucTimeLabel}>Break</Text><Text style={historyStyles.ucTimeValueMuted}>--</Text></View>
                    </View>
                    <View style={historyStyles.ucTotalRow}>
                      <Text style={historyStyles.ucTotalLabel}>Total</Text>
                      <Text style={historyStyles.ucTotalValueMuted}>--</Text>
                    </View>
                  </View>
                )}
                {showAbsenceOptions && !isEditingInline && (
                  <View style={historyStyles.ucAbsenceSection}>
                    <Text style={historyStyles.ucAbsenceTitle}>Select Reason</Text>
                    {[{ key: 'rain', label: '🌧️ Rain Day' }, { key: 'snow', label: '❄️ Snow Day' }, { key: 'sick', label: '🤒 Sick Day' }, { key: 'day_off', label: '🏖️ Day Off' }, { key: 'holiday', label: '🎉 Holiday' }].map((option) => (
                      <PressableOpacity key={option.key} style={historyStyles.absenceOption} onPress={async () => { if (selectedDayForModal) { await saveAbsenceForDate(selectedDayForModal, option.key); setShowAbsenceOptions(false); } }}>
                        <Text style={historyStyles.absenceOptionText}>{option.label}</Text>
                      </PressableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>

        {/* BREAK PICKER MODAL */}
        <Modal visible={showBreakPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowBreakPicker(false); setShowCustomBreak(false); }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={timePickerModalStyles.overlay} onPress={() => { setShowBreakPicker(false); setShowCustomBreak(false); }}>
            <View style={timePickerModalStyles.sheet}>
              <Text style={timePickerModalStyles.sheetTitle}>Break Duration</Text>
              {BREAK_PRESETS.map((preset) => (
                <PressableOpacity key={preset.value} style={[breakPickerStyles.option, editBreakMinutes === preset.value && breakPickerStyles.optionSelected]} onPress={() => handleSelectBreak(preset.value)} activeOpacity={0.7}>
                  <Text style={[breakPickerStyles.optionText, editBreakMinutes === preset.value && breakPickerStyles.optionTextSelected]}>{preset.label}</Text>
                  {editBreakMinutes === preset.value && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </PressableOpacity>
              ))}
              {!showCustomBreak ? (
                <PressableOpacity style={breakPickerStyles.option} onPress={() => setShowCustomBreak(true)} activeOpacity={0.7}>
                  <Text style={breakPickerStyles.optionText}>Custom...</Text>
                </PressableOpacity>
              ) : (
                <View style={breakPickerStyles.customRow}>
                  <TextInput style={breakPickerStyles.customInput} value={customBreakText} onChangeText={(t) => setCustomBreakText(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor={colors.inputPlaceholder} autoFocus />
                  <PressableOpacity style={breakPickerStyles.customSave} onPress={handleCustomBreakSave}>
                    <Text style={breakPickerStyles.customSaveText}>Set</Text>
                  </PressableOpacity>
                </View>
              )}
              <PressableOpacity style={breakPickerStyles.cancel} onPress={() => { setShowBreakPicker(false); setShowCustomBreak(false); }}>
                <Text style={breakPickerStyles.cancelText}>Cancel</Text>
              </PressableOpacity>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* iOS TIME PICKER */}
        {Platform.OS === 'ios' && activeTimePicker !== null && (
          <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setActiveTimePicker(null)}>
            <Pressable style={timePickerModalStyles.overlay} onPress={() => setActiveTimePicker(null)}>
              <Pressable style={timePickerModalStyles.sheet}>
                <Text style={timePickerModalStyles.sheetTitle}>{activeTimePicker === 'entry' ? 'Entry Time' : 'Exit Time'}</Text>
                <DateTimePicker value={activeTimePicker === 'entry' ? entryTime : exitTime} mode="time" display="spinner" themeVariant="light" onChange={handleTimePickerChange} minuteInterval={5} style={{ height: 180, width: '100%' }} />
                <PressableOpacity style={timePickerModalStyles.doneBtn} onPress={() => setActiveTimePicker(null)} activeOpacity={0.8}>
                  <Text style={timePickerModalStyles.doneBtnText}>Done</Text>
                </PressableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* ============================================ */}
        {/* SUCCESS MODAL */}
        {/* ============================================ */}
        <Modal
          visible={showSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={successModalStyles.overlay}>
            <View style={successModalStyles.card}>
              <Ionicons name="checkmark-circle" size={48} color={colors.successTeal} />
              <Text style={successModalStyles.title}>Invoice saved</Text>
              {successInvoice && (
                <Text style={successModalStyles.subtitle}>
                  {successInvoice.number} · {formatMoney(successInvoice.total)}
                </Text>
              )}
              <PressableOpacity
                style={successModalStyles.shareBtn}
                onPress={async () => {
                  if (successInvoice?.pdfUri) {
                    try {
                      await Sharing.shareAsync(successInvoice.pdfUri, {
                        mimeType: 'application/pdf',
                        dialogTitle: 'Share Invoice',
                      });
                    } catch { /* user cancelled */ }
                  }
                }}
              >
                <Ionicons name="share-outline" size={18} color={colors.white} />
                <Text style={successModalStyles.shareBtnText}>Share invoice</Text>
              </PressableOpacity>
              <PressableOpacity
                style={successModalStyles.doneBtn}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={successModalStyles.doneBtnText}>Done</Text>
              </PressableOpacity>
            </View>
          </View>
        </Modal>

        {/* ============================================ */}
        {/* INLINE HOUR ENTRY MODAL */}
        {/* ============================================ */}
        <Modal
          visible={!!inlineEntryDate}
          transparent
          animationType="fade"
          onRequestClose={() => setInlineEntryDate(null)}
        >
          <Pressable style={successModalStyles.overlay} onPress={() => setInlineEntryDate(null)}>
            <View style={inlineEntryStyles.card} onStartShouldSetResponder={() => true}>
              <Text style={inlineEntryStyles.title}>
                Add hours — {inlineEntryDate?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>

              <View style={inlineEntryStyles.timeRow}>
                <PressableOpacity
                  style={inlineEntryStyles.timeBtn}
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      DateTimePickerAndroid.open({
                        value: inlineIn,
                        mode: 'time',
                        display: 'spinner',
                        positiveButton: { label: 'OK', textColor: colors.white },
                        negativeButton: { label: 'Cancel', textColor: colors.white },
                        onChange: (_, d) => { if (d) setInlineIn(d); },
                      });
                    } else {
                      setInlineTimePicker(inlineTimePicker === 'in' ? null : 'in');
                    }
                  }}
                >
                  <Text style={inlineEntryStyles.timeLabel}>IN</Text>
                  <Text style={inlineEntryStyles.timeValue}>
                    {inlineIn.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </PressableOpacity>

                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />

                <PressableOpacity
                  style={inlineEntryStyles.timeBtn}
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      DateTimePickerAndroid.open({
                        value: inlineOut,
                        mode: 'time',
                        display: 'spinner',
                        positiveButton: { label: 'OK', textColor: colors.white },
                        negativeButton: { label: 'Cancel', textColor: colors.white },
                        onChange: (_, d) => { if (d) setInlineOut(d); },
                      });
                    } else {
                      setInlineTimePicker(inlineTimePicker === 'out' ? null : 'out');
                    }
                  }}
                >
                  <Text style={inlineEntryStyles.timeLabel}>OUT</Text>
                  <Text style={inlineEntryStyles.timeValue}>
                    {inlineOut.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </PressableOpacity>
              </View>

              {/* iOS inline time picker */}
              {Platform.OS === 'ios' && inlineTimePicker && (
                <DateTimePicker
                  value={inlineTimePicker === 'in' ? inlineIn : inlineOut}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  minuteInterval={5}
                  style={{ height: 150 }}
                  onChange={(_, d) => {
                    if (d) {
                      if (inlineTimePicker === 'in') setInlineIn(d);
                      else setInlineOut(d);
                    }
                  }}
                />
              )}

              <View style={inlineEntryStyles.breakRow}>
                <Text style={inlineEntryStyles.breakLabel}>Break</Text>
                <View style={inlineEntryStyles.breakChips}>
                  {[0, 30, 60].map(mins => (
                    <PressableOpacity
                      key={mins}
                      style={[inlineEntryStyles.breakChip, inlineBreak === mins && inlineEntryStyles.breakChipActive]}
                      onPress={() => setInlineBreak(mins)}
                    >
                      <Text style={[inlineEntryStyles.breakChipText, inlineBreak === mins && inlineEntryStyles.breakChipTextActive]}>
                        {mins === 0 ? 'None' : `${mins}m`}
                      </Text>
                    </PressableOpacity>
                  ))}
                </View>
              </View>

              <View style={inlineEntryStyles.liveTotal}>
                <Text style={inlineEntryStyles.liveTotalLabel}>Total</Text>
                <Text style={inlineEntryStyles.liveTotalValue}>
                  {formatDuration(Math.max(0, (inlineOut.getHours() * 60 + inlineOut.getMinutes()) - (inlineIn.getHours() * 60 + inlineIn.getMinutes()) - inlineBreak))}
                </Text>
              </View>

              <View style={inlineEntryStyles.actions}>
                <PressableOpacity style={inlineEntryStyles.cancelBtn} onPress={() => setInlineEntryDate(null)}>
                  <Text style={inlineEntryStyles.cancelBtnText}>Cancel</Text>
                </PressableOpacity>
                <PressableOpacity style={inlineEntryStyles.saveBtn} onPress={handleInlineEntrySave}>
                  <Text style={inlineEntryStyles.saveBtnText}>Save & continue</Text>
                </PressableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>

        {/* ============================================ */}
        {/* READ-ONLY DAY DETAIL MODAL */}
        {/* ============================================ */}
        <Modal
          visible={!!detailDate}
          transparent
          animationType="fade"
          onRequestClose={() => { setDetailDate(null); setDetailData(null); }}
        >
          <Pressable style={successModalStyles.overlay} onPress={() => { setDetailDate(null); setDetailData(null); }}>
            <View style={dayDetailStyles.card} onStartShouldSetResponder={() => true}>
              <Text style={dayDetailStyles.title}>
                {detailDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>

              {detailData ? (
                <>
                  <View style={dayDetailStyles.rows}>
                    <View style={dayDetailStyles.row}>
                      <Text style={dayDetailStyles.rowLabel}>IN</Text>
                      <Text style={dayDetailStyles.rowValue}>
                        {detailData.first_entry || '—'}
                      </Text>
                    </View>
                    <View style={dayDetailStyles.row}>
                      <Text style={dayDetailStyles.rowLabel}>OUT</Text>
                      <Text style={dayDetailStyles.rowValue}>
                        {detailData.last_exit || '—'}
                      </Text>
                    </View>
                    {detailData.break_minutes > 0 && (
                      <View style={dayDetailStyles.row}>
                        <Text style={dayDetailStyles.rowLabel}>Break</Text>
                        <Text style={dayDetailStyles.rowValue}>
                          {detailData.break_minutes}m
                        </Text>
                      </View>
                    )}
                    <View style={dayDetailStyles.separator} />
                    <View style={dayDetailStyles.row}>
                      <Text style={dayDetailStyles.rowLabelBold}>Total</Text>
                      <Text style={dayDetailStyles.rowValueBold}>
                        {formatDuration(detailData.total_minutes)}
                      </Text>
                    </View>
                    <View style={dayDetailStyles.sourceRow}>
                      <Ionicons
                        name={detailData.source === 'gps' ? 'location' : 'pencil'}
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={dayDetailStyles.sourceText}>
                        {detailData.source === 'gps' ? 'Auto-logged' : 'Manual entry'}
                      </Text>
                    </View>
                  </View>

                  <View style={dayDetailStyles.actions}>
                    <PressableOpacity style={dayDetailStyles.editLogBtn} onPress={handleEditOnLog}>
                      <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                      <Text style={dayDetailStyles.editLogBtnText}>Edit on Log</Text>
                    </PressableOpacity>
                    <PressableOpacity
                      style={dayDetailStyles.closeBtn}
                      onPress={() => { setDetailDate(null); setDetailData(null); }}
                    >
                      <Text style={dayDetailStyles.closeBtnText}>Close</Text>
                    </PressableOpacity>
                  </View>
                </>
              ) : (
                <View style={dayDetailStyles.emptyContainer}>
                  <Text style={dayDetailStyles.emptyText}>No hours recorded</Text>
                  <PressableOpacity
                    style={dayDetailStyles.addBtn}
                    onPress={() => {
                      setDetailDate(null);
                      setDetailData(null);
                      if (detailDate) openInlineEntry(detailDate);
                    }}
                  >
                    <Text style={dayDetailStyles.addBtnText}>Add hours</Text>
                  </PressableOpacity>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ============================================
  // SERVICES VIEW — Accordion Wizard
  // ============================================
  if (activeView === 'services') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.backgroundWarm }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.backgroundWarm} />
        <ServicesWizard
          onBack={() => {
            resetServicesForm();
            setActiveView('hub');
            if (userId) invoiceStore.loadDashboard(userId);
          }}
        />
      </SafeAreaView>
    );
  }


  // Fallback (should never reach here)
  return null;
}

// ============================================
// HUB STYLES
// ============================================
const hubStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },

  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.sm,
  },
  typeCardIcon: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  typeCardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 4 },
  typeCardSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 10 },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: colors.textMuted, marginTop: 8 },

  invoiceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.cardBorder,
  },
  invoiceNumber: { fontSize: 14, fontWeight: '700', color: colors.text },
  invoiceClient: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  invoiceTotal: { fontSize: 15, fontWeight: '700', color: colors.text },

  swipeDeleteBtn: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 8,
  },

  profileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12,
    marginBottom: 20,
  },
  profileBtnTitle: {
    fontSize: 15, fontWeight: '700', color: colors.white,
  },
  profileBtnSub: {
    fontSize: 12, fontWeight: '500', color: withOpacity(colors.white, 0.75), marginTop: 1,
  },
  profileLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  profileLinkText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
});

// ============================================
// INVOICE DETAIL MODAL STYLES
// ============================================
const detailStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingHorizontal: 20,
    maxHeight: Dimensions.get('window').height * 0.85,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight,
    alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center', alignItems: 'center',
  },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  invoiceNumber: { fontSize: 18, fontWeight: '700', color: colors.text },
  dateText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  actionsSection: { gap: 8, marginTop: 16 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: withOpacity(colors.error, 0.3),
  },
  deleteBtnText: { fontSize: 15, fontWeight: '500', color: colors.error },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
    backgroundColor: colors.primarySoft,
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});

// ============================================
// INVOICE EDIT MODE STYLES
// ============================================
// (invoiceEditStyles removed — edit mode now inside InvoiceSummaryCard v2)

// ============================================
// SERVICES FORM STYLES
// ============================================
const svcStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },

  inputGroup: { gap: 8 },
  input: {
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  inputSingle: {
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  inputRow: { flexDirection: 'row', gap: 8 },

  suggestionsBox: {
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.primary,
    marginTop: -4, overflow: 'hidden',
  },
  suggestionItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  suggestionText: { fontSize: 15, fontWeight: '600', color: colors.text },
  suggestionSubtext: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  presetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: colors.primarySoft, borderRadius: 8,
  },
  presetBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  lineItem: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  lineItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineItemIndex: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  lineItemDesc: {
    backgroundColor: colors.surfaceMuted, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 14, color: colors.text, marginBottom: 10, minHeight: 40,
    borderWidth: 1, borderColor: colors.border,
  },
  lineItemNumbers: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  lineItemFieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  lineItemNumInput: {
    backgroundColor: colors.surfaceMuted, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  lineItemTotal: { fontSize: 15, fontWeight: '700', color: colors.primary },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    borderColor: colors.primary, borderStyle: 'dashed', marginBottom: 20,
  },
  addItemBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  totalsCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16, ...shadows.sm,
  },
  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  totalsLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  totalsValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxInput: {
    backgroundColor: colors.surfaceMuted, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8,
    fontSize: 14, fontWeight: '600', color: colors.text, width: 50, textAlign: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  taxPercent: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  totalGrandRow: {
    borderBottomWidth: 0, marginTop: 4, paddingTop: 14,
    borderTopWidth: 2, borderTopColor: colors.text,
  },
  totalGrandLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  totalGrandValue: { fontSize: 20, fontWeight: '700', color: colors.primary },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  generateBtnText: { fontSize: 16, fontWeight: '600', color: colors.white },

  presetOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4,
  },
  presetOptionText: { fontSize: 16, fontWeight: '500', color: colors.text },
  presetCancel: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, backgroundColor: colors.surfaceMuted,
  },
  presetCancelText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
});

// ============================================
// TIME PICKER MODAL STYLES
// ============================================
const timePickerModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingHorizontal: 20, width: '100%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16, textAlign: 'center' },
  doneBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: 12,
  },
  doneBtnText: { fontSize: 16, fontWeight: '600', color: colors.white },
});

// ============================================
// EDIT MODE STYLES
// ============================================
const editStyles = StyleSheet.create({
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timeCol: { flex: 1 },
  timeLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 8 },
  timePill: {
    backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', ...shadows.sm,
  },
  timeValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  breakPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 16, ...shadows.sm,
  },
  breakLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakLabelText: { fontSize: 15, fontWeight: '600', color: colors.text },
  breakRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakValue: { fontSize: 15, fontWeight: '600', color: colors.primary },
  totalPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.charcoal, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 8,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: withOpacity(colors.white, 0.7), letterSpacing: 0.5 },
  totalValue: { fontSize: 20, fontWeight: '700', color: colors.white },
});

// ============================================
// BREAK PICKER STYLES
// ============================================
const breakPickerStyles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  optionTextSelected: { fontWeight: '700', color: colors.primary },
  cancel: { marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surfaceMuted },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginBottom: 4 },
  customInput: {
    flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 16, fontWeight: '600', color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  customSave: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  customSaveText: { fontSize: 15, fontWeight: '700', color: colors.white },
});

// ============================================
// CHART STYLES
// ============================================
const chartStyles = StyleSheet.create({
  container: { paddingVertical: 16, paddingHorizontal: 4 },
  title: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 12 },
  barsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  barValue: { fontSize: 9, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  barBg: { width: '100%', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  bar: { width: '100%', backgroundColor: colors.iconMuted, borderRadius: 4 },
  barEmpty: { backgroundColor: colors.graphBarMuted },
  barToday: { backgroundColor: colors.textSecondary },
  dayLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 4 },
  dayLabelToday: { color: colors.text, fontWeight: '700' },
});

// ============================================
// HISTORY/CALENDAR STYLES
// ============================================
const historyStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.background,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
    ...(Platform.OS === 'web' ? { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number } : {}),
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 4 },
  backText: { fontSize: 16, fontWeight: '600', color: colors.text },
  calendarCard: { padding: 12, marginBottom: 16, backgroundColor: colors.card, borderRadius: 12, borderWidth: 0.5, borderColor: colors.border, ...shadows.sm },
  navBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceMuted, justifyContent: 'center', alignItems: 'center' },
  calendarTitle: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' },
  calendarTotal: { fontSize: 13, fontWeight: '500', color: colors.primary, textAlign: 'center', marginTop: 2 },
  contentArea: { flex: 1 },
  contentAreaScroll: { paddingBottom: 100 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  exportBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
  businessProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: 8, marginBottom: 4, paddingVertical: 10 },
  businessProfileBtnText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  calendarCardRange: { borderColor: colors.primary, borderWidth: 1 },
  dateRangeSummary: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.primary, ...shadows.sm },
  dateRangeSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  dateRangeSummaryBox: { flex: 1, alignItems: 'center' },
  dateRangeSummaryLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  dateRangeSummaryValue: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  dateRangeSummaryArrow: { paddingHorizontal: 12, paddingTop: 14 },
  dateRangeCancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 10 },
  dateRangeCancelBtnText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  noBreakBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: withOpacity(colors.warning, 0.1), borderRadius: 8, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: withOpacity(colors.warning, 0.2) },
  noBreakBannerText: { fontSize: 13, fontWeight: '500', color: colors.warning, flex: 1 },
  absenceOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  absenceOptionText: { fontSize: 15, fontWeight: '500', color: colors.text },
  noLocationsContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', gap: 12 },
  noLocationsText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
  exportModalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  exportModalContent: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 32, maxHeight: '80%' },
  exportModalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  exportModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  exportModalTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  exportModalClose: { padding: 8 },
  exportModalDateRange: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 20, backgroundColor: colors.surfaceMuted },
  exportModalDateBox: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  exportModalDateLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 4 },
  exportModalDateValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  exportModalArrow: { paddingHorizontal: 4 },
  exportModalSummary: { paddingHorizontal: 20, paddingVertical: 16 },
  exportModalSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  exportModalSummaryLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  exportModalSummaryValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  exportModalTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, marginTop: 8, backgroundColor: colors.surfaceMuted, borderRadius: 12, paddingHorizontal: 16 },
  exportModalTotalLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  exportModalTotalValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
  exportModalRateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 8, marginTop: 4 },
  exportModalRateText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  exportModalActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16 },
  exportModalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, minHeight: 52 },
  exportModalBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
  exportModalBtnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  exportModalBtnSecondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
  ucHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  ucCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, justifyContent: 'center', alignItems: 'center' },
  dayModalTitleV2: { fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 16 },
  ucScrollContent: { padding: 16, gap: 12 },
  ucCard: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  ucLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  ucPickerWrap: { flexShrink: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  ucTimesGrid: { flexDirection: 'row', gap: 12 },
  ucTimeCol: { flex: 1, alignItems: 'center' },
  ucTimeLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  ucTimeValue: { fontSize: 16, fontWeight: '600', color: colors.text },
  ucTimeValueMuted: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  ucTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  ucTotalLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  ucTotalValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
  ucTotalValueMuted: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  ucLocationDot: { width: 10, height: 10, borderRadius: 5 },
  ucLocationName: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  ucLocationNameMuted: { fontSize: 15, fontWeight: '600', color: colors.textMuted, flex: 1 },
  ucEditedBadge: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, backgroundColor: withOpacity(colors.textSecondary, 0.15), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  ucAbsenceSection: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 },
  ucAbsenceTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  ucActionBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  ucFooterBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.primary, minHeight: 52 },
  ucFooterBtnPrimaryText: { fontSize: 15, fontWeight: '600', color: colors.buttonPrimaryText },
  ucFooterBtnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  ucFooterBtnSecondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
  ucFooterBtnDanger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: withOpacity(colors.error, 0.1), borderWidth: 1, borderColor: withOpacity(colors.error, 0.3), minHeight: 52 },
  ucFooterBtnDangerText: { fontSize: 15, fontWeight: '600', color: colors.error },
  detailsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: withOpacity(colors.primary, 0.08) },
  detailsButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  detailsSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailsSectionTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  detailsSegmentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  detailsSegmentIndex: { fontSize: 12, fontWeight: '600', color: colors.textMuted, width: 18 },
  detailsSegmentTime: { fontSize: 13, fontWeight: '500', color: colors.text, flex: 1 },
  detailsSegmentDuration: { fontSize: 13, fontWeight: '700', color: colors.primary },
  detailsEmpty: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  detailsGapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailsGapLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  detailsGapValue: { fontSize: 13, fontWeight: '700', color: colors.errorLight },
});

// ============================================
// WIZARD MODAL STYLES (3-step hourly flow)
// ============================================
const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

const wizardStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 10, paddingTop: 50, paddingBottom: 30,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 20,
    flex: 1, width: '100%',
    overflow: 'hidden',
    ...shadows.lg,
  },
  handle: {
    width: 36, height: 4, backgroundColor: colors.borderWarm,
    borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18, fontWeight: '700', color: colors.text,
  },
  dotsRow: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  calendarNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  // Charcoal button (Step 1→2, 2→3)
  btnCharcoal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    backgroundColor: colors.charcoal, minHeight: 56,
  },
  btnCharcoalText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
  // Disabled button
  btnDisabled: {
    backgroundColor: colors.borderLight,
  },
  btnDisabledText: {
    color: colors.iconMuted,
  },
  // Amber button (final action)
  btnAmber: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    backgroundColor: colors.amberDark, minHeight: 56,
  },
  btnAmberText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
});

// ============================================
// DUE DATE STYLES
// ============================================
const dueDateStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceMuted, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  chipText: {
    fontSize: 15, fontWeight: '600', color: colors.text, flex: 1,
  },
  iosPicker: {
    backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    marginTop: 8, overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  iosPickerTitle: {
    fontSize: 14, fontWeight: '600', color: colors.text,
  },
  iosPickerDone: {
    fontSize: 14, fontWeight: '600', color: colors.primary,
  },
});

// ============================================
// RECIPIENT MODAL STYLES (card-based)
// ============================================
const recipientStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12,
  },
  stepCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleText: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
  },
  cardTitle: {
    fontSize: 16, fontWeight: '700', color: colors.text,
  },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 12, marginBottom: 4,
  },
  clientRowSelected: {
    backgroundColor: withOpacity(colors.primary, 0.08),
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14, fontWeight: '700',
  },
  clientName: {
    fontSize: 15, fontWeight: '600', color: colors.text,
  },
  clientSub: {
    fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 2,
  },
  deleteClientBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  newClientBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, marginTop: 4,
    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newClientBtnText: {
    fontSize: 14, fontWeight: '600', color: colors.textSecondary,
  },
  newClientInputRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newClientInput: {
    flex: 1,
    fontSize: 15, fontWeight: '500', color: colors.text,
    backgroundColor: colors.surfaceMuted, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.primary,
  },
  fullFormBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ============================================
// DAY EDIT MODAL STYLES
// ============================================
const dayEditStyles = StyleSheet.create({
  label: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceMuted, borderRadius: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 14, fontSize: 16, fontWeight: '600',
    color: colors.text, borderWidth: 1, borderColor: colors.border,
    textAlign: 'center',
  },
});


// ============================================
// DATE PICKER STYLES (Airbnb-style range picker)
// ============================================
const datePickerStyles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15, fontWeight: '600', color: colors.text,
    marginBottom: 12, marginTop: 4,
  },
  dateCardsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  dateCard: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1.5,
    borderColor: colors.border, borderStyle: 'dashed',
    backgroundColor: colors.surfaceMuted,
  },
  dateCardActive: {
    borderColor: colors.primary, borderStyle: 'solid',
    backgroundColor: withOpacity(colors.primary, 0.06),
  },
  dateCardFilled: {
    borderColor: colors.primary, borderStyle: 'solid',
    backgroundColor: withOpacity(colors.primary, 0.1),
  },
  dateCardLabel: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  dateCardValue: {
    fontSize: 18, fontWeight: '700', color: colors.text,
  },
  dateCardValueFilled: {
    color: colors.primary,
  },
  dateCardPlaceholder: {
    fontSize: 15, fontWeight: '500', color: colors.textMuted,
  },
  dateCardsArrow: {
    paddingHorizontal: 2, paddingTop: 12,
  },
  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  hintText: {
    fontSize: 13, fontWeight: '500', color: colors.primary,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 20, backgroundColor: withOpacity(colors.primary, 0.1),
  },
  summaryChipText: {
    fontSize: 13, fontWeight: '600', color: colors.primary,
  },
  warningPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: '#FFF8E7',
    marginTop: 4, alignSelf: 'flex-start',
  },
  warningPillText: {
    fontSize: 13, fontWeight: '500', color: '#854F0B',
  },
  snackbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 6,
    backgroundColor: '#333', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  snackbarText: {
    fontSize: 13, fontWeight: '500', color: '#fff', flex: 1,
  },
  resetLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, marginTop: 8,
  },
  resetLinkText: {
    fontSize: 13, fontWeight: '500', color: colors.textSecondary,
  },
  stickyBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'android' ? 16 : 8,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    ...(Platform.OS === 'web' ? { maxWidth: 500, alignSelf: 'center' as const, width: '100%' as unknown as number } : {}),
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 16,
    backgroundColor: colors.primary, minHeight: 56,
    ...shadows.md,
  },
  generateBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.border,
    ...({ boxShadow: 'none', elevation: 0 } as any),
  },
  generateBtnText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
  generateBtnTextDisabled: {
    color: colors.textMuted,
  },
});

// ============================================
// NO HOURS FALLBACK STYLES
// ============================================
const noHoursStyles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1, height: 1, backgroundColor: colors.borderLight,
  },
  dividerLabel: {
    fontSize: 12, fontWeight: '500', color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  title: {
    fontSize: 15, fontWeight: '600', color: colors.text, flex: 1,
  },
  subtitle: {
    fontSize: 13, color: colors.textSecondary, marginBottom: 20, lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
    marginBottom: 16,
  },
  hoursInput: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    minWidth: 120,
  },
  hoursUnit: {
    fontSize: 18, fontWeight: '500', color: colors.textSecondary,
  },
  saveBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.charcoal,
    minHeight: 56,
  },
  saveBtnDisabled: {
    backgroundColor: colors.borderLight,
  },
  saveBtnText: {
    fontSize: 16, fontWeight: '700', color: colors.white,
  },
  saveBtnTextDisabled: {
    color: colors.iconMuted,
  },
  confirmedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.successSoft,
    borderRadius: 12, padding: 14,
  },
  confirmedText: {
    fontSize: 15, fontWeight: '600', color: colors.text, flex: 1,
  },
  editLink: {
    fontSize: 14, fontWeight: '600', color: colors.primary,
  },
});

// ============================================
// SUCCESS MODAL STYLES
// ============================================
const successModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    width: '100%',
    marginBottom: spacing.sm,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.charcoal,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});

// ============================================
// INLINE ENTRY STYLES
// ============================================
const inlineEntryStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  timeBtn: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    minWidth: 100,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.xxs,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  breakLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  breakChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  breakChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  breakChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  breakChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  breakChipTextActive: {
    color: colors.white,
  },
  liveTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  liveTotalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  liveTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});

const dayDetailStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowLabelBold: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowValueBold: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  separator: {
    height: 0.5,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  sourceText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  editLogBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: '#F0F4FF',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  editLogBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  closeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  addBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});

const emptyExplainerStyles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: '#FFF8E7',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F5E6C8',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: '#A16207',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  addHoursBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
  },
  addHoursBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: colors.borderLight,
  },
  dividerLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hoursInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  hoursUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  useBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: borderRadius.md,
  },
  useBtnDisabled: {
    backgroundColor: colors.backgroundTertiary,
  },
  useBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  useBtnTextDisabled: {
    color: colors.textMuted,
  },
});
