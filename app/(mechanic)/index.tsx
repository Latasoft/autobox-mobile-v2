import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../../services/apiService';
import authService from '../../services/authService';
import { Screen } from '../../components/ui/Screen';
import { InspectionListItem } from '../../components/mechanic/InspectionListItem';
import { Inspection } from '../../types';
import DateTimePicker from '@react-native-community/datetimepicker';
import { isInsideReassignmentWindow } from '../../services/reassignmentService';

export default function MechanicInspectionsScreen() {
  const router = useRouter();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mechanicId, setMechanicId] = useState<string | null>(null);

  // Sort & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const loadMechanicProfile = async () => {
    try {
      const user = await authService.getUser();
      if (!user) {
        Alert.alert('Error', 'Debes iniciar sesión');
        return null;
      }

      // Buscar el perfil de mecánico asociado al usuario
      // Nota: Esto asume que existe un endpoint o forma de obtener el ID del mecánico
      // Si no, habría que ajustar la lógica según el backend
      // const mechanicData = await apiService.get(`/mechanics/by-user/${user.id}`);
      
      // if (mechanicData) {
      //   setMechanicId(mechanicData.id);
      //   return mechanicData.id;
      // } else {
      
      // Para simplificar, asumimos que el ID del usuario es el ID del mecánico
      // ya que en la tabla de usuarios el rol es 'Mecánico'
      setMechanicId(user.id);
      return user.id;

      //   Alert.alert(
      //     'No eres mecánico',
      //     'No se encontró un perfil de mecánico asociado a tu cuenta.',
      //     [{ text: 'OK' }]
      //   );
      //   return null;
      // }
    } catch (error: any) {
      console.error('Error al cargar perfil de mecánico:', error);
      // Alert.alert('Error', error.message || 'No se pudo cargar el perfil');
      return null;
    }
  };

  const loadInspections = async () => {
    try {
      setLoading(true);
      let currentMechanicId = mechanicId;
      
      if (!currentMechanicId) {
        currentMechanicId = await loadMechanicProfile();
      }

      if (currentMechanicId) {
        const data = await apiService.get(`/inspections/mechanic/${currentMechanicId}`);
        setInspections(data || []);
      }
    } catch (error: any) {
      console.error('Error loading inspections:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar las inspecciones');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInspections();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInspections();
    setRefreshing(false);
  };

  const handleInspectionPress = (inspection: Inspection) => {
    router.push({
      pathname: '/(mechanic)/inspection-detail',
      params: { id: inspection.id }
    });
  };

  // Filtered and sorted inspections
  const filteredInspections = useMemo(() => {
    let result = [...inspections];

    // Text search: by vehicle patent, brand, model
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => {
        const vehicle = i.vehiculo || i.publicacion?.vehiculo;
        return (
          (vehicle?.patente && vehicle.patente.toLowerCase().includes(q)) ||
          (vehicle?.marca && vehicle.marca.toLowerCase().includes(q)) ||
          (vehicle?.modelo && vehicle.modelo.toLowerCase().includes(q))
        );
      });
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter(i => {
        const d = i.fechaProgramada ? new Date(i.fechaProgramada) : null;
        return d ? d >= from : false;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(i => {
        const d = i.fechaProgramada ? new Date(i.fechaProgramada) : null;
        return d ? d <= to : false;
      });
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = a.fechaProgramada ? new Date(a.fechaProgramada).getTime() : 0;
      const dateB = b.fechaProgramada ? new Date(b.fechaProgramada).getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [inspections, searchQuery, sortOrder, dateFrom, dateTo]);

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

  return (
    <Screen style={styles.container}>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
        </View>
      ) : (
        <FlatList
          data={filteredInspections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InspectionListItem
              inspection={item}
              onPress={() => handleInspectionPress(item)}
              canRequestReassign={isInsideReassignmentWindow(item)}
              onRequestReassign={() => {
                router.push({
                  pathname: '/(mechanic)/inspection-detail',
                  params: { id: item.id, requestReassign: '1' }
                });
              }}
              onViewResult={() => {
                router.push({
                  pathname: '/user-inspection-detail',
                  params: { id: item.id }
                });
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF9800']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {hasActiveFilters ? 'No se encontraron inspecciones con los filtros aplicados' : 'No tienes inspecciones asignadas'}
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
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
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
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
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
