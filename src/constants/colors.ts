/**
 * OnSite Club - Color Tokens (Enterprise Theme v3.0)
 *
 * Design direction: Professional, enterprise-grade, modern
 * Principles: Clean neutrals, utility green, muted amber accents
 *
 * Ratio: 85-90% neutrals / 8-12% green / 2-5% amber
 *
 * Timer states: idle = neutral, running = green, paused = amber
 * Tab bar: active = amber, inactive = iconMuted
 * Primary buttons = green filled, secondary = neutral outline
 */

export const colors = {
  // ============================================
  // NEUTRALS (Structure - 85-90%)
  // ============================================

  // Backgrounds
  background: '#F6F7F9',           // App canvas (bg)
  backgroundSecondary: '#FFFFFF',  // Cards, modals (surface)
  backgroundTertiary: '#F2F4F7',   // Inputs, muted sections (surface2)
  backgroundElevated: '#FFFFFF',   // Elevated elements

  // Surfaces
  surface: '#FFFFFF',              // Card background
  surface2: '#F2F4F7',             // Secondary surface
  surfaceMuted: '#F6F7F9',         // Input fields, placeholders

  // Text
  text: '#101828',                 // Primary text (near black)
  textSecondary: '#667085',        // Labels, descriptions
  textTertiary: '#667085',         // Subtle text (alias)
  textMuted: '#667085',            // Muted text

  // Icons
  iconMuted: '#98A2B3',            // Inactive icons, placeholders

  // Borders
  border: '#E3E7EE',               // Dividers, card borders
  borderLight: '#F2F4F7',          // Subtle borders
  borderFocus: '#0F766E',          // Focus state (green for inputs)

  // Base colors
  black: '#101828',                // For text
  white: '#FFFFFF',

  // ============================================
  // BRAND ACCENT - MUTED AMBER (2-5%)
  // ============================================

  // Amber (use sparingly - tab active, paused state, warnings)
  primary: '#C58B1B',              // Muted amber
  primaryStrong: '#A67516',        // Darker amber
  primaryPressed: '#8F6513',       // Pressed state
  primarySoft: '#FFF3D6',          // Soft amber background (amberSoft)
  primaryLight: '#FFF3D6',         // Light amber tint
  primaryLine: '#F2D28B',          // Amber line/border (amberLine)
  primaryDark: '#A67516',          // Alias

  // Amber semantic aliases
  amber: '#C58B1B',
  amberSoft: '#FFF3D6',
  amberLine: '#F2D28B',

  // ============================================
  // UTILITY GREEN (8-12%)
  // ============================================

  // Green (primary actions, active states, success)
  accent: '#0F766E',               // Deep teal/green - ACTIVE state
  accentLight: '#14B8A6',          // Lighter green
  accentSoft: '#D1FAE5',           // Soft green background (greenSoft)

  // Green semantic aliases
  green: '#0F766E',
  greenSoft: '#D1FAE5',

  // ============================================
  // FEEDBACK / STATES
  // ============================================
  success: '#0F766E',              // Green for success
  successLight: '#14B8A6',
  successSoft: '#D1FAE5',

  warning: '#C58B1B',              // Amber for warnings
  warningDark: '#A67516',
  warningSoft: '#FFF3D6',

  error: '#DC2626',                // Danger (red-600)
  errorLight: '#EF4444',
  errorSoft: 'rgba(220, 38, 38, 0.12)',

  info: '#3B82F6',                 // Blue (rare, links)
  infoDark: '#2563EB',

  // ============================================
  // TIMER STATES
  // ============================================

  // Timer (idle = neutral, running = green, paused = amber)
  timerIdle: '#98A2B3',            // Neutral gray (iconMuted)
  timerActive: '#0F766E',          // Green for running
  timerPaused: '#C58B1B',          // Amber for paused
  timerBackground: '#FFFFFF',
  timerRing: 'rgba(15, 118, 110, 0.15)',  // Green ring (subtle)
  timerRingTrack: '#E3E7EE',       // Neutral gray track

  // ============================================
  // COMPONENT-SPECIFIC
  // ============================================

  // Cards
  card: '#FFFFFF',
  cardBorder: '#E3E7EE',
  cardPressed: '#F6F7F9',
  cardAccent: '#0F766E',           // Left accent bar (green)

  // Tab Bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E3E7EE',
  tabActive: '#C58B1B',            // Amber for active tab
  tabInactive: '#98A2B3',          // iconMuted for inactive

  // Header
  header: '#F6F7F9',
  headerText: '#101828',

  // Inputs
  input: '#F2F4F7',                // surface2
  inputBorder: '#E3E7EE',
  inputPlaceholder: '#98A2B3',     // iconMuted
  inputFocus: '#0F766E',           // Green focus ring

  // Buttons (primary = green, secondary = neutral outline)
  buttonPrimary: '#0F766E',        // Green filled
  buttonPrimaryText: '#FFFFFF',    // White text
  buttonSecondary: '#FFFFFF',      // Neutral surface
  buttonSecondaryBorder: '#E3E7EE', // Border
  buttonSecondaryText: '#101828',  // Dark text
  buttonDisabled: '#F2F4F7',       // surface2
  buttonDisabledText: '#98A2B3',   // iconMuted

  // Danger button
  buttonDanger: '#DC2626',
  buttonDangerPressed: '#B91C1C',
  buttonDangerText: '#FFFFFF',

  // Map
  mapCircle: 'rgba(15, 118, 110, 0.2)',
  mapCircleBorder: '#0F766E',

  // Badges
  badgeActive: '#0F766E',          // Green for ACTIVE
  badgeActiveText: '#FFFFFF',
  badgeSuccess: '#0F766E',
  badgeWarning: '#C58B1B',
  badgeError: '#DC2626',
  badgeInfo: '#3B82F6',

  // Overlay
  overlay: 'rgba(16, 24, 40, 0.6)',      // Near black with opacity
  overlayLight: 'rgba(16, 24, 40, 0.4)',

  // Graph styles
  graphite: '#F6F7F9',             // Background for graphs
  steel: '#E3E7EE',                // Grid lines
  graphBar: '#0F766E',             // Bar chart color (green)
};

/**
 * Helper to create color with opacity
 */
export function withOpacity(color: string, opacity: number): string {
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Location colors (for map circles)
 */
export const localColors = [
  '#F6C343',  // Yellow (primary)
  '#3B82F6',  // Blue
  '#16A34A',  // Green
  '#8B5CF6',  // Purple
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#F97316',  // Orange
  '#14B8A6',  // Teal
];

export function getLocalColor(index: number): string {
  return localColors[index % localColors.length];
}

export function getRandomGeofenceColor(): string {
  const randomIndex = Math.floor(Math.random() * localColors.length);
  return localColors[randomIndex];
}

/**
 * Spacing tokens
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Border radius tokens
 */
export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

/**
 * Shadow tokens (soft elevation - neutral)
 */
export const shadows = {
  sm: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  },
};

/**
 * Typography (reference values)
 */
export const typography = {
  // Screen title
  screenTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    lineHeight: 34,
  },
  // Card title
  cardTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  // Timer
  timer: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: 0.5,
  },
  // Labels
  label: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  // Meta/Small
  meta: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
};
