/**
 * SearchBox Component - OnSite Timekeeper
 *
 * v2: Dual-mode — displays current address by default,
 * tap magnifying glass to switch to search mode.
 * Translucent background over the map.
 */

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Text,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import {
  buscarEnderecoAutocomplete,
  formatarEnderecoResumido,
} from '../../lib/geocoding';
import { AUTOCOMPLETE_DELAY, type SearchResult } from './constants';
import { logger } from '../../lib/logger';

// ============================================
// TYPES
// ============================================

interface SearchBoxProps {
  /** Reverse-geocoded address from hooks (display mode) */
  address: string;
  /** Whether reverse geocoding is in progress */
  isGeocoding: boolean;
  /** Coordinates to show as fallback when no address */
  latitude?: number;
  longitude?: number;
  /** User's current GPS for distance calc in search results */
  currentLatitude?: number;
  currentLongitude?: number;
  onSelectResult: (result: SearchResult) => void;
}

// ============================================
// HELPERS
// ============================================

function formatDistance(distancia?: number): string {
  if (distancia === undefined) return '';
  if (distancia < 1) {
    return `${Math.round(distancia * 1000)}m`;
  }
  if (distancia < 10) {
    return `${distancia.toFixed(1)}km`;
  }
  return `${Math.round(distancia)}km`;
}

function getDistanceColor(distancia?: number): string {
  if (distancia === undefined) return colors.textMuted;
  if (distancia < 5) return '#22C55E';
  if (distancia < 20) return '#3B82F6';
  if (distancia < 100) return '#F59E0B';
  return '#EF4444';
}

function formatCoords(lat?: number, lng?: number): string {
  if (lat === undefined || lng === undefined) return '';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ============================================
// COMPONENT
// ============================================

export const SearchBox = memo(function SearchBox({
  address,
  isGeocoding,
  latitude,
  longitude,
  currentLatitude,
  currentLongitude,
  onSelectResult,
}: SearchBoxProps) {
  const inputRef = useRef<TextInput>(null);
  const autocompleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searching, setSearching] = useState(false); // display vs search mode
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Display text for address bar
  const displayText = isGeocoding
    ? 'Looking up address...'
    : address || formatCoords(latitude, longitude) || 'Pan map to select location';

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autocompleteTimeout.current) {
        clearTimeout(autocompleteTimeout.current);
      }
    };
  }, []);

  // Focus input when entering search mode
  useEffect(() => {
    if (searching) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [searching]);

  const enterSearchMode = useCallback(() => {
    setSearching(true);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }, []);

  const exitSearchMode = useCallback(() => {
    setSearching(false);
    setQuery('');
    setResults([]);
    setShowResults(false);
    Keyboard.dismiss();
  }, []);

  // Handle search input change with debounce
  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);

    if (autocompleteTimeout.current) {
      clearTimeout(autocompleteTimeout.current);
    }

    if (text.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    autocompleteTimeout.current = setTimeout(async () => {
      try {
        logger.debug('ui', `Searching: "${text}"`);
        const searchResults = await buscarEnderecoAutocomplete(
          text,
          currentLatitude,
          currentLongitude
        );
        setResults(searchResults);
        setShowResults(searchResults.length > 0);
      } catch (error) {
        logger.error('ui', 'Autocomplete error', { error: String(error) });
      } finally {
        setIsSearching(false);
      }
    }, AUTOCOMPLETE_DELAY);
  }, [currentLatitude, currentLongitude]);

  // Handle result selection
  const handleSelectResult = useCallback((result: SearchResult) => {
    logger.debug('ui', `Selected: ${formatarEnderecoResumido(result.endereco)}`);
    setShowResults(false);
    setSearching(false);
    setQuery('');
    Keyboard.dismiss();
    onSelectResult(result);
  }, [onSelectResult]);

  // Handle submit (enter key)
  const handleSubmit = useCallback(async () => {
    if (query.length < 3) return;

    setIsSearching(true);
    try {
      const searchResults = await buscarEnderecoAutocomplete(
        query,
        currentLatitude,
        currentLongitude
      );
      setResults(searchResults);
      setShowResults(true);
    } catch (error) {
      logger.error('ui', 'Search error', { error: String(error) });
    } finally {
      setIsSearching(false);
    }
  }, [query, currentLatitude, currentLongitude]);

  return (
    <View style={styles.container}>
      {/* ===== BAR ===== */}
      <View style={styles.bar}>
        {searching ? (
          // SEARCH MODE: text input + close button
          <>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.barIcon} />
            <TextInput
              ref={inputRef}
              style={styles.barInput}
              placeholder="Search address or place..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={handleSearchChange}
              onSubmitEditing={handleSubmit}
              returnKeyType="search"
            />
            {isSearching && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.barLoader} />
            )}
            <TouchableOpacity
              onPress={exitSearchMode}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        ) : (
          // DISPLAY MODE: address text + search button
          <>
            <Ionicons name="location" size={18} color={colors.primary} style={styles.barIcon} />
            <Text style={styles.barText} numberOfLines={2}>
              {displayText}
            </Text>
            {isGeocoding && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.barLoader} />
            )}
            <TouchableOpacity
              onPress={enterSearchMode}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.searchButton}
            >
              <Ionicons name="search" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ===== SEARCH RESULTS ===== */}
      {searching && showResults && results.length > 0 && (
        <View style={styles.results}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsList}>
            {results.map((result, index) => (
              <TouchableOpacity
                key={`${result.latitude}-${result.longitude}-${index}`}
                style={styles.resultItem}
                onPress={() => handleSelectResult(result)}
              >
                <View style={styles.resultIconContainer}>
                  <Ionicons name="location" size={16} color={colors.primary} />
                </View>
                <View style={styles.resultContent}>
                  <Text style={styles.resultText} numberOfLines={2}>
                    {formatarEnderecoResumido(result.endereco)}
                  </Text>
                  {result.cidade && (
                    <Text style={styles.resultSubtext} numberOfLines={1}>
                      {[result.cidade, result.estado, result.pais].filter(Boolean).join(', ')}
                    </Text>
                  )}
                </View>
                {result.distancia !== undefined && (
                  <View style={styles.distanceBadge}>
                    <Text style={[styles.distanceText, { color: getDistanceColor(result.distancia) }]}>
                      {formatDistance(result.distancia)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {currentLatitude && (
            <View style={styles.resultsHint}>
              <Ionicons name="navigate" size={12} color={colors.textMuted} />
              <Text style={styles.resultsHintText}>
                Sorted by distance from you
              </Text>
            </View>
          )}
        </View>
      )}

      {/* No results */}
      {searching && showResults && results.length === 0 && !isSearching && query.length >= 3 && (
        <View style={styles.noResults}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noResultsText}>No addresses found</Text>
        </View>
      )}
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const TRANSLUCENT_BG = 'rgba(255, 255, 255, 0.65)';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },

  // The main bar (both modes)
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TRANSLUCENT_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  barIcon: {
    marginRight: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  barText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 18,
    backgroundColor: 'transparent',
  },
  barInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  barLoader: {
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  searchButton: {
    marginLeft: 8,
    padding: 4,
    backgroundColor: 'transparent',
  },

  // Results dropdown
  results: {
    backgroundColor: TRANSLUCENT_BG,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  resultsList: {
    maxHeight: 280,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  resultIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 18,
  },
  resultSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  distanceBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(245, 245, 245, 0.7)',
    gap: 4,
  },
  resultsHintText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  noResults: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TRANSLUCENT_BG,
    borderRadius: 14,
    marginTop: 8,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    gap: 8,
  },
  noResultsText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
