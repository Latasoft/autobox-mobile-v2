import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { Select } from '../../components/ui/Select';
import { DatePicker } from '../../components/ui/DatePicker';
import apiService from '../../services/apiService';
import paymentService, { PosPaymentRequest, PosPaymentStatus } from '../../services/paymentService';

const STATUS_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: 'Pendiente', value: PosPaymentStatus.PENDING },
  { label: 'Confirmado', value: PosPaymentStatus.CONFIRMED },
  { label: 'Rechazado', value: PosPaymentStatus.REJECTED },
];

const statusColor = (status: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized.includes('PEND')) return '#FF9800';
  if (normalized.includes('CONF')) return '#4CAF50';
  return '#F44336';
};

const normalizeDate = (value: string) => {
  if (!value) return '';
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) return '';
  return `${year}-${month}-${day}`;
};

export default function PosPaymentsScreen() {
  const [requests, setRequests] = useState<PosPaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSedeId, setSelectedSedeId] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [sedes, setSedes] = useState<Array<{ id: number; nombre: string }>>([]);
  const [selectedRequest, setSelectedRequest] = useState<PosPaymentRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadSedes = useCallback(async () => {
    try {
      const response = await apiService.getSedes();
      if (Array.isArray(response)) {
        setSedes(response.map((item: any) => ({ id: Number(item.id), nombre: item.nombre })));
      }
    } catch (error) {
      console.error('Error loading sedes for POS module:', error);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const data = await paymentService.getPosPaymentRequests({
        status: selectedStatus,
        date: normalizeDate(selectedDate),
        sedeId: selectedSedeId !== 'all' ? Number(selectedSedeId) : undefined,
      });
      setRequests(data);
    } catch (error) {
      console.error('Error loading POS requests:', error);
      Alert.alert('Error', 'No se pudieron cargar las solicitudes POS');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStatus, selectedDate, selectedSedeId]);

  useEffect(() => {
    void loadSedes();
  }, [loadSedes]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
  };

  const sedeOptions = useMemo(
    () => [{ label: 'Todas las sedes', value: 'all' }, ...sedes.map((sede) => ({ label: sede.nombre, value: String(sede.id) }))],
    [sedes]
  );

  const handleConfirm = async () => {
    if (!selectedRequest) return;
    try {
      setActionLoading(true);
      await paymentService.confirmPosPaymentRequest(selectedRequest.id);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo confirmar el pago POS');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    try {
      setActionLoading(true);
      await paymentService.rejectPosPaymentRequest(selectedRequest.id, 'Rechazado por administrador');
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo rechazar el pago POS');
    } finally {
      setActionLoading(false);
    }
  };

  const renderRequest = ({ item }: { item: PosPaymentRequest }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelectedRequest(item)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name="card" size={20} color="#1976D2" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Solicitud POS</Text>
          <Text style={styles.cardSubtitle}>{item.requesterName || 'Cliente'} • {item.sedeName || 'Sede sin nombre'}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(String(item.status)) }]} />
          <Text style={styles.statusLabel}>{String(item.status)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.amount}>${Number(item.amount || 0).toLocaleString('es-CL')}</Text>
        <Text style={styles.metaText}>Fecha: {new Date(item.requestedAt).toLocaleDateString('es-CL')}</Text>
        <Text style={styles.metaText}>Hora: {new Date(item.requestedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen backgroundColor="#F5F5F5">
      <View style={styles.headerRow}>
        <Ionicons name="card" size={22} color="#1976D2" />
        <Text style={styles.title}>Pagos POS</Text>
      </View>

      <View style={styles.filtersBox}>
        <Select label="Estado" value={selectedStatus} onChange={setSelectedStatus} options={STATUS_OPTIONS} />
        <DatePicker label="Fecha" value={selectedDate} onChange={setSelectedDate} placeholder="Filtrar por fecha" />
        <Select label="Sede" value={selectedSedeId} onChange={setSelectedSedeId} options={sedeOptions} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1976D2" />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="card-outline" size={60} color="#CFCFCF" />
              <Text style={styles.emptyText}>No hay solicitudes POS con esos filtros</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selectedRequest} transparent animationType="slide" onRequestClose={() => setSelectedRequest(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Detalle Solicitud POS</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Cliente</Text>
              <Text style={styles.detailValue}>{selectedRequest?.requesterName || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Correo</Text>
              <Text style={styles.detailValue}>{selectedRequest?.requesterEmail || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Monto</Text>
              <Text style={styles.detailValue}>${Number(selectedRequest?.amount || 0).toLocaleString('es-CL')}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Sede</Text>
              <Text style={styles.detailValue}>{selectedRequest?.sedeName || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fecha</Text>
              <Text style={styles.detailValue}>{selectedRequest ? new Date(selectedRequest.requestedAt).toLocaleDateString('es-CL') : '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hora</Text>
              <Text style={styles.detailValue}>{selectedRequest ? new Date(selectedRequest.requestedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Estado</Text>
              <Text style={styles.detailValue}>{selectedRequest?.status || '-'}</Text>
            </View>

            {String(selectedRequest?.status || '').toUpperCase().includes('PEND') ? (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={handleReject}
                  disabled={actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionButtonText}>Cancelar Pago</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.confirmButton]}
                  onPress={handleConfirm}
                  disabled={actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionButtonText}>Confirmar Pago</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.resolvedText}>Esta solicitud ya fue resuelta.</Text>
            )}

            <TouchableOpacity style={styles.closeModalButton} onPress={() => setSelectedRequest(null)}>
              <Text style={styles.closeModalText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  filtersBox: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6B7280',
  },
  cardBody: {
    marginTop: 12,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976D2',
  },
  metaText: {
    marginTop: 4,
    fontSize: 13,
    color: '#4B5563',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: '#2E7D32',
  },
  rejectButton: {
    backgroundColor: '#D32F2F',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeModalButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeModalText: {
    color: '#4B5563',
    fontWeight: '600',
  },
  resolvedText: {
    marginTop: 14,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
