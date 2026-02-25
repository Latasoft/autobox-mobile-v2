import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { usePayments } from '../../hooks/usePayments';
import paymentService, { Payment, PaymentStatus } from '../../services/paymentService';

export default function PaymentsScreen() {
  // Hook personalizado que maneja la lógica de carga
  const {
    payments,
    loading,
    refreshing,
    onRefresh: refreshPaymentsList,
    updatePaymentStatus,
  } = usePayments();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Estado para el resumen financiero
  const [financialSummary, setFinancialSummary] = useState({ 
    totalConfirmed: 0, 
    totalUserBalance: 0, 
    totalMechanicWithdrawals: 0 
  });

  // Cargar resumen financiero al montar la pantalla
  useEffect(() => {
     loadFinancialSummary();
  }, []);

  const loadFinancialSummary = async () => {
     try {
       const summary = await paymentService.getFinancialSummary();
       if (summary) {
         setFinancialSummary(summary);
       }
     } catch (error) {
       console.log('Error cargando resumen financiero (no crítico):', error);
     }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const renderItem = ({ item }: { item: Payment }) => {
    const isExpanded = expandedId === item.id;
    const statusColor = paymentService.getStatusColor(item.estado);
    
    // Formateo de fecha seguro
    let dateFormatted = 'Fecha desconocida';
    try {
        if (item.fechaCreacion) {
            dateFormatted = new Date(item.fechaCreacion).toLocaleDateString('es-CL', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        }
    } catch (e) {
        console.log('Error formateando fecha', e);
    }

    return (
      <TouchableOpacity 
        style={styles.card} 
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.9}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconBg, { backgroundColor: statusColor + '20' }]}>
              <Ionicons 
                name={item.metodo === 'WebPay' ? 'card-outline' : 'cash-outline'} 
                size={24} 
                color={statusColor} 
              />
            </View>
          </View>
          
          <View style={styles.cardInfo}>
            <Text style={styles.amount}>{paymentService.formatCurrency(item.monto)}</Text>
            <Text style={styles.userText}>
              {item.usuario?.nombre ? `${item.usuario.nombre} ${item.usuario.apellido}` : 'Usuario'}
            </Text>
            <Text style={styles.dateText}>{dateFormatted} • {item.metodo}</Text>
          </View>

          <View style={styles.statusContainer}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>
                {paymentService.getStatusLabel(item.estado)}
              </Text>
            </View>
            <Ionicons 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color="#999" 
              style={{ marginTop: 4, alignSelf: 'flex-end' }}
            />
          </View>
        </View>

        {isExpanded && (
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ID Transacción:</Text>
              {/* Uso de 'any' para evitar errores de tipado estricto si la propiedad no existe en la interfaz */}
              <Text style={styles.detailValue}>
                {(item as any).idempotencyKey || (item as any).token || 'N/A'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Detalle:</Text>
              <Text style={styles.detailValue}>{item.detalles || 'Sin detalles'}</Text>
            </View>

            <View style={styles.actionsRow}>
                {(typeof item.estado === 'string' ? item.estado.toUpperCase() : '') === PaymentStatus.PENDING.toUpperCase() && (
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
                    onPress={() => updatePaymentStatus(item.id, PaymentStatus.COMPLETED)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.actionText}>Marcar Completado</Text>
                  </TouchableOpacity>
                )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    // CAMBIO AQUI: Eliminamos la prop 'title' que daba error
    <Screen>
      
      {/* Título manual agregado visualmente */}
      <View style={styles.headerContainer}>
        <Text style={styles.screenTitle}>Gestión de Pagos</Text>
      </View>
      
      {/* Resumen Financiero */}
      <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Ingresos Totales</Text>
              <Text style={styles.summaryValue}>
                  {paymentService.formatCurrency(financialSummary.totalConfirmed)}
              </Text>
          </View>
      </View>

      {/* Lista de Pagos */}
      {loading ? (
         <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={payments}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
                refreshPaymentsList();
                loadFinancialSummary();
            }} />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No hay pagos registrados</Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
    // Estilos nuevos para el encabezado manual
    headerContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff', 
    },
    screenTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    // Fin estilos nuevos
    summaryContainer: {
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    summaryCard: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2E7D32',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: 12,
    },
    iconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardInfo: {
        flex: 1,
    },
    amount: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    userText: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    dateText: {
        fontSize: 12,
        color: '#999',
        marginTop: 2,
    },
    statusContainer: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    detailsContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    detailLabel: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    detailValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '600',
        maxWidth: '60%',
        textAlign: 'right'
    },
    actionsRow: {
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        gap: 6
    },
    actionText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyText: {
        color: '#999',
        marginTop: 10,
        fontSize: 16,
    }
});