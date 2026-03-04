import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import adminService, { Sede } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export default function AdminSedesScreen() {
  const router = useRouter();

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [activo, setActivo] = useState(true);

  const loadSedes = async () => {
    try {
      const data = await adminService.getSedes();
      setSedes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading sedes:', error);
      Alert.alert('Error', 'No se pudieron cargar las sedes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadSedes();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadSedes();
  };

  const openCreateModal = () => {
    setNombre('');
    setDireccion('');
    setActivo(true);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!creating) {
      setShowCreateModal(false);
    }
  };

  const handleCreateSede = async () => {
    const nombreTrim = nombre.trim();
    const direccionTrim = direccion.trim();

    if (!nombreTrim || !direccionTrim) {
      Alert.alert('Campos requeridos', 'Debes completar nombre y direccion');
      return;
    }

    try {
      setCreating(true);
      await adminService.createSede({
        nombre: nombreTrim,
        direccion: direccionTrim,
        activo,
      });
      setShowCreateModal(false);
      Alert.alert('Exito', 'Sede creada correctamente');
      await loadSedes();
    } catch (error: any) {
      console.error('Error creating sede:', error);
      Alert.alert('Error', error?.message || 'No se pudo crear la sede');
    } finally {
      setCreating(false);
    }
  };

  const handleSedePress = (sede: Sede) => {
    router.push({
      pathname: '/(admin)/sede-detail',
      params: { id: String(sede.id) },
    });
  };

  const renderSede = ({ item }: { item: Sede }) => {
    const isActive = Boolean(item.activo);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleSedePress(item)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre}</Text>
          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={styles.statusText}>{isActive ? 'Activa' : 'Inactiva'}</Text>
          </View>
        </View>

        <Text style={styles.cardAddress} numberOfLines={2}>{item.direccion}</Text>

        <View style={styles.cardBottomRow}>
          <Text style={styles.idText}>ID: {item.id}</Text>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sedes</Text>
        <Button
          title="Nueva Sede"
          onPress={openCreateModal}
          size="small"
          icon={<Ionicons name="add" size={20} color="#FFF" />}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <FlatList
          data={sedes}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSede}
          contentContainerStyle={[styles.listContent, sedes.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="business-outline" size={56} color="#d0d0d0" />
              <Text style={styles.emptyTitle}>Sin sedes</Text>
              <Text style={styles.emptyText}>Crea una sede para comenzar</Text>
            </View>
          }
        />
      )}

      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={closeCreateModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crear Sede</Text>

            <Input
              label="Nombre"
              placeholder="Ej: Sede Santiago Centro"
              value={nombre}
              onChangeText={setNombre}
              editable={!creating}
            />

            <Input
              label="Direccion"
              placeholder="Ej: Av. Providencia 1234"
              value={direccion}
              onChangeText={setDireccion}
              editable={!creating}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Activa</Text>
              <Switch
                value={activo}
                onValueChange={setActivo}
                disabled={creating}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={activo ? '#007bff' : '#9CA3AF'}
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                onPress={closeCreateModal}
                variant="outline"
                style={styles.actionButton}
                disabled={creating}
              />
              <Button
                title="Crear"
                onPress={handleCreateSede}
                style={styles.actionButton}
                loading={creating}
              />
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardAddress: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  cardBottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
  },
  statusInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#4B5563',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  switchRow: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
