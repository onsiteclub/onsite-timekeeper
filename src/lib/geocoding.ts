/**
 * Geocoding Service - OnSite Timekeeper
 * 
 * Usa Nominatim (OpenStreetMap) para:
 * - Buscar endereços → coordenadas (forward geocoding)
 * - Coordenadas → endereço (reverse geocoding)
 * 
 * 100% gratuito, sem API key necessária
 */

import { logger } from './logger';

// URL base do Nominatim
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// User-Agent obrigatório (política do Nominatim)
const USER_AGENT = 'OnSiteTimekeeper/1.0';

// ============================================
// TIPOS
// ============================================

export interface ResultadoGeocodificacao {
  latitude: number;
  longitude: number;
  endereco: string;
  cidade?: string;
  estado?: string;
  pais?: string;
}

// ============================================
// FORWARD GEOCODING (Endereço → Coordenadas)
// ============================================

/**
 * Busca endereços e retorna coordenadas
 * @param query - Texto de busca (endereço, local, etc.)
 * @param limite - Número máximo de resultados (default: 5)
 */
export async function buscarEndereco(
  query: string,
  limite: number = 5
): Promise<ResultadoGeocodificacao[]> {
  try {
    if (!query || query.length < 3) {
      return [];
    }

    logger.debug('gps', `🔍 Buscando endereço: "${query}"`);

    const response = await fetch(
      `${NOMINATIM_URL}/search?` +
        new URLSearchParams({
          q: query,
          format: 'json',
          limit: String(limite),
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

    const resultados: ResultadoGeocodificacao[] = data.map((item: any) => ({
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      endereco: item.display_name,
      cidade: item.address?.city || item.address?.town || item.address?.village,
      estado: item.address?.state,
      pais: item.address?.country,
    }));

    logger.info('gps', `✅ ${resultados.length} resultado(s) encontrado(s)`);
    return resultados;
  } catch (error) {
    logger.error('gps', 'Erro ao buscar endereço', { error: String(error) });
    return [];
  }
}

// ============================================
// REVERSE GEOCODING (Coordenadas → Endereço)
// ============================================

/**
 * Obtém endereço a partir de coordenadas
 * @param latitude - Latitude do ponto
 * @param longitude - Longitude do ponto
 */
export async function obterEndereco(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    logger.debug('gps', `🔍 Reverse geocoding: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

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
      logger.debug('gps', `✅ Endereço encontrado: ${endereco.substring(0, 50)}...`);
    }

    return endereco;
  } catch (error) {
    logger.error('gps', 'Erro no reverse geocoding', { error: String(error) });
    return null;
  }
}

/**
 * Obtém detalhes do endereço a partir de coordenadas
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
    logger.error('gps', 'Erro ao obter detalhes do endereço', { error: String(error) });
    return null;
  }
}

/**
 * Formata endereço para exibição curta
 * Ex: "Rua das Flores, 123 - Centro, São Paulo"
 */
export function formatarEnderecoResumido(endereco: string): string {
  if (!endereco) return '';

  // Pega apenas os primeiros 2-3 componentes
  const partes = endereco.split(', ');
  if (partes.length <= 3) return endereco;

  return partes.slice(0, 3).join(', ');
}
