import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import adminService, { MechanicWorkingSede, MechanicSchedule } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
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

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const uniqueSorted = (slots: string[]) => Array.from(new Set(slots)).sort((a, b) => toMinutes(a) - toMinutes(b));

const emptyMap = () => {
  const map: Record<number, string[]> = {};
  DAYS.forEach((day) => {
    map[day.id] = [];
  });
  return map;
};

const mapSchedules = (data: any[]) => {
  const map = emptyMap();
  data.forEach((item: any) => {
    if (item?.isActive) {
      const day = Number(item.dayOfWeek);
      map[day] = uniqueSorted([...(map[day] || []), ...((item.timeSlots as string[]) || [])]);
    }
  });
  return map;
};

const sanitizeBySedeSlots = (
  selectedMap: Record<number, string[]>,
  sedeMap: Record<number, string[]>
) => {
  const map = emptyMap();
  DAYS.forEach((day) => {
    const allowed = new Set(sedeMap[day.id] || []);
    map[day.id] = uniqueSorted((selectedMap[day.id] || []).filter((slot) => allowed.has(slot)));
  });
  return map;
};

export default function AdminMechanicScheduleScreen() {
  const { id, name } = useLocalSearchParams();
  const mechanicId = Array.isArray(id) ? id[0] : id;
  const mechanicName = Array.isArray(name) ? name[0] : name;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [allSchedules, setAllSchedules] = useState<MechanicSchedule[]>([]);

  const [availableSedes, setAvailableSedes] = useState<MechanicWorkingSede[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<number | null>(null);

  const [currentSchedulesMap, setCurrentSchedulesMap] = useState<Record<number, string[]>>(emptyMap());
  const [sedeSlotsMap, setSedeSlotsMap] = useState<Record<number, string[]>>(emptyMap());

  const getSedeIdFromSchedule = (item: any) => Number(item?.sedeId ?? item?.sede?.id);

  const hydrateSedesFromSchedules = (schedules: MechanicSchedule[], existing: MechanicWorkingSede[]) => {
    const byId = new Map<number, MechanicWorkingSede>();
    existing.forEach((sede) => byId.set(sede.id, sede));

    schedules.forEach((item: any) => {
      const sedeId = getSedeIdFromSchedule(item);
      if (!Number.isFinite(sedeId)) return;
      if (!byId.has(sedeId)) {
        byId.set(sedeId, {
          id: sedeId,
          nombre: item?.sede?.nombre || `Autobox ${sedeId}`,
          direccion: item?.sede?.direccion,
        });
      }
    });

    return Array.from(byId.values());
  };

  const hasAnyScheduleInSede = (sedeId: number) => {
    return allSchedules.some((item: any) => {
      const itemSedeId = getSedeIdFromSchedule(item);
      return itemSedeId === sedeId && item.isActive && Array.isArray(item.timeSlots) && item.timeSlots.length > 0;
    });
  };

  const loadSedeView = async (sedeId: number, sourceSchedules?: MechanicSchedule[]) => {
    const source = sourceSchedules || allSchedules;

    const mechanicForSede = source.filter((item: any) => {
      const itemSedeId = getSedeIdFromSchedule(item);
      return itemSedeId === sedeId;
    });

    const mechanicMap = mapSchedules(mechanicForSede);

    const sedeScheduleRaw = await adminService.getSedeSchedule(sedeId).catch(() => []);
    const sedeMap = mapSchedules(Array.isArray(sedeScheduleRaw) ? sedeScheduleRaw : []);

    setSedeSlotsMap(sedeMap);
    setCurrentSchedulesMap(sanitizeBySedeSlots(mechanicMap, sedeMap));
  };

  const init = async () => {
    if (!mechanicId) return;

    try {
      setLoading(true);

      const [workingSedes, mechanicSchedules] = await Promise.all([
        adminService.getMechanicWorkingSedes(mechanicId).catch(() => []),
        adminService.getMechanicSchedule(mechanicId).catch(() => []),
      ]);

      const normalizedSchedules = Array.isArray(mechanicSchedules) ? mechanicSchedules : [];
      setAllSchedules(normalizedSchedules);

      const resolvedSedes = hydrateSedesFromSchedules(normalizedSchedules, workingSedes || []);
      const sedesWithSchedule = resolvedSedes.filter((sede) => hasAnyScheduleInSede(sede.id));
      setAvailableSedes(sedesWithSchedule);

      if (sedesWithSchedule.length === 0) {
        setSelectedSedeId(null);
        setCurrentSchedulesMap(emptyMap());
        setSedeSlotsMap(emptyMap());
        return;
      }

      const nextSedeId = selectedSedeId && sedesWithSchedule.some((item) => item.id === selectedSedeId)
        ? selectedSedeId
        : sedesWithSchedule[0].id;

      setSelectedSedeId(nextSedeId);
      await loadSedeView(nextSedeId, normalizedSchedules);
    } catch (error) {
      console.error('Error loading mechanic schedule:', error);
      Alert.alert('Error', 'No se pudo cargar el horario del mecánico.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      init();
    }, [mechanicId])
  );

  const displayedSlots = useMemo(() => {
    return uniqueSorted([...(sedeSlotsMap[selectedDay] || [])]);
  }, [selectedDay, sedeSlotsMap, currentSchedulesMap]);

  const handleSedeChange = async (value: string) => {
    const sedeId = Number(value);
    if (!Number.isFinite(sedeId)) return;
    setSelectedSedeId(sedeId);
    await loadSedeView(sedeId);
  };

  const toggleSlot = (time: string) => {
    const allowed = new Set(sedeSlotsMap[selectedDay] || []);
    if (!allowed.has(time)) return;

    setCurrentSchedulesMap((prev) => {
      const current = prev[selectedDay] || [];
      const next = current.includes(time)
        ? current.filter((item) => item !== time)
        : uniqueSorted([...current, time]);

      return {
        ...prev,
        [selectedDay]: next,
      };
    });
  };

  const handleSave = async () => {
    if (!mechanicId || !selectedSedeId) return;

    try {
      setSaving(true);
      const payload = DAYS.map((day) => ({
        dayOfWeek: day.id,
        timeSlots: currentSchedulesMap[day.id] || [],
        isActive: (currentSchedulesMap[day.id] || []).length > 0,
        sedeId: selectedSedeId,
      }));

      await adminService.updateMechanicSchedule(mechanicId, { sedeId: selectedSedeId, schedules: payload });
      Alert.alert('Éxito', 'Horario actualizado correctamente.');
      await init();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar el horario');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Horario de {mechanicName || 'Mecánico'}</Text>
      </View>

      <View style={styles.selectorWrap}>
        <Select
          label="Sede con horario"
          value={selectedSedeId ? String(selectedSedeId) : ''}
          onChange={handleSedeChange}
          options={availableSedes.map((sede) => ({ label: sede.nombre, value: String(sede.id) }))}
          placeholder="Selecciona una sede"
          disabled={availableSedes.length === 0}
        />
        {availableSedes.length === 0 && (
          <Text style={styles.selectorHint}>Este mecánico no tiene sedes con horario configurado.</Text>
        )}
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
              {(currentSchedulesMap[day.id] || []).length > 0 && <View style={styles.dot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.slotsContainer}>
        <Text style={styles.sectionTitle}>Bloques de horario</Text>
        <Text style={styles.subtitle}>Solo puedes seleccionar bloques configurados por la sede.</Text>

        <View style={styles.grid}>
          {displayedSlots.map((time) => {
            const isSelected = (currentSchedulesMap[selectedDay] || []).includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[styles.slot, isSelected && styles.selectedSlot]}
                onPress={() => toggleSlot(time)}
                disabled={!selectedSedeId}
              >
                <Text style={[styles.slotText, isSelected && styles.selectedSlotText]}>{time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {displayedSlots.length === 0 && (
          <Text style={styles.emptySlotsText}>La sede no tiene bloques configurados para este día.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Guardar Cambios"
          onPress={handleSave}
          loading={saving}
          disabled={!selectedSedeId || saving}
          style={styles.saveButton}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  selectorWrap: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  selectorHint: {
    fontSize: 12,
    color: '#777',
    marginTop: -8,
    marginBottom: 8,
  },
  daysContainer: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
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
    backgroundColor: '#007bff',
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
    backgroundColor: '#28a745',
    marginTop: 4,
  },
  slotsContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  emptySlotsText: {
    color: '#777',
    textAlign: 'center',
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
    backgroundColor: '#e7f1ff',
    borderColor: '#007bff',
  },
  slotText: {
    fontSize: 14,
    color: '#333',
  },
  selectedSlotText: {
    color: '#007bff',
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  saveButton: {
    backgroundColor: '#007bff',
  },
});
