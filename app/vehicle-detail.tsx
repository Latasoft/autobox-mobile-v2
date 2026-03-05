import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Dimensions, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { ShareModal } from '../components/ShareModal';
import { useVehicleDetail } from '../hooks/useVehicleDetail';
import { getImageUrl } from '../utils/imageUtils';
import ttsService from '../services/ttsService';

const { width } = Dimensions.get('window');

export default function VehicleDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  if (!params) {
    console.error('❌ [VehicleDetailScreen] params is null');
    return null;
  }
  
  console.log('🚗 [VehicleDetailScreen] Params:', params);
  
  const { vehicle, loading, isLiked, isOwner, toggleLike, deactivateVehicle, deleteVehiclePublication, refresh } = useVehicleDetail();
  console.log('🚗 [VehicleDetailScreen] State:', { loading, hasVehicle: !!vehicle });
  
  const [muted, setMuted] = useState(true);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      refresh();
      return () => {
         ttsService.stop();
      };
    }, [refresh])
  );

  const narrationText = useMemo(() => {
    if (!vehicle) return '';
    // Cast to any to avoid TS errors with fallback properties not in interface
    const v = vehicle as any;
    const normalized = {
      brand: v.marca || v.brand,
      model: v.modelo || v.model,
      year: v.anio || v.year,
      kilometers: v.kilometraje ?? v.kilometers,
      transmission: v.transmision || v.transmission,
      fuelType: v.combustible || v.tipoCombustible || v.fuelType,
      price: v.valor ?? v.price,
      description: v.descripcion || v.description,
      observations: v.observacion || v.observations,
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

  const handleRefundRequest = () => {
    if (!vehicle?.publicationId) {
      Alert.alert('Error', 'No se pudo identificar la publicación para solicitar el reembolso.');
      return;
    }
    router.push({
      pathname: '/request-refund',
      params: { 
        publicationId: vehicle.publicationId
      }
    });
  };

  if (loading) {
    return (
      <Screen backgroundColor="#FFF">
        <View style={styles.centerContainer}>
          <Text>Cargando vehículo...</Text>
        </View>
      </Screen>
    );
  }

  if (!vehicle) {
    return (
      <Screen backgroundColor="#FFF">
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#CCC" />
          <Text style={{ marginTop: 12, color: '#666' }}>No se pudo cargar la información del vehículo.</Text>
          <Button title="Volver" variant="outline" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor="#FFF" style={{ padding: 0 }}>
      <ScrollView>
        {/* Image Carousel Placeholder */}
        <View style={styles.imageContainer}>
          {vehicle.images && vehicle.images.length > 0 ? (
            <Image source={{ uri: getImageUrl(vehicle.images[0]) }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="car-sport" size={64} color="#CCC" />
            </View>
          )}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.topRightActions}>
            <TouchableOpacity style={styles.shareButton} onPress={() => setShareModalVisible(true)}>
              <Ionicons name="share-social-outline" size={24} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.likeButton} onPress={toggleLike}>
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={28} color={isLiked ? "#F44336" : "#FFF"} />
            </TouchableOpacity>
          </View>
        
          <View style={styles.muteWrap}>
            <TouchableOpacity
              style={[styles.muteButton, muted ? styles.iconBtnMuted : styles.iconBtnUnmuted]}
              onPress={toggleMute}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color="#FFF" />
              <Text style={styles.muteLabel}>{muted ? 'Narrador apagado' : 'Narrando'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          {(vehicle.estado === 'blocked' || vehicle.status === 'blocked') && (
            <View style={styles.blockedBanner}>
              <Ionicons name="alert-circle" size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.blockedText}>Publicación bloqueada. Contáctenos o solicite reembolso.</Text>
            </View>
          )}

          <View style={styles.header}>
            <Text style={styles.title}>{vehicle.marca} {vehicle.modelo}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.year}>{vehicle.anio} • {vehicle.kilometraje ? Number(vehicle.kilometraje).toLocaleString('es-CL') : 'N/A'} km</Text>
              <Text style={styles.price}>${(vehicle.valor || 0).toLocaleString('es-CL')}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailsGrid}>
            <DetailItem icon="speedometer-outline" label="Kilometraje" value={vehicle.kilometraje ? `${Number(vehicle.kilometraje).toLocaleString('es-CL')} km` : 'N/A'} />
            <DetailItem icon="calendar-outline" label="Año" value={vehicle.anio?.toString() || 'N/A'} />
            <DetailItem icon="hardware-chip-outline" label="Transmisión" value={vehicle.transmision || 'N/A'} />
            <DetailItem icon="water-outline" label="Combustible" value={vehicle.combustible || vehicle.tipoCombustible || 'N/A'} />
            <DetailItem icon="car-outline" label="Tipo" value={vehicle.tipoVehiculo || 'N/A'} />
            <DetailItem icon="car-sport-outline" label="Carrocería" value={vehicle.tipoCarroceria || 'N/A'} />
            <DetailItem icon="color-palette-outline" label="Color" value={vehicle.color || 'N/A'} />
            <DetailItem icon="layers-outline" label="Puertas" value={vehicle.puertas?.toString() || 'N/A'} />
            <DetailItem icon="cog-outline" label="Motor" value={vehicle.motor || 'N/A'} />
            <DetailItem icon="barcode-outline" label="N° Motor" value={vehicle.numeroMotor || 'N/A'} />
            <DetailItem icon="document-text-outline" label="Rev. Técnica" value={vehicle.mesRevisionTecnica || 'N/A'} />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Descripción</Text>
          <Text style={styles.description}>{vehicle.descripcion || 'Sin descripción'}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isOwner ? (
          (vehicle.estado === 'blocked' || vehicle.status === 'blocked') ? (
            <>
              <Button 
                title="Solicitar Reembolso" 
                variant="outline"
                style={{ marginBottom: 12, borderColor: '#FF9800', backgroundColor: '#FFF3E0' }}
                textStyle={{ color: '#F57C00' }}
                onPress={handleRefundRequest}
              />
              <Button 
                title="Editar Publicación" 
                variant="outline"
                onPress={() => {
                  router.push({
                    pathname: '/edit-publication',
                    params: { 
                      vehicleId: vehicle.id,
                      publicationId: vehicle.publicationId
                    }
                  });
                }} 
              />
            </>
          ) : (
          <>
            <Button 
              title="Editar Publicación" 
              variant="outline"
              style={{ marginBottom: 12 }}
              onPress={() => {
                if (!vehicle) return;
                router.push({
                  pathname: '/edit-publication',
                  params: { 
                    vehicleId: vehicle.id,
                    publicationId: vehicle.publicationId
                  }
                });
              }} 
            />
            <Button 
              title="Desactivar Publicación" 
              variant="outline"
              onPress={deactivateVehicle}
              style={{ borderColor: '#F44336', marginTop: 12 }}
              textStyle={{ color: '#F44336' }}
            />
            <Button
              title="Eliminar Publicación"
              variant="danger"
              onPress={() => deleteVehiclePublication(() => router.replace('/(tabs)?tab=publications'))}
              style={{ marginTop: 12 }}
            />
          </>
          )
        ) : (
          <>
            <Button 
              title="Agendar Inspección" 
              variant="outline"
              style={{ marginBottom: 12 }}
              onPress={() => {
                if (!vehicle) return;
                router.push({
                  pathname: '/schedule-inspection',
                  params: { 
                    vehicleId: vehicle.id,
                    publicationId: vehicle.publicationId
                  }
                });
              }} 
            />
            <Button 
              title="Contactar Vendedor" 
              onPress={() => {
                if (!vehicle) return;
                const sellerName = (vehicle as any).user 
                  ? `${(vehicle as any).user.primerNombre} ${(vehicle as any).user.primerApellido}` 
                  : 'Vendedor';
                
                router.push({
                  pathname: '/(tabs)/chat-detail',
                  params: { 
                    userId: vehicle.userId,
                    userName: sellerName,
                    userAvatar: (vehicle as any).user?.foto_url
                  }
                });
              }} 
            />
          </>
        )}
      </View>

      <ShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        vehicleId={vehicle?.id}
        publicationId={vehicle?.publicationId}
        vehicleTitle={vehicle ? `${vehicle.marca} ${vehicle.modelo} ${vehicle.anio}` : undefined}
      />
    </Screen>
  );
}

const DetailItem = ({ icon, label, value }: { icon: any, label: string, value: string }) => (
  <View style={styles.detailItem}>
    <Ionicons name={icon} size={24} color="#666" style={{ marginBottom: 4 }} />
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    height: 300,
    backgroundColor: '#EEE',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightActions: {
    position: 'absolute',
    top: 40,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteWrap: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 8,
  },
  muteLabel: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  iconBtnMuted: {
    opacity: 0.8,
  },
  iconBtnUnmuted: {
    opacity: 1,
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F44336',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  blockedText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 180,
  },
  header: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  year: {
    fontSize: 16,
    color: '#666',
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE',
    marginVertical: 24,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  detailItem: {
    width: '33.33%',
    padding: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
});