/**
 * Geocoding Service - OnSite Timekeeper
 *
 * Uses Photon (photon.komoot.io) for:
 * - Search addresses AND places/POIs → coordinates (forward geocoding)
 * - Supports businesses, landmarks, schools, restaurants, etc.
 * - Location bias via lat/lon (prioritizes nearby results)
 *
 * Photon is powered by OpenStreetMap + Elasticsearch
 * 100% free, no API key needed
 */

import { logger } from './logger';

// Base URL for Photon geocoder (komoot public instance)
const PHOTON_URL = 'https://photon.komoot.io/api/';

// Required User-Agent
const USER_AGENT = 'OnSiteTimekeeper/1.0';

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
  distancia?: number; // Distance from bias point in km
}

// ============================================
// HAVERSINE DISTANCE
// ============================================

function calcularDistanciaKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================
// FORWARD GEOCODING (Address/Place → Coordinates)
// ============================================

async function searchPhoton(
  query: string,
  options: { limit: number; lat?: number; lon?: number }
): Promise<ResultadoGeocodificacao[]> {
  const params: Record<string, string> = {
    q: query,
    limit: String(options.limit),
  };

  // Location bias — Photon natively prioritizes results near this point
  if (options.lat !== undefined && options.lon !== undefined) {
    params.lat = String(options.lat);
    params.lon = String(options.lon);
    params.location_bias_scale = '0.6'; // Strong bias toward user location
  }

  const response = await fetch(
    `${PHOTON_URL}?${new URLSearchParams(params)}`,
    { headers: { 'User-Agent': USER_AGENT } }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  return (data.features || []).map((feature: any) => {
    const props = feature.properties || {};
    const [lon, lat] = feature.geometry.coordinates;

    // Build human-readable address from structured fields
    const parts: string[] = [];
    if (props.name) parts.push(props.name);
    const streetPart = [props.housenumber, props.street].filter(Boolean).join(' ');
    if (streetPart) parts.push(streetPart);
    const city = props.city || props.town || props.village;
    if (city) parts.push(city);
    const endereco = parts.join(', ') || props.name || query;

    return {
      latitude: lat,
      longitude: lon,
      endereco,
      cidade: city,
      estado: props.state,
      pais: props.country,
    };
  });
}

/**
 * Search addresses and places with location bias (internal)
 */
async function buscarEndereco(
  query: string,
  options: {
    limite?: number;
    biasLatitude?: number;
    biasLongitude?: number;
  } = {}
): Promise<ResultadoGeocodificacao[]> {
  try {
    const limite = options.limite ?? 5;

    if (!query || query.length < 2) {
      return [];
    }

    const hasLocation = options.biasLatitude !== undefined && options.biasLongitude !== undefined;

    logger.debug('gps', `Searching: "${query}"`, {
      bias: hasLocation ? `${options.biasLatitude!.toFixed(4)},${options.biasLongitude!.toFixed(4)}` : 'none',
    });

    // Single call — Photon handles bias natively via lat/lon
    let resultados = await searchPhoton(query, {
      limit: limite,
      lat: options.biasLatitude,
      lon: options.biasLongitude,
    });

    // Calculate distance from user for display and sorting
    if (hasLocation) {
      resultados = resultados.map(r => ({
        ...r,
        distancia: calcularDistanciaKm(options.biasLatitude!, options.biasLongitude!, r.latitude, r.longitude),
      }));

      resultados.sort((a, b) => (a.distancia ?? Infinity) - (b.distancia ?? Infinity));
    }

    const closestDist = resultados[0]?.distancia;
    logger.info('gps', `${resultados.length} result(s)`, {
      closest: closestDist ? `${closestDist.toFixed(1)}km` : 'n/a',
    });

    return resultados;
  } catch (error) {
    logger.error('gps', 'Error searching address', { error: String(error) });
    return [];
  }
}

/**
 * Search addresses and places with autocomplete (for use with debounce)
 * Searches POIs, businesses, landmarks, AND street addresses
 */
export async function buscarEnderecoAutocomplete(
  query: string,
  biasLatitude?: number,
  biasLongitude?: number
): Promise<ResultadoGeocodificacao[]> {
  return buscarEndereco(query, {
    limite: 6,
    biasLatitude,
    biasLongitude,
  });
}

// ============================================
// HELPERS
// ============================================

/**
 * Format address for short display
 * Ex: "McDonald's, 670 Bronson Ave, Ottawa"
 */
export function formatarEnderecoResumido(endereco: string): string {
  if (!endereco) return '';

  const partes = endereco.split(', ');
  if (partes.length <= 3) return endereco;

  return partes.slice(0, 3).join(', ');
}
