/**
 * OnSite Club - Paleta de Cores (Dark Mode)
 * 
 * Baseado no brand guide:
 * - OnSite Amber (Hero): #F7B324
 * - OnSite Black: #0D0D0D (mais escuro para dark mode)
 * - Graphite: #1C1C1E (cards)
 * - Steel Grey: #2C2C2E (elementos secundários)
 */

export const colors = {
  // ============================================
  // CORES PRIMÁRIAS (Brand)
  // ============================================
  primary: '#F7B324',        // OnSite Amber - cor principal/destaque
  primaryLight: '#FFC94D',   // Amber mais claro
  primaryDark: '#D99B1A',    // Amber mais escuro
  
  // ============================================
  // NEUTROS (Dark Mode)
  // ============================================
  black: '#000000',          // Preto puro
  white: '#FFFFFF',          // Branco
  graphite: '#1C1C1E',       // Cards, elementos elevados
  steel: '#2C2C2E',          // Elementos secundários
  
  // ============================================
  // BACKGROUNDS (Dark Mode)
  // ============================================
  background: '#0D0D0D',           // Fundo principal (quase preto)
  backgroundSecondary: '#1C1C1E',  // Fundo de cards
  backgroundTertiary: '#2C2C2E',   // Fundo de inputs, elevações
  backgroundElevated: '#3A3A3C',   // Elementos mais elevados
  
  // ============================================
  // TEXTOS (Dark Mode)
  // ============================================
  text: '#FFFFFF',           // Texto principal (branco)
  textSecondary: '#EBEBF5',  // Texto secundário (branco suave)
  textTertiary: '#8E8E93',   // Texto terciário (cinza)
  textMuted: '#636366',      // Texto mudo/desabilitado
  
  // ============================================
  // BORDAS (Dark Mode)
  // ============================================
  border: '#3A3A3C',         // Bordas padrão
  borderLight: '#2C2C2E',    // Bordas sutis
  borderFocus: '#F7B324',    // Borda de foco (amber)
  
  // ============================================
  // STATUS
  // ============================================
  success: '#30D158',        // Verde iOS
  successDark: '#248A3D',    // Verde escuro
  warning: '#FF9F0A',        // Laranja iOS
  warningDark: '#FF9500',    // Laranja escuro
  error: '#FF453A',          // Vermelho iOS
  errorDark: '#D70015',      // Vermelho escuro
  errorLight: 'rgba(255, 69, 58, 0.15)',
  info: '#0A84FF',           // Azul iOS
  infoDark: '#0071E3',       // Azul escuro
  
  // ============================================
  // COMPONENTES ESPECÍFICOS
  // ============================================
  timerActive: '#F7B324',    // Timer ativo (amber)
  timerIdle: '#8E8E93',      // Timer inativo (cinza)
  timerBackground: '#1C1C1E', // Fundo do timer
  
  // Cards
  card: '#1C1C1E',           // Fundo de cards
  cardBorder: '#3A3A3C',     // Borda de cards
  cardPressed: '#2C2C2E',    // Card pressionado
  
  // Tab Bar
  tabBar: '#1C1C1E',         // Fundo da tab bar
  tabBarBorder: '#3A3A3C',   // Borda superior
  tabActive: '#F7B324',      // Ícone/texto ativo (amber)
  tabInactive: '#8E8E93',    // Ícone/texto inativo (cinza)
  
  // Header
  header: '#0D0D0D',         // Fundo do header
  headerText: '#FFFFFF',     // Texto do header
  
  // Inputs
  input: '#1C1C1E',          // Fundo de inputs
  inputBorder: '#3A3A3C',    // Borda de inputs
  inputPlaceholder: '#636366', // Placeholder
  
  // Buttons
  buttonPrimary: '#F7B324',  // Botão primário (amber)
  buttonPrimaryText: '#000000', // Texto do botão primário (preto)
  buttonSecondary: '#2C2C2E', // Botão secundário
  buttonSecondaryText: '#FFFFFF', // Texto do botão secundário
  buttonDisabled: '#3A3A3C', // Botão desabilitado
  buttonDisabledText: '#636366', // Texto desabilitado
  
  // Map
  mapCircle: 'rgba(247, 179, 36, 0.3)',  // Círculo no mapa (amber transparente)
  mapCircleBorder: '#F7B324', // Borda do círculo
  
  // Badges
  badgeSuccess: '#30D158',   // Badge verde
  badgeWarning: '#FF9F0A',   // Badge laranja
  badgeError: '#FF453A',     // Badge vermelho
  badgeInfo: '#0A84FF',      // Badge azul
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)', // Overlay escuro
  overlayLight: 'rgba(0, 0, 0, 0.5)', // Overlay mais claro
};

/**
 * Helper para criar cor com opacidade
 */
export function withOpacity(color: string, opacity: number): string {
  // Se já é rgba, extrai e recalcula
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  
  // Converte hex para rgba
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
  '#F7B324',  // Amber (principal)
  '#30D158',  // Verde
  '#0A84FF',  // Azul
  '#BF5AF2',  // Roxo
  '#FF9F0A',  // Laranja
  '#64D2FF',  // Ciano
  '#FF375F',  // Rosa
  '#32D74B',  // Verde claro
];

export function getLocalColor(index: number): string {
  return localColors[index % localColors.length];
}

/**
 * Retorna uma cor aleatória para geofence
 */
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
 * Sombras (para dark mode, sombras são mais sutis)
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
