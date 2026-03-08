import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import mechanicSedeService, { MechanicWorkingSede } from '../../services/mechanicSedeService';
import { Select } from '../../components/ui/Select';

const DAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 7, name: 'Domingo' },
];

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

const parseSedeId = (item: any): number | null => {
  const parsed = Number(item?.sedeId ?? item?.sede?.id);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function MechanicScheduleScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [workingSedes, setWorkingSedes] = useState<MechanicWorkingSede[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<number | null>(null);

  // Tracks whether the initial loadData() call has already invoked loadSedeScheduleState.
  // Without this ref the useEffect([selectedSedeId]) fires on mount (first state set by
  // loadData) AND on every subsequent user-driven sede change — causing a duplicate network
  // round-trip on the very first render.
  const initialLoadDone = useRef(false);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [schedules, setSchedules] = useState<Record<number, string[]>>({});
  const [availableSlots, setAvailableSlots] = useState<Record<number, string[]>>({});

  const initializeScheduleMap = () => {
    const map: Record<number, string[]> = {};
    DAYS.forEach((day) => {
      map[day.id] = [];
    });
    return map;
  };

  const mapFromApiSchedule = (data: any[]): Record<number, string[]> => {
    const scheduleMap = initializeScheduleMap();
    data.forEach((item: any) => {
      if (item.isActive) {
        const existing = scheduleMap[item.dayOfWeek] || [];
        scheduleMap[item.dayOfWeek] = uniqueSorted([...(existing || []), ...(item.timeSlots || [])]);
      }
    });
    return scheduleMap;
  };

  const sanitizeByAvailableSlots = (
    selectedMap: Record<number, string[]>,
    availableMap: Record<number, string[]>
  ): Record<number, string[]> => {
    const sanitized = initializeScheduleMap();
    DAYS.forEach((day) => {
      const allowed = new Set(availableMap[day.id] || []);
      sanitized[day.id] = uniqueSorted((selectedMap[day.id] || []).filter((slot) => allowed.has(slot)));
    });
    return sanitized;
  };

  const loadSedeScheduleState = async (currentMechanicId: string, sedeId: number) => {
    const [sedeSchedule, mechanicSchedule] = await Promise.all([
      mechanicSedeService.getSedeSchedule(sedeId),
      mechanicSedeService.getMechanicScheduleBySede(currentMechanicId, sedeId),
    ]);

    const availableMap = mapFromApiSchedule(sedeSchedule);
    const selectedMap = mapFromApiSchedule(mechanicSchedule);
    setAvailableSlots(availableMap);
    setSchedules(sanitizeByAvailableSlots(selectedMap, availableMap));
  };

  const loadData = async () => {
    // Reset the guard so the useEffect skip works correctly on every focus event,
    // not just the initial mount.
    initialLoadDone.current = false;
    try {
      setLoading(true);
      const currentMechanicId = await mechanicSedeService.getCurrentMechanicId();
      setMechanicId(currentMechanicId);

      const [sedes, mechanicSchedules] = await Promise.all([
        mechanicSedeService.getMyWorkingSedes(),
        mechanicSedeService.getMechanicSchedules(currentMechanicId),
      ]);

      const sedeIdsWithSchedule = new Set<number>();
      mechanicSchedules.forEach((item: any) => {
        if (!item?.isActive || !Array.isArray(item?.timeSlots) || item.timeSlots.length === 0) return;
        const sedeId = parseSedeId(item);
        if (sedeId) sedeIdsWithSchedule.add(sedeId);
      });

      const sedesMarkedActive = sedes.filter((sede) => sede.hasActiveSchedule === true);
      const filteredSedes = sedeIdsWithSchedule.size > 0
        ? sedes.filter((sede) => sedeIdsWithSchedule.has(sede.id))
        : sedesMarkedActive.length > 0
        ? sedesMarkedActive
        : sedes;

      setWorkingSedes(filteredSedes);

      if (filteredSedes.length > 0) {
        const preselectedFromRoute = Number(Array.isArray(routeParams.sedeId) ? routeParams.sedeId[0] : routeParams.sedeId);
        const nextSedeId = selectedSedeId && filteredSedes.some((s) => s.id === selectedSedeId)
          ? selectedSedeId
          : Number.isFinite(preselectedFromRoute) && filteredSedes.some((s) => s.id === preselectedFromRoute)
          ? preselectedFromRoute
          : filteredSedes[0].id;
        setSelectedSedeId(nextSedeId);
        await loadSedeScheduleState(currentMechanicId, nextSedeId);
      } else {
        setSelectedSedeId(null);
        setAvailableSlots(initializeScheduleMap());
        setSchedules(initializeScheduleMap());
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar el horario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mechanicId || !selectedSedeId) return;

    // Skip the first trigger: loadData() already called loadSedeScheduleState directly
    // and set selectedSedeId. We only want this effect to re-run on user-driven sede changes.
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      return;
    }

    loadSedeScheduleState(mechanicId, selectedSedeId).catch(() => {
      Alert.alert('Error', 'No se pudo cambiar la sede seleccionada');
    });
  }, [selectedSedeId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const currentDaySlots = uniqueSorted([
    ...(availableSlots[selectedDay] || []),
  ]);

  const toggleSlot = (time: string) => {
    const allowed = new Set(availableSlots[selectedDay] || []);
    if (!allowed.has(time)) return;

    setSchedules((prev) => {
      const currentSlots = prev[selectedDay] || [];
      const nextSlots = currentSlots.includes(time)
        ? currentSlots.filter((item) => item !== time)
        : uniqueSorted([...currentSlots, time]);

      return {
        ...prev,
        [selectedDay]: nextSlots,
      };
    });
  };

  const handleSave = async () => {
    if (!mechanicId || !selectedSedeId) return;

    try {
      setSaving(true);
      const payload = DAYS.map((day) => ({
        dayOfWeek: day.id,
        timeSlots: schedules[day.id] || [],
        isActive: (schedules[day.id] || []).length > 0,
        sedeId: selectedSedeId,
      }));

      await mechanicSedeService.saveMechanicScheduleBySede(mechanicId, selectedSedeId, payload);
      Alert.alert('Éxito', 'Horario actualizado correctamente');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar el horario');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9800" />
      </Screen>
    );
  }

  if (!selectedSedeId) {
    return (
      <Screen style={styles.emptyRoot}>
        <Text style={styles.emptyTitle}>Aún no tienes sedes seleccionadas</Text>
        <Text style={styles.emptySubtitle}>Configura tu primer Autobox para habilitar la agenda.</Text>
        <Button
          title="IR A SELECCIONAR SEDES"
          onPress={() => router.push('/(mechanic)/my-autobox')}
          style={styles.goAutoboxButton}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.sedeSection}>
        <Select
          label="Sede con horario"
          value={selectedSedeId ? String(selectedSedeId) : ''}
          onChange={(value) => setSelectedSedeId(Number(value))}
          options={workingSedes.map((sede) => ({ label: sede.nombre, value: String(sede.id) }))}
          placeholder="Seleccionar sede"
        />
      </View>

      <View style={styles.daysContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map((day) => (
            <TouchableOpacity
              key={day.id}
              style={[styles.dayButton, selectedDay === day.id && styles.selectedDayButton]}
              onPress={() => setSelectedDay(day.id)}
            >
              <Text style={[styles.dayText, selectedDay === day.id && styles.selectedDayText]}>{day.name}</Text>
              {(schedules[day.id] || []).length > 0 && <View style={styles.dot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.slotsContainer}>
        <Text style={styles.sectionTitle}>Horario para {DAYS.find((d) => d.id === selectedDay)?.name}</Text>
        <Text style={styles.subtitle}>Sede: {workingSedes.find((sede) => sede.id === selectedSedeId)?.nombre}</Text>

        <View style={styles.grid}>
          {currentDaySlots.map((time) => {
            const isSelected = (schedules[selectedDay] || []).includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[styles.slot, isSelected && styles.selectedSlot]}
                onPress={() => toggleSlot(time)}
              >
                <Text style={[styles.slotText, isSelected && styles.selectedSlotText]}>{time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {currentDaySlots.length === 0 && <Text style={styles.emptySlotsText}>No hay bloques disponibles para este día.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Guardar Horario" onPress={handleSave} loading={saving} style={styles.saveButton} />
      </View>
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
  sedeSection: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  daysContainer: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  dayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  selectedDayButton: {
    backgroundColor: '#FF9800',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  selectedDayText: {
    color: '#FFF',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
    marginTop: 4,
  },
  slotsContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slot: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  selectedSlot: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  slotText: {
    fontSize: 14,
    color: '#333',
  },
  selectedSlotText: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  emptySlotsText: {
    marginTop: 18,
    color: '#777',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  saveButton: {
    backgroundColor: '#FF9800',
  },
  emptyRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F5F5F5',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  goAutoboxButton: {
    backgroundColor: '#FF9800',
    width: '100%',
  },
});