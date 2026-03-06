import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import mechanicSedeService, { DaySchedule } from '../../services/mechanicSedeService';

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export default function MechanicMyAutoboxSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const sedeId = Number(Array.isArray(params.sedeId) ? params.sedeId[0] : params.sedeId);
  const sedeNombre = String(Array.isArray(params.sedeNombre) ? params.sedeNombre[0] : params.sedeNombre || 'Autobox');
  const sedeDireccion = String(Array.isArray(params.sedeDireccion) ? params.sedeDireccion[0] : params.sedeDireccion || '');

  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<DaySchedule[]>([]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const mechanicId = await mechanicSedeService.getCurrentMechanicId();
      const data = await mechanicSedeService.getMechanicScheduleBySede(mechanicId, sedeId);
      setSchedules(data.filter((item) => item.isActive && item.timeSlots.length > 0));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [sedeId])
  );

  const summaryItems = useMemo(() => {
    return schedules
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((item) => ({
        label: DAY_LABELS[item.dayOfWeek] || `Día ${item.dayOfWeek}`,
        value: item.timeSlots.join(', '),
      }));
  }, [schedules]);

  return (
    <Screen style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.checkWrapOuter}>
          <View style={styles.checkWrapInner}>
            <Ionicons name="checkmark" size={76} color="#2E7D32" />
          </View>
        </View>

        <Text style={styles.title}>Horario exitosamente configurado</Text>
        <Text style={styles.subtitle}>Tu disponibilidad quedó actualizada para la sede seleccionada.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{sedeNombre}</Text>
          {!!sedeDireccion && <Text style={styles.cardAddress}>{sedeDireccion}</Text>}

          {loading ? (
            <ActivityIndicator color="#FF9800" style={{ marginTop: 14 }} />
          ) : summaryItems.length > 0 ? (
            <View style={styles.scheduleList}>
              {summaryItems.map((item) => (
                <View key={item.label} style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{item.label}</Text>
                  <Text style={styles.scheduleValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No se encontraron bloques horarios activos para mostrar.</Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="IR A HORARIOS"
          onPress={() => router.replace('/(mechanic)/schedule')}
          style={styles.primaryButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  checkWrapOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#4CAF50',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  checkWrapInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#232323',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6E6E6E',
    fontSize: 14,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
  },
  cardAddress: {
    marginTop: 4,
    fontSize: 13,
    color: '#777',
  },
  scheduleList: {
    marginTop: 12,
    gap: 10,
  },
  scheduleRow: {
    borderWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 10,
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  scheduleValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 14,
    color: '#777',
  },
  footer: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    padding: 16,
  },
  primaryButton: {
    backgroundColor: '#FF9800',
  },
});
