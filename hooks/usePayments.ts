import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import paymentService, { Payment, PaymentStatus } from '../services/paymentService';

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filtro visual para el usuario
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'confirmado' | 'pendiente' | 'fallido'>('all');
  
  const [totalAmount, setTotalAmount] = useState(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      
      // CORRECCIÓN 1: Quitamos el argumento {}. 
      // getAllPayments() ahora no pide nada.
      const allData = await paymentService.getAllPayments();
      
      const allPayments = allData || [];
      
      // 1. Calcular total histórico de pagos COMPLETADOS
      // Usa la misma definición que isPaymentCompletedStatus en payment-gateway/callback:
      // COMPLETADO, COMPLETED, AUTHORIZED y PAGADO son todos estados de pago exitoso.
      const confirmed = allPayments.filter(p => {
        const status = typeof p.estado === 'string' ? p.estado.toUpperCase() : '';
        return status === 'COMPLETADO' || status === 'COMPLETED' || status === 'AUTHORIZED' || status === 'PAGADO' || p.estado === PaymentStatus.COMPLETED;
      });
      
      const total = confirmed.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      setTotalAmount(total);

      // 2. Filtrar para la lista visual
      let displayData = allPayments;

      if (selectedFilter !== 'all') {
        displayData = displayData.filter(p => {
            const status = typeof p.estado === 'string' ? p.estado.toUpperCase() : '';
            if (selectedFilter === 'confirmado') return status.includes('COMPLET') || status === 'AUTHORIZED' || status === 'PAGADO';
            if (selectedFilter === 'pendiente') return status.includes('PEND');
            if (selectedFilter === 'fallido') return status.includes('FALL') || status.includes('FAIL');
            return true;
        });
      }

      // 3. Filtro de Fechas (Opcional)
      if (startDate && endDate) {
        displayData = displayData.filter(p => {
            const pDate = new Date(p.fechaCreacion);
            return pDate >= startDate && pDate <= endDate;
        });
      }

      setPayments(displayData);
    } catch (error) {
      console.error('Error loading payments:', error);
      Alert.alert('Error', 'No se pudieron cargar los pagos');
    } finally {
      setLoading(false);
    }
  }, [selectedFilter, startDate, endDate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadPayments();
    } finally {
      setRefreshing(false);
    }
  };

  // CORRECCIÓN 2: Cambiamos el tipo de newStatus de string a PaymentStatus
  // Esto arregla el error de asignación.
  const updatePaymentStatus = async (paymentId: string, newStatus: PaymentStatus) => {
    try {
      const updated = await paymentService.updatePaymentStatus(paymentId, newStatus);
      
      if (updated) {
        // Actualizamos la lista localmente
        const newPayments = payments.map(p => p.id === paymentId ? updated : p);
        setPayments(newPayments);
        
        // Si cambió a completado, recargamos todo para actualizar el total monetario correctamente
        if (newStatus === PaymentStatus.COMPLETED) {
           loadPayments(); 
        } else {
           Alert.alert('Éxito', 'Estado actualizado correctamente');
        }
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo actualizar el estado');
    }
  };

  return {
    payments,
    loading,
    refreshing,
    onRefresh,
    selectedFilter,
    setSelectedFilter,
    totalAmount,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    updatePaymentStatus
  };
}