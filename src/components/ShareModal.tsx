/**
 * ShareModal - OnSite Timekeeper
 *
 * Unified modal for sharing/exporting work records
 * Used in: Home (after save), Reports (export)
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, withOpacity } from '../constants/colors';
import { generateReport } from '../lib/reports';
import { formatDuration, type ComputedSession } from '../lib/database';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  sessions: ComputedSession[];
  userName?: string;
  userId?: string;
  onGoToReports?: () => void; // Optional - only shown if provided
  title?: string;
}

// ============================================
// COMPONENT
// ============================================

export function ShareModal({
  visible,
  onClose,
  sessions,
  userName,
  userId,
  onGoToReports,
  title = 'Share Report'
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

  const reportText = generateReport(sessions, { userName, userId });

  // Share as TXT (uses native share sheet)
  const handleShareTxt = async () => {
    try {
      await Share.share({
        message: reportText,
        title: `Work Report - ${summary.date}`,
      });
      onClose();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Share via WhatsApp
  const handleShareWhatsApp = async () => {
    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(reportText)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);

      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        onClose();
      } else {
        Alert.alert('WhatsApp not installed', 'Please install WhatsApp to share via this method.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open WhatsApp');
      console.error('WhatsApp error:', error);
    }
  };

  // Share via Email
  const handleShareEmail = async () => {
    try {
      const subject = encodeURIComponent(`Work Report - ${summary.locationName} - ${summary.date}`);
      const body = encodeURIComponent(reportText);
      const emailUrl = `mailto:?subject=${subject}&body=${body}`;

      await Linking.openURL(emailUrl);
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Could not open email app');
      console.error('Email error:', error);
    }
  };

  // Go to Reports
  const handleGoToReports = () => {
    onClose();
    if (onGoToReports) {
      onGoToReports();
    }
  };

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

            {/* Divider */}
            <View style={modalStyles.divider} />

            {/* Share Options */}
            <Text style={modalStyles.sectionTitle}>Share via</Text>

            <View style={modalStyles.optionsGrid}>
              {/* TXT / Share */}
              <TouchableOpacity style={modalStyles.optionBtn} onPress={handleShareTxt}>
                <View style={[modalStyles.optionIcon, { backgroundColor: withOpacity(colors.textSecondary, 0.15) }]}>
                  <Ionicons name="document-text-outline" size={24} color={colors.text} />
                </View>
                <Text style={modalStyles.optionLabel}>Text</Text>
              </TouchableOpacity>

              {/* WhatsApp */}
              <TouchableOpacity style={modalStyles.optionBtn} onPress={handleShareWhatsApp}>
                <View style={[modalStyles.optionIcon, { backgroundColor: '#25D366' }]}>
                  <Ionicons name="logo-whatsapp" size={24} color={colors.white} />
                </View>
                <Text style={modalStyles.optionLabel}>WhatsApp</Text>
              </TouchableOpacity>

              {/* Email */}
              <TouchableOpacity style={modalStyles.optionBtn} onPress={handleShareEmail}>
                <View style={[modalStyles.optionIcon, { backgroundColor: '#EA4335' }]}>
                  <Ionicons name="mail-outline" size={24} color={colors.white} />
                </View>
                <Text style={modalStyles.optionLabel}>Email</Text>
              </TouchableOpacity>

              {/* Go to Reports - only if handler provided */}
              {onGoToReports && (
                <TouchableOpacity style={modalStyles.optionBtn} onPress={handleGoToReports}>
                  <View style={[modalStyles.optionIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="bar-chart-outline" size={24} color={colors.white} />
                  </View>
                  <Text style={modalStyles.optionLabel}>Reports</Text>
                </TouchableOpacity>
              )}
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
    maxWidth: 340,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  optionBtn: {
    alignItems: 'center',
    width: 70,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  doneBtn: {
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
