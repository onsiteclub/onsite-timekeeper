/**
 * SearchBox Component - OnSite Timekeeper
 * 
 * Memoized search component to prevent MapView re-renders
 * when user types in the search input.
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
import { buscarEnderecoAutocomplete, formatarEnderecoResumido } from '../../lib/geocoding';
import { AUTOCOMPLETE_DELAY, type SearchResult } from './constants';

// ============================================
// TYPES
// ============================================

interface SearchBoxProps {
  currentLatitude?: number;
  currentLongitude?: number;
  onSelectResult: (result: SearchResult) => void;
}

// ============================================
// COMPONENT
// ============================================

export const SearchBox = memo(function SearchBox({
  currentLatitude,
  currentLongitude,
  onSelectResult,
}: SearchBoxProps) {
  const inputRef = useRef<TextInput>(null);
  const autocompleteTimeout = useRef<NodeJS.Timeout | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autocompleteTimeout.current) {
        clearTimeout(autocompleteTimeout.current);
      }
    };
  }, []);

  // Handle search input change with debounce
  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);

    // Cancel previous search
    if (autocompleteTimeout.current) {
      clearTimeout(autocompleteTimeout.current);
    }

    // If text too short, clear results
    if (text.length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    // Debounce: wait for user to stop typing
    setIsSearching(true);
    autocompleteTimeout.current = setTimeout(async () => {
      try {
        const searchResults = await buscarEnderecoAutocomplete(
          text,
          currentLatitude,
          currentLongitude
        );
        setResults(searchResults);
        setShowResults(searchResults.length > 0);
      } catch (error) {
        console.error('Autocomplete error:', error);
      } finally {
        setIsSearching(false);
      }
    }, AUTOCOMPLETE_DELAY);
  }, [currentLatitude, currentLongitude]);

  // Handle result selection
  const handleSelectResult = useCallback((result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    Keyboard.dismiss();
    onSelectResult(result);
  }, [onSelectResult]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  }, []);

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
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [query, currentLatitude, currentLongitude]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#666666" style={styles.icon} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Search address..."
          placeholderTextColor="#999999"
          value={query}
          onChangeText={handleSearchChange}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
          onFocus={() => setShowResults(results.length > 0)}
        />
        {isSearching && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        )}
        {query.length > 0 && !isSearching && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={20} color="#999999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Results dropdown */}
      {showResults && results.length > 0 && (
        <View style={styles.results}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsList}>
            {results.map((result, index) => (
              <TouchableOpacity
                key={index}
                style={styles.resultItem}
                onPress={() => handleSelectResult(result)}
              >
                <Ionicons name="location-outline" size={16} color="#666666" style={styles.resultIcon} />
                <Text style={styles.resultText} numberOfLines={2}>
                  {formatarEnderecoResumido(result.endereco)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
  loader: {
    marginRight: 8,
  },
  results: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  resultsList: {
    maxHeight: 200,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  resultIcon: {
    marginRight: 10,
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },
});
