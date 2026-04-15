/**
 * Map Screen Styles - OnSite Timekeeper
 *
 * v3: 75% map + fixed bottom panel (no drag handle)
 * Location detail redesign with marketing balloon / detection zone slider
 */

import { StyleSheet, Platform } from 'react-native';
import { colors, withOpacity, spacing, borderRadius } from '../../constants/colors';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Map fills remaining space above the content-sized panel
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },

  // ============================================
  // MAP OVERLAYS
  // ============================================
  myLocationButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  // Branded pin — full overlay centered, needle tip at exact center
  pinWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 46,
  },
  pinBubble: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.amber,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  pinImage: {
    width: 28,
    height: 28,
    tintColor: colors.white,
  },
  pinNeedle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.amber,
    marginTop: -1,
  },

  // Permission banner wrapper
  permissionBannerWrapper: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 5,
  },

  // ============================================
  // LOCATION LABELS (on map markers)
  // ============================================
  locationLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    maxWidth: 160,
  },
  locationLabelDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  locationLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },

  // ============================================
  // BOTTOM PANEL
  // ============================================
  // Panel sizes to content — no flex, no scroll
  panel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  panelContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Panel handle (State A only — kept for adding mode)
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.xs,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  // Name input (State A)
  nameInput: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.backgroundTertiary,
    marginBottom: spacing.md,
  },
  nameInputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },

  // Add button (State A)
  addButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.buttonPrimary,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },

  // ============================================
  // STEP 1: FLOATING CONFIRM AREA (bottom of map)
  // ============================================
  confirmArea: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.buttonPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.buttonPrimaryText,
  },
});

// ============================================
// STATE B — Location Detail Panel
// ============================================

export const detailStyles = StyleSheet.create({
  // Header section
  headerSection: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  nameText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  editButton: {
    padding: spacing.sm,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingLeft: 18, // Align with name (dot 10px + margin 8px)
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  // Empty state (adding mode, no name entered yet)
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.xs,
  },

  // Toggle section
  toggleSection: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  toggleSubtitleOff: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  toggleSubtitleOn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successTeal,
  },
  statusText: {
    fontSize: 13,
    color: colors.successTeal,
  },

  // Marketing balloon (toggle OFF)
  balloon: {
    backgroundColor: colors.amberSoftWarm,
    borderRadius: borderRadius.sm,
    padding: 14,
    marginTop: 14,
  },
  balloonArrow: {
    position: 'absolute',
    top: -8,
    right: 60,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.amberSoftWarm,
  },
  balloonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryStrong,
    marginBottom: spacing.sm,
  },
  balloonBody: {
    fontSize: 14,
    color: colors.primaryStrong,
    lineHeight: 20,
  },

  // Detection zone slider card (toggle ON)
  sliderCard: {
    backgroundColor: colors.backgroundWarm,
    borderRadius: borderRadius.sm,
    padding: 14,
    marginTop: 14,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  sliderLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sliderValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  sliderUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginLeft: 1,
  },
  sliderTrack: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  sliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderRangeText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  sliderHelper: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Permission warning
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: withOpacity(colors.amber, 0.08),
    marginTop: spacing.md,
  },
  warningText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  warningLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.amber,
  },

  // Delete section
  deleteSection: {
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  deleteButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteIcon: {
    // placeholder for icon sizing
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.error,
  },
});

// ============================================
// STATE A — Adding Mode
// Uses same visual language as State B (detailStyles)
// ============================================

export const addingStyles = StyleSheet.create({
  // Wraps all adding content — same horizontal padding as detailStyles sections
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // Radius section — inside a card like detailStyles.sliderCard
  radiusCard: {
    backgroundColor: colors.backgroundWarm,
    borderRadius: borderRadius.sm,
    padding: 14,
    marginTop: 14,
  },
  radiusLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
  },

  // Add button — same margin pattern as detailStyles.deleteSection
  addButtonWrap: {
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
    paddingHorizontal: spacing.xl,
    paddingTop: 14,
    paddingBottom: spacing.lg,
  },
});
