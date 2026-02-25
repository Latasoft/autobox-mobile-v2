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
      const tokenWs = params.token_ws as string | undefined;
      const tbkToken = params.TBK_TOKEN as string | undefined;
      const callbackStatus = params.status as string | undefined;

      console.log('🔵 [PaymentCallback] Recibido deep link con params:', {
        tokenWs: tokenWs?.substring(0, 10),
        tbkToken: tbkToken?.substring(0, 10),
        status: callbackStatus,
      });

      // Caso 1: Cancelación explícita (TBK_TOKEN o status de rechazo)
      if (tbkToken || callbackStatus === 'rejected' || callbackStatus === 'error' || callbackStatus === 'aborted') {
        console.log('❌ [PaymentCallback] Pago cancelado/rechazado');
        // Marcar pago como fallido en backend
        const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');
        if (savedPaymentId) {
          apiService.fetch(`/payments/${savedPaymentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'Fallido', detalles: 'Anulado por el usuario o el banco (deep link)' }),
          }).catch(() => {});
          await AsyncStorage.removeItem('waitingForPayment');
        }
        setStatus('failure');
        setMessage('La operación fue anulada.');
        return;
      }

      // Caso 2: Pago exitoso o en verificación
      const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');

      // Intentar confirmar con token_ws si lo tenemos
      const tokenToUse = tokenWs || (savedPaymentId ? await AsyncStorage.getItem(`payment_${savedPaymentId}_token`) : null);

      if (tokenToUse) {
        try {
          // Primero intentar confirmar la transacción WebPay
          const result = await apiService.confirmWebPayTransaction(tokenToUse);
          const responseCode = result?.response_code ?? result?.transaction?.response_code;
          const resultStatus = result?.status ?? result?.transaction?.status;
          const isAuthorized = responseCode === 0 || resultStatus === 'AUTHORIZED';

          if (isAuthorized) {
            console.log('✅ [PaymentCallback] Pago confirmado exitosamente');
            setStatus('success');
            setMessage('¡Tu pago fue procesado correctamente!');
            await AsyncStorage.removeItem('waitingForPayment');
            return;
          }
        } catch (e: any) {
          // Si ya fue procesado (422), verificar estado final
          if (e.message?.includes('422') || e.message?.includes('already locked')) {
            if (savedPaymentId) {
              const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
              if (paymentCheck?.estado === 'Completado') {
                setStatus('success');
                setMessage('¡Tu pago fue procesado correctamente!');
                await AsyncStorage.removeItem('waitingForPayment');
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
        if (paymentCheck?.estado === 'Completado') {
          setStatus('success');
          setMessage('¡Tu pago fue procesado correctamente!');
          await AsyncStorage.removeItem('waitingForPayment');
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
