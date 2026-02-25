import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, FlatList, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import adminService from '../../services/adminService';
import paymentService from '../../services/paymentService';
import { User, Payment } from '../../types';
import { InspectionCard } from '../../components/admin/InspectionCard';
import { getImageUrl } from '../../utils/imageUtils';

type Tab = 'profile' | 'inspections' | 'payments';

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Data for tabs
  const [inspections, setInspections] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (!id) return;
      
      const [userData, inspectionsData, paymentsData] = await Promise.all([
          adminService.getUser(id as string),
          adminService.getUserInspections(id as string),
          paymentService.getPaymentsByUser(id as string)
      ]);

      setUser(userData);
      
      // Map inspections to match InspectionCard expected format
      const mappedInspections = inspectionsData.map((item: any) => ({
        id: item.id,
        inspectionNumber: `INS-${item.id?.slice(0, 8)}`,
        vehicleId: item.publicacion?.vehiculo?.id,
        vehiclePatent: item.publicacion?.vehiculo?.patente || item?.vehiclePatent,
        vehicleBrand: item.publicacion?.vehiculo?.marca || item?.vehicleBrand,
        vehicleModel: item.publicacion?.vehiculo?.modelo || item?.vehicleModel,
        mechanicId: item.mecanico?.id,
        mechanicName: item.mecanico ? `${item.mecanico.primerNombre} ${item.mecanico.primerApellido}` : null,
        status: item.estado_insp || item.status,
        scheduledDate: item.fechaProgramada,
        price: item.valor || 0,
        paymentStatus: item.estado_pago,
        createdAt: item.fechaCreacion,
        relationRole: item.relationRole // Included from backend
      }));

      const mappedPayments = (paymentsData || []).map((item: any) => ({
        ...item,
        metodo: (item.metodo as "Débito" | "Saldo_Autobox" | "Transferencia" | "Efectivo" | "Webpay")
      }));

      setInspections(mappedInspections);
      setPayments(mappedPayments);

    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = (nuevoEstado: 'activo' | 'inactivo' | 'bloqueado') => {
    const labels: Record<string, string> = {
      activo: 'activar',
      inactivo: 'desactivar',
      bloqueado: 'bloquear',
    };
    Alert.alert(
      'Confirmar acción',
      `¿Estás seguro de que deseas ${labels[nuevoEstado]} a este usuario?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: nuevoEstado === 'bloqueado' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setActionLoading(true);
              const updated = await adminService.updateUserStatus(id as string, nuevoEstado);
              setUser(prev => prev ? { ...prev, estado: updated?.estado ?? nuevoEstado } : prev);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'No se pudo actualizar el estado del usuario');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const getEstadoBadge = (estado?: string) => {
    const map: Record<string, { color: string; label: string }> = {
      activo:    { color: '#4CAF50', label: 'Activo' },
      inactivo:  { color: '#FF9800', label: 'Inactivo' },
      bloqueado: { color: '#F44336', label: 'Bloqueado' },
    };
    const cfg = map[estado ?? 'activo'] ?? map['activo'];
    return (
      <View style={[styles.estadoBadge, { backgroundColor: cfg.color }]}>
        <Text style={styles.estadoBadgeText}>{cfg.label}</Text>
      </View>
    );
  };

  const renderTabButton = (tab: Tab, label: string, icon: any) => (
    <TouchableOpacity 
      style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]} 
      onPress={() => setActiveTab(tab)}
    >
      <Ionicons name={icon} size={20} color={activeTab === tab ? '#007bff' : '#666'} />
      <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderProfile = () => (
    <ScrollView style={styles.tabContent}>
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información Personal</Text>
            <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.infoIcon} />
                <View>
                    <Text style={styles.infoLabel}>Nombre Completo</Text>
                    <Text style={styles.infoValue}>{user?.primerNombre} {user?.primerApellido}</Text>
                </View>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color="#666" style={styles.infoIcon} />
                <View>
                    <Text style={styles.infoLabel}>Email</Text>
                    <Text style={styles.infoValue}>{user?.email}</Text>
                </View>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color="#666" style={styles.infoIcon} />
                <View>
                    <Text style={styles.infoLabel}>Teléfono</Text>
                    <Text style={styles.infoValue}>{user?.telefono || 'No registrado'}</Text>
                </View>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="card-outline" size={20} color="#666" style={styles.infoIcon} />
                <View>
                    <Text style={styles.infoLabel}>RUT</Text>
                    <Text style={styles.infoValue}>{user?.rut || 'No registrado'}</Text>
                </View>
            </View>
        </View>

        <View style={styles.section}>
             <Text style={styles.sectionTitle}>Billetera Virtual</Text>
             <View style={styles.balanceContainer}>
                 <Text style={styles.balanceLabel}>Saldo Disponible</Text>
                 <Text style={styles.balanceValue}>{paymentService.formatCurrency(user?.saldo || 0)}</Text>
             </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones de Administrador</Text>
          {actionLoading ? (
            <ActivityIndicator size="small" color="#007bff" style={{ marginVertical: 12 }} />
          ) : (
            <View style={styles.actionsContainer}>
              {user?.estado !== 'inactivo' ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonWarning]}
                  onPress={() => handleUpdateStatus('inactivo')}
                >
                  <Ionicons name="pause-circle-outline" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Desactivar Usuario</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSuccess]}
                  onPress={() => handleUpdateStatus('activo')}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Activar Usuario</Text>
                </TouchableOpacity>
              )}
              {user?.estado !== 'bloqueado' ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonDanger]}
                  onPress={() => handleUpdateStatus('bloqueado')}
                >
                  <Ionicons name="ban-outline" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Bloquear Usuario</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSuccess]}
                  onPress={() => handleUpdateStatus('activo')}
                >
                  <Ionicons name="lock-open-outline" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Desbloquear Usuario</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
    </ScrollView>
  );

  const renderInspections = () => (
      <FlatList 
        data={inspections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
            <View>
                {/* Role Badge Header */}
                <View style={[
                    styles.roleHeader, 
                    item.relationRole === 'SOLICITANTE' ? styles.roleRequester : styles.roleOwner
                ]}>
                    <Text style={styles.roleHeaderText}>
                        {item.relationRole === 'SOLICITANTE' ? 'SOLICITADA POR EL USUARIO' : 'INSPECCIÓN A SU VEHÍCULO'}
                    </Text>
                </View>
                <InspectionCard 
                    inspection={item} 
                    onPress={() => router.push({ pathname: '/(admin)/inspections', params: { highlightId: item.id }})}
                    showMechanic={true}
                />
            </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay inspecciones asociadas</Text>}
      />
  );

  const renderPayments = () => (
      <FlatList
        data={payments}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
            <View style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                    <Text style={styles.paymentAmount}>{paymentService.formatCurrency(item.monto)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: paymentService.getStatusColor(item.estado) }]}>
                        <Text style={styles.statusText}>{paymentService.getStatusLabel(item.estado)}</Text>
                    </View>
                </View>
                <Text style={styles.paymentDate}>{new Date(item.fechaCreacion).toLocaleDateString()}</Text>
                <Text style={styles.paymentDetail}>{item.metodo} - {item.detalles || 'Sin detalle'}</Text>
            </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay pagos registrados</Text>}
      />
  );

  if (loading) {
      return (
          <Screen backgroundColor="#fff">
              <View style={styles.center}><ActivityIndicator size="large" color="#007bff" /></View>
          </Screen>
      );
  }

  if (!user) return null;

  return (
    <Screen backgroundColor="#F5F5F5" style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Perfil de Usuario</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.userHeader}>
           {user.foto_url ? (
             <Image source={{ uri: getImageUrl(user.foto_url) }} style={styles.avatar} />
           ) : (
             <View style={[styles.avatar, styles.avatarPlaceholder]}>
               <Text style={styles.avatarInitialLarge}>{user.primerNombre?.[0] || user.email?.[0] || '?'}</Text>
             </View>
           )}
           <View style={styles.userHeaderInfo}>
               <Text style={styles.userName}>{user.primerNombre} {user.primerApellido}</Text>
               <View style={styles.userHeaderBadges}>
                 <View style={styles.roleTag}>
                     <Text style={styles.roleTagText}>{user.rol}</Text>
                 </View>
                 {getEstadoBadge(user.estado)}
               </View>
           </View>
      </View>

      <View style={styles.tabsContainer}>
          {renderTabButton('profile', 'Perfil', 'person')}
          {renderTabButton('inspections', 'Inspecciones', 'car-sport')}
          {renderTabButton('payments', 'Pagos', 'wallet')}
      </View>

      <View style={styles.contentContainer}>
          {activeTab === 'profile' && renderProfile()}
          {activeTab === 'inspections' && renderInspections()}
          {activeTab === 'payments' && renderPayments()}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  backButton: { padding: 4 },
  
  userHeader: {
      flexDirection: 'row', padding: 20, backgroundColor: '#fff', alignItems: 'center', marginBottom: 1
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#eee', marginRight: 16 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E0E0E0' },
  avatarInitialLarge: { fontSize: 24, fontWeight: 'bold', color: '#757575' },
  userHeaderInfo: { flex: 1 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  userHeaderBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  roleTag: { alignSelf: 'flex-start', backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleTagText: { color: '#1976D2', fontSize: 12, fontWeight: '600' },
  estadoBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  estadoBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  actionsContainer: { gap: 10 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, gap: 8,
  },
  actionButtonWarning: { backgroundColor: '#FF9800' },
  actionButtonDanger:  { backgroundColor: '#F44336' },
  actionButtonSuccess: { backgroundColor: '#4CAF50' },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  tabsContainer: {
      flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', elevation: 1
  },
  tabButton: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 12, gap: 8, borderBottomWidth: 2, borderBottomColor: 'transparent'
  },
  tabButtonActive: { borderBottomColor: '#007bff' },
  tabLabel: { fontSize: 14, color: '#666', fontWeight: '500' },
  tabLabelActive: { color: '#007bff', fontWeight: 'bold' },

  contentContainer: { flex: 1 },
  tabContent: { flex: 1, padding: 16 },
  listContent: { padding: 16, paddingBottom: 40 },

  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  infoRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  infoIcon: { marginRight: 16, marginTop: 2 },
  infoLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
  infoValue: { fontSize: 16, color: '#333' },

  balanceContainer: { alignItems: 'center', padding: 16, backgroundColor: '#FAFAFA', borderRadius: 8 },
  balanceLabel: { fontSize: 14, color: '#666' },
  balanceValue: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32', marginTop: 4 },

  paymentCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  paymentAmount: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  paymentDate: { fontSize: 12, color: '#999', marginBottom: 4 },
  paymentDetail: { fontSize: 14, color: '#666' },

  roleHeader: { paddingHorizontal: 12, paddingVertical: 4, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginBottom: -8, zIndex: 1, alignSelf: 'flex-start', marginLeft: 16 },
  roleRequester: { backgroundColor: '#E3F2FD' },
  roleOwner: { backgroundColor: '#E8F5E9' },
  roleHeaderText: { fontSize: 10, fontWeight: 'bold', color: '#555' },
  
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 }
});