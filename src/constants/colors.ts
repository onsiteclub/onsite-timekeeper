/**
 * Paleta de cores do OnSite Timekeeper
 * Baseado em Tailwind CSS blue-500 como cor primária
 */

export const colors = {
  // Primárias
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  
  // Status
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F3F4F6',
  backgroundTertiary: '#E5E7EB',
  
  // Textos
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',
  
  // Bordas
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',
  
  // Geofence cores (para locais de trabalho)
  geofenceColors: [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#F97316', // orange
  ],
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Transparências
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Retorna uma cor aleatória para geofence
 */
export function getRandomGeofenceColor(): string {
  const index = Math.floor(Math.random() * colors.geofenceColors.length);
  return colors.geofenceColors[index];
}

/**
 * Retorna cor com opacidade (para círculos de geofence)
 */
export function withOpacity(hexColor: string, opacity: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
