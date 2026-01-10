/**
 * OnSite Club - Color Tokens (Light Minimal Theme)
 * 
 * Design direction: Light minimal / neutral-first / card-based dashboard
 * Principles: soft elevation, thin borders, subtle accent, high whitespace
 * 
 * Ratio: 90% neutrals / 9% slate-forest / 1% yellow
 */

export const colors = {
  // ============================================
  // NEUTRALS (Structure - 90%)
  // ============================================
  
  // Backgrounds
  background: '#F8FAFC',           // App canvas (slate-50)
  backgroundSecondary: '#FFFFFF',  // Cards, modals, elevated surfaces
  backgroundTertiary: '#F1F5F9',   // Inputs, muted sections (slate-100)
  backgroundElevated: '#FFFFFF',   // Elevated elements
  
  // Surfaces
  surface: '#FFFFFF',              // Card background
  surfaceMuted: '#F1F5F9',         // Input fields, placeholders
  
  // Text
  text: '#0F172A',                 // Primary text (slate-900)
  textSecondary: '#475569',        // Labels, descriptions (slate-600)
  textTertiary: '#64748B',         // Subtle text (slate-500)
  textMuted: '#94A3B8',            // Very subtle (slate-400)
  
  // Borders
  border: '#E2E8F0',               // Dividers, card borders (slate-200)
  borderLight: '#F1F5F9',          // Subtle borders
  borderFocus: '#F6C343',          // Focus state (yellow)
  
  // Base colors
  black: '#0F172A',                // For text on yellow buttons
  white: '#FFFFFF',
  
  // ============================================
  // ACCENT COLORS (Brand - 9% + 1%)
  // ============================================
  
  // Yellow (use sparingly - 1%)
  primary: '#F6C343',              // Accent yellow subtle
  primaryStrong: '#F2B705',        // CTA, important actions (rare)
  primaryPressed: '#E5A600',       // Pressed state
  primarySoft: 'rgba(246, 195, 67, 0.12)',  // Subtle background
  primaryLight: '#F6C343',         // Alias
  primaryDark: '#E5A600',          // Alias
  
  // Slate/Forest (state indicator - 9%)
  accent: '#0F3D3E',               // ACTIVE badge, state icons
  accentLight: '#1A5456',          // Hover state
  
  // ============================================
  // FEEDBACK / STATES
  // ============================================
  success: '#16A34A',              // Green (green-600)
  successLight: '#22C55E',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  
  warning: '#F6C343',              // Uses brand yellow
  warningDark: '#E5A600',
  
  error: '#DC2626',                // Danger (red-600)
  errorLight: '#EF4444',
  errorSoft: 'rgba(220, 38, 38, 0.12)',
  
  info: '#3B82F6',                 // Blue (rare, links)
  infoDark: '#2563EB',
  
  // ============================================
  // COMPONENT-SPECIFIC
  // ============================================
  
  // Timer
  timerActive: '#0F3D3E',          // Forest for active state
  timerIdle: '#94A3B8',            // Muted gray
  timerBackground: '#FFFFFF',
  timerRing: 'rgba(246, 195, 67, 0.15)',  // Yellow ring (subtle)
  timerRingTrack: '#E2E8F0',       // Ring background
  
  // Cards
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  cardPressed: '#F8FAFC',
  cardAccent: '#F6C343',           // Left accent bar
  
  // Tab Bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: '#0F3D3E',            // Forest for active
  tabInactive: '#94A3B8',
  
  // Header
  header: '#F8FAFC',
  headerText: '#0F172A',
  
  // Inputs
  input: '#F1F5F9',
  inputBorder: '#E2E8F0',
  inputPlaceholder: '#94A3B8',
  inputFocus: '#F6C343',
  
  // Buttons
  buttonPrimary: '#F6C343',
  buttonPrimaryText: '#0F172A',    // Dark text on yellow
  buttonSecondary: '#F1F5F9',
  buttonSecondaryText: '#0F172A',
  buttonDisabled: '#E2E8F0',
  buttonDisabledText: '#94A3B8',
  
  // Danger button
  buttonDanger: '#DC2626',
  buttonDangerPressed: '#B91C1C',
  buttonDangerText: '#FFFFFF',
  
  // Map (keep similar for visibility)
  mapCircle: 'rgba(246, 195, 67, 0.2)',
  mapCircleBorder: '#F6C343',
  
  // Badges
  badgeActive: '#0F3D3E',          // Forest green for ACTIVE
  badgeActiveText: '#FFFFFF',
  badgeSuccess: '#16A34A',
  badgeWarning: '#F6C343',
  badgeError: '#DC2626',
  badgeInfo: '#3B82F6',
  
  // Overlay
  overlay: 'rgba(15, 23, 42, 0.6)',      // slate-900 with opacity
  overlayLight: 'rgba(15, 23, 42, 0.4)',
  
  // Graph styles
  graphite: '#F1F5F9',             // Background for graphs
  steel: '#E2E8F0',                // Grid lines
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
 * Shadow tokens (soft elevation - yellow tinted)
 */
export const shadows = {
  sm: {
    shadowColor: '#F6C343',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#F6C343',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#F6C343',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
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
