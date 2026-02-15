/**
 * ShareModal - OnSite Timekeeper
 *
 * Summary modal shown after saving work hours.
 * Displays a brief summary of the saved record.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { formatDuration } from '../lib/database';
// V3: ComputedSession now comes from hooks.ts (was removed from database)
import type { ComputedSession } from '../screens/home/hooks';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  sessions: ComputedSession[];
  title?: string;
}

// ============================================
// COMPONENT
// ============================================

export function ShareModal({
  visible,
  onClose,
  sessions,
  title = 'Hours Saved!'
}: ShareModalProps) {
  // Compute summary from sessions
  const summary = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return { locationName: '', date: '', entryTime: '', exitTime: '', totalHours: '0h' };
    }

    const locationNames = new Set<string>();
    let totalMinutes = 0;
    let firstEntry: Date | null = null;
    let lastExit: Date | null = null;

    for (const s of sessions) {
      locationNames.add(s.location_name || 'Unknown');
      const pause = s.pause_minutes || 0;
      totalMinutes += Math.max(0, s.duration_minutes - pause);

      const entryDate = new Date(s.entry_at);
      if (!firstEntry || entryDate < firstEntry) {
        firstEntry = entryDate;
      }

      if (s.exit_at) {
        const exitDate = new Date(s.exit_at);
        if (!lastExit || exitDate > lastExit) {
          lastExit = exitDate;
        }
      }
    }

    const formatTime = (date: Date | null): string => {
      if (!date) return '--:--';
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatDateLabel = (date: Date): string => {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    return {
      locationName: Array.from(locationNames).join(', '),
      date: firstEntry ? formatDateLabel(firstEntry) : '',
      entryTime: formatTime(firstEntry),
      exitTime: formatTime(lastExit),
      totalHours: formatDuration(totalMinutes),
    };
  }, [sessions]);

  if (!sessions || sessions.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={modalStyles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={modalStyles.container}>
            {/* Header */}
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>{title}</Text>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Record Summary */}
            <View style={modalStyles.summary}>
              <View style={modalStyles.summaryRow}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <Text style={modalStyles.summaryText}>{summary.locationName}</Text>
              </View>
              <View style={modalStyles.summaryRow}>
                <Ionicons name="calendar" size={16} color={colors.textSecondary} />
                <Text style={modalStyles.summaryText}>{summary.date}</Text>
              </View>
              <View style={modalStyles.summaryRow}>
                <Ionicons name="time" size={16} color={colors.textSecondary} />
                <Text style={modalStyles.summaryText}>
                  {summary.entryTime} - {summary.exitTime} ({summary.totalHours})
                </Text>
              </View>
            </View>

            {/* Done Button */}
            <TouchableOpacity style={modalStyles.doneBtn} onPress={onClose}>
              <Text style={modalStyles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================
// STYLES
// ============================================

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  doneBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
