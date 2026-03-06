import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import mechanicSedeService, { MechanicWorkingSede } from '../../services/mechanicSedeService';

export default function MechanicMyAutoboxScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sedeModalVisible, setSedeModalVisible] = useState(false);

  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [availableSedes, setAvailableSedes] = useState<MechanicWorkingSede[]>([]);
  const [blockedSedeIds, setBlockedSedeIds] = useState<number[]>([]);
  const [selectedSede, setSelectedSede] = useState<MechanicWorkingSede | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const currentMechanicId = await mechanicSedeService.getCurrentMechanicId();
      setMechanicId(currentMechanicId);

      const [sedes, blockedSedes] = await Promise.all([
        mechanicSedeService.getSedesWithActiveSchedule(),
        mechanicSedeService.getBlockedSedes(currentMechanicId),
      ]);

      setAvailableSedes(sedes);
      setBlockedSedeIds(blockedSedes);

      if (selectedSede) {
        const stillExists = sedes.some((sede) => sede.id === selectedSede.id);
        if (!stillExists) {
          setSelectedSede(null);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar las sedes');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const filteredSedes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return availableSedes;

    return availableSedes.filter((sede) => {
      return (
        String(sede.id).toLowerCase().includes(normalizedQuery) ||
        sede.nombre.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [availableSedes, searchQuery]);

  const handlePickSede = async (sede: MechanicWorkingSede) => {
    if (blockedSedeIds.includes(sede.id)) {
      Alert.alert('Sede bloqueada', 'No puedes seleccionar esta sede porque fue bloqueada por un administrador.');
      return;
    }

    const schedule = await mechanicSedeService.getSedeSchedule(sede.id);
    const hasVigenteSchedule = schedule.some((item) => item.isActive && item.timeSlots.length > 0);

    if (!hasVigenteSchedule) {
      Alert.alert('Error', 'Sede sin horario". Seleccione una que esté con horario vigente)');
      return;
    }

    setSelectedSede(sede);
    setSedeModalVisible(false);
  };

  const handleContinue = async () => {
    if (!selectedSede || !mechanicId) return;

    try {
      setContinuing(true);

      const pendingInspections = await mechanicSedeService.getPendingInspections(mechanicId);
      const now = new Date();
      const hasFuturePendingInspection = pendingInspections.some((inspection) => {
        const inspectionDate = inspection.fechaProgramada
          ? new Date(inspection.fechaProgramada)
          : (inspection.horario?.fecha ? new Date(`${inspection.horario.fecha}T${inspection.horario.horaInicio || '00:00'}:00`) : null);

        if (!inspectionDate) return false;
        return inspectionDate.getTime() > now.getTime();
      });

      if (hasFuturePendingInspection) {
        Alert.alert(
          'Cambio de sede no permitido',
          'No puedes cambiarte de sede mientras tengas citas pendientes en el día.'
        );
        return;
      }

      const validation = await mechanicSedeService.validateSedeChange(mechanicId, selectedSede.id);
      if (!validation.allowed) {
        Alert.alert('No disponible', validation.message || 'No puedes cambiar de sede en este momento.');
        return;
      }

      router.push({
        pathname: '/(mechanic)/my-autobox-schedule',
        params: {
          sedeId: String(selectedSede.id),
          sedeNombre: selectedSede.nombre,
          sedeDireccion: selectedSede.direccion || '',
        },
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo continuar');
    } finally {
      setContinuing(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9800" />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Seleccionar una sede</Text>
        <Text style={styles.subtitle}>Seleccione en qué sedes desea trabajar.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por ID o nombre"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.chipSelector} onPress={() => setSedeModalVisible(true)}>
          <View style={styles.chipSelectorTextWrap}>
            <Text style={styles.chipLabel}>Autobox seleccionado</Text>
            <Text style={[styles.chipValue, !selectedSede && styles.chipPlaceholder]}>
              {selectedSede ? `${selectedSede.nombre} (#${selectedSede.id})` : 'Seleccionar sede'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Reglas rápidas</Text>
          <Text style={styles.infoText}>• Solo puedes escoger una sede por sesión.</Text>
          <Text style={styles.infoText}>• Solo puedes elegir sedes con horario vigente.</Text>
          <Text style={styles.infoText}>• Si una sede fue bloqueada por admin, no estará disponible.</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title="CONTINUAR"
          onPress={handleContinue}
          disabled={!selectedSede || continuing}
          loading={continuing}
          style={styles.continueButton}
        />
      </View>

      <Modal
        visible={sedeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSedeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Autobox</Text>
              <TouchableOpacity onPress={() => setSedeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={filteredSedes}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const isBlocked = blockedSedeIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.sedeItem, isBlocked && styles.sedeItemBlocked]}
                    onPress={() => handlePickSede(item)}
                    disabled={isBlocked}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sedeName}>{item.nombre}</Text>
                      <Text style={styles.sedeMeta}>ID: {item.id}</Text>
                      {!!item.direccion && <Text style={styles.sedeAddress}>{item.direccion}</Text>}
                    </View>
                    {isBlocked ? (
                      <Text style={styles.blockedText}>Bloqueada</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#999" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No se encontraron sedes para tu búsqueda</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
  },
  subtitle: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#7C7C7C',
    marginBottom: 6,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#333',
  },
  chipSelector: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipSelectorTextWrap: {
    flex: 1,
  },
  chipLabel: {
    fontSize: 12,
    color: '#8A8A8A',
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#232323',
  },
  chipPlaceholder: {
    color: '#9A9A9A',
    fontWeight: '400',
  },
  infoCard: {
    marginTop: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  continueButton: {
    backgroundColor: '#FF9800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  sedeItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sedeItemBlocked: {
    opacity: 0.6,
  },
  sedeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  sedeMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  sedeAddress: {
    fontSize: 12,
    color: '#555',
    marginTop: 3,
  },
  blockedText: {
    color: '#D32F2F',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
});
