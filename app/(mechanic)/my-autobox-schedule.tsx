import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import mechanicSedeService, { DaySchedule, MechanicWorkingSede } from '../../services/mechanicSedeService';

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

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort((a, b) => toMinutes(a) - toMinutes(b));

export default function MechanicMyAutoboxScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const sedeId = Number(Array.isArray(params.sedeId) ? params.sedeId[0] : params.sedeId);
  const sedeNombre = String(Array.isArray(params.sedeNombre) ? params.sedeNombre[0] : params.sedeNombre || 'Autobox');
  const sedeDireccion = String(Array.isArray(params.sedeDireccion) ? params.sedeDireccion[0] : params.sedeDireccion || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mechanicId, setMechanicId] = useState<string>('');

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [availableSlotsByDay, setAvailableSlotsByDay] = useState<Record<number, string[]>>({});
  const [schedulesByDay, setSchedulesByDay] = useState<Record<number, string[]>>({});

  const [otherSedeSchedules, setOtherSedeSchedules] = useState<Record<number, Record<number, string[]>>>({});

  const initializeMap = () => {
    const empty: Record<number, string[]> = {};
    DAYS.forEach((day) => {
      empty[day.id] = [];
    });
    return empty;
  };

  const mapScheduleArray = (items: DaySchedule[]) => {
    const map = initializeMap();
    items.forEach((item) => {
      if (item.isActive) {
        map[item.dayOfWeek] = uniqueSorted([...(map[item.dayOfWeek] || []), ...(item.timeSlots || [])]);
      }
    });
    return map;
  };

  const loadData = async () => {
    if (!Number.isFinite(sedeId)) {
      Alert.alert('Error', 'Sede inválida');
      router.back();
      return;
    }

    try {
      setLoading(true);
      const currentMechanicId = await mechanicSedeService.getCurrentMechanicId();
      setMechanicId(currentMechanicId);

      const [sedeSchedule, mechanicSchedule, workingSedes] = await Promise.all([
        mechanicSedeService.getSedeSchedule(sedeId),
        mechanicSedeService.getMechanicScheduleBySede(currentMechanicId, sedeId),
        mechanicSedeService.getMyWorkingSedes(),
      ]);

      setAvailableSlotsByDay(mapScheduleArray(sedeSchedule));
      setSchedulesByDay(mapScheduleArray(mechanicSchedule));

      const otherSedes = workingSedes.filter((sede) => sede.id !== sedeId);
      const otherScheduleEntries = await Promise.all(
        otherSedes.map(async (sede: MechanicWorkingSede) => {
          const schedule = await mechanicSedeService.getMechanicScheduleBySede(currentMechanicId, sede.id).catch(() => []);
          return [sede.id, mapScheduleArray(schedule)] as const;
        })
      );

      const otherMap: Record<number, Record<number, string[]>> = {};
      otherScheduleEntries.forEach(([id, scheduleMap]) => {
        otherMap[id] = scheduleMap;
      });
      setOtherSedeSchedules(otherMap);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar la configuración de horario');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [sedeId])
  );

  const currentDaySlots = useMemo(() => {
    const available = availableSlotsByDay[selectedDay] || [];
    const selected = schedulesByDay[selectedDay] || [];
    return uniqueSorted([...available, ...selected]);
  }, [availableSlotsByDay, schedulesByDay, selectedDay]);

  const validateSlotForBusinessRules = (day: number, time: string, isSelecting: boolean) => {
    if (!isSelecting) return { valid: true as const };

    const timeMinutes = toMinutes(time);
    const otherSedesWithSlots = Object.values(otherSedeSchedules)
      .map((schedule) => schedule[day] || [])
      .filter((slots) => slots.length > 0);

    if (otherSedesWithSlots.length > 1) {
      return {
        valid: false as const,
        message: 'Solo puedes tener hasta dos sedes por día.',
      };
    }

    if (otherSedesWithSlots.length > 0) {
      const otherMinutes = otherSedesWithSlots[0].map(toMinutes);
      const maxOther = Math.max(...otherMinutes);

      if (timeMinutes < maxOther + 120) {
        return {
          valid: false as const,
          message: 'Debes dejar cuatro bloques (2 horas) de separación entre sedes.',
        };
      }

      if (otherMinutes.includes(timeMinutes)) {
        return {
          valid: false as const,
          message: 'No puedes solapar horarios entre sedes.',
        };
      }
    }

    return { valid: true as const };
  };

  const toggleSlot = (time: string) => {
    setSchedulesByDay((prev) => {
      const current = prev[selectedDay] || [];
      const isSelected = current.includes(time);

      const validation = validateSlotForBusinessRules(selectedDay, time, !isSelected);
      if (!validation.valid) {
        Alert.alert('Horario no permitido', validation.message);
        return prev;
      }

      const nextDaySlots = isSelected
        ? current.filter((item) => item !== time)
        : uniqueSorted([...current, time]);

      return {
        ...prev,
        [selectedDay]: nextDaySlots,
      };
    });
  };

  const buildSchedulePayload = (): DaySchedule[] => {
    return DAYS.map((day) => ({
      dayOfWeek: day.id,
      timeSlots: schedulesByDay[day.id] || [],
      isActive: (schedulesByDay[day.id] || []).length > 0,
      sedeId,
    }));
  };

  const handleContinue = async () => {
    if (!mechanicId) return;

    const hasAtLeastOneSlot = Object.values(schedulesByDay).some((slots) => slots.length > 0);
    if (!hasAtLeastOneSlot) {
      Alert.alert('Horario vacío', 'Selecciona al menos un bloque horario para continuar.');
      return;
    }

    try {
      setSaving(true);
      await mechanicSedeService.assignSedeToMechanic(mechanicId, sedeId);
      await mechanicSedeService.saveMechanicScheduleBySede(mechanicId, sedeId, buildSchedulePayload());

      router.push({
        pathname: '/(mechanic)/my-autobox-success',
        params: {
          sedeId: String(sedeId),
          sedeNombre,
          sedeDireccion,
        },
      });
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

  return (
    <Screen style={styles.container}>
      <View style={styles.topCard}>
        <Text style={styles.title}>Seleccionar horario</Text>
        <Text style={styles.sedeName}>{sedeNombre}</Text>
        {!!sedeDireccion && <Text style={styles.sedeAddress}>{sedeDireccion}</Text>}
      </View>

      <View style={styles.daysContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map((day) => {
            const hasSlots = (schedulesByDay[day.id] || []).length > 0;
            return (
              <TouchableOpacity
                key={day.id}
                style={[styles.dayChip, selectedDay === day.id && styles.dayChipActive]}
                onPress={() => setSelectedDay(day.id)}
              >
                <Text style={[styles.dayChipText, selectedDay === day.id && styles.dayChipTextActive]}>{day.name}</Text>
                {hasSlots && <View style={styles.dayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.slotsContainer} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.sectionTitle}>Bloques disponibles</Text>
        <Text style={styles.sectionSubtitle}>Solo puedes elegir horarios de la sede seleccionada.</Text>

        <View style={styles.grid}>
          {currentDaySlots.map((time) => {
            const selected = (schedulesByDay[selectedDay] || []).includes(time);
            return (
              <TouchableOpacity
                key={time}
                style={[styles.slot, selected && styles.slotSelected]}
                onPress={() => toggleSlot(time)}
              >
                <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {currentDaySlots.length === 0 && <Text style={styles.emptyText}>No hay horarios vigentes para este día.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="CONTINUAR"
          onPress={handleContinue}
          loading={saving}
          disabled={saving}
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
  topCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  sedeName: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sedeAddress: {
    marginTop: 2,
    fontSize: 13,
    color: '#777',
  },
  daysContainer: {
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  dayChip: {
    marginHorizontal: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: '#FF9800',
  },
  dayChipText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#FFF',
  },
  dayDot: {
    marginTop: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
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
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slot: {
    width: '30%',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  slotSelected: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  slotText: {
    color: '#333',
    fontSize: 14,
  },
  slotTextSelected: {
    color: '#E65100',
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 20,
    color: '#777',
    textAlign: 'center',
  },
  footer: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    padding: 16,
  },
  saveButton: {
    backgroundColor: '#FF9800',
  },
});
