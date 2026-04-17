/**
 * InvoiceSummaryCard v3 — Spec-compliant dual Read/Edit mode
 *
 * Container is TRANSPARENT — each section is its own white sub-card.
 * One edit button in header, inline editing, auto-calculation.
 * Handles BOTH hourly and services invoice types.
 *
 * Used in:
 * - Invoice Detail Modal (with onSave → full dual-mode, with onClose → close btn)
 * - Wizard Step 3 (without onSave → read-only + individual callbacks)
 * - ServicesWizard Step 5 (without onSave → read-only)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { PressableOpacity } from '../../components/ui/PressableOpacity';
import { formatMoney, BREAK_PRESETS } from '../../lib/format';
import { colors } from '../../constants/colors';
import type { DailyHoursEntry } from '../../lib/database/daily';

// ============================================
// TYPES
// ============================================

/** A single day row in the time table */
export interface TimeTableDay {
  id?: string;
  date: string;            // YYYY-MM-DD
  dateLabel: string;       // "Apr 2" (pre-formatted)
  inLabel: string;         // "8:00 AM" or "—"
  outLabel: string;        // "5:00 PM" or "—"
  breakLabel: string;      // "30m" or "—"
  totalLabel: string;      // "8h 30m"
  totalMinutes: number;
  rawEntry?: DailyHoursEntry;
}

/** Changes produced by edit mode save */
export interface InvoiceSummaryChanges {
  rate?: number;
  notes?: string;
  dueDate?: string;        // YYYY-MM-DD
  dayUpdates?: {
    date: string;
    firstEntry: string;    // HH:MM
    lastExit: string;      // HH:MM
    breakMinutes: number;
    totalMinutes: number;
  }[];
  lineItems?: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export interface InvoiceSummaryCardProps {
  // --- Identity ---
  invoiceNumber?: string;
  createdAt?: string;       // ISO date for header display
  onClose?: () => void;     // Close button in header

  // --- Client (TO) ---
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  clientEmail?: string;
  onEditClient?: () => void | Promise<void>;

  // --- Business (FROM) ---
  fromName?: string;
  fromPhone?: string;
  fromAddress?: string;
  fromEmail?: string;
  onEditFrom?: () => void | Promise<void>;

  // --- Due Date ---
  dueDate?: string;              // display string
  dueDateISO?: string;           // YYYY-MM-DD for picker init
  onDueDateChange?: (iso: string) => void;

  // --- Time table (hourly) ---
  days: TimeTableDay[];
  totalDays: number;
  totalMinutes: number;
  totalLabel: string;
  onDayPress?: (day: TimeTableDay) => void;
  emptyAction?: { label: string; onPress: () => void };
  manualRow?: { totalLabel: string };

  // --- Rate (hourly) ---
  rate: number;
  onRateChange?: (newRate: number) => void;

  // --- Tax ---
  taxRate: number;
  taxLabel?: string;

  // --- Notes ---
  notes?: string;

  // --- Line items (products/services) ---
  lineItems?: {
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];

  // --- Services-specific fields ---
  jobSite?: string;
  jobSiteLot?: string;
  serviceDate?: string;
  etransferEmail?: string;

  // --- Warnings ---
  showZeroWarning?: boolean;

  // --- Batch save (enables dual-mode) ---
  onSave?: (changes: InvoiceSummaryChanges) => void | Promise<void>;
}

// ============================================
// VISUAL CONSTANTS (from spec)
// ============================================

const CARD_BORDER = '#E8E6E0';
const ROW_SEPARATOR = '#F0EEE8';
const AMBER_SOFT = '#FFF8E7';     // amberSoftWarm
const BANNER_TEXT = '#854F0B';
const DESC_COLOR = '#555555';

// ============================================
// HELPERS
// ============================================

interface DayDraft {
  firstEntry: string;   // HH:MM
  lastExit: string;     // HH:MM
  breakMinutes: number;
  totalMinutes: number;
}

function formatDurationLocal(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function parseHHMM(hhMM: string): Date {
  const parts = hhMM.split(':').map(Number);
  const d = new Date();
  d.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
  return d;
}

function toHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatHHMMDisplay(hhMM: string): string {
  if (!hhMM || hhMM === '—') return '—';
  const parts = hhMM.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function recalcDayTotal(entry: string, exit: string, breakMin: number): number {
  if (!entry || !exit) return 0;
  const ep = entry.split(':').map(Number);
  const xp = exit.split(':').map(Number);
  const entryMin = (ep[0] || 0) * 60 + (ep[1] || 0);
  const exitMin = (xp[0] || 0) * 60 + (xp[1] || 0);
  return Math.max(0, exitMin - entryMin - breakMin);
}

function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function AutoLabel() {
  return <Text style={st.autoLabel}>auto</Text>;
}

function BreakPresetRow({ value, onChange }: { value: number; onChange: (mins: number) => void }) {
  return (
    <View style={st.breakRow}>
      {BREAK_PRESETS.map((p) => (
        <PressableOpacity
          key={p.value}
          style={[st.breakPill, p.value === value && st.breakPillActive]}
          onPress={() => onChange(p.value)}
          activeOpacity={0.6}
        >
          <Text style={[st.breakPillText, p.value === value && st.breakPillTextActive]}>
            {p.label}
          </Text>
        </PressableOpacity>
      ))}
    </View>
  );
}

// ============================================
// INFO CARD HELPER
// ============================================

function renderInfoCard(
  label: string,
  name: string,
  phone?: string,
  address?: string,
  email?: string,
  editCallback?: () => void,
  legacyCallback?: () => void,
  isEditing?: boolean,
  isEmpty?: boolean,
) {
  // Edit mode: amber border, arrow label, tappable -> profile
  if (isEditing && editCallback) {
    return (
      <PressableOpacity style={[st.toFromCard, st.toFromCardAmber]} onPress={editCallback} activeOpacity={0.6}>
        <Text style={st.cardLabelAmber}>{label} →</Text>
        {isEmpty ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
              Add {label.toLowerCase() === 'from' ? 'business info' : 'client'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={st.toFromName} numberOfLines={2}>{name}</Text>
            {phone ? <Text style={st.toFromSub} numberOfLines={1}>{phone}</Text> : null}
            {address ? <Text style={st.toFromSub} numberOfLines={2}>{address}</Text> : null}
            {email ? <Text style={st.toFromSub} numberOfLines={1}>{email}</Text> : null}
          </>
        )}
      </PressableOpacity>
    );
  }

  // Legacy mode (wizard): tappable with pencil icon
  if (legacyCallback) {
    return (
      <PressableOpacity style={[st.toFromCard, st.toFromCardLegacy]} onPress={legacyCallback} activeOpacity={0.6}>
        <Text style={st.cardLabel}>{label}</Text>
        {isEmpty ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
              Add {label.toLowerCase() === 'from' ? 'business info' : 'client'}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={st.toFromName} numberOfLines={2}>{name}</Text>
              {phone ? <Text style={st.toFromSub} numberOfLines={1}>{phone}</Text> : null}
              {address ? <Text style={st.toFromSub} numberOfLines={2}>{address}</Text> : null}
              {email ? <Text style={st.toFromSub} numberOfLines={1}>{email}</Text> : null}
            </View>
            <Ionicons name="create-outline" size={14} color={colors.textMuted} />
          </View>
        )}
      </PressableOpacity>
    );
  }

  // Static read-only
  if (!name && !isEmpty) return null;
  return (
    <View style={st.toFromCard}>
      <Text style={st.cardLabel}>{label}</Text>
      <Text style={st.toFromName} numberOfLines={2}>{name || '—'}</Text>
      {phone ? <Text style={st.toFromSub} numberOfLines={1}>{phone}</Text> : null}
      {address ? <Text style={st.toFromSub} numberOfLines={2}>{address}</Text> : null}
      {email ? <Text style={st.toFromSub} numberOfLines={1}>{email}</Text> : null}
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function InvoiceSummaryCard(props: InvoiceSummaryCardProps) {
  const {
    invoiceNumber,
    createdAt,
    onClose,
    clientName, clientPhone, clientAddress, clientEmail, onEditClient,
    fromName, fromPhone, fromAddress, fromEmail, onEditFrom,
    dueDate, dueDateISO,
    days, totalDays, totalMinutes, totalLabel,
    onDayPress, emptyAction, manualRow,
    rate, onRateChange,
    taxRate, taxLabel = 'Tax',
    notes,
    lineItems,
    jobSite, jobSiteLot, serviceDate, etransferEmail,
    showZeroWarning,
    onSave,
  } = props;

  const canEdit = !!onSave;
  const isHourly = !lineItems || lineItems.length === 0;
  const showFromCard = !!fromName || !!onEditFrom;

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = useState(false);
  const [draftRate, setDraftRate] = useState(0);
  const [draftRateText, setDraftRateText] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftDueDate, setDraftDueDate] = useState<Date | null>(null);
  const [draftDays, setDraftDays] = useState<Map<string, DayDraft>>(new Map());
  const [draftLineItems, setDraftLineItems] = useState<{
    title: string;
    description: string;
    quantity: string;
    unitPrice: string;
  }[]>([]);

  // Picker state
  const [activeTimePicker, setActiveTimePicker] = useState<{
    date: string;
    field: 'entry' | 'exit';
    value: Date;
  } | null>(null);
  const [activeBreakDate, setActiveBreakDate] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState(false);
  const [showIOSDuePicker, setShowIOSDuePicker] = useState(false);

  // Legacy rate editing (wizard context without onSave)
  const [legacyEditingRate, setLegacyEditingRate] = useState(false);
  const [legacyRateText, setLegacyRateText] = useState('');

  // Banner auto-dismiss (5 seconds)
  const [showBanner, setShowBanner] = useState(false);
  useEffect(() => {
    if (!isEditing) { setShowBanner(false); return; }
    setShowBanner(true);
    const timer = setTimeout(() => setShowBanner(false), 5000);
    return () => clearTimeout(timer);
  }, [isEditing]);

  // ── Enter edit mode ──
  const enterEditMode = useCallback(() => {
    setDraftRate(rate);
    setDraftRateText(rate > 0 ? String(rate) : '');
    setDraftNotes(notes || '');
    setDraftDueDate(dueDateISO ? new Date(dueDateISO + 'T12:00:00') : null);

    const map = new Map<string, DayDraft>();
    for (const day of days) {
      if (day.rawEntry) {
        map.set(day.date, {
          firstEntry: day.rawEntry.first_entry || '',
          lastExit: day.rawEntry.last_exit || '',
          breakMinutes: day.rawEntry.break_minutes || 0,
          totalMinutes: day.rawEntry.total_minutes || 0,
        });
      }
    }
    setDraftDays(map);

    if (lineItems) {
      setDraftLineItems(lineItems.map(i => {
        const firstNewline = i.description.indexOf('\n');
        return {
          title: firstNewline >= 0 ? i.description.slice(0, firstNewline) : i.description,
          description: firstNewline >= 0 ? i.description.slice(firstNewline + 1) : '',
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
        };
      }));
    }

    setActiveTimePicker(null);
    setActiveBreakDate(null);
    setEditingRate(false);
    setShowIOSDuePicker(false);
    setIsEditing(true);
  }, [rate, notes, dueDateISO, days, lineItems]);

  // ── Build pending draft as an InvoiceSummaryChanges object ──
  const buildChanges = useCallback((): InvoiceSummaryChanges => {
    const changes: InvoiceSummaryChanges = {};

    const parsedRate = parseFloat(draftRateText) || draftRate;
    if (parsedRate !== rate) changes.rate = parsedRate;
    if (draftNotes !== (notes || '')) changes.notes = draftNotes;

    if (draftDueDate) {
      const iso = dateToISO(draftDueDate);
      if (iso !== dueDateISO) changes.dueDate = iso;
    }

    const dayUpdates: NonNullable<InvoiceSummaryChanges['dayUpdates']> = [];
    for (const [date, draft] of draftDays) {
      const original = days.find(d => d.date === date);
      if (!original?.rawEntry) continue;
      const orig = original.rawEntry;
      if (
        draft.firstEntry !== (orig.first_entry || '') ||
        draft.lastExit !== (orig.last_exit || '') ||
        draft.breakMinutes !== (orig.break_minutes || 0) ||
        draft.totalMinutes !== (orig.total_minutes || 0)
      ) {
        dayUpdates.push({ date, ...draft });
      }
    }
    if (dayUpdates.length > 0) changes.dayUpdates = dayUpdates;

    if (draftLineItems.length > 0) {
      changes.lineItems = draftLineItems
        .filter(i => i.title.trim() || i.description.trim())
        .map(i => {
          const desc = i.description.trim()
            ? `${i.title.trim()}\n${i.description.trim()}`
            : i.title.trim();
          return {
            description: desc,
            quantity: parseFloat(i.quantity) || 0,
            unitPrice: parseFloat(i.unitPrice) || 0,
            total: (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0),
          };
        });
    }

    return changes;
  }, [draftRate, draftRateText, draftNotes, draftDueDate, draftDays, draftLineItems, rate, notes, dueDateISO, days]);

  // ── Save changes ──
  const handleSave = useCallback(async () => {
    if (!onSave) return;
    await Promise.resolve(onSave(buildChanges()));
    setIsEditing(false);
  }, [onSave, buildChanges]);

  // ── Commit pending drafts (if editing) then run a navigation callback ──
  // Used when user taps TO/FROM cards to jump to Client/Profile screen.
  // Awaits the persistence layer so there is zero data loss during transition.
  const commitDraftsAndRun = useCallback(async (cb?: () => void | Promise<void>) => {
    if (!cb) return;
    if (isEditing && onSave) {
      await Promise.resolve(onSave(buildChanges()));
      setIsEditing(false);
    }
    await Promise.resolve(cb());
  }, [isEditing, onSave, buildChanges]);

  // ── Toggle edit / discard ──
  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      Alert.alert('Discard changes?', 'You have unsaved edits.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setIsEditing(false) },
      ]);
    } else {
      enterEditMode();
    }
  }, [isEditing, enterEditMode]);

  // ── Handle close (with discard check if editing) ──
  const handleClose = useCallback(() => {
    if (isEditing) {
      Alert.alert('Discard changes?', 'You have unsaved edits.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => {
          setIsEditing(false);
          onClose?.();
        }},
      ]);
    } else {
      onClose?.();
    }
  }, [isEditing, onClose]);

  // ── Time picker handlers ──
  const openTimePicker = useCallback((date: string, field: 'entry' | 'exit') => {
    const draft = draftDays.get(date);
    const hhMM = field === 'entry' ? draft?.firstEntry : draft?.lastExit;
    const value = hhMM ? parseHHMM(hhMM) : new Date();

    if (Platform.OS === 'android') {
      (DateTimePickerAndroid.open as any)({
        value,
        mode: 'time',
        display: 'spinner',
        is24Hour: false,
        positiveButton: { textColor: '#FFFFFF' },
        negativeButton: { textColor: '#FFFFFF' },
        onChange: (_e: DateTimePickerEvent, selectedDate?: Date) => {
          if (selectedDate) updateDayTime(date, field, toHHMM(selectedDate));
        },
      });
    } else {
      setActiveTimePicker({ date, field, value });
    }
  }, [draftDays]);

  const updateDayTime = useCallback((date: string, field: 'entry' | 'exit', hhMM: string) => {
    setDraftDays(prev => {
      const next = new Map(prev);
      const draft = { ...(next.get(date) || { firstEntry: '', lastExit: '', breakMinutes: 0, totalMinutes: 0 }) };
      if (field === 'entry') draft.firstEntry = hhMM;
      else draft.lastExit = hhMM;
      draft.totalMinutes = recalcDayTotal(draft.firstEntry, draft.lastExit, draft.breakMinutes);
      next.set(date, draft);
      return next;
    });
  }, []);

  const updateDayBreak = useCallback((date: string, breakMinutes: number) => {
    setDraftDays(prev => {
      const next = new Map(prev);
      const draft = { ...(next.get(date) || { firstEntry: '', lastExit: '', breakMinutes: 0, totalMinutes: 0 }) };
      draft.breakMinutes = breakMinutes;
      draft.totalMinutes = recalcDayTotal(draft.firstEntry, draft.lastExit, draft.breakMinutes);
      next.set(date, draft);
      return next;
    });
    setActiveBreakDate(null);
  }, []);

  // ── Due date picker ──
  const openDueDatePicker = useCallback(() => {
    const value = draftDueDate || new Date();
    if (Platform.OS === 'android') {
      (DateTimePickerAndroid.open as any)({
        value,
        mode: 'date',
        display: 'calendar',
        onChange: (_e: DateTimePickerEvent, selectedDate?: Date) => {
          if (selectedDate) setDraftDueDate(selectedDate);
        },
      });
    } else {
      setShowIOSDuePicker(!showIOSDuePicker);
    }
  }, [draftDueDate, showIOSDuePicker]);

  // ── Auto-calculations ──
  const editedTotalMinutes = useMemo(() => {
    if (!isEditing) return totalMinutes;
    let sum = 0;
    for (const day of days) {
      const draft = draftDays.get(day.date);
      sum += draft ? draft.totalMinutes : day.totalMinutes;
    }
    return sum;
  }, [isEditing, days, draftDays, totalMinutes]);

  const effectiveRate = isEditing ? (parseFloat(draftRateText) || draftRate) : rate;
  const calcMinutes = isEditing ? editedTotalMinutes : totalMinutes;
  const subtotal = Math.round((calcMinutes / 60) * effectiveRate * 100) / 100;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  // Products/services calculations
  const itemsSubtotal = useMemo(() => {
    if (isEditing && draftLineItems.length > 0) {
      return draftLineItems.reduce((s, i) =>
        s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0);
    }
    return lineItems?.reduce((s, i) => s + i.total, 0) || 0;
  }, [isEditing, draftLineItems, lineItems]);
  const itemsTax = Math.round(itemsSubtotal * (taxRate / 100) * 100) / 100;
  const itemsTotal = Math.round((itemsSubtotal + itemsTax) * 100) / 100;

  // Effective due date display
  const dueDateDisplay = useMemo(() => {
    if (isEditing && draftDueDate) {
      return draftDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dueDate;
  }, [isEditing, draftDueDate, dueDate]);

  // Legacy rate editing (wizard context)
  const startLegacyRate = useCallback(() => {
    setLegacyRateText(rate > 0 ? String(rate) : '');
    setLegacyEditingRate(true);
  }, [rate]);

  const commitLegacyRate = useCallback(() => {
    const val = parseFloat(legacyRateText);
    if (val > 0 && onRateChange) onRateChange(val);
    setLegacyEditingRate(false);
  }, [legacyRateText, onRateChange]);

  // Created date display
  const createdDateDisplay = useMemo(() => {
    if (!createdAt) return null;
    try {
      return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return null; }
  }, [createdAt]);

  // =============================================
  // RENDER
  // =============================================

  return (
    <View style={st.container}>
      {/* ═══════ HEADER ═══════ */}
      <View style={st.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>
            {invoiceNumber || 'Invoice Preview'}
          </Text>
          {createdDateDisplay && (
            <Text style={st.headerDate}>{createdDateDisplay}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canEdit && (
            isEditing ? (
              <PressableOpacity style={st.saveBtn} onPress={handleSave} activeOpacity={0.7}>
                <Text style={st.saveBtnText}>Save</Text>
              </PressableOpacity>
            ) : (
              <PressableOpacity style={st.headerBtn} onPress={handleToggleEdit} activeOpacity={0.6}>
                <Ionicons name="create-outline" size={28} color={colors.textSecondary} />
              </PressableOpacity>
            )
          )}
          {onClose && (
            <PressableOpacity style={st.headerBtn} onPress={handleClose} activeOpacity={0.6}>
              <Ionicons name="close" size={32} color={colors.textSecondary} />
            </PressableOpacity>
          )}
        </View>
      </View>

      {/* ═══════ EDIT BANNER (auto-dismiss 5s) ═══════ */}
      {isEditing && showBanner && (
        <View style={st.banner}>
          <Ionicons name="information-circle-outline" size={14} color={BANNER_TEXT} />
          <Text style={st.bannerText}>Tap any value to edit. Names link to your profile.</Text>
        </View>
      )}

      {/* ═══════ TO / FROM ═══════ */}
      <View style={st.toFromRow}>
        {renderInfoCard('TO', clientName, clientPhone, clientAddress, clientEmail,
          isEditing ? () => commitDraftsAndRun(onEditClient) : undefined,
          !canEdit ? onEditClient : undefined,
          isEditing,
        )}
        {showFromCard && renderInfoCard('FROM', fromName || '', fromPhone, fromAddress, fromEmail,
          isEditing ? () => commitDraftsAndRun(onEditFrom) : undefined,
          !canEdit ? onEditFrom : undefined,
          isEditing,
          !fromName,
        )}
      </View>

      {/* ═══════ JOB SITE (services) ═══════ */}
      {jobSite && (
        <View style={st.subCard}>
          <Text style={st.cardLabel}>JOB SITE</Text>
          <Text style={st.cardValue}>{jobSite}</Text>
          {jobSiteLot ? <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Lot {jobSiteLot}</Text> : null}
        </View>
      )}

      {/* ═══════ DUE DATE ═══════ */}
      {(dueDateDisplay || (isEditing && dueDateISO)) && (
        isEditing ? (
          <PressableOpacity style={[st.subCard, st.dashedAmber]} onPress={openDueDatePicker} activeOpacity={0.6}>
            <Text style={st.cardLabel}>DUE DATE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.cardValue}>{dueDateDisplay || 'Set due date'}</Text>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            </View>
          </PressableOpacity>
        ) : dueDateDisplay ? (
          <View style={st.subCard}>
            <Text style={st.cardLabel}>DUE DATE</Text>
            <Text style={st.cardValue}>{dueDateDisplay}</Text>
          </View>
        ) : null
      )}

      {/* iOS date picker inline */}
      {isEditing && showIOSDuePicker && Platform.OS === 'ios' && (
        <View style={st.iosPickerBox}>
          <View style={st.iosPickerHeader}>
            <Text style={st.iosPickerTitle}>Due Date</Text>
            <PressableOpacity onPress={() => setShowIOSDuePicker(false)}>
              <Text style={st.iosPickerDone}>Done</Text>
            </PressableOpacity>
          </View>
          <DateTimePicker
            value={draftDueDate || new Date()}
            mode="date"
            display="inline"
            themeVariant="light"
            onChange={(_e: DateTimePickerEvent, d?: Date) => { if (d) setDraftDueDate(d); }}
            style={{ height: 320 }}
          />
        </View>
      )}

      {/* ═══════ SERVICE DATE / E-TRANSFER (services) ═══════ */}
      {serviceDate && (
        <View style={st.subCard}>
          <Text style={st.cardLabel}>SERVICE DATE</Text>
          <Text style={st.cardValue}>{serviceDate}</Text>
        </View>
      )}
      {etransferEmail && (
        <View style={st.subCard}>
          <Text style={st.cardLabel}>E-TRANSFER</Text>
          <Text style={{ fontSize: 13, color: colors.text }}>{etransferEmail}</Text>
        </View>
      )}

      {/* ═══════ HOURLY: Time Table ═══════ */}
      {isHourly && (
        <>
          <View style={st.subCard}>
            {/* Table header */}
            <View style={st.tableHeader}>
              <Text style={[st.tableHeaderCell, { flex: 1.2 }]}>DATE</Text>
              <Text style={[st.tableHeaderCell, { textAlign: 'center' }]}>IN</Text>
              <Text style={[st.tableHeaderCell, { textAlign: 'center' }]}>OUT</Text>
              <Text style={[st.tableHeaderCell, { textAlign: 'center' }]}>BREAK</Text>
              <Text style={[st.tableHeaderCell, { textAlign: 'right' }]}>TOTAL</Text>
            </View>

            {/* Empty state */}
            {days.length === 0 && !manualRow && emptyAction && (
              <PressableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 }}
                onPress={emptyAction.onPress}
                activeOpacity={0.6}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  {emptyAction.label}
                </Text>
              </PressableOpacity>
            )}

            {/* Day rows */}
            {days.map((day, i) => {
              const draft = isEditing ? draftDays.get(day.date) : null;
              const inDisplay = draft ? formatHHMMDisplay(draft.firstEntry) : day.inLabel;
              const outDisplay = draft ? formatHHMMDisplay(draft.lastExit) : day.outLabel;
              const breakDisplay = draft ? (draft.breakMinutes > 0 ? `${draft.breakMinutes}m` : '0m') : day.breakLabel;
              const totalDisplay = draft ? formatDurationLocal(draft.totalMinutes) : day.totalLabel;
              const isBreakActive = activeBreakDate === day.date;

              // Edit mode: cells are tappable
              if (isEditing && draft) {
                return (
                  <View key={day.id || day.date || i}>
                    <View style={[st.tableRow, i > 0 && st.tableRowBorder]}>
                      <Text style={[st.tableCell, { flex: 1.2, fontWeight: '500' }]}>{day.dateLabel}</Text>
                      <PressableOpacity
                        style={[st.tableCell, st.editableCell, { alignItems: 'center' }]}
                        onPress={() => openTimePicker(day.date, 'entry')}
                        activeOpacity={0.6}
                      >
                        <Text style={st.editableCellText}>{inDisplay}</Text>
                      </PressableOpacity>
                      <PressableOpacity
                        style={[st.tableCell, st.editableCell, { alignItems: 'center' }]}
                        onPress={() => openTimePicker(day.date, 'exit')}
                        activeOpacity={0.6}
                      >
                        <Text style={st.editableCellText}>{outDisplay}</Text>
                      </PressableOpacity>
                      <PressableOpacity
                        style={[st.tableCell, st.editableCell, { alignItems: 'center' }]}
                        onPress={() => setActiveBreakDate(isBreakActive ? null : day.date)}
                        activeOpacity={0.6}
                      >
                        <Text style={st.editableCellText}>{breakDisplay}</Text>
                      </PressableOpacity>
                      <View style={[st.tableCell, { alignItems: 'flex-end' }]}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>{totalDisplay}</Text>
                        <AutoLabel />
                      </View>
                    </View>
                    {isBreakActive && (
                      <BreakPresetRow
                        value={draft.breakMinutes}
                        onChange={(mins) => updateDayBreak(day.date, mins)}
                      />
                    )}
                  </View>
                );
              }

              // Read mode
              const Row = (!canEdit && onDayPress) ? PressableOpacity : View;
              const rowProps = (!canEdit && onDayPress)
                ? { onPress: () => onDayPress(day), activeOpacity: 0.6 }
                : {};
              return (
                <Row
                  key={day.id || day.date || i}
                  style={[st.tableRow, i > 0 && st.tableRowBorder]}
                  {...(rowProps as any)}
                >
                  <Text style={[st.tableCell, { flex: 1.2, fontWeight: '500' }]}>{day.dateLabel}</Text>
                  <Text style={[st.tableCell, { textAlign: 'center' }]}>{day.inLabel}</Text>
                  <Text style={[st.tableCell, { textAlign: 'center' }]}>{day.outLabel}</Text>
                  <Text style={[st.tableCell, { textAlign: 'center' }]}>{day.breakLabel}</Text>
                  <Text style={[st.tableCell, { textAlign: 'right', fontWeight: '500' }]}>{day.totalLabel}</Text>
                </Row>
              );
            })}

            {/* Manual hours row */}
            {manualRow && (
              <View style={[st.tableRow, days.length > 0 && st.tableRowBorder]}>
                <Text style={[st.tableCell, { flex: 1.2, fontWeight: '500' }]}>Manual</Text>
                <Text style={[st.tableCell, { textAlign: 'center' }]}>—</Text>
                <Text style={[st.tableCell, { textAlign: 'center' }]}>—</Text>
                <Text style={[st.tableCell, { textAlign: 'center' }]}>—</Text>
                <Text style={[st.tableCell, { textAlign: 'right', fontWeight: '500' }]}>{manualRow.totalLabel}</Text>
              </View>
            )}

            {/* Summary row */}
            {(totalDays > 0 || manualRow) && (
              <View style={st.tableSummary}>
                <Text style={st.summaryLabel}>
                  {totalDays} day{totalDays !== 1 ? 's' : ''}
                </Text>
                <Text style={st.summaryValue}>
                  {isEditing ? formatDurationLocal(editedTotalMinutes) : totalLabel}
                </Text>
              </View>
            )}
          </View>

          {/* iOS time picker */}
          {isEditing && activeTimePicker && Platform.OS === 'ios' && (
            <View style={st.iosPickerBox}>
              <View style={st.iosPickerHeader}>
                <Text style={st.iosPickerTitle}>
                  {activeTimePicker.field === 'entry' ? 'Clock In' : 'Clock Out'}
                </Text>
                <PressableOpacity onPress={() => setActiveTimePicker(null)}>
                  <Text style={st.iosPickerDone}>Done</Text>
                </PressableOpacity>
              </View>
              <DateTimePicker
                value={activeTimePicker.value}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={(_e: DateTimePickerEvent, d?: Date) => {
                  if (d) {
                    updateDayTime(activeTimePicker.date, activeTimePicker.field, toHHMM(d));
                    setActiveTimePicker(prev => prev ? { ...prev, value: d } : null);
                  }
                }}
              />
            </View>
          )}

          {/* ═══════ RATE / SUBTOTAL / TAX / TOTAL ═══════ */}
          <View style={st.subCard}>
            {isEditing ? (
              <>
                {/* Rate — tappable inline edit */}
                {editingRate ? (
                  <View style={st.totalsRow}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.text }}>$</Text>
                      <TextInput
                        style={st.rateInput}
                        value={draftRateText}
                        onChangeText={setDraftRateText}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        onBlur={() => setEditingRate(false)}
                        onSubmitEditing={() => setEditingRate(false)}
                      />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>/hr</Text>
                    </View>
                  </View>
                ) : (
                  <PressableOpacity style={st.totalsRow} onPress={() => setEditingRate(true)} activeOpacity={0.6}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <Text style={[st.totalsValue, { color: colors.primary }]}>
                      {effectiveRate > 0 ? `$${effectiveRate.toFixed(2)}/hr` : 'Set rate'}
                    </Text>
                  </PressableOpacity>
                )}

                {/* Subtotal — auto */}
                <View style={st.totalsRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={st.totalsLabel}>Subtotal</Text>
                    <AutoLabel />
                  </View>
                  <Text style={st.totalsValue}>{formatMoney(subtotal)}</Text>
                </View>

                {/* Tax — auto */}
                {taxRate > 0 && (
                  <View style={st.totalsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.totalsLabel}>{taxLabel} ({taxRate}%)</Text>
                      <AutoLabel />
                    </View>
                    <Text style={st.totalsValue}>{formatMoney(taxAmount)}</Text>
                  </View>
                )}

                {/* Separator + Total */}
                <View style={st.totalsSeparator} />
                <View style={st.totalsRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={st.totalFinalLabel}>Total</Text>
                    <AutoLabel />
                  </View>
                  <Text style={st.totalFinalValue}>{formatMoney(grandTotal)}</Text>
                </View>
              </>
            ) : effectiveRate <= 0 && !legacyEditingRate ? (
              /* Read mode: no rate set */
              <>
                {!canEdit && onRateChange ? (
                  <PressableOpacity style={st.totalsRow} onPress={startLegacyRate} activeOpacity={0.6}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[st.totalsValue, { color: colors.primary }]}>Set rate</Text>
                      <Ionicons name="create-outline" size={14} color={colors.primary} />
                    </View>
                  </PressableOpacity>
                ) : (
                  <View style={st.totalsRow}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <Text style={st.totalsValue}>—</Text>
                  </View>
                )}
                <View style={st.totalsSeparator} />
                <View style={st.totalsRow}>
                  <Text style={st.totalFinalLabel}>Total Hours</Text>
                  <Text style={st.totalFinalValue}>{totalLabel}</Text>
                </View>
              </>
            ) : (
              /* Read mode: rate is set or legacy editing */
              <>
                {legacyEditingRate ? (
                  <View style={st.totalsRow}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.text }}>$</Text>
                      <TextInput
                        style={st.rateInput}
                        value={legacyRateText}
                        onChangeText={setLegacyRateText}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        onBlur={commitLegacyRate}
                        onSubmitEditing={commitLegacyRate}
                      />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>/hr</Text>
                    </View>
                  </View>
                ) : !canEdit && onRateChange ? (
                  <PressableOpacity style={st.totalsRow} onPress={startLegacyRate} activeOpacity={0.6}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.totalsValue}>${effectiveRate.toFixed(2)}/hr</Text>
                      <Ionicons name="create-outline" size={14} color={colors.textMuted} />
                    </View>
                  </PressableOpacity>
                ) : (
                  <View style={st.totalsRow}>
                    <Text style={st.totalsLabel}>Rate</Text>
                    <Text style={st.totalsValue}>${effectiveRate.toFixed(2)}/hr</Text>
                  </View>
                )}
                <View style={st.totalsRow}>
                  <Text style={st.totalsLabel}>Subtotal</Text>
                  <Text style={st.totalsValue}>{formatMoney(subtotal)}</Text>
                </View>
                {taxRate > 0 && (
                  <View style={st.totalsRow}>
                    <Text style={st.totalsLabel}>{taxLabel} ({taxRate}%)</Text>
                    <Text style={st.totalsValue}>{formatMoney(taxAmount)}</Text>
                  </View>
                )}
                <View style={st.totalsSeparator} />
                <View style={st.totalsRow}>
                  <Text style={st.totalFinalLabel}>Total</Text>
                  <Text style={st.totalFinalValue}>{formatMoney(grandTotal)}</Text>
                </View>
              </>
            )}
          </View>
        </>
      )}

      {/* ═══════ PRODUCTS/SERVICES: Line Items ═══════ */}
      {lineItems && lineItems.length > 0 && (
        <>
          {isEditing ? (
            /* Edit mode: editable line items */
            <View style={st.subCard}>
              <Text style={st.cardLabel}>LINE ITEMS</Text>
              {draftLineItems.map((item, i) => {
                const itemTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
                return (
                  <View key={i} style={[st.lineItemEdit, i > 0 && { borderTopWidth: 0.5, borderTopColor: ROW_SEPARATOR }]}>
                    {/* Title + Delete */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[st.lineItemTitleInput, { flex: 1 }]}
                        value={item.title}
                        onChangeText={(v) => {
                          const next = [...draftLineItems];
                          next[i] = { ...next[i], title: v };
                          setDraftLineItems(next);
                        }}
                        placeholder="Title"
                        placeholderTextColor={colors.textMuted}
                      />
                      <PressableOpacity
                        onPress={() => {
                          Alert.alert('Remove item?', item.title || 'This line item', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => setDraftLineItems(draftLineItems.filter((_, idx) => idx !== i)) },
                          ]);
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </PressableOpacity>
                    </View>
                    {/* Description */}
                    <TextInput
                      style={st.lineItemDescInput}
                      value={item.description}
                      onChangeText={(v) => {
                        const next = [...draftLineItems];
                        next[i] = { ...next[i], description: v };
                        setDraftLineItems(next);
                      }}
                      placeholder="Description"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                    />
                    {/* Qty x Price = Total */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <TextInput
                        style={st.lineItemQtyInput}
                        value={item.quantity}
                        onChangeText={(v) => {
                          const next = [...draftLineItems];
                          next[i] = { ...next[i], quantity: v };
                          setDraftLineItems(next);
                        }}
                        placeholder="Qty"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>x</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: colors.text }}>$</Text>
                        <TextInput
                          style={st.lineItemPriceInput}
                          value={item.unitPrice}
                          onChangeText={(v) => {
                            const next = [...draftLineItems];
                            next[i] = { ...next[i], unitPrice: v };
                            setDraftLineItems(next);
                          }}
                          placeholder="0.00"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: colors.text, textAlign: 'right' }}>
                        {formatMoney(itemTotal)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <PressableOpacity
                style={st.addItemBtn}
                onPress={() => setDraftLineItems([...draftLineItems, { title: '', description: '', quantity: '1', unitPrice: '' }])}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Add line item</Text>
              </PressableOpacity>
            </View>
          ) : (
            /* Read mode: title + description + qty x price = total */
            <View style={st.subCard}>
              <Text style={st.cardLabel}>LINE ITEMS</Text>
              {lineItems.map((item, i) => {
                const firstNewline = item.description.indexOf('\n');
                const title = firstNewline >= 0 ? item.description.slice(0, firstNewline) : item.description;
                const desc = firstNewline >= 0 ? item.description.slice(firstNewline + 1) : '';
                return (
                  <View key={item.id || i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 0.5, borderTopColor: ROW_SEPARATOR }]}>
                    <Text style={st.lineItemTitle}>{title}</Text>
                    {desc ? <Text style={st.lineItemDesc}>{desc}</Text> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={st.lineItemMeta}>
                        {item.quantity > 0 ? item.quantity.toLocaleString() : '—'} x {formatMoney(item.unitPrice)}
                      </Text>
                      <Text style={st.lineItemTotal}>{formatMoney(item.total)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Totals for line items */}
          <View style={st.subCard}>
            <View style={st.totalsRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.totalsLabel}>Subtotal</Text>
                {isEditing && <AutoLabel />}
              </View>
              <Text style={st.totalsValue}>{formatMoney(itemsSubtotal)}</Text>
            </View>
            {taxRate > 0 && (
              <View style={st.totalsRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={st.totalsLabel}>{taxLabel} ({taxRate}%)</Text>
                  {isEditing && <AutoLabel />}
                </View>
                <Text style={st.totalsValue}>{formatMoney(itemsTax)}</Text>
              </View>
            )}
            <View style={st.totalsSeparator} />
            <View style={st.totalsRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.totalFinalLabel}>Total</Text>
                {isEditing && <AutoLabel />}
              </View>
              <Text style={st.totalFinalValue}>{formatMoney(itemsTotal)}</Text>
            </View>
          </View>
        </>
      )}

      {/* ═══════ $0 Warning ═══════ */}
      {showZeroWarning && (
        <View style={st.zeroWarning}>
          <Ionicons name="alert-circle" size={18} color="#92400E" />
          <Text style={st.zeroWarningText}>
            This invoice has $0 total. You can edit it anytime to add hours.
          </Text>
        </View>
      )}

      {/* ═══════ NOTES ═══════ */}
      {(notes || isEditing) && (
        <View style={st.subCard}>
          <Text style={st.cardLabel}>NOTES</Text>
          {isEditing ? (
            <TextInput
              style={st.notesInput}
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Add notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          ) : notes ? (
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>{notes}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ============================================
// EXPORTED BACKWARD-COMPAT ALIASES
// ============================================

export const cardStyles = StyleSheet.create({
  receiptCard: {},
  receiptSection: { paddingVertical: 8 },
  receiptLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
  },
  receiptValue: { fontSize: 14, fontWeight: '500', color: colors.text },
  receiptSubvalue: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: CARD_BORDER, marginVertical: 12 },
  receiptRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '500', color: colors.text },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  grandTotalLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
  grandTotalValue: { fontSize: 18, fontWeight: '500', color: colors.primary },
  editBadge: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 0.5, borderColor: CARD_BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
});

export const tableStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: CARD_BORDER,
  },
  headerCell: {
    flex: 1, fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row', paddingVertical: 8, alignItems: 'center',
  },
  rowAlt: {},
  cell: { flex: 1, fontSize: 13, color: colors.text },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: CARD_BORDER,
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 14, fontWeight: '500', color: colors.text },
});

// ============================================
// STYLES
// ============================================

const st = StyleSheet.create({
  container: {
    gap: 10,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20, fontWeight: '500', color: colors.text,
  },
  headerDate: {
    fontSize: 12, color: colors.textMuted, marginTop: 2,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 0.5, borderColor: '#D1D0CE',
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
    justifyContent: 'center', alignItems: 'center',
    height: 32,
  },
  saveBtnText: {
    fontSize: 13, fontWeight: '600', color: colors.white,
  },

  // ── Banner ──
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: AMBER_SOFT, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  bannerText: {
    fontSize: 12, color: BANNER_TEXT, flex: 1,
  },

  // ── Sub-card (white card wrapper for each section) ──
  subCard: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 0.5, borderColor: CARD_BORDER,
    padding: 12,
  },
  dashedAmber: {
    borderWidth: 1, borderColor: colors.primary,
    borderStyle: 'dashed' as any,
  },

  // ── Card labels & values ──
  cardLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
  },
  cardLabelAmber: {
    fontSize: 10, fontWeight: '600', color: colors.primary,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
  },
  cardValue: {
    fontSize: 14, color: colors.text,
  },

  // ── TO / FROM ──
  toFromRow: {
    flexDirection: 'row', gap: 12,
  },
  toFromCard: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 0.5, borderColor: CARD_BORDER,
    minHeight: 56,
  },
  toFromCardAmber: {
    borderWidth: 1, borderColor: colors.primary,
  },
  toFromCardLegacy: {
    borderColor: '#D1D0CE',
  },
  toFromName: {
    fontSize: 15, fontWeight: '500', color: colors.text,
  },
  toFromSub: {
    fontSize: 12, color: colors.textSecondary, marginTop: 1,
  },

  // ── Table ──
  tableHeader: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: CARD_BORDER,
  },
  tableHeaderCell: {
    flex: 1, fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, alignItems: 'center',
  },
  tableRowBorder: {
    borderTopWidth: 0.5, borderTopColor: ROW_SEPARATOR,
  },
  tableCell: {
    flex: 1, fontSize: 13, color: colors.text,
  },
  editableCell: {
    backgroundColor: AMBER_SOFT,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    borderRadius: 4,
    paddingVertical: 4, paddingHorizontal: 2,
    marginHorizontal: 2,
  },
  editableCellText: {
    fontSize: 13, fontWeight: '500', color: colors.text,
  },
  tableSummary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: CARD_BORDER,
  },
  summaryLabel: {
    fontSize: 13, color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14, fontWeight: '500', color: colors.text,
  },

  // ── Totals card ──
  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 6,
  },
  totalsLabel: {
    fontSize: 13, color: colors.textSecondary,
  },
  totalsValue: {
    fontSize: 13, fontWeight: '500', color: colors.text,
  },
  totalsSeparator: {
    height: 1, backgroundColor: CARD_BORDER, marginVertical: 4,
  },
  totalFinalLabel: {
    fontSize: 15, fontWeight: '500', color: colors.text,
  },
  totalFinalValue: {
    fontSize: 18, fontWeight: '500', color: colors.primary,
  },

  // ── Rate input ──
  rateInput: {
    fontSize: 13, fontWeight: '500', color: colors.text,
    backgroundColor: AMBER_SOFT,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    borderRadius: 4,
    paddingVertical: 2, paddingHorizontal: 8,
    minWidth: 50, textAlign: 'right',
  },

  // ── Auto label ──
  autoLabel: {
    fontSize: 10, fontStyle: 'italic', color: colors.textSecondary,
  },

  // ── Break presets ──
  breakRow: {
    flexDirection: 'row', gap: 6, paddingVertical: 8,
    paddingHorizontal: 4, flexWrap: 'wrap',
  },
  breakPill: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: colors.surfaceMuted,
    borderWidth: 0.5, borderColor: CARD_BORDER,
    minHeight: 36,
  },
  breakPillActive: {
    backgroundColor: AMBER_SOFT,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  breakPillText: {
    fontSize: 12, fontWeight: '500', color: colors.textSecondary,
  },
  breakPillTextActive: {
    color: colors.primary, fontWeight: '700',
  },

  // ── iOS picker ──
  iosPickerBox: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 0.5, borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: CARD_BORDER,
  },
  iosPickerTitle: {
    fontSize: 14, fontWeight: '600', color: colors.text,
  },
  iosPickerDone: {
    fontSize: 14, fontWeight: '600', color: colors.primary,
  },

  // ── Notes ──
  notesInput: {
    backgroundColor: AMBER_SOFT,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: 8, padding: 10,
    fontSize: 13, color: colors.text,
    minHeight: 56,
  },

  // ── Line items (read mode) ──
  lineItemTitle: {
    fontSize: 14, fontWeight: '500', color: colors.text,
  },
  lineItemDesc: {
    fontSize: 13, fontWeight: '400', color: DESC_COLOR, lineHeight: 19,
    marginTop: 2,
  },
  lineItemMeta: {
    fontSize: 13, color: colors.textSecondary,
  },
  lineItemTotal: {
    fontSize: 13, fontWeight: '500', color: colors.text,
  },

  // ── Line items (edit mode) ──
  lineItemEdit: {
    paddingVertical: 10,
  },
  lineItemTitleInput: {
    fontSize: 14, fontWeight: '500', color: colors.text,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  lineItemDescInput: {
    backgroundColor: AMBER_SOFT,
    borderRadius: 6, padding: 8, marginTop: 6,
    fontSize: 13, color: colors.text,
    minHeight: 44,
  },
  lineItemQtyInput: {
    width: 50,
    backgroundColor: AMBER_SOFT,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6,
    fontSize: 13, color: colors.text, textAlign: 'center',
  },
  lineItemPriceInput: {
    width: 70,
    backgroundColor: AMBER_SOFT,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
    borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6,
    fontSize: 13, color: colors.text, textAlign: 'right',
  },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 8,
    borderWidth: 1, borderStyle: 'dashed' as any, borderColor: colors.primary,
    borderRadius: 8,
  },

  // ── $0 Warning ──
  zeroWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12,
  },
  zeroWarningText: {
    flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18,
  },
});
