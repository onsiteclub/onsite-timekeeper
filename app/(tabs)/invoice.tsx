/**
 * Invoice Screen - OnSite Timekeeper
 *
 * Personal billing hub: business profile, month summary, PDF export.
 * Positions the app as a time-record + invoice tool for freelancers.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../../src/constants/colors';
import { useBusinessProfileStore } from '../../src/stores/businessProfileStore';
import { useAuthStore } from '../../src/stores/authStore';
import { generateAndShareTimesheetPDF } from '../../src/lib/timesheetPdf';
import { getDailyHoursByPeriod, type DailyHoursEntry } from '../../src/lib/database/daily';
import { toLocalDateString } from '../../src/lib/database/core';

function formatHM(minutes: number): string {
  if (minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function InvoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile: businessProfile, loadProfile, incrementInvoiceNumber } = useBusinessProfileStore();
  const userId = useAuthStore((s) => s.getUserId());
  const userName = useAuthStore((s) => s.getUserName());

  // Month data
  const [monthDays, setMonthDays] = useState(0);
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Load business profile
  useEffect(() => {
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  // Load current month summary
  useEffect(() => {
    if (!userId) return;
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startStr = toLocalDateString(firstDay);
    const endStr = toLocalDateString(lastDay);

    try {
      const rows = getDailyHoursByPeriod(userId, startStr, endStr);
      const worked = rows.filter((r) => r.total_minutes > 0);
      setMonthDays(worked.length);
      setMonthMinutes(worked.reduce((sum, r) => sum + r.total_minutes, 0));
    } catch { /* ignore */ }
  }, [userId]);

  // Export current month as PDF
  const handleExportMonth = useCallback(async () => {
    if (!userId) return;
    setIsExporting(true);

    try {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const startStr = toLocalDateString(firstDay);
      const endStr = toLocalDateString(lastDay);

      const rows = getDailyHoursByPeriod(userId, startStr, endStr);
      const sessions = rows.map((r) => ({
        id: r.id,
        date: r.date,
        duration_minutes: r.total_minutes,
        pause_minutes: r.break_minutes || 0,
        entry_at: r.first_entry || '',
        exit_at: r.last_exit || '',
        location_name: r.location_name || '',
        location_id: r.location_id || '',
        source: r.source || 'manual',
        verified: r.verified || false,
      }));

      const invoiceNumber = businessProfile?.next_invoice_number ?? undefined;

      await generateAndShareTimesheetPDF(sessions as any, {
        employeeName: userName || 'User',
        employeeId: userId,
        periodStart: firstDay,
        periodEnd: lastDay,
        businessName: businessProfile?.business_name,
        businessAddress: businessProfile
          ? [businessProfile.address_street, businessProfile.address_city, businessProfile.address_province, businessProfile.address_postal_code].filter(Boolean).join(', ')
          : undefined,
        businessPhone: businessProfile?.phone ?? undefined,
        businessEmail: businessProfile?.email ?? undefined,
        businessNumber: businessProfile?.business_number ?? undefined,
        gstHstNumber: businessProfile?.gst_hst_number ?? undefined,
        hourlyRate: businessProfile?.default_hourly_rate || undefined,
        taxRate: businessProfile?.tax_rate || undefined,
        invoiceNumber,
      });

      // Auto-increment invoice number after successful generation
      if (userId && invoiceNumber) {
        incrementInvoiceNumber(userId);
      }
    } catch (error) {
      // PDF generation handles its own errors
    } finally {
      setIsExporting(false);
    }
  }, [userId, userName, businessProfile]);

  const monthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
    >
      {/* Header */}
      <Text style={styles.screenTitle}>Invoice</Text>
      <Text style={styles.screenSubtitle}>Generate and export your time records</Text>

      {/* Business Profile Card */}
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push('/business-profile')}
      >
        <View style={styles.cardRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="business-outline" size={22} color={colors.accent} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Business Profile</Text>
            <Text style={styles.cardDescription} numberOfLines={1}>
              {businessProfile?.business_name || 'Set up your business details'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.iconMuted} />
        </View>
      </Pressable>

      {/* Month Summary Card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{monthName}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{monthDays}</Text>
            <Text style={styles.statLabel}>days worked</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatHM(monthMinutes)}</Text>
            <Text style={styles.statLabel}>total time</Text>
          </View>
        </View>
      </View>

      {/* Generate Invoice Card */}
      <View style={[styles.card, styles.exportCard]}>
        <View style={styles.cardRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.greenSoft }]}>
            <Ionicons name="document-text-outline" size={22} color={colors.green} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Generate Invoice</Text>
            <Text style={styles.cardDescription}>
              Export a PDF time report for the current month with your business details, hours, and rates.
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.exportButton, pressed && styles.exportButtonPressed, isExporting && styles.exportButtonDisabled]}
          onPress={handleExportMonth}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="download-outline" size={20} color={colors.white} />
          )}
          <Text style={styles.exportButtonText}>
            {isExporting ? 'Generating...' : 'Export This Month'}
          </Text>
        </Pressable>

        <Text style={styles.exportHint}>
          For a custom date range, go to Home and tap "Select Dates to Export"
        </Text>
      </View>

      {/* Tip Card */}
      <View style={styles.tipCard}>
        <Ionicons name="bulb-outline" size={18} color={colors.primary} />
        <Text style={styles.tipText}>
          Set up your business profile to include your company name, address, and tax information on exported invoices.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  // Cards
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.sm,
  },
  cardPressed: {
    backgroundColor: colors.cardPressed,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.borderLight,
  },

  // Export
  exportCard: {
    borderColor: colors.accent,
    borderWidth: 1,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  exportButtonPressed: {
    opacity: 0.85,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  exportHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Tip
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
