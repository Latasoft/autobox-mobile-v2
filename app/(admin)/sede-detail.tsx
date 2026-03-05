import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import adminService, { Sede } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function SedeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [sede, setSede] = useState<Sede | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [activo, setActivo] = useState(true);

  const isSedeActive = (value?: boolean | number) => {
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  };

  const loadSede = useCallback(async () => {
    if (!id) {
      setLoading(false);
      Alert.alert('Error', 'No se encontro el ID de la sede');
      router.back();
      return;
    }

    try {
      setLoading(true);
      const sedeId = Number(id);
      const data = Number.isNaN(sedeId)
        ? null
        : await adminService.getSedeById(sedeId).catch(async () => {
            const all = await adminService.getSedes();
            return all.find((item) => item.id === sedeId) || null;
          });

      if (!data) {
        Alert.alert('Error', 'No se pudo cargar la sede');
        router.back();
        return;
      }

      setSede(data);
      setNombre(data.nombre || '');
      setDireccion(data.direccion || '');
      setActivo(isSedeActive(data.activo));
    } catch (error) {
      console.error('Error loading sede:', error);
      Alert.alert('Error', 'No se pudo cargar la sede');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadSede();
  }, [loadSede]);

  const handleSave = async () => {
    if (!sede) return;

    const nombreTrim = nombre.trim();
    const direccionTrim = direccion.trim();

    if (!nombreTrim || !direccionTrim || typeof activo !== 'boolean') {
      Alert.alert('Campos requeridos', 'Debes completar todos los campos de la sede');
      return;
    }

    try {
      setSaving(true);
      await adminService.updateSede(sede.id, {
        nombre: nombreTrim,
        direccion: direccionTrim,
        activo,
      });
      Alert.alert('Exito', 'Sede actualizada correctamente');
      await loadSede();
    } catch (error: any) {
      console.error('Error updating sede:', error);
      Alert.alert('Error', error?.message || 'No se pudo actualizar la sede');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!sede) return;

    Alert.alert(
      'Eliminar sede',
      `¿Seguro que deseas eliminar de forma definitiva la sede ${sede.nombre}? Esta accion no se puede deshacer y borrara sus datos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await adminService.deleteSede(sede.id);
              Alert.alert('Exito', 'Sede eliminada correctamente', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error: any) {
              console.error('Error deleting sede:', error);
              Alert.alert('Error', error?.message || 'No se pudo eliminar la sede');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async () => {
    if (!sede) return;

    const nextActive = !activo;
    const actionLabel = nextActive ? 'activar' : 'desactivar';

    Alert.alert(
      `${nextActive ? 'Activar' : 'Desactivar'} sede`,
      `¿Seguro que deseas ${actionLabel} la sede ${sede.nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextActive ? 'Activar' : 'Desactivar',
          onPress: async () => {
            try {
              setSaving(true);
              await adminService.updateSede(sede.id, { activo: nextActive });
              Alert.alert('Exito', `Sede ${nextActive ? 'activada' : 'desactivada'} correctamente`);
              await loadSede();
            } catch (error: any) {
              console.error('Error toggling sede status:', error);
              Alert.alert('Error', error?.message || `No se pudo ${actionLabel} la sede`);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleGoToSchedule = () => {
    if (!sede) return;

    router.push({
      pathname: '/(admin)/sede-schedule',
      params: {
        sedeId: String(sede.id),
      },
    });
  };

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator size="large" color="#007bff" />
      </Screen>
    );
  }

  if (!sede) return null;

  return (
    <Screen style={styles.container} backgroundColor="#F5F5F5">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle de Sede</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.nameRow}>
            <View style={[styles.statusDot, activo ? styles.dotActive : styles.dotInactive]} />
            <Text style={styles.sectionTitle}>{nombre || 'Datos de la sede'}</Text>
          </View>

          <Input
            label="ID"
            value={String(sede.id)}
            editable={false}
          />

          <Input
            label="Nombre"
            value={nombre}
            onChangeText={setNombre}
            editable={!saving}
            placeholder="Nombre de la sede"
          />

          <Input
            label="Direccion"
            value={direccion}
            onChangeText={setDireccion}
            editable={!saving}
            placeholder="Direccion de la sede"
          />

          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Estado</Text>
            <Text style={[styles.stateValue, activo ? styles.stateActive : styles.stateInactive]}>
              {activo ? 'Activa' : 'Desactivada'}
            </Text>
          </View>
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          <Button
            title={saving ? 'Actualizando...' : 'Actualizar Sede'}
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.actionSpacing}
          />

          <Button
            title={activo ? 'Desactivar Sede' : 'Activar Sede'}
            onPress={handleToggleActive}
            style={[styles.actionSpacing, styles.orangeButton]}
            textStyle={styles.orangeButtonText}
            disabled={saving}
          />

          <Button
            title="Ver Horario Sede"
            onPress={handleGoToSchedule}
            variant="secondary"
            style={styles.actionSpacing}
            disabled={saving}
          />

          <Button
            title="Eliminar Sede"
            onPress={handleDelete}
            variant="danger"
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
  },
  dotActive: {
    backgroundColor: '#22C55E',
  },
  dotInactive: {
    backgroundColor: '#F59E0B',
  },
  stateRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stateLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  stateValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  stateActive: {
    color: '#22C55E',
  },
  stateInactive: {
    color: '#F59E0B',
  },
  actionSpacing: {
    marginBottom: 12,
  },
  orangeButton: {
    backgroundColor: '#F59E0B',
  },
  orangeButtonText: {
    color: '#FFF',
  },
});
