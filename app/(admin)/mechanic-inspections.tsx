import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Alert, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import adminService, { AdminInspection } from '../../services/adminService';
import { InspectionCard } from '../../components/admin/InspectionCard';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function MechanicInspectionsScreen() {
  const { mechanicId, mechanicName } = useLocalSearchParams();
  const router = useRouter();
  const [inspections, setInspections] = useState<AdminInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search, Sort & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const loadInspections = async () => {
    try {
      if (!mechanicId) return;
      setLoading(true);
      const data = await adminService.getMechanicInspections(mechanicId as string);
      
      const mapStatus = (status: string) => {
        if (!status) return 'pending';
        const s = status.toLowerCase();
        if (s === 'pendiente') return 'pending';
        if (s === 'confirmada') return 'scheduled';
        if (s === 'finalizada') return 'completed';
        if (s === 'rechazada' || s === 'cancelada') return 'cancelled';
        return s;
      };

      const mappedData = (data as any[]).map((item: any) => ({
        id: item.id,
        inspectionNumber: item.inspectionNumber || `INS-${item.id?.slice(0, 8)}`,
        vehicleId: item.vehicleId || item.vehicle?.id || item.publicacion?.vehiculo?.id,
        vehiclePatent: item.vehicle?.patent || item.vehiclePatent || item.publicacion?.vehiculo?.patente,
        vehicleBrand: item.vehicle?.brand || item.vehicleBrand || item.publicacion?.vehiculo?.marca || null,
        vehicleModel: item.vehicle?.model || item.vehicleModel || item.publicacion?.vehiculo?.modelo || null,
        mechanicId: item.mechanicId || item.mechanic?.id,
        mechanicName: item.mechanicName || (item.mechanic 
          ? (`${item.mechanic.primerNombre || item.mechanic.firstName || ''} ${item.mechanic.primerApellido || item.mechanic.lastName || ''}`.trim() || item.mechanic.email || 'Mecánico')
          : null),
        mechanicPhoto: item.mechanicPhoto || item.mechanic?.foto_url || item.mechanic?.profilePhoto || null,
        status: mapStatus(item.estado_insp || item.status),
        scheduledDate: item.fechaProgramada || item.scheduledDate || item.fechaCreacion || item.createdAt,
        price: item.valor || item.price || 0,
        paymentStatus: item.estado_pago || item.paymentStatus || 'pending',
        createdAt: item.fechaCreacion || item.createdAt,
        updatedAt: item.updatedAt,
        cancellationReason: item.cancellationReason,
        observacion: item.observacion,
      }));

      setInspections(mappedData);
    } catch (error) {
      console.error('Error loading mechanic inspections:', error);
      Alert.alert('Error', 'No se pudieron cargar las inspecciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInspections();
  }, [mechanicId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInspections();
    setRefreshing(false);
  };

  // Filtered and sorted inspections
  const filteredInspections = useMemo(() => {
    let result = [...inspections];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        (i.vehiclePatent && i.vehiclePatent.toLowerCase().includes(q)) ||
        (i.vehicleBrand && i.vehicleBrand.toLowerCase().includes(q)) ||
        (i.vehicleModel && i.vehicleModel.toLowerCase().includes(q)) ||
        (i.inspectionNumber && i.inspectionNumber.toLowerCase().includes(q))
      );
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter(i => new Date(i.scheduledDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(i => new Date(i.scheduledDate) <= to);
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.scheduledDate).getTime();
      const dateB = new Date(b.scheduledDate).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [inspections, searchQuery, sortOrder, dateFrom, dateTo]);

  const handleDeleteInspection = (inspection: AdminInspection) => {
    Alert.alert(
      'Eliminar Inspección',
      `¿Estás seguro de eliminar la inspección ${inspection.inspectionNumber}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.deleteInspection(inspection.id);
              setInspections(prev => prev.filter(i => i.id !== inspection.id));
              Alert.alert('Éxito', 'Inspección eliminada correctamente');
            } catch (error: any) {
              console.error('Error deleting inspection:', error);
              Alert.alert('Error', error.message || 'No se pudo eliminar la inspección');
            }
          },
        },
      ]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateFrom(null);
    setDateTo(null);
    setSortOrder('desc');
  };

  const hasActiveFilters = searchQuery.trim() !== '' || dateFrom !== null || dateTo !== null;

  const formatDateLabel = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('es-CL');
  };

  const handleInspectionPress = (inspection: AdminInspection) => {
     router.push({
        pathname: '/(admin)/inspections',
        params: { highlightId: inspection.id }
     });
  };

  return (
    <Screen style={styles.container} backgroundColor="#fff">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Inspecciones</Text>
          <Text style={styles.headerSubtitle}>{mechanicName || 'Mecánico'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.filterSearchInput}
              placeholder="Buscar por patente, marca..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sortButton, sortOrder === 'asc' && styles.sortButtonActive]}
            onPress={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          >
            <Ionicons name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={18} color={sortOrder === 'asc' ? '#FFF' : '#666'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterToggleButton, showFilters && styles.filterToggleButtonActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="options-outline" size={18} color={showFilters ? '#FFF' : '#666'} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <Text style={styles.filterLabel}>Rango de fecha:</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateFromPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#666" />
                <Text style={styles.dateButtonText}>{dateFrom ? formatDateLabel(dateFrom) : 'Desde'}</Text>
              </TouchableOpacity>
              <Text style={styles.dateSeparator}>—</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateToPicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#666" />
                <Text style={styles.dateButtonText}>{dateTo ? formatDateLabel(dateTo) : 'Hasta'}</Text>
              </TouchableOpacity>
            </View>

            {hasActiveFilters && (
              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                <Ionicons name="close-circle-outline" size={16} color="#F44336" />
                <Text style={styles.clearFiltersText}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {hasActiveFilters && (
          <Text style={styles.resultsCount}>{filteredInspections.length} resultado(s)</Text>
        )}
      </View>

      {/* Date Pickers */}
      {showDateFromPicker && (
        <DateTimePicker
          value={dateFrom || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowDateFromPicker(false);
            if (date) setDateFrom(date);
          }}
        />
      )}
      {showDateToPicker && (
        <DateTimePicker
          value={dateTo || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowDateToPicker(false);
            if (date) setDateTo(date);
          }}
        />
      )}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
          <FlatList
            data={filteredInspections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <InspectionCard 
                inspection={item} 
                onPress={() => handleInspectionPress(item)}
                onDelete={() => handleDeleteInspection(item)}
                showMechanic={false}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="clipboard-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>
                  {hasActiveFilters 
                    ? 'No se encontraron inspecciones con los filtros aplicados' 
                    : 'Este mecánico no tiene inspecciones asignadas.'}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 12, color: '#666' },
  backButton: { padding: 4 },
  // Filter Bar Styles
  filterBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterSearchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 14,
    color: '#333',
  },
  sortButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sortButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  filterToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterToggleButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filtersContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 6,
  },
  dateButtonText: {
    fontSize: 13,
    color: '#555',
  },
  dateSeparator: {
    fontSize: 14,
    color: '#999',
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  clearFiltersText: {
    fontSize: 13,
    color: '#F44336',
  },
  resultsCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    textAlign: 'right',
  },
  listContent: { padding: 16 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 12, fontSize: 16, color: '#666', textAlign: 'center' },
});
