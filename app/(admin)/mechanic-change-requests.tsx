import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import adminService, { Sede } from '../../services/adminService';
import reassignmentService, {
  isRequestExpired,
  ReassignmentRequest,
} from '../../services/reassignmentService';
import apiService from '../../services/apiService';

export default function MechanicChangeRequestsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<ReassignmentRequest[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'>('all');
  const [selectedSede, setSelectedSede] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'status' | 'sede' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRequest, setSelectedRequest] = useState<ReassignmentRequest | null>(null);
  // Mechanic picker (required when accepting: backend needs targetMechanicId)
  const [showMechanicPicker, setShowMechanicPicker] = useState(false);
  const [pendingAcceptRequest, setPendingAcceptRequest] = useState<ReassignmentRequest | null>(null);
  const [availableMechanics, setAvailableMechanics] = useState<any[]>([]);
  const [loadingMechanics, setLoadingMechanics] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestData, sedeData] = await Promise.all([
        reassignmentService.getRequests(),
        adminService.getSedes().catch(() => []),
      ]);
      setRequests(requestData);
      setSedes(sedeData);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredRequests = useMemo(() => {
    let result = [...requests].map((item) => {
      if (item.status === 'PENDING' && isRequestExpired(item)) {
        return { ...item, status: 'EXPIRED' as const };
      }
      return item;
    });

    if (selectedStatus !== 'all') {
      result = result.filter((item) => item.status === selectedStatus);
    }

    if (selectedSede !== 'all') {
      result = result.filter((item) => String(item.sedeId || '') === selectedSede);
    }

    result.sort((a, b) => {
      if (sortBy === 'status') {
        const cmp = a.status.localeCompare(b.status);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (sortBy === 'sede') {
        const cmp = Number(a.sedeId || 0) - Number(b.sedeId || 0);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [requests, selectedStatus, selectedSede, sortBy, sortOrder]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: ReassignmentRequest['status']) => {
    switch (status) {
      case 'APPROVED':
        return '#4CAF50';
      case 'REJECTED':
        return '#F44336';
      case 'EXPIRED':
        return '#9E9E9E';
      default:
        return '#FFC107';
    }
  };

  const getSedeName = (sedeId?: number) => {
    if (!sedeId) return 'Sin sede';
    const found = sedes.find((item) => item.id === sedeId);
    return found?.nombre || `Sede ${sedeId}`;
  };

  const resolveRequest = async (request: ReassignmentRequest, accept: boolean) => {
    if (request.status !== 'PENDING') {
      Alert.alert('Solicitud cerrada', 'Esta solicitud ya fue procesada.');
      return;
    }

    if (isRequestExpired(request)) {
      Alert.alert('Solicitud vencida', 'Esta solicitud superó el tiempo máximo de 5 minutos.');
      await loadData();
      return;
    }

    if (!accept) {
      // Reject: no mechanic needed, resolve directly
      try {
        await reassignmentService.resolveRequest(
          request.id,
          false,
          undefined,
          'Solicitud rechazada por administrador'
        );
        Alert.alert('Solicitud rechazada', 'La solicitud fue rechazada.');
        setSelectedRequest(null);
        await loadData();
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'No se pudo rechazar la solicitud.');
      }
      return;
    }

    // Accept: must pick a mechanic first (backend requires targetMechanicId)
    setPendingAcceptRequest(request);
    setSelectedRequest(null);
    setLoadingMechanics(true);
    setShowMechanicPicker(true);
    try {
      const mechanics = await apiService.get(`/inspections/${request.inspectionId}/available-mechanics`);
      setAvailableMechanics(Array.isArray(mechanics) ? mechanics : []);
    } catch {
      setAvailableMechanics([]);
    } finally {
      setLoadingMechanics(false);
    }
  };

  const confirmAcceptWithMechanic = async (mechanicId: string) => {
    if (!pendingAcceptRequest) return;
    setShowMechanicPicker(false);
    try {
      await reassignmentService.resolveRequest(
        pendingAcceptRequest.id,
        true,
        mechanicId,
        'Solicitud aprobada y mecánico reasignado'
      );
      Alert.alert('Solicitud aceptada', 'El mecánico fue reasignado exitosamente.');
      setPendingAcceptRequest(null);
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo procesar la solicitud.');
    }
  };

  const pendingCount = filteredRequests.filter((item) => item.status === 'PENDING').length;

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Solicitudes de cambio de mecánico</Text>
        <Text style={styles.subtitle}>Pendientes: {pendingCount}</Text>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.filterChip} onPress={() => setSortBy((prev) => (prev === 'date' ? 'status' : prev === 'status' ? 'sede' : 'date'))}>
          <Text style={styles.filterChipText}>Orden: {sortBy === 'date' ? 'fecha' : sortBy === 'status' ? 'estado' : 'sede'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip} onPress={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
          <Text style={styles.filterChipText}>{sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'all' && styles.statusChipActive]}
          onPress={() => setSelectedStatus('all')}
        >
          <Text style={[styles.statusChipText, selectedStatus === 'all' && styles.statusChipTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'PENDING' && styles.statusChipActive]}
          onPress={() => setSelectedStatus('PENDING')}
        >
          <Text style={[styles.statusChipText, selectedStatus === 'PENDING' && styles.statusChipTextActive]}>Pendiente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'APPROVED' && styles.statusChipActive]}
          onPress={() => setSelectedStatus('APPROVED')}
        >
          <Text style={[styles.statusChipText, selectedStatus === 'APPROVED' && styles.statusChipTextActive]}>Aprobada</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sedeContainer}>
        <TouchableOpacity
          style={[styles.sedeChip, selectedSede === 'all' && styles.sedeChipActive]}
          onPress={() => setSelectedSede('all')}
        >
          <Text style={[styles.sedeChipText, selectedSede === 'all' && styles.sedeChipTextActive]}>Todas las sedes</Text>
        </TouchableOpacity>
        {sedes.slice(0, 3).map((sede) => (
          <TouchableOpacity
            key={sede.id}
            style={[styles.sedeChip, selectedSede === String(sede.id) && styles.sedeChipActive]}
            onPress={() => setSelectedSede(String(sede.id))}
          >
            <Text style={[styles.sedeChipText, selectedSede === String(sede.id) && styles.sedeChipTextActive]}>{sede.nombre}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FFC107" />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay solicitudes para los filtros seleccionados.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedRequest(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Inspección #{item.inspectionId.slice(0, 8)}</Text>
                <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.label}>Sede: {getSedeName(item.sedeId)}</Text>
              <Text style={styles.label}>Fecha solicitud: {formatDate(item.createdAt)}</Text>
              <Text style={styles.label}>Vence: {formatDate(item.expiresAt)}</Text>
              <Text style={styles.description}>{item.description}</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => resolveRequest(item, false)}>
                  <Text style={styles.rejectBtnText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => resolveRequest(item, true)}>
                  <Text style={styles.acceptBtnText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={Boolean(selectedRequest)} transparent animationType="fade" onRequestClose={() => setSelectedRequest(null)}>
        <View style={styles.overlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Detalle solicitud</Text>
              <TouchableOpacity onPress={() => setSelectedRequest(null)}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedRequest ? (
              <>
                <Text style={styles.detailText}>Inspección: {selectedRequest.inspectionId}</Text>
                <Text style={styles.detailText}>Estado: {selectedRequest.status}</Text>
                <Text style={styles.detailText}>Sede: {getSedeName(selectedRequest.sedeId)}</Text>
                <Text style={styles.detailDescription}>{selectedRequest.description}</Text>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => resolveRequest(selectedRequest, false)}>
                    <Text style={styles.rejectBtnText}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => resolveRequest(selectedRequest, true)}>
                    <Text style={styles.acceptBtnText}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Mechanic Picker — shown when admin accepts a request (backend requires targetMechanicId) */}
      <Modal visible={showMechanicPicker} transparent animationType="slide" onRequestClose={() => { setShowMechanicPicker(false); setPendingAcceptRequest(null); }}>
        <View style={styles.overlay}>
          <View style={[styles.detailCard, { maxHeight: '75%' }]}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Seleccionar mecánico</Text>
              <TouchableOpacity onPress={() => { setShowMechanicPicker(false); setPendingAcceptRequest(null); }}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {loadingMechanics ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={{ marginTop: 8, color: '#666' }}>Cargando mecánicos...</Text>
              </View>
            ) : availableMechanics.length === 0 ? (
              <Text style={{ color: '#888', textAlign: 'center', padding: 24 }}>No hay mecánicos disponibles para este horario.</Text>
            ) : (
              <FlatList
                data={availableMechanics}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    disabled={!item.canSelect}
                    style={[styles.mechanicItem, !item.canSelect && styles.mechanicItemDisabled]}
                    onPress={() => confirmAcceptWithMechanic(item.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mechanicName, !item.canSelect && { color: '#AAA' }]}>
                        {item.primerNombre} {item.primerApellido}
                      </Text>
                      {item.blockedReason ? (
                        <Text style={styles.mechanicBlocked}>{item.blockedReason}</Text>
                      ) : null}
                    </View>
                    {item.canSelect && <Ionicons name="chevron-forward" size={18} color="#4CAF50" />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  title: { fontSize: 18, fontWeight: '700', color: '#333' },
  subtitle: { marginTop: 4, color: '#8A6D00', fontWeight: '600' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginTop: 10 },
  filterChip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  filterChipText: { color: '#555', fontSize: 12, fontWeight: '600' },
  statusChip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  statusChipActive: { borderColor: '#FFC107', backgroundColor: '#FFF8CC' },
  statusChipText: { fontSize: 12, color: '#666', fontWeight: '600' },
  statusChipTextActive: { color: '#8A6D00' },
  sedeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, marginTop: 8 },
  sedeChip: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  sedeChipActive: { borderColor: '#2196F3', backgroundColor: '#E3F2FD' },
  sedeChipText: { fontSize: 12, color: '#666' },
  sedeChipTextActive: { color: '#1976D2', fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#EEE', padding: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 11 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  description: { color: '#333', marginTop: 4, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#F44336' },
  acceptBtn: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#4CAF50' },
  rejectBtnText: { color: '#C62828', fontWeight: '700' },
  acceptBtnText: { color: '#2E7D32', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  detailTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  detailText: { color: '#555', marginBottom: 6 },
  detailDescription: { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#EEE', borderRadius: 8, padding: 10, marginBottom: 12, color: '#333' },
  mechanicItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  mechanicItemDisabled: { opacity: 0.45 },
  mechanicName: { fontSize: 14, fontWeight: '600', color: '#333' },
  mechanicBlocked: { fontSize: 12, color: '#999', marginTop: 2 },
});