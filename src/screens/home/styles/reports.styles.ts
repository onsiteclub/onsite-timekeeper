/**
 * Reports Styles - OnSite Timekeeper
 * 
 * Estilos específicos para a tela Reports
 * - Calendar Card
 * - Week/Month Views
 * - Day Modal
 * - Export Buttons
 * - Batch Actions
 */

import { StyleSheet, Dimensions, Platform } from 'react-native';
import { colors, withOpacity, shadows, spacing, borderRadius, typography } from '../../../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const MONTH_DAY_SIZE = (SCREEN_WIDTH - 32 - 12) / 7;

export const reportsStyles = StyleSheet.create({
  // ============================================
  // CALENDAR CARD
  // ============================================
  calendarCard: {
    padding: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  calendarHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
  },
  calendarCenter: { alignItems: 'center', flex: 1 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  navBtnText: { color: colors.textSecondary, ...typography.bodyMd, fontWeight: '700' },
  calendarTitle: {
    ...typography.bodySm,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  calendarTotal: {
    ...typography.displaySm,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  // View toggle (Week/Month)
  viewToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  viewToggleBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.accent,
  },
  viewToggleText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewToggleTextActive: {
    color: colors.white,
  },

  // ============================================
  // SELECTION BAR
  // ============================================
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  selectionText: { color: colors.white, ...typography.bodyMd, fontWeight: '500' },
  selectionCancel: { color: colors.white, ...typography.bodyMd, fontWeight: '600' },

  // ============================================
  // WEEK VIEW - DAY ROW
  // ============================================
  dayRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  dayRowToday: { 
    borderWidth: 2, 
    borderColor: colors.primary,
  },
  dayRowSelected: { 
    backgroundColor: withOpacity(colors.primary, 0.08), 
    borderWidth: 2, 
    borderColor: colors.primary,
  },
  dayRowWeekend: {
    backgroundColor: withOpacity(colors.textMuted, 0.08),
  },
  dayRowFuture: {
    opacity: 0.5,
  },
  
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.xs,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: { 
    backgroundColor: colors.accent, 
    borderColor: colors.accent,
  },
  checkmark: { color: colors.white, ...typography.bodyMd, fontWeight: '700' },

  dayLeft: { width: 44, alignItems: 'center', marginRight: spacing.md },
  dayName: { ...typography.labelMd, color: colors.textSecondary, fontWeight: '500' },
  dayNameToday: { color: colors.accent },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  dayCircleToday: { 
    backgroundColor: colors.primary,
  },
  dayNumber: { ...typography.bodyMd, fontWeight: '600', color: colors.text },
  dayNumberToday: { color: colors.buttonPrimaryText },
  
  dayRight: { flex: 1 },
  dayEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayEmptyText: { ...typography.bodySm, color: colors.textMuted, fontStyle: 'italic' },
  dayPreview: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  dayPreviewDuration: { ...typography.bodyLg, fontWeight: '600', color: colors.text },
  expandIcon: { ...typography.labelLg, color: colors.textSecondary, marginLeft: spacing.sm },

  // ============================================
  // MONTH VIEW
  // ============================================
  monthContainer: {
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  monthWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.sm,
  },
  monthWeekHeaderText: {
    width: MONTH_DAY_SIZE,
    textAlign: 'center',
    ...typography.labelLg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  monthDayEmpty: {
    width: MONTH_DAY_SIZE,
    height: MONTH_DAY_SIZE,
  },
  monthDay: {
    width: MONTH_DAY_SIZE,
    height: MONTH_DAY_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
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
  monthDayNumber: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.text,
  },
  monthDayNumberToday: {
    color: colors.accent,
    fontWeight: '700',
  },
  monthDayNumberSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  monthDayIndicator: {
    width: 4,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    marginTop: spacing.xxs,
  },
  monthDayWeekend: {
    backgroundColor: withOpacity(colors.textMuted, 0.15),
  },
  monthDayFuture: {
    opacity: 0.4,
  },
  monthDayNumberFuture: {
    color: colors.textMuted,
  },
  monthDayTagIndicator: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  monthExpandedReport: {
    marginTop: spacing.md,
  },

  // ============================================
  // EXPORT BUTTONS
  // ============================================
  exportBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  exportBtnText: { color: colors.buttonPrimaryText, ...typography.bodyLg, fontWeight: '600' },
  exportBtnSecondary: {
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  exportBtnSecondaryText: { color: colors.text, ...typography.bodyLg, fontWeight: '600' },

  // ============================================
  // DAY DETAIL MODAL
  // ============================================
  dayModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['4xl'],
  },
  dayModalContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  dayModalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
    maxHeight: '85%',
  },
  dayModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayModalTitle: {
    ...typography.titleSm,
    color: colors.text,
    flex: 1,
  },
  dayModalHeaderActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayModalHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayModalHeaderBtnText: {
    ...typography.titleMd,
  },
  dayModalCloseHeaderBtn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayModalCloseHeaderBtnText: {
    ...typography.titleSm,
    fontWeight: '700',
    color: colors.white,
  },
  
  dayModalSelectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayModalSelectionText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  dayModalSelectionActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  dayModalSelectionBtn: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.accent,
  },

  dayModalSessionsList: {
    flex: 1,
  },
  dayModalSessionsContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  dayModalSessions: {
    maxHeight: 350,
  },
  dayModalEmpty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  dayModalEmptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
    opacity: 0.3,
  },
  dayModalEmptyText: {
    ...typography.titleSm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  dayModalAddBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.xxl,
  },
  dayModalAddBtnText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },

  dayModalSession: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayModalSessionSelected: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dayModalCheckbox: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    marginTop: spacing.xxs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayModalCheckboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayModalCheckmark: {
    color: colors.white,
    ...typography.bodyMd,
    fontWeight: '700',
  },
  dayModalSessionInfo: {
    flex: 1,
  },
  dayModalSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dayModalSessionLocation: {
    ...typography.titleSm,
    color: colors.text,
  },
  dayModalSessionDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
  },
  dayModalSessionTime: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dayModalSessionTimeEdited: {
    color: colors.warning,
  },
  dayModalSessionPause: {
    ...typography.bodySm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  dayModalSessionTotal: {
    ...typography.titleMd,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },

  dayModalTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayModalTotalLabel: {
    ...typography.titleSm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dayModalTotalValue: {
    ...typography.displaySm,
    fontWeight: '700',
    color: colors.text,
  },

  dayModalFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  dayModalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  dayModalCancelBtnText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayModalExportBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  dayModalExportBtnText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
  
  dayModalCloseBtn: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayModalCloseBtnText: {
    ...typography.titleSm,
    color: colors.textSecondary,
  },

  // ============================================
  // BATCH ACTION BAR
  // ============================================
  batchActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  batchActionText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.white,
  },
  batchActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  batchActionBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchActionBtnText: {
    ...typography.titleMd,
  },
  batchActionBtnCancel: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchActionCancelText: {
    ...typography.titleSm,
    fontWeight: '700',
    color: colors.white,
  },
});
