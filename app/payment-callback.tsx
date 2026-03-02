import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/apiService';
import walletService from '../services/walletService';

/**
 * payment-callback.tsx
 *
 * Pantalla que maneja el retorno del deep link autobox://payment-callback
 * cuando el SO recibe la redirección de Transbank/backend fuera del WebView
 * (por ejemplo, si el usuario sale de la app durante el proceso de pago y
 * el navegador externo o el backend redirige al deep link).
 *
 * Extrae los parámetros (token_ws, TBK_TOKEN, status) y verifica/confirma
 * el pago antes de redirigir al usuario a la pantalla correspondiente.
 */
export default function PaymentCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'failure'>('loading');
  const [message, setMessage] = useState('Verificando tu pago...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const normalizeResponseCode = (code: any): number | null => {
        if (code === undefined || code === null || code === '') return null;
        const parsed = Number(code);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const isPaymentCompletedStatus = (estado: any): boolean => {
        const normalized = typeof estado === 'string' ? estado.toUpperCase() : '';
        return normalized === 'COMPLETADO' || normalized === 'COMPLETED' || normalized === 'AUTHORIZED' || normalized === 'PAGADO';
      };

      const tokenWs = params.token_ws as string | undefined;
      const tbkToken = params.TBK_TOKEN as string | undefined;
      const callbackStatus = params.status as string | undefined;

      console.log('🔵 [PaymentCallback] Recibido deep link con params:', {
        tokenWs: tokenWs?.substring(0, 10),
        tbkToken: tbkToken?.substring(0, 10),
        status: callbackStatus,
      });

      const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');
      // Determinar si es un depósito de wallet leyendo el tipo guardado
      const savedServiceType = savedPaymentId
        ? await AsyncStorage.getItem(`payment_${savedPaymentId}_serviceType`)
        : null;
      const isWalletDeposit = savedServiceType === 'wallet_deposit';

      // Helper para limpiar todas las claves de AsyncStorage del pago
      const cleanupPaymentStorage = async (paymentId?: string | null) => {
        await AsyncStorage.removeItem('waitingForPayment');
        if (paymentId) {
          await AsyncStorage.removeItem(`payment_${paymentId}_token`);
          await AsyncStorage.removeItem(`payment_${paymentId}_timestamp`);
          await AsyncStorage.removeItem(`payment_${paymentId}_amount`);
          await AsyncStorage.removeItem(`payment_${paymentId}_serviceType`);
        }
      };

      // Caso 1: Cancelación explícita (TBK_TOKEN o status de rechazo)
      if (tbkToken || callbackStatus === 'rejected' || callbackStatus === 'error' || callbackStatus === 'aborted') {
        console.log('❌ [PaymentCallback] Pago cancelado/rechazado');
        if (savedPaymentId) {
          apiService.fetch(`/payments/${savedPaymentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'Fallido', detalles: 'Anulado por el usuario o el banco (deep link)' }),
          }).catch(() => {});
        }
        await cleanupPaymentStorage(savedPaymentId);
        setStatus('failure');
        setMessage('La operación fue anulada.');
        return;
      }

      // Caso 1b: El callback del backend ya confirmó exitosamente (wallet deposit return URL)
      // Cuando el endpoint /wallet/public/deposit/transbank/return confirma OK, redirige con status=success
      if (callbackStatus === 'success' && isWalletDeposit) {
        console.log('✅ [PaymentCallback] Depósito de wallet ya confirmado por el backend');
        setStatus('success');
        setMessage('¡Tu saldo ha sido actualizado!');
        await cleanupPaymentStorage(savedPaymentId);
        return;
      }

      // Caso 2: Pago exitoso o en verificación
      const tokenToUse = tokenWs || (savedPaymentId ? await AsyncStorage.getItem(`payment_${savedPaymentId}_token`) : null);

      if (tokenToUse) {
        try {
          let isAuthorized = false;

          if (isWalletDeposit) {
            // Wallet deposit: usar endpoint de confirmación de wallet
            console.log('🔵 [PaymentCallback] Confirmando depósito de wallet...');
            const result = await walletService.confirmTransbankDeposit(tokenToUse, savedPaymentId || undefined);
            const resultStatus = result?.status || result?.data?.status;
            const responseCode = result?.response_code ?? result?.data?.response_code;
            const responseCodeNum = normalizeResponseCode(responseCode);
            isAuthorized = result?.success === true || resultStatus === 'AUTHORIZED' || responseCodeNum === 0;
          } else {
            // Pago normal: usar endpoint de confirmación WebPay
            console.log('🔵 [PaymentCallback] Confirmando pago WebPay...');
            const result = await apiService.confirmWebPayTransaction(tokenToUse);
            const responseCode = result?.response_code ?? result?.transaction?.response_code ?? result?.data?.response_code;
            const responseCodeNum = normalizeResponseCode(responseCode);
            const resultStatus = result?.status ?? result?.transaction?.status ?? result?.data?.status;
            isAuthorized = responseCodeNum === 0 || resultStatus === 'AUTHORIZED';
          }

          if (isAuthorized) {
            console.log('✅ [PaymentCallback] Pago confirmado exitosamente');
            setStatus('success');
            setMessage(isWalletDeposit ? '¡Tu saldo ha sido actualizado!' : '¡Tu pago fue procesado correctamente!');
            await cleanupPaymentStorage(savedPaymentId);
            return;
          }
        } catch (e: any) {
          // Si ya fue procesado (422), verificar estado final
          if (e.message?.includes('422') || e.message?.includes('already locked') || e.message?.includes('processed') || e.message?.includes('Invalid status') || e.message?.includes('ya fue confirmado')) {
            if (savedPaymentId) {
              const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
              if (isPaymentCompletedStatus(paymentCheck?.estado)) {
                setStatus('success');
                setMessage(isWalletDeposit ? '¡Tu saldo ha sido actualizado!' : '¡Tu pago fue procesado correctamente!');
                await cleanupPaymentStorage(savedPaymentId);
                return;
              }
            }
          }
          console.warn('⚠️ [PaymentCallback] Error confirmando:', e.message);
        }
      }

      // Caso 3: Verificar directamente el estado del pago en el backend
      if (savedPaymentId) {
        const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
        if (isPaymentCompletedStatus(paymentCheck?.estado)) {
          setStatus('success');
          setMessage(isWalletDeposit ? '¡Tu saldo ha sido actualizado!' : '¡Tu pago fue procesado correctamente!');
          await cleanupPaymentStorage(savedPaymentId);
          return;
        }
      }

      // Si llegamos aquí sin poder confirmar, mostrar estado indeterminado
      console.log('⚠️ [PaymentCallback] No se pudo confirmar el pago');
      setStatus('failure');
      setMessage('No pudimos confirmar tu pago. Revisa tu historial o contacta a soporte.');

    } catch (error: any) {
      console.error('❌ [PaymentCallback] Error:', error.message);
      setStatus('failure');
      setMessage('Ocurrió un error al verificar tu pago. Por favor, contacta a soporte.');
    }
  };

  return (
    <Screen backgroundColor="#F5F5F5">
      <View style={styles.container}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.message}>{message}</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            <Text style={styles.title}>¡Pago Exitoso!</Text>
            <Text style={styles.message}>{message}</Text>
            <Button
              title="Continuar"
              onPress={() => {
                router.dismissAll();
                router.replace('/(tabs)');
              }}
              style={styles.button}
            />
          </>
        )}

        {status === 'failure' && (
          <>
            <Ionicons name="close-circle" size={80} color="#F44336" />
            <Text style={styles.title}>Pago No Completado</Text>
            <Text style={styles.message}>{message}</Text>
            <Button
              title="Volver al Inicio"
              onPress={() => {
                router.dismissAll();
                router.replace('/(tabs)');
              }}
              style={styles.button}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
  button: {
    width: '100%',
    maxWidth: 300,
  },
});