/**
 * OnSite Club - Paleta de Cores (Dark Mode - PROFESSIONAL)
 * 
 * Paleta fria e profissional:
 * - Neutros azulados/acinzentados
 * - Amarelo OnSite apenas em CTAs
 * - Cores de estado discretas (sem carnaval)
 */

export const colors = {
  // ============================================
  // CORES PRIMÁRIAS (Brand)
  // ============================================
  primary: '#F5B700',        // OnSite Yellow - cor principal
  primaryPressed: '#DFA600', // Yellow pressionado
  primarySoft: 'rgba(245, 183, 0, 0.12)', // Fundo suave amarelo
  primaryLight: '#F5B700',   // Alias
  primaryDark: '#DFA600',    // Alias
  
  // ============================================
  // NEUTROS (Base - tons frios)
  // ============================================
  black: '#000000',
  white: '#FFFFFF',
  graphite: '#12161C',       // Surface 1
  steel: '#171C23',          // Surface 2
  
  // ============================================
  // BACKGROUNDS
  // ============================================
  background: '#0B0D10',           // BG principal (preto azulado)
  backgroundSecondary: '#12161C',  // Surface 1 - cards
  backgroundTertiary: '#171C23',   // Surface 2 - cards elevados
  backgroundElevated: '#1D232B',   // Elementos mais elevados
  
  // ============================================
  // TEXTOS
  // ============================================
  text: '#E8EDF2',           // Alto contraste
  textSecondary: '#9AA6B2',  // Muted
  textTertiary: '#6B7785',   // Subtle
  textMuted: '#4A5568',      // Muito sutil
  
  // ============================================
  // BORDAS
  // ============================================
  border: '#242B35',         // Dividers
  borderLight: '#1A2029',    // Bordas sutis
  borderFocus: '#F5B700',    // Foco (yellow)
  
  // ============================================
  // ESTADOS (discretos, sem carnaval)
  // ============================================
  success: '#22C55E',        // Verde (usar pouco)
  successDark: '#16A34A',
  warning: '#F5B700',        // Usa o amarelo da marca
  warningDark: '#DFA600',
  error: '#EF4444',          // Danger/Stop
  errorDark: '#DC2626',      // Danger pressed
  errorLight: 'rgba(239, 68, 68, 0.12)',
  info: '#3B82F6',           // Azul (raro, links)
  infoDark: '#2563EB',
  
  // ============================================
  // COMPONENTES ESPECÍFICOS
  // ============================================
  
  // Timer
  timerActive: '#F5B700',
  timerIdle: '#6B7785',
  timerBackground: '#12161C',
  
  // Cards
  card: '#12161C',
  cardBorder: '#242B35',
  cardPressed: '#171C23',
  
  // Tab Bar
  tabBar: '#0B0D10',
  tabBarBorder: '#1A2029',
  tabActive: '#F5B700',
  tabInactive: '#6B7785',
  
  // Header
  header: '#0B0D10',
  headerText: '#E8EDF2',
  
  // Inputs
  input: '#12161C',
  inputBorder: '#242B35',
  inputPlaceholder: '#6B7785',
  
  // Buttons
  buttonPrimary: '#F5B700',
  buttonPrimaryText: '#0B0D10',    // Texto escuro no botão amarelo
  buttonSecondary: '#171C23',
  buttonSecondaryText: '#E8EDF2',
  buttonDisabled: '#1D232B',
  buttonDisabledText: '#4A5568',
  
  // Danger button (Stop)
  buttonDanger: '#EF4444',
  buttonDangerPressed: '#DC2626',
  buttonDangerText: '#FFFFFF',
  
  // Map
  mapCircle: 'rgba(245, 183, 0, 0.2)',
  mapCircleBorder: '#F5B700',
  
  // Badges
  badgeSuccess: '#22C55E',
  badgeWarning: '#F5B700',
  badgeError: '#EF4444',
  badgeInfo: '#3B82F6',
  
  // Overlay
  overlay: 'rgba(11, 13, 16, 0.8)',
  overlayLight: 'rgba(11, 13, 16, 0.6)',
};

/**
 * Helper para criar cor com opacidade
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
 * Cores para locais (círculos no mapa)
 */
export const localColors = [
  '#F5B700',  // Yellow (principal)
  '#3B82F6',  // Blue
  '#22C55E',  // Green
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
 * Espaçamentos padrão
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
 * Border radius padrão
 */
export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

/**
 * Sombras
 */
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
};
