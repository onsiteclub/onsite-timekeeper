/**
 * Map Screen (Web) - OnSite Timekeeper
 *
 * Web fallback: shows locations as a list instead of a map.
 * No geofencing, no GPS — just informational view.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { useLocationStore } from '../../src/stores/locationStore';

export default function MapScreenWeb() {
  const locations = useLocationStore(s => s.locations);

  return (
    <View style={wStyles.container}>
      <View style={wStyles.header}>
        <Ionicons name="location-outline" size={24} color={colors.primary} />
        <Text style={wStyles.headerTitle}>Work Sites</Text>
      </View>

      <Text style={wStyles.subtitle}>
        Geofencing is only available on the mobile app. You can view your saved sites below.
      </Text>

      <ScrollView style={wStyles.list} contentContainerStyle={wStyles.listContent}>
        {locations.length === 0 ? (
          <View style={wStyles.emptyContainer}>
            <Ionicons name="map-outline" size={48} color={colors.textMuted} />
            <Text style={wStyles.emptyText}>No locations added yet</Text>
            <Text style={wStyles.emptyHint}>
              Add locations from the mobile app to enable auto-tracking.
            </Text>
          </View>
        ) : (
          locations.map((location) => (
            <View key={location.id} style={wStyles.card}>
              <View style={[wStyles.colorDot, { backgroundColor: location.color }]} />
              <View style={wStyles.cardContent}>
                <Text style={wStyles.cardName}>{location.name}</Text>
                <Text style={wStyles.cardCoords}>
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </Text>
                <Text style={wStyles.cardRadius}>Radius: {location.radius}m</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const wStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  cardContent: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cardCoords: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  cardRadius: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
