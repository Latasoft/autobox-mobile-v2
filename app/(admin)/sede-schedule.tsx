import React, { useState, useCallback, useEffect } from 'react';
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
import adminService, { Sede } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const DAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 7, name: 'Domingo' }
];

export default function AdminSedeScheduleScreen() {
  const router = useRouter();
  const { sedeId } = useLocalSearchParams<{ sedeId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [schedules, setSchedules] = useState<Record<number, string[]>>({});
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<string>('');

  // Initialize empty schedule
  const initializeSchedule = () => {
    const initialSchedule: Record<number, string[]> = {};
    DAYS.forEach(day => {
      initialSchedule[day.id] = [];
    });
    setSchedules(initialSchedule);
  };

  const loadTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    setTimeSlots(slots);
  };

  const loadSedes = useCallback(async () => {
    try {
      const data = await adminService.getSedes();
      setSedes(data);
      if (data.length > 0 && !selectedSedeId) {
        const hasRouteSede = sedeId ? data.some((item) => String(item.id) === String(sedeId)) : false;
        if (hasRouteSede) {
          setSelectedSedeId(String(sedeId));
        } else {
          setSelectedSedeId(String(data[0].id));
        }
      }
    } catch (error) {
      console.error('Error loading sedes:', error);
      Alert.alert('Error', 'No se pudieron cargar las sedes');
    }
  }, [selectedSedeId, sedeId]);

  const loadSchedule = useCallback(async () => {
    if (!selectedSedeId) return;
    try {
      const data = await adminService.getSedeSchedule(Number(selectedSedeId));
      const scheduleMap: Record<number, string[]> = {};

      DAYS.forEach(day => {
        scheduleMap[day.id] = [];
      });

      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if (item.isActive) {
            const existing = scheduleMap[item.dayOfWeek] || [];
            scheduleMap[item.dayOfWeek] = [...existing, ...(item.timeSlots || [])];
          }
        });
      }

      setSchedules(scheduleMap);
    } catch (error) {
      console.error('Error loading schedule:', error);
      Alert.alert('Error', 'No se pudo cargar el horario');
    }
  }, [selectedSedeId]);

  const init = useCallback(async () => {
    setLoading(true);
    initializeSchedule();
    loadTimeSlots();
    await loadSedes();
    setLoading(false);
  }, [loadSedes]);

  useFocusEffect(
    useCallback(() => {
      init();
    }, [init])
  );

  // Load schedule whenever the selected sede changes.
  // useEffect (not useFocusEffect) is required here because useFocusEffect only
  // re-runs on screen focus, not when React state changes. Since selectedSedeId
  // is set asynchronously inside loadSedes(), a plain useEffect correctly reacts
  // to that state update and triggers the schedule fetch.
  useEffect(() => {
    if (selectedSedeId) {
      loadSchedule();
    }
  }, [selectedSedeId, loadSchedule]);

  const handleSedeChange = (value: string) => {
    setSelectedSedeId(value);
    initializeSchedule();
  };

  const toggleSlot = (time: string) => {
    setSchedules(prev => {
      const currentSlots = prev[selectedDay] || [];
      const newSlots = currentSlots.includes(time)
        ? currentSlots.filter(t => t !== time)
        : [...currentSlots, time].sort();

      return {
        ...prev,
        [selectedDay]: newSlots
      };
    });
  };

  const handleRepeatSchedule = () => {
    const currentDaySchedule = schedules[selectedDay] || [];
    const currentDayName = DAYS.find(d => d.id === selectedDay)?.name;

    Alert.alert(
      'Repetir Horario',
      `¿Estás seguro de que quieres copiar el horario del ${currentDayName} a todos los demás días?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Copiar',
          onPress: () => {
            setSchedules(prev => {
              const newSchedules: Record<number, string[]> = {};
              DAYS.forEach(day => {
                newSchedules[day.id] = [...currentDaySchedule];
              });
              return newSchedules;
            });
            Alert.alert('Éxito', 'Horario copiado a todos los días');
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    if (!selectedSedeId) {
      Alert.alert('Error', 'Debes seleccionar una sede primero');
      return;
    }
    try {
      setSaving(true);

      const scheduleArray = Object.entries(schedules).map(([day, slots]) => ({
        dayOfWeek: parseInt(day),
        timeSlots: slots,
        isActive: slots.length > 0
      }));

      await adminService.updateSedeSchedule(Number(selectedSedeId), { schedules: scheduleArray });
      Alert.alert('Éxito', 'Horario actualizado correctamente', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Error saving schedule:', error);
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

  if (sedes.length === 0) {
    return (
      <Screen style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Horario de Atención</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="business-outline" size={48} color="#999" />
          <Text style={styles.emptyText}>No hay sedes registradas</Text>
          <Text style={styles.emptySubtext}>Crea una sede primero para gestionar sus horarios</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Horario de Atención</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.sedeSelector}>
        <Select
          label="Sede"
          value={selectedSedeId}
          onChange={handleSedeChange}
          options={sedes.map(s => ({ label: s.nombre, value: String(s.id) }))}
          placeholder="Selecciona una sede"
        />
      </View>

      <View style={styles.daysContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map(day => (
            <TouchableOpacity
              key={day.id}
              style={[
                styles.dayButton,
                selectedDay === day.id && styles.selectedDayButton
              ]}
              onPress={() => setSelectedDay(day.id)}
            >
              <Text style={[
                styles.dayText,
                selectedDay === day.id && styles.selectedDayText
              ]}>
                {day.name}
              </Text>
              {schedules[day.id]?.length > 0 && (
                <View style={styles.dot} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.slotsContainer}>
        <Text style={styles.sectionTitle}>
          {DAYS.find(d => d.id === selectedDay)?.name}
        </Text>
        <Text style={styles.subtitle}>Selecciona las horas disponibles</Text>

        <View style={styles.grid}>
          {timeSlots.map(time => {
            const isSelected = schedules[selectedDay]?.includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[
                  styles.slot,
                  isSelected && styles.selectedSlot
                ]}
                onPress={() => toggleSlot(time)}
              >
                <Text style={[
                  styles.slotText,
                  isSelected && styles.selectedSlotText
                ]}>
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Repetir en todos los días"
          onPress={handleRepeatSchedule}
          variant="outline"
          style={styles.repeatButton}
        />
        <Button
          title="Guardar Cambios"
          onPress={handleSave}
          loading={saving}
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
  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  sedeSelector: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
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
    gap: 12,
  },
  repeatButton: {
    marginBottom: 0,
  },
  saveButton: {
    backgroundColor: '#007bff',
  },
});