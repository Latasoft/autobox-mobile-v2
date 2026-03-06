import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import adminService, { MechanicWorkingSede } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { useFocusEffect } from '@react-navigation/native';

const DAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 7, name: 'Domingo' },
];

const uniqueSorted = (slots: string[]) => Array.from(new Set(slots)).sort();

export default function AdminMechanicScheduleScreen() {
  const router = useRouter();
  const { id, name, viewOnly } = useLocalSearchParams();
  const mechanicId = Array.isArray(id) ? id[0] : id;
  const mechanicName = Array.isArray(name) ? name[0] : name;
  const isViewOnly = String(Array.isArray(viewOnly) ? viewOnly[0] : viewOnly || '').toLowerCase() === 'true';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1);

  const [workingSedes, setWorkingSedes] = useState<MechanicWorkingSede[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<number | null>(null);

  const [schedules, setSchedules] = useState<Record<number, string[]>>({});
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  const initializeMap = () => {
    const empty: Record<number, string[]> = {};
    DAYS.forEach((day) => {
      empty[day.id] = [];
    });
    return empty;
  };

  const mapSchedules = (data: any[]) => {
    const map = initializeMap();

    data.forEach((item: any) => {
      if (item.isActive) {
        const existing = map[item.dayOfWeek] || [];
        map[item.dayOfWeek] = uniqueSorted([...(existing || []), ...(item.timeSlots || [])]);
      }
    });

    return map;
  };

  const loadScheduleForSede = async (sedeId: number) => {
    if (!mechanicId) return;

    const [mechanicSchedule, sedeSchedule] = await Promise.all([
      adminService.getMechanicScheduleBySede(mechanicId, sedeId).catch(() => []),
      adminService.getSedeSchedule(sedeId).catch(() => []),
    ]);

    const map = mapSchedules(mechanicSchedule as any[]);
    setSchedules(map);

    const sedeMap = mapSchedules(sedeSchedule as any[]);
    const daySlots = uniqueSorted([...(sedeMap[selectedDay] || []), ...(map[selectedDay] || [])]);
    setTimeSlots(daySlots);
  };

  const init = async () => {
    if (!mechanicId) return;

    try {
      setLoading(true);
      const sedes = await adminService.getMechanicWorkingSedes(mechanicId);
      setWorkingSedes(sedes || []);

      if (sedes.length > 0) {
        const nextSede = selectedSedeId && sedes.some((item) => item.id === selectedSedeId)
          ? selectedSedeId
          : sedes[0].id;
        setSelectedSedeId(nextSede);
        await loadScheduleForSede(nextSede);
      } else {
        setSelectedSedeId(null);
        const fallback = await adminService.getMechanicSchedule(mechanicId).catch(() => []);
        const map = mapSchedules(fallback as any[]);
        setSchedules(map);
        setTimeSlots(map[selectedDay] || []);
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      Alert.alert('Error', 'No se pudo cargar el horario');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      init();
    }, [mechanicId])
  );

  const onChangeDay = (dayId: number) => {
    setSelectedDay(dayId);

    const currentDaySlots = schedules[dayId] || [];
    setTimeSlots(currentDaySlots);
  };

  const onChangeSede = async (sedeId: number) => {
    setSelectedSedeId(sedeId);
    await loadScheduleForSede(sedeId);
  };

  const toggleSlot = (time: string) => {
    if (isViewOnly) return;

    setSchedules((prev) => {
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
    if (!mechanicId) return;

    try {
      setSaving(true);

      const scheduleArray = Object.entries(schedules).map(([day, slots]) => ({
        dayOfWeek: parseInt(day, 10),
        timeSlots: slots,
        isActive: slots.length > 0,
      }));

      await adminService.updateMechanicSchedule(mechanicId, { schedules: scheduleArray });
      Alert.alert('Éxito', 'Horario actualizado correctamente', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar el horario');
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
        <Text style={styles.title}>{isViewOnly ? 'Horario de' : 'Editar horario de'} {mechanicName || 'Mecánico'}</Text>
      </View>

      {workingSedes.length > 0 && (
        <View style={styles.sedesContainer}>
          <Text style={styles.sedesLabel}>Sedes con horario</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {workingSedes.map((sede) => (
              <TouchableOpacity
                key={sede.id}
                style={[styles.sedeChip, selectedSedeId === sede.id && styles.sedeChipActive]}
                onPress={() => onChangeSede(sede.id)}
              >
                <Text style={[styles.sedeChipText, selectedSedeId === sede.id && styles.sedeChipTextActive]}>{sede.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.daysContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map((day) => (
            <TouchableOpacity
              key={day.id}
              style={[styles.dayButton, selectedDay === day.id && styles.selectedDayButton]}
              onPress={() => onChangeDay(day.id)}
            >
              <Text style={[styles.dayText, selectedDay === day.id && styles.selectedDayText]}>{day.name}</Text>
              {(schedules[day.id] || []).length > 0 && <View style={styles.dot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.slotsContainer}>
        <Text style={styles.sectionTitle}>{DAYS.find((d) => d.id === selectedDay)?.name}</Text>
        <Text style={styles.subtitle}>{isViewOnly ? 'Horario configurado' : 'Selecciona las horas disponibles'}</Text>

        <View style={styles.grid}>
          {timeSlots.map((time) => {
            const isSelected = (schedules[selectedDay] || []).includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[styles.slot, isSelected && styles.selectedSlot]}
                onPress={() => toggleSlot(time)}
                disabled={isViewOnly}
              >
                <Text style={[styles.slotText, isSelected && styles.selectedSlotText]}>{time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {!isViewOnly && (
        <View style={styles.footer}>
          <Button title="Guardar Cambios" onPress={handleSave} loading={saving} style={styles.saveButton} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sedesContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  sedesLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  sedeChip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  sedeChipActive: {
    borderColor: '#007bff',
    backgroundColor: '#E3F2FD',
  },
  sedeChipText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
  },
  sedeChipTextActive: {
    color: '#0D47A1',
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
    backgroundColor: '#e7f1ff',
    borderColor: '#007bff',
  },
  slotText: {
    fontSize: 14,
    color: '#333',
  },
  selectedSlotText: {
    color: '#007bff',
    fontWeight: 'bold',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  saveButton: {
    backgroundColor: '#007bff',
  },
});
