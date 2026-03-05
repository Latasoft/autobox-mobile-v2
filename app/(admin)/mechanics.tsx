import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import adminService, { Mechanic } from '../../services/adminService';
import uploadService from '../../services/uploadService';
import { Screen } from '../../components/ui/Screen';
import { MechanicCard } from '../../components/admin/MechanicCard';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';

export default function AdminMechanicsScreen() {
  const router = useRouter();
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMechanicId, setExpandedMechanicId] = useState<string | null>(null);
  const [mechanicInspections, setMechanicInspections] = useState<{[key: string]: any[]}>({});
  const [loadingInspections, setLoadingInspections] = useState<{[key: string]: boolean}>({});

  // Payment states
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState<Mechanic | null>(null);
  const [debtData, setDebtData] = useState<{totalDebt: number, count: number, inspections: any[]} | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [sedes, setSedes] = useState<{ id: number; nombre: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedSedeId, setSelectedSedeId] = useState<string>('all');

  const getMechanicSedeId = (mechanic: any): string | null => {
    if (mechanic?.sedeId !== undefined && mechanic?.sedeId !== null) return String(mechanic.sedeId);
    if (mechanic?.sede?.id !== undefined && mechanic?.sede?.id !== null) return String(mechanic.sede.id);
    return null;
  };

  const getMechanicSedeName = (mechanic: any): string => {
    return mechanic?.sede?.nombre || mechanic?.module || '';
  };

  const loadMechanics = async () => {
    try {
      setLoading(true);
      const [mechanicsData, sedesData] = await Promise.all([
        adminService.getMechanics(),
        adminService.getSedes().catch(() => []),
      ]);
      setMechanics(mechanicsData);
      setSedes((sedesData || []).map((s: any) => ({ id: s.id, nombre: s.nombre })));
    } catch (error: any) {
      console.error('Error loading mechanics:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar los mecánicos');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMechanics();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMechanics();
    setRefreshing(false);
  };

  const filteredMechanics = useMemo(() => {
    return mechanics.filter((mechanic: any) => {
      if (statusFilter !== 'all' && mechanic.status !== statusFilter) return false;

      if (selectedSedeId !== 'all') {
        const mechanicSedeId = getMechanicSedeId(mechanic);
        const mechanicSedeName = getMechanicSedeName(mechanic).toLowerCase();
        const selectedSedeName = (sedes.find(s => String(s.id) === selectedSedeId)?.nombre || '').toLowerCase();

        if (mechanicSedeId) {
          if (mechanicSedeId !== selectedSedeId) return false;
        } else if (selectedSedeName) {
          if (mechanicSedeName !== selectedSedeName) return false;
        } else {
          return false;
        }
      }

      return true;
    });
  }, [mechanics, statusFilter, selectedSedeId, sedes]);

  const handleCreateMechanic = () => {
    router.push('/(admin)/create-mechanic');
  };

  const handleMechanicPress = (mechanic: Mechanic) => {
    // Navigate to profile details
    router.push({
      pathname: '/(admin)/mechanic-detail',
      params: { id: mechanic.id }
    });
  };

  const handleSchedulePress = (mechanic: Mechanic) => {
    router.push({
      pathname: '/(admin)/mechanic-schedule',
      params: { 
        id: mechanic.id, 
        name: `${mechanic.firstName} ${mechanic.lastName}` 
      }
    });
  };

  const handlePaymentPress = async (mechanic: Mechanic) => {
    try {
      setSelectedMechanic(mechanic);
      // Don't set main loading to true to avoid hiding the list, use local state or just show modal loading
      const data = await adminService.getMechanicDebt(mechanic.id);
      setDebtData(data);
      setShowPayModal(true);
      if (data.totalDebt <= 0) {
        // Optional: Alert.alert('Info', 'Sin deuda pendiente'); 
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo obtener la deuda');
    }
  };

  const handlePickReceipt = async () => {
    try {
        const result = await uploadService.pickImage(false); 
        if (result) {
            setReceiptImage(result.uri);
        }
    } catch (error) {
        Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handleConfirmPayment = async () => {
    if (!receiptImage) {
        Alert.alert('Falta comprobante', 'Debes adjuntar el comprobante.');
        return;
    }
    if (!selectedMechanic || !debtData) return;

    setUploadingPayment(true);
    try {
      const folder = 'receipts'; 
      const uploadedFile = await uploadService.uploadFile(receiptImage, `pago_${selectedMechanic.id}_${Date.now()}.jpg`, 'image/jpeg', folder);
      
      const inspectionIds = debtData.inspections.map(i => i.inspectionId);
      
      await adminService.registerPayment(
          selectedMechanic.id,
          debtData.totalDebt,
          uploadedFile.publicUrl,
          inspectionIds
      );

      Alert.alert('Éxito', 'Pago registrado correctamente');
      closePaymentModal();
      loadMechanics(); // Refresh list/stats
    } catch (error: any) {
       console.error(error);
       Alert.alert('Error', error.message || 'Error al registrar el pago');
    } finally {
       setUploadingPayment(false);
    }
  };

  const closePaymentModal = () => {
    setShowPayModal(false);
    setReceiptImage(null);
    setDebtData(null);
    setSelectedMechanic(null);
  };


  const toggleMechanicInspections = async (mechanicId: string) => {
    if (expandedMechanicId === mechanicId) {
      setExpandedMechanicId(null);
      return;
    }

    setExpandedMechanicId(mechanicId);
    
    // Load inspections if not already loaded
    if (!mechanicInspections[mechanicId]) {
      setLoadingInspections(prev => ({ ...prev, [mechanicId]: true }));
      try {
        const inspections = await adminService.getMechanicInspections(mechanicId);
        setMechanicInspections(prev => ({ ...prev, [mechanicId]: inspections }));
      } catch (error) {
        console.error('Error loading mechanic inspections:', error);
        Alert.alert('Error', 'No se pudieron cargar las inspecciones del mecánico');
      } finally {
        setLoadingInspections(prev => ({ ...prev, [mechanicId]: false }));
      }
    }
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mecánicos</Text>
        <Button 
          title="Nuevo Mecánico" 
          onPress={handleCreateMechanic}
          size="small"
          icon={<Ionicons name="add" size={20} color="#FFF" />}
        />
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.statusFiltersRow}>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>Todos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'active' && styles.filterChipActive]}
            onPress={() => setStatusFilter('active')}
          >
            <Text style={[styles.filterChipText, statusFilter === 'active' && styles.filterChipTextActive]}>Activos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'inactive' && styles.filterChipActive]}
            onPress={() => setStatusFilter('inactive')}
          >
            <Text style={[styles.filterChipText, statusFilter === 'inactive' && styles.filterChipTextActive]}>Inactivos</Text>
          </TouchableOpacity>
        </View>

        <Select
          label="Sede"
          value={selectedSedeId}
          onChange={setSelectedSedeId}
          options={[
            { label: 'Todas las sedes', value: 'all' },
            ...sedes.map((s) => ({ label: s.nombre, value: String(s.id) })),
          ]}
          placeholder="Filtrar por sede"
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <FlatList
          data={filteredMechanics}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MechanicCard
              mechanic={item}
              onPress={() => handleMechanicPress(item)}
              onSchedulePress={() => handleSchedulePress(item)}
              onPaymentPress={() => handlePaymentPress(item)}
              onToggleInspections={() => toggleMechanicInspections(item.id)}
              isExpanded={expandedMechanicId === item.id}
              inspections={mechanicInspections[item.id]}
              loadingInspections={loadingInspections[item.id]}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay mecánicos para los filtros seleccionados</Text>
            </View>
          }
        />
      )}
      
      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={closePaymentModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Pago</Text>
            {selectedMechanic && (
              <Text style={styles.modalSubtitle}>Mecánico: {selectedMechanic.firstName} {selectedMechanic.lastName}</Text>
            )}
            
            {debtData ? (
              <>
                <Text style={styles.debtAmount}>Total: ${debtData.totalDebt?.toLocaleString('es-CL')}</Text>
                <Text style={styles.modalInfo}>{debtData.count} inspecciones pendientes de pago</Text>
              </>
            ) : (
              <ActivityIndicator color="#007bff" style={{ marginVertical: 20 }} />
            )}

            <TouchableOpacity style={styles.uploadArea} onPress={handlePickReceipt}>
                {receiptImage ? (
                    <Image source={{ uri: receiptImage }} style={styles.previewImage} />
                ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Ionicons name="cloud-upload-outline" size={40} color="#888" />
                      <Text style={styles.uploadText}>Adjuntar Comprobante</Text>
                    </View>
                )}
            </TouchableOpacity>

            <View style={styles.modalButtons}>
                <TouchableOpacity 
                    style={[styles.modalBtn, styles.cancelBtn]} 
                    onPress={closePaymentModal}
                    disabled={uploadingPayment}
                >
                    <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.modalBtn, styles.confirmBtn]} 
                    onPress={handleConfirmPayment}
                    disabled={uploadingPayment || !debtData || debtData.totalDebt === 0}
                >
                    {uploadingPayment ? <ActivityIndicator color="#fff"/> : <Text style={styles.confirmText}>Confirmar</Text>}
                </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  statusFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  filterChipActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    padding: 20 
  },
  modalContent: { 
    backgroundColor: 'white', 
    borderRadius: 20, 
    padding: 20, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginBottom: 5 
  },
  modalSubtitle: { 
    fontSize: 16, 
    color: '#666', 
    marginBottom: 15 
  },
  debtAmount: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#D32F2F',
    marginBottom: 5
  },
  modalInfo: { 
    fontSize: 14, 
    color: '#666', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  uploadArea: { 
    width: '100%', 
    height: 150, 
    backgroundColor: '#f8f9fa', 
    borderRadius: 12, 
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 2, 
    borderColor: '#e9ecef', 
    borderStyle: 'dashed'
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: { 
    color: '#888', 
    fontSize: 16, 
    marginTop: 8 
  },
  previewImage: { 
    width: '100%', 
    height: '100%', 
    resizeMode: 'cover' 
  },
  modalButtons: { 
    flexDirection: 'row', 
    width: '100%', 
    gap: 12 
  },
  modalBtn: { 
    flex: 1, 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelBtn: { 
    backgroundColor: '#f1f3f5' 
  },
  confirmBtn: { 
    backgroundColor: '#231F7C' 
  },
  cancelText: { 
    color: '#495057', 
    fontWeight: '600',
    fontSize: 16
  },
  confirmText: { 
    color: 'white', 
    fontWeight: '600',
    fontSize: 16
  },
});
