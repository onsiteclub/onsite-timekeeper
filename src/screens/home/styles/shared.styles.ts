/**
 * Shared Styles - OnSite Timekeeper
 * 
 * Estilos compartilhados entre Home e Reports
 * - Container, Header, Tooltip
 * - Timer Card (versão original)
 * - Location Cards (versão original)
 * - Modals genéricos
 * - Tag Modal
 */

import { StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { colors, withOpacity, shadows, spacing, borderRadius, typography } from '../../../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const MONTH_DAY_SIZE = (SCREEN_WIDTH - 32 - 12) / 7;

export const sharedStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + spacing.lg : 60,
  },

  // ============================================
  // HEADER
  // ============================================
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerLogoContainer: {
    padding: spacing.xs,
  },
  headerLogo: { 
    width: 110, 
    height: 36,
  },
  headerUserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerUserName: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.textSecondary,
    maxWidth: 120,
  },
  headerUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  
  // Logo Tooltip
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingHorizontal: spacing.xl,
  },
  tooltipContainer: {
    alignSelf: 'flex-start',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.card,
    marginLeft: spacing.xl,
    ...shadows.md,
  },
  tooltipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  tooltipText: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  tooltipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  tooltipButtonText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },

  greeting: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // ============================================
  // TIMER CARD (Active Session)
  // ============================================
  timerCard: {
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  timerCardActive: { 
    backgroundColor: colors.card, 
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.cardAccent,
  },
  timerCardIdle: { 
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  
  // Active badge (green)
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  activeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
  },
  activeBadgeText: {
    ...typography.labelLg,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.4,
  },
  
  // Idle badge (gray)
  idleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  idleBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textSecondary,
  },
  idleBadgeText: {
    ...typography.labelLg,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  
  // Location badge
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
  },
  locationBadgeText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.text,
  },
  
  // Timer display
  timerLabel: {
    ...typography.bodySm,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  timer: {
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  timerPaused: { opacity: 0.4 },
  timerHint: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  
  // Geofence status
  geofenceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  geofenceStatusText: {
    ...typography.labelLg,
    fontWeight: '500',
    color: colors.success,
  },
  
  // Timer actions
  timerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.md,
    minWidth: 110,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionBtnText: { ...typography.bodyMd, fontWeight: '600' },
  
  pauseBtn: { 
    backgroundColor: colors.surfaceMuted, 
    borderWidth: 1, 
    borderColor: colors.border,
  },
  pauseBtnText: { color: colors.text },
  continueBtn: { backgroundColor: colors.primary },
  continueBtnText: { color: colors.buttonPrimaryText },
  stopBtn: { backgroundColor: colors.textSecondary },
  stopBtnText: { color: colors.white },
  startBtn: { backgroundColor: colors.primary },
  startBtnText: { color: colors.buttonPrimaryText },

  // Break/Pause display
  pausaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  pausaLabel: { ...typography.bodySm, color: colors.textSecondary },
  pausaTimer: {
    ...typography.titleSm,
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
  pausaTimerActive: { color: colors.accent },

  // ============================================
  // SECTION DIVIDER
  // ============================================
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
    marginHorizontal: 0,
  },

  // ============================================
  // LOCATION CARDS
  // ============================================
  locationCardsSection: {
    marginBottom: spacing.lg,
  },
  locationCardsScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  locationCardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  
  locationCardFull: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  locationCardHalf: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  locationCardScrollable: {
    width: 160,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  locationCardHeaderInfo: {
    flex: 1,
  },
  locationCardHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationCardIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  locationCardIconGlow: {
    position: 'absolute',
    bottom: 0,
    width: 20,
    height: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  locationCardName: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.text,
  },
  locationCardNameCompact: {
    flex: 1,
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
  },
  locationCardCoords: {
    ...typography.labelMd,
    color: colors.textTertiary,
    marginTop: 1,
  },
  locationCardTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  locationCardTimeLabel: {
    ...typography.labelLg,
    color: colors.textSecondary,
  },
  locationCardTimeValue: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
  },
  locationCardTimeActive: {
    color: colors.success,
  },
  locationCardStatsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  locationCardTotal: {
    ...typography.titleMd,
    fontWeight: '700',
    color: colors.text,
  },
  locationCardTotalCompact: {
    ...typography.titleSm,
    fontWeight: '700',
    color: colors.text,
  },
  locationCardSubtext: {
    ...typography.labelMd,
    color: colors.textTertiary,
    marginTop: spacing.xxs,
  },

  // ============================================
  // MODAL (Manual Entry)
  // ============================================
  modalOverlay: { 
    flex: 1, 
    backgroundColor: colors.overlay, 
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
  },
  modalTitle: {
    ...typography.titleMd,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...typography.bodySm,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  localPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  localOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  localOptionActive: { 
    backgroundColor: colors.primary, 
    borderColor: colors.primary,
  },
  localDot: { width: 10, height: 10, borderRadius: borderRadius.full, marginRight: spacing.sm },
  localOptionText: { ...typography.bodySm, color: colors.text },
  localOptionTextActive: { color: colors.buttonPrimaryText, fontWeight: '500' },

  timeRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  timeField: { flex: 1 },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeInputSmall: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.displaySm,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    width: 56,
  },
  timeSeparator: {
    ...typography.displaySm,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.xs,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.titleMd,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  pausaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pausaInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.titleLg,
    fontWeight: '600',
    textAlign: 'center',
    width: 70,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  pausaHint: { ...typography.titleSm, color: colors.textSecondary },
  inputHint: {
    ...typography.labelLg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  
  // Entry mode toggle
  entryModeToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  entryModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  entryModeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  entryModeBtnText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  entryModeBtnTextActive: {
    color: colors.buttonPrimaryText,
  },
  
  // Absence options
  absenceOptions: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  absenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  absenceOptionActive: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderColor: colors.primary,
  },
  absenceOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  absenceOptionText: {
    flex: 1,
    ...typography.bodyLg,
    fontWeight: '500',
    color: colors.text,
  },
  absenceOptionTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  
  modalActions: { flexDirection: 'row', gap: spacing.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  cancelBtnText: { ...typography.bodyLg, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnText: { ...typography.bodyLg, color: colors.buttonPrimaryText, fontWeight: '600' },

  // ============================================
  // TAG MODAL
  // ============================================
  tagModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
  },
  tagModalTitle: {
    ...typography.titleMd,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  tagModalSubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  tagOptionsList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tagOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.md,
  },
  tagOptionActive: {
    backgroundColor: withOpacity(colors.primary, 0.15),
    borderWidth: 2,
    borderColor: colors.primary,
  },
  tagOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagOptionText: {
    ...typography.bodyLg,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  tagOptionCheck: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tagClearBtnText: {
    ...typography.bodyLg,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tagCloseBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  tagCloseBtnText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
  
  dayTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.xs,
    marginTop: spacing.xs,
  },
  dayTagBadgeText: {
    ...typography.labelSm,
    fontWeight: '600',
  },

  // ============================================
  // SHARED PATTERNS (Phase 3 consolidation)
  // ============================================

  // Section label (uppercase, small, secondary)
  sectionLabel: {
    ...typography.labelMd,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Standard card container
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Surface card variant (lighter)
  cardSurface: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
  },

  // Bottom sheet top
  bottomSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    backgroundColor: colors.card,
  },

  // Bottom sheet drag handle
  bottomSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderWarm,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
});
