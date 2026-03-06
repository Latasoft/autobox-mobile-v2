import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import mechanicSedeService, { MechanicRatingItem } from '../../services/mechanicSedeService';

type SortMode = 'desc' | 'asc' | 'fecha';

export default function MechanicRatingsScreen() {
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<MechanicRatingItem[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('fecha');
  const [selectedSede, setSelectedSede] = useState<string>('all');

  const loadRatings = async () => {
    try {
      setLoading(true);
      const data = await mechanicSedeService.getMyRatings();
      setRatings(data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRatings();
    }, [])
  );

  const sedeOptions = useMemo(() => {
    const map = new Map<string, string>();
    ratings.forEach((item) => {
      if (item.sedeId) {
        map.set(String(item.sedeId), item.sedeNombre || `Autobox ${item.sedeId}`);
      }
    });

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [ratings]);

  const filteredRatings = useMemo(() => {
    let result = [...ratings];

    if (selectedSede !== 'all') {
      result = result.filter((item) => String(item.sedeId || '') === selectedSede);
    }

    result.sort((a, b) => {
      if (sortMode === 'fecha') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === 'asc') {
        return a.rating - b.rating;
      }
      return b.rating - a.rating;
    });

    return result;
  }, [ratings, sortMode, selectedSede]);

  const globalAverage = useMemo(() => {
    if (ratings.length === 0) return 0;
    const total = ratings.reduce((acc, item) => acc + item.rating, 0);
    return total / ratings.length;
  }, [ratings]);

  return (
    <Screen style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Mis calificaciones</Text>
        <View style={styles.averageRow}>
          <Ionicons name="star" size={24} color="#FFB300" />
          <Text style={styles.averageValue}>{globalAverage.toFixed(1)}</Text>
          <Text style={styles.averageMeta}>({ratings.length} reseñas)</Text>
        </View>
      </View>

      <View style={styles.filtersWrap}>
        <Text style={styles.filterTitle}>Orden</Text>
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, sortMode === 'fecha' && styles.chipActive]}
            onPress={() => setSortMode('fecha')}
          >
            <Text style={[styles.chipText, sortMode === 'fecha' && styles.chipTextActive]}>Fecha</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, sortMode === 'asc' && styles.chipActive]}
            onPress={() => setSortMode('asc')}
          >
            <Text style={[styles.chipText, sortMode === 'asc' && styles.chipTextActive]}>Ascendente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, sortMode === 'desc' && styles.chipActive]}
            onPress={() => setSortMode('desc')}
          >
            <Text style={[styles.chipText, sortMode === 'desc' && styles.chipTextActive]}>Descendente</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.filterTitle, { marginTop: 10 }]}>Sede</Text>
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, selectedSede === 'all' && styles.chipActive]}
            onPress={() => setSelectedSede('all')}
          >
            <Text style={[styles.chipText, selectedSede === 'all' && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>
          {sedeOptions.map((sede) => (
            <TouchableOpacity
              key={sede.value}
              style={[styles.chip, selectedSede === sede.value && styles.chipActive]}
              onPress={() => setSelectedSede(sede.value)}
            >
              <Text style={[styles.chipText, selectedSede === sede.value && styles.chipTextActive]}>{sede.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
        </View>
      ) : (
        <FlatList
          data={filteredRatings}
          keyExtractor={(item) => `${item.inspectionId}-${item.createdAt}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.ratingCard}>
              <View style={styles.ratingCardTop}>
                <Text style={styles.ratingCardTitle}>{item.sedeNombre || 'Sede sin detalle'}</Text>
                <View style={styles.inlineRating}>
                  <Ionicons name="star" size={14} color="#FFB300" />
                  <Text style={styles.inlineRatingText}>{item.rating.toFixed(1)}</Text>
                </View>
              </View>
              <Text style={styles.ratingMeta}>Fecha: {new Date(item.createdAt).toLocaleDateString('es-CL')}</Text>
              {!!item.vehiclePatent && <Text style={styles.ratingMeta}>Patente: {item.vehiclePatent}</Text>}
              {!!item.comment && <Text style={styles.comment}>{item.comment}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay calificaciones para los filtros aplicados.</Text>}
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
  headerCard: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  averageRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  averageValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  averageMeta: {
    fontSize: 13,
    color: '#777',
  },
  filtersWrap: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  filterTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  chipText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#E65100',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  ratingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 12,
  },
  ratingCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#232323',
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineRatingText: {
    fontWeight: '700',
    color: '#333',
  },
  ratingMeta: {
    marginTop: 6,
    color: '#666',
    fontSize: 12,
  },
  comment: {
    marginTop: 10,
    color: '#444',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#777',
  },
});
