/**
 * Home Styles - OnSite Timekeeper
 * 
 * v1.5 - Layout 50/25/25 com Timer Vertical
 * 
 * - Form Section (50%) - Log Hours inline
 * - Locations Section (25%) - Location cards compactos
 * - Timer Section (25%) - Timer vertical com botões embaixo
 */

import { StyleSheet, Platform } from 'react-native';
import { colors, withOpacity, shadows, spacing, borderRadius, typography } from '../../../constants/colors';

export const homeStyles = StyleSheet.create({
  // Container - paddingTop handled by SafeAreaView in the component
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLogo: {
    width: 90,
    height: 28,
  },

  // Main Content Wrapper - distributes timer and form to fill screen
  mainContentWrapper: {
    flex: 1,
    minHeight: 460,  // Increased to fill screen
    justifyContent: 'flex-start',
  },

  // ============================================
  // LOG HOURS FORM - Enhanced prominence with darker gray background
  // ============================================
  formSection: {
    flex: 1,  // Takes remaining space (now the dominant container)
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
    justifyContent: 'flex-start',
    ...shadows.md,
  },
  formSectionEditing: {
    flex: 1,  // Takes remaining space when editing too
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
    justifyContent: 'flex-start',
    ...shadows.md,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  formTitle: {
    ...typography.titleSm,
    fontWeight: '700',
    color: colors.text,
  },
  reportsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderRadius: borderRadius.sm,
  },
  reportsLinkText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.primary,
  },
  inputLabel: {
    ...typography.labelMd,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dropdownDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  dropdownText: {
    ...typography.bodyMd,
    fontWeight: '500',
    color: colors.text,
  },
  dropdownPlaceholder: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  dropdownMenu: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    marginTop: -6,
    overflow: 'hidden',
    ...shadows.md,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownOptionActive: {
    backgroundColor: withOpacity(colors.primary, 0.08),
  },
  dropdownOptionText: {
    ...typography.bodyMd,
    color: colors.text,
    flex: 1,
  },
  dropdownOptionTextActive: {
    fontWeight: '600',
    color: colors.primary,
  },

  // ============================================
  // TIME INPUTS - Centered rows
  // ============================================
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  
  // Entry - normal size
  timeLabel: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 60,
  },
  timeInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInput: {
    width: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSeparator: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.sm,
  },

  // Exit & Break - LARGER
  timeLabelLg: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 60,
  },
  timeInputLg: {
    width: 50,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    ...typography.displaySm,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  timeSeparatorLg: {
    ...typography.displaySm,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.sm,
  },
  breakInputLg: {
    width: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    ...typography.displaySm,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  breakUnitLg: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },

  // Save button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  saveButtonText: {
    ...typography.bodyLg,
    fontWeight: '700',
    color: colors.buttonPrimaryText,
  },

  // Send to button (always visible)
  sendToButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: withOpacity(colors.accent, 0.1),
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: withOpacity(colors.accent, 0.3),
  },
  sendToButtonText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.accent,
  },

  // ============================================
  // SEND TO MODAL STYLES
  // ============================================
  sendToModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  sendToModalContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    ...shadows.lg,
  },
  sendToModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sendToModalTitle: {
    ...typography.titleMd,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  sendToModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneInputContainer: {
    marginBottom: spacing.lg,
  },
  phoneInputLabel: {
    ...typography.labelLg,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.titleSm,
    color: colors.text,
  },
  contactsButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentContactsContainer: {
    marginBottom: spacing.xl,
  },
  recentContactsTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  recentContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  recentContactInfo: {
    flex: 1,
  },
  recentContactName: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xxs,
  },
  recentContactPhone: {
    ...typography.labelLg,
    color: colors.textSecondary,
  },
  recentContactSelect: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendToModalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  sendToModalCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendToModalCancelText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
  },
  sendToModalSendButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sendToModalSendText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.white,
  },
  emptyContactsText: {
    textAlign: 'center',
    color: colors.textMuted,
    ...typography.bodyMd,
    fontStyle: 'italic',
    paddingVertical: spacing.xl,
  },

  // ============================================
  // LOCATIONS - Auto height
  // ============================================
  locationsSection: {
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  addButton: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyLocations: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.darkSurface,
    borderRadius: borderRadius.md,
    minHeight: 80,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyLocationsText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.white,
  },
  locationCardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  locationCard: {
    width: 120,
    height: 80,
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: 'center',
  },
  locationCardSelected: {
    backgroundColor: withOpacity(colors.warning, 0.15),
    borderColor: colors.warning,
    borderWidth: 2,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  locationCardName: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  locationCardTotal: {
    ...typography.labelLg,
    color: colors.textSecondary,
  },
  locationCardActive: {
    ...typography.labelLg,
    fontWeight: '600',
    color: colors.success,
  },
  addLocationCardInline: {
    width: 80,
    height: 80,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ============================================
  // TIMER - Larger to accommodate animated ring
  // ============================================
  timerSection: {
    // Natural height only (ring + buttons) — form is now the dominant container
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  timerSectionActive: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },

  // VERTICAL layout
  timerVertical: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerTopRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successSoft,
    paddingVertical: 3,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  activeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success,
  },
  activeBadgeText: {
    ...typography.labelLg,
    fontWeight: '600',
    color: colors.success,
  },
  timerDisplay: {
    ...typography.displayMd,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.text,
    marginBottom: spacing.xs,
  },
  timerPaused: {
    opacity: 0.4,
  },
  pausaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xs,
  },
  pausaTimer: {
    ...typography.bodySm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
  pausaTimerActive: {
    color: colors.accent,
  },

  // Buttons row - CENTERED BELOW timer
  timerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  pauseBtn: {
    width: 48,  // Increased 20% (was 40)
    height: 48,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeBtn: {
    width: 48,  // Increased 20% (was 40)
    height: 48,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopBtn: {
    width: 48,  // Increased 20% (was 40)
    height: 48,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Idle state
  idleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 3,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
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
  },
  timerIdle: {
    ...typography.displayMd,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.sm,
  },
  startBtnText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },

  // Waiting state
  timerWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  timerWaitingText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },

  // ============================================
  // NEW: DATE PICKER STYLES
  // ============================================
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: withOpacity(colors.primary, 0.05),
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.2),
    marginBottom: spacing.md,
  },
  dateSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateSelectorText: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
  },
  dateDropdown: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    marginTop: -6,
    overflow: 'hidden',
    ...shadows.md,
  },
  dateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateOptionText: {
    ...typography.bodyMd,
    color: colors.text,
  },

  // ============================================
  // NEW: TIME PICKER BUTTONS (replacing inputs)
  // ============================================
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: withOpacity(colors.primary, 0.15),
    ...shadows.sm,
  },
  timePickerText: {
    ...typography.titleMd,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.text,
    minWidth: 70,
  },
  timePickerButtonLg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: withOpacity(colors.primary, 0.15),
    ...shadows.sm,
  },
  timePickerTextLg: {
    ...typography.titleMd,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.text,
    minWidth: 70,
  },

  // ============================================
  // NEW: TOTAL HOURS DISPLAY
  // ============================================
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: withOpacity(colors.success, 0.08),
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.2),
  },
  totalLabel: {
    ...typography.titleSm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
  },
  totalText: {
    ...typography.titleMd,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: colors.primary,
  },

  // ============================================
  // NEW: TIME PICKER MODALS (iOS)
  // ============================================
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  pickerCancel: {
    fontSize: 17,
    color: colors.textSecondary,
  },
  pickerDone: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
  },
  iosTimePicker: {
    height: 200,
  },

  // ============================================
  // NEW: LOCATION CAROUSEL
  // ============================================
  locationCarousel: {
    marginBottom: spacing.md,
  },
  locationCarouselScroll: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  locationCarouselCard: {
    width: 100,
    height: 60,
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  locationCarouselCardSelected: {
    backgroundColor: withOpacity(colors.warning, 0.15),
    borderColor: colors.warning,
    borderWidth: 2,
  },
  locationCarouselCardName: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.text,
  },
  locationCarouselCardHours: {
    ...typography.labelMd,
    color: colors.textSecondary,
  },
  addLocationCard: {
    width: 80,
    height: 60,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ============================================
  // NEW: BREAK DROPDOWN
  // ============================================
  breakDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
    justifyContent: 'space-between',
  },
  breakDropdownText: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.text,
  },
  breakDropdownMenu: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    marginTop: -6,
    overflow: 'hidden',
    ...shadows.md,
  },
  breakOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakOptionLast: {
    borderBottomWidth: 0,
  },
  breakOptionText: {
    ...typography.bodyMd,
    color: colors.text,
  },
  breakInput: {
    width: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    ...typography.titleMd,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  breakUnit: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },

  // ============================================
  // NEW: SIMPLIFIED TOTAL
  // ============================================
  totalRowSimple: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  totalSimple: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  totalSimpleValue: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.text,
  },
});

// Alias para compatibilidade
export const fixedStyles = homeStyles;
