/**
 * Geocoding Service - OnSite Timekeeper
 * 
 * Uses Nominatim (OpenStreetMap) for:
 * - Search addresses → coordinates (forward geocoding)
 * - Coordinates → address (reverse geocoding)
 * 
 * MODIFIED:
 * - Adds location bias (prioritizes results near GPS)
 * - Search with viewbox to limit geographic area
 * - Fixed: NodeJS.Timeout → ReturnType<typeof setTimeout>
 * 
 * 100% free, no API key needed
 */

import { logger } from './logger';

// Base URL for Nominatim
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Required User-Agent (Nominatim policy)
const USER_AGENT = 'OnSiteTimekeeper/1.0';

// Default radius for location bias (in degrees, ~100km)
const DEFAULT_BIAS_RADIUS = 1.0;

// ============================================
// TYPES
// ============================================

export interface ResultadoGeocodificacao {
  latitude: number;
  longitude: number;
  endereco: string;
  cidade?: string;
  estado?: string;
  pais?: string;
}

export interface BuscaOptions {
  limite?: number;
  // Location bias - prioritizes results near these coordinates
  biasLatitude?: number;
  biasLongitude?: number;
  // Bias radius in degrees (default ~100km)
  biasRadius?: number;
}

// ============================================
// FORWARD GEOCODING (Address → Coordinates)
// ============================================

/**
 * Search addresses and return coordinates
 * @param query - Search text (address, place, etc.)
 * @param options - Search options (limit, location bias)
 */
export async function buscarEndereco(
  query: string,
  options: BuscaOptions | number = 5
): Promise<ResultadoGeocodificacao[]> {
  try {
    // Compatibility: if number is passed, it's the limit
    const opts: BuscaOptions = typeof options === 'number' 
      ? { limite: options } 
      : options;
    
    const limite = opts.limite ?? 5;

    if (!query || query.length < 3) {
      return [];
    }

    logger.debug('gps', `🔍 Searching address: "${query}"`, {
      bias: opts.biasLatitude ? `${opts.biasLatitude.toFixed(4)},${opts.biasLongitude?.toFixed(4)}` : 'none'
    });

    // Base parameters
    const params: Record<string, string> = {
      q: query,
      format: 'json',
      limit: String(limite),
      addressdetails: '1',
    };

    // If location bias exists, add viewbox to prioritize area
    if (opts.biasLatitude !== undefined && opts.biasLongitude !== undefined) {
      const radius = opts.biasRadius ?? DEFAULT_BIAS_RADIUS;
      
      // Viewbox: left,top,right,bottom (minLon,maxLat,maxLon,minLat)
      const minLon = opts.biasLongitude - radius;
      const maxLon = opts.biasLongitude + radius;
      const minLat = opts.biasLatitude - radius;
      const maxLat = opts.biasLatitude + radius;
      
      params.viewbox = `${minLon},${maxLat},${maxLon},${minLat}`;
      params.bounded = '0'; // Don't strictly limit, just prioritize
    }

    const response = await fetch(
      `${NOMINATIM_URL}/search?` + new URLSearchParams(params),
      {
        headers: {
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    let resultados: ResultadoGeocodificacao[] = data.map((item: any) => ({
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      endereco: item.display_name,
      cidade: item.address?.city || item.address?.town || item.address?.village,
      estado: item.address?.state,
      pais: item.address?.country,
    }));

    // If bias exists, sort by distance from reference point
    if (opts.biasLatitude !== undefined && opts.biasLongitude !== undefined) {
      resultados = resultados.sort((a, b) => {
        const distA = calcularDistanciaSimples(
          opts.biasLatitude!, opts.biasLongitude!,
          a.latitude, a.longitude
        );
        const distB = calcularDistanciaSimples(
          opts.biasLatitude!, opts.biasLongitude!,
          b.latitude, b.longitude
        );
        return distA - distB;
      });
    }

    logger.info('gps', `✅ ${resultados.length} result(s) found`);
    return resultados;
  } catch (error) {
    logger.error('gps', 'Error searching address', { error: String(error) });
    return [];
  }
}

/**
 * Search addresses with autocomplete (for use with debounce)
 * Returns results faster, prioritizing local area
 */
export async function buscarEnderecoAutocomplete(
  query: string,
  biasLatitude?: number,
  biasLongitude?: number
): Promise<ResultadoGeocodificacao[]> {
  return buscarEndereco(query, {
    limite: 5,
    biasLatitude,
    biasLongitude,
    biasRadius: 0.5, // ~50km for autocomplete (more restricted)
  });
}

// ============================================
// REVERSE GEOCODING (Coordinates → Address)
// ============================================

/**
 * Get address from coordinates
 * @param latitude - Point latitude
 * @param longitude - Point longitude
 */
export async function obterEndereco(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    logger.debug('gps', `📍 Reverse geocoding: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

    const response = await fetch(
      `${NOMINATIM_URL}/reverse?` +
        new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
          format: 'json',
        }),
      {
        headers: {
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const endereco = data.display_name || null;

    if (endereco) {
      logger.debug('gps', `✅ Address found: ${endereco.substring(0, 50)}...`);
    }

    return endereco;
  } catch (error) {
    logger.error('gps', 'Reverse geocoding error', { error: String(error) });
    return null;
  }
}

/**
 * Get address details from coordinates
 */
export async function obterDetalhesEndereco(
  latitude: number,
  longitude: number
): Promise<ResultadoGeocodificacao | null> {
  try {
    const response = await fetch(
      `${NOMINATIM_URL}/reverse?` +
        new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
          format: 'json',
          addressdetails: '1',
        }),
      {
        headers: {
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.lat || !data.lon) {
      return null;
    }

    return {
      latitude: parseFloat(data.lat),
      longitude: parseFloat(data.lon),
      endereco: data.display_name,
      cidade: data.address?.city || data.address?.town || data.address?.village,
      estado: data.address?.state,
      pais: data.address?.country,
    };
  } catch (error) {
    logger.error('gps', 'Error getting address details', { error: String(error) });
    return null;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Calculate simple distance between two points (fast approximation)
 * Uses Euclidean formula for sorting - doesn't need to be exact
 */
function calcularDistanciaSimples(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Format address for short display
 * Ex: "123 Main St - Downtown, Toronto"
 */
export function formatarEnderecoResumido(endereco: string): string {
  if (!endereco) return '';

  // Get only the first 2-3 components
  const partes = endereco.split(', ');
  if (partes.length <= 3) return endereco;

  return partes.slice(0, 3).join(', ');
}

/**
 * Create debounce function for autocomplete
 * 
 * FIX: Uses portable ReturnType<typeof setTimeout> instead of NodeJS.Timeout
 */
export function criarDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
