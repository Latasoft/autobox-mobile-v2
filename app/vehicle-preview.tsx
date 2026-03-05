import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, FlatList, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui/Screen';
import apiService from '../services/apiService';
import ttsService from '../services/ttsService';
import { getImageUrl } from '../utils/imageUtils';

const { width, height } = Dimensions.get('window');

export default function VehiclePreviewScreen() {
  const { id } = useLocalSearchParams();
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        const v = await apiService.getVehicleById(id as string);
        setVehicle(v);
      } catch (e) {
        console.error('Error loading vehicle for preview', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const images: string[] = useMemo(() => {
    if (!vehicle) return [];
    if (Array.isArray(vehicle.images) && vehicle.images.length > 0) return vehicle.images;
    // fallback: some APIs embed photos array as strings already
    if (Array.isArray(vehicle.fotos) && vehicle.fotos.length > 0) {
      return vehicle.fotos.map((f: any) => (typeof f === 'string' ? f : f.url)).filter(Boolean);
    }
    return [];
  }, [vehicle]);

  const narrationText = useMemo(() => {
    if (!vehicle) return '';
    const normalized = {
      brand: vehicle.marca || vehicle.brand,
      model: vehicle.modelo || vehicle.model,
      year: vehicle.anio || vehicle.year,
      kilometers: vehicle.kilometraje ?? vehicle.kilometers,
      transmission: vehicle.transmision || vehicle.transmission,
      fuelType: vehicle.combustible || vehicle.tipoCombustible || vehicle.fuelType,
      price: vehicle.valor ?? vehicle.price,
      description: vehicle.descripcion || vehicle.description,
      observations: vehicle.observacion || vehicle.observations,
    };
    return ttsService.generateVehicleNarration(normalized);
  }, [vehicle]);

  useEffect(() => {
    return () => {
      ttsService.stop();
    };
  }, []);

  const startNarration = () => {
    if (!narrationText) return;

    setMuted(false);
    ttsService.speak(narrationText, {
      onDone: () => setMuted(true),
      onStopped: () => setMuted(true),
      onError: () => setMuted(true),
    }).catch(e => {
      console.log('Error TTS', e);
      setMuted(true);
    });
  };

  const toggleMute = () => {
    if (muted) {
      startNarration();
    } else {
      setMuted(true);
      ttsService.stop();
    }
  };

  const goToDetails = () => {
    if (!vehicle) return;
    router.push({ pathname: '/vehicle-detail', params: { id: vehicle.id } });
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}> 
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Cargando vehículo...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(uri, idx) => `${uri}-${idx}`}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.9} onPress={goToDetails}>
              <Image source={{ uri: getImageUrl(item) }} style={styles.image} resizeMode="cover" />
            </TouchableOpacity>
          )}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centerFill}> 
              <Ionicons name="car-sport-outline" size={72} color="#CCC" />
              <Text style={styles.emptyText}>Sin fotos disponibles</Text>
            </View>
          }
        />

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {vehicle?.marca || vehicle?.brand} {vehicle?.modelo || vehicle?.model} {vehicle?.anio || vehicle?.year}
            </Text>
          </View>
          <View style={styles.muteWrap}>
            <TouchableOpacity
              style={[styles.iconBtn, muted ? styles.iconBtnMuted : styles.iconBtnUnmuted]}
              onPress={toggleMute}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.muteLabel}>{muted ? 'Narrador apagado' : 'Narrando'}</Text>
          </View>
        </View>

        {/* Bottom CTA */}
        <View style={styles.bottomBar}>
          <View style={styles.priceWrap}>
            <Text style={styles.priceText}>
              ${((vehicle?.valor ?? vehicle?.price) || 0).toLocaleString('es-CL')}
            </Text>
          </View>
          <TouchableOpacity style={styles.ctaBtn} onPress={goToDetails}>
            <Ionicons name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.ctaText}>Ver detalles</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerFill: { width, height, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#666' },
  emptyText: { marginTop: 12, color: '#CCC', fontSize: 16 },
  image: { width, height },
  topBar: {
    position: 'absolute', top: 40, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  titleWrap: { flex: 1, marginHorizontal: 12 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  muteWrap: { alignItems: 'center' },
  muteLabel: { color: '#fff', fontSize: 11, marginTop: 4, opacity: 0.9 },
  iconBtnMuted: { backgroundColor: 'rgba(255, 59, 48, 0.6)' },
  iconBtnUnmuted: { backgroundColor: 'rgba(76, 175, 80, 0.6)' },
  bottomBar: {
    position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  priceWrap: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  priceText: { color: '#4CAF50', fontSize: 18, fontWeight: '800' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4CAF50', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
