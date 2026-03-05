import React, { useCallback, useMemo, useState } from 'react';
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
  TextInput,
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
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<'todos' | 'activas' | 'inactivas'>('todos');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const isSedeActive = (value?: boolean | number) => {
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  };

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

    if (!nombreTrim || !direccionTrim || typeof activo !== 'boolean') {
      Alert.alert('Campos requeridos', 'Debes completar todos los campos de la sede');
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

  const filteredSedes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = sedes.filter((item) => {
      const active = isSedeActive(item.activo);
      if (estadoFilter === 'activas' && !active) return false;
      if (estadoFilter === 'inactivas' && active) return false;

      if (query) {
        const nombreMatch = (item.nombre || '').toLowerCase().includes(query);
        const direccionMatch = (item.direccion || '').toLowerCase().includes(query);
        const idMatch = String(item.id || '').includes(query);
        if (!nombreMatch && !direccionMatch && !idMatch) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortOrder === 'asc') return a.id - b.id;
      return b.id - a.id;
    });
  }, [sedes, search, estadoFilter, sortOrder]);

  const renderSede = ({ item }: { item: Sede }) => {
    const isActive = isSedeActive(item.activo);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleSedePress(item)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.nameRow}>
            <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotInactive]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre}</Text>
          </View>
          <Text style={styles.idText}>ID: {item.id}</Text>
        </View>

        <Text style={styles.cardAddress} numberOfLines={2}>{item.direccion}</Text>

        <View style={styles.cardBottomRow}>
          <TouchableOpacity
            style={styles.detailCta}
            onPress={() => handleSedePress(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={14} color="#2563EB" />
            <Text style={styles.detailCtaText}>Ver detalle</Text>
          </TouchableOpacity>
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

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar sede por nombre, direccion o ID"
            placeholderTextColor="#B0B0B0"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.filterChip, estadoFilter === 'todos' && styles.filterChipActive]}
            onPress={() => setEstadoFilter('todos')}
          >
            <Text style={[styles.filterChipText, estadoFilter === 'todos' && styles.filterChipTextActive]}>Todas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, estadoFilter === 'activas' && styles.filterChipActive]}
            onPress={() => setEstadoFilter('activas')}
          >
            <Text style={[styles.filterChipText, estadoFilter === 'activas' && styles.filterChipTextActive]}>Activas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, estadoFilter === 'inactivas' && styles.filterChipActive]}
            onPress={() => setEstadoFilter('inactivas')}
          >
            <Text style={[styles.filterChipText, estadoFilter === 'inactivas' && styles.filterChipTextActive]}>Inactivas</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Numero de sede:</Text>
          <TouchableOpacity
            style={[styles.sortButton, sortOrder === 'asc' && styles.sortButtonActive]}
            onPress={() => setSortOrder('asc')}
          >
            <Text style={[styles.sortButtonText, sortOrder === 'asc' && styles.sortButtonTextActive]}>Asc</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortOrder === 'desc' && styles.sortButtonActive]}
            onPress={() => setSortOrder('desc')}
          >
            <Text style={[styles.sortButtonText, sortOrder === 'desc' && styles.sortButtonTextActive]}>Desc</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <FlatList
          data={filteredSedes}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSede}
          contentContainerStyle={[styles.listContent, filteredSedes.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="business-outline" size={56} color="#d0d0d0" />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>No hay sedes para los filtros seleccionados</Text>
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
  searchContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  searchBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    color: '#333',
    fontSize: 15,
  },
  filtersRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFF',
  },
  filterChipActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  sortRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  sortButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  sortButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  sortButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: '#FFF',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  dotActive: {
    backgroundColor: '#22C55E',
  },
  dotInactive: {
    backgroundColor: '#F59E0B',
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
  detailCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
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
