/**
 * Map Screen - OnSite Timekeeper
 * Gerenciar locais de trabalho com 3 modos de adicionar
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, Modal, Dimensions, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, Region, PROVIDER_DEFAULT } from 'react-native-maps';
import { colors, withOpacity, getRandomGeofenceColor } from '../../src/constants/colors';
import { Button, Card, Input } from '../../src/components/ui/Button';
import { useLocationStore } from '../../src/stores/locationStore';
import { buscarEndereco, formatarEnderecoResumido } from '../../src/lib/geocoding';

const { width, height } = Dimensions.get('window');

// Região default (Ottawa, CA)
const DEFAULT_REGION: Region = {
  latitude: 45.4215,
  longitude: -75.6972,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const { locais, localizacaoAtual, isGeofencingAtivo, adicionarLocal, removerLocal, iniciarMonitoramento, pararMonitoramento, atualizarLocalizacao } = useLocationStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'current' | 'search' | 'tap'>('current');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newLocal, setNewLocal] = useState({ nome: '', raio: 100 });
  const [isAdding, setIsAdding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Região inicial baseada na localização atual ou default
  const getInitialRegion = (): Region => {
    if (localizacaoAtual?.latitude && localizacaoAtual?.longitude) {
      return {
        latitude: localizacaoAtual.latitude,
        longitude: localizacaoAtual.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    return DEFAULT_REGION;
  };

  const [region, setRegion] = useState<Region>(getInitialRegion());

  useEffect(() => {
    atualizarLocalizacao();
  }, []);

  // Atualiza região quando localização muda (apenas se mapa ainda não foi movido manualmente)
  useEffect(() => {
    if (localizacaoAtual?.latitude && localizacaoAtual?.longitude && !mapReady) {
      setRegion({
        latitude: localizacaoAtual.latitude,
        longitude: localizacaoAtual.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [localizacaoAtual]);

  const handleMapReady = () => {
    console.log('🗺️ Mapa carregado com sucesso');
    setMapReady(true);
    setMapError(null);
  };

  const handleMapError = (error: any) => {
    console.error('❌ Erro no mapa:', error);
    setMapError('Erro ao carregar mapa');
  };

  const handleMapPress = (e: any) => {
    if (addMode === 'tap' && !showAddModal) {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setSelectedCoords({ lat: latitude, lng: longitude });
      setShowAddModal(true);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 3) return;
    const results = await buscarEndereco(searchQuery);
    setSearchResults(results);
  };

  const selectSearchResult = (result: any) => {
    setSelectedCoords({ lat: result.latitude, lng: result.longitude });
    setSearchResults([]);
    const newRegion = { latitude: result.latitude, longitude: result.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 };
    mapRef.current?.animateToRegion(newRegion, 500);
  };

  const handleUseCurrentLocation = () => {
    if (!localizacaoAtual) {
      Alert.alert('Erro', 'Localização não disponível. Verifique as permissões de GPS.');
      return;
    }
    setSelectedCoords({ lat: localizacaoAtual.latitude, lng: localizacaoAtual.longitude });
  };

  const handleAddLocal = async () => {
    if (!newLocal.nome.trim()) {
      Alert.alert('Erro', 'Digite um nome para o local');
      return;
    }
    if (!selectedCoords) {
      Alert.alert('Erro', 'Selecione uma localização');
      return;
    }

    setIsAdding(true);
    try {
      await adicionarLocal({
        nome: newLocal.nome,
        latitude: selectedCoords.lat,
        longitude: selectedCoords.lng,
        raio: newLocal.raio,
        cor: getRandomGeofenceColor(),
      });
      Alert.alert('Sucesso', `Local "${newLocal.nome}" adicionado!`);
      resetForm();
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível adicionar o local');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteLocal = (id: string, nome: string) => {
    Alert.alert('Remover local', `Deseja remover "${nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removerLocal(id) },
    ]);
  };

  const resetForm = () => {
    setShowAddModal(false);
    setAddMode('current');
    setSelectedCoords(null);
    setSearchQuery('');
    setSearchResults([]);
    setNewLocal({ nome: '', raio: 100 });
  };

  const toggleMonitoramento = () => {
    if (isGeofencingAtivo) {
      pararMonitoramento();
    } else {
      if (locais.length === 0) {
        Alert.alert('Aviso', 'Adicione pelo menos um local antes de ativar o monitoramento');
        return;
      }
      iniciarMonitoramento();
    }
  };

  const goToMyLocation = () => {
    if (localizacaoAtual) {
      mapRef.current?.animateToRegion({
        latitude: localizacaoAtual.latitude,
        longitude: localizacaoAtual.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    } else {
      Alert.alert('GPS', 'Localização não disponível');
    }
  };

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={region}
        onMapReady={handleMapReady}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        loadingEnabled={true}
        loadingIndicatorColor={colors.primary}
        loadingBackgroundColor={colors.background}
      >
        {/* Círculos e Markers dos locais */}
        {locais.map((local) => (
          <React.Fragment key={local.id}>
            <Circle
              center={{ latitude: local.latitude, longitude: local.longitude }}
              radius={local.raio}
              fillColor={withOpacity(local.cor, 0.2)}
              strokeColor={local.cor}
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: local.latitude, longitude: local.longitude }}
              title={local.nome}
              description={`Raio: ${local.raio}m`}
              onCalloutPress={() => handleDeleteLocal(local.id, local.nome)}
            >
              <View style={[styles.marker, { backgroundColor: local.cor }]}>
                <Text style={styles.markerText}>📍</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {/* Preview do novo local */}
        {selectedCoords && (
          <>
            <Circle
              center={{ latitude: selectedCoords.lat, longitude: selectedCoords.lng }}
              radius={newLocal.raio}
              fillColor={withOpacity(colors.success, 0.3)}
              strokeColor={colors.success}
              strokeWidth={2}
            />
            <Marker coordinate={{ latitude: selectedCoords.lat, longitude: selectedCoords.lng }}>
              <View style={[styles.marker, { backgroundColor: colors.success }]}>
                <Text style={styles.markerText}>✓</Text>
              </View>
            </Marker>
          </>
        )}
      </MapView>

      {/* Botão Minha Localização */}
      <TouchableOpacity style={styles.myLocationButton} onPress={goToMyLocation}>
        <Text style={styles.myLocationIcon}>🎯</Text>
      </TouchableOpacity>

      {/* Controls no topo */}
      <View style={styles.topControls}>
        <TouchableOpacity
          style={[styles.monitorButton, isGeofencingAtivo && styles.monitorButtonActive]}
          onPress={toggleMonitoramento}
        >
          <Text style={[styles.monitorButtonText, isGeofencingAtivo && styles.monitorButtonTextActive]}>
            {isGeofencingAtivo ? '🟢 Monitorando' : '⚪ Monitoramento OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Botão Adicionar */}
      <View style={styles.bottomControls}>
        <Button title="➕ Adicionar Local" onPress={() => { setAddMode('current'); handleUseCurrentLocation(); setShowAddModal(true); }} />
      </View>

      {/* Lista de locais */}
      {locais.length > 0 && (
        <View style={styles.localsList}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {locais.map((local) => (
              <TouchableOpacity
                key={local.id}
                style={[styles.localChip, { borderColor: local.cor }]}
                onPress={() => mapRef.current?.animateToRegion({
                  latitude: local.latitude,
                  longitude: local.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }, 500)}
                onLongPress={() => handleDeleteLocal(local.id, local.nome)}
              >
                <View style={[styles.localChipDot, { backgroundColor: local.cor }]} />
                <Text style={styles.localChipText} numberOfLines={1}>{local.nome}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={resetForm}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adicionar Local</Text>

            {/* Mode selector */}
            <View style={styles.modeSelector}>
              {[
                { key: 'current', label: '📍 Atual', onPress: () => { setAddMode('current'); handleUseCurrentLocation(); } },
                { key: 'search', label: '🔍 Buscar', onPress: () => setAddMode('search') },
                { key: 'tap', label: '👆 Mapa', onPress: () => { setAddMode('tap'); setShowAddModal(false); Alert.alert('Toque no mapa', 'Toque no local desejado no mapa'); } },
              ].map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeButton, addMode === mode.key && styles.modeButtonActive]}
                  onPress={mode.onPress}
                >
                  <Text style={[styles.modeButtonText, addMode === mode.key && styles.modeButtonTextActive]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            {addMode === 'search' && (
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar endereço..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
                <Button title="Buscar" size="sm" onPress={handleSearch} />
              </View>
            )}

            {searchResults.length > 0 && (
              <ScrollView style={styles.searchResults}>
                {searchResults.map((result, i) => (
                  <TouchableOpacity key={i} style={styles.searchResultItem} onPress={() => selectSearchResult(result)}>
                    <Text numberOfLines={2}>{formatarEnderecoResumido(result.endereco)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Form */}
            {selectedCoords && (
              <View style={styles.form}>
                <Text style={styles.coordsText}>📍 {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}</Text>
                <Input
                  label="Nome do local"
                  placeholder="Ex: Escritório, Obra Centro"
                  value={newLocal.nome}
                  onChangeText={(t) => setNewLocal({ ...newLocal, nome: t })}
                />
                <View style={styles.raioContainer}>
                  <Text style={styles.raioLabel}>Raio: {newLocal.raio}m</Text>
                  <View style={styles.raioButtons}>
                    {[50, 100, 150, 200].map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.raioButton, newLocal.raio === r && styles.raioButtonActive]}
                        onPress={() => setNewLocal({ ...newLocal, raio: r })}
                      >
                        <Text style={[styles.raioButtonText, newLocal.raio === r && styles.raioButtonTextActive]}>{r}m</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="ghost" onPress={resetForm} />
              <Button title="Adicionar" onPress={handleAddLocal} loading={isAdding} disabled={!selectedCoords || !newLocal.nome} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, width: '100%', height: '100%' },
  marker: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white },
  markerText: { fontSize: 18 },
  myLocationButton: {
    position: 'absolute',
    top: 80,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  myLocationIcon: { fontSize: 24 },
  topControls: { position: 'absolute', top: 16, left: 16, right: 70 },
  monitorButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignSelf: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  monitorButtonActive: { backgroundColor: colors.success },
  monitorButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
  monitorButtonTextActive: { color: colors.white },
  bottomControls: { position: 'absolute', bottom: 100, left: 16, right: 16 },
  localsList: { position: 'absolute', bottom: 24, left: 0, right: 0 },
  localChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginLeft: 12, borderWidth: 2 },
  localChipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  localChipText: { fontSize: 13, fontWeight: '500', maxWidth: 100 },
  modalOverlay: { flex: 1, backgroundColor: withOpacity(colors.black, 0.5), justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modeSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeButton: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.backgroundSecondary, alignItems: 'center' },
  modeButtonActive: { backgroundColor: colors.primary },
  modeButtonText: { fontSize: 14, color: colors.textSecondary },
  modeButtonTextActive: { color: colors.white, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  searchResults: { maxHeight: 150, marginBottom: 12 },
  searchResultItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  form: { marginTop: 12 },
  coordsText: { fontSize: 12, color: colors.textSecondary, marginBottom: 12 },
  raioContainer: { marginTop: 8 },
  raioLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  raioButtons: { flexDirection: 'row', gap: 8 },
  raioButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center' },
  raioButtonActive: { backgroundColor: colors.primary },
  raioButtonText: { fontSize: 14, color: colors.textSecondary },
  raioButtonTextActive: { color: colors.white, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 12 },
});
