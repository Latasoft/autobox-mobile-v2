import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Linking, AppState, Platform, TouchableOpacity, Modal, SafeAreaView, useWindowDimensions, StatusBar, BackHandler } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '../../../components/ui/Screen';
import { Button } from '../../../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import apiService from '../../../services/apiService';
import authService from '../../../services/authService';
import walletService from '../../../services/walletService';
import { useWallet } from '../../../hooks/useWallet';
import {API_URL} from '../../../constants/Config';

// Configuración de reintentos
const MAX_RETRIES = 2; // Reducido de 3 a 2
const RETRY_DELAY_MS = 1000; // Reducido de 2000 a 1000
const TIMEOUT_MS = 10000; // Reducido de 30000 a 10000

interface PaymentError {
  code: string;
  message: string;
  retryable: boolean;
  userMessage: string;
}

export default function PaymentGatewayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { balance, refresh: refreshWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failure' | 'cancelled' | 'verifying'>('pending');
  const [isWaitingForPayment, setIsWaitingForPayment] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'webpay' | 'wallet'>('webpay');
  const [prices, setPrices] = useState<{ nombre: string; precio: number }[]>([]);
  const [webviewVisible, setWebviewVisible] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
  const [webviewHtml, setWebviewHtml] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [errorDetails, setErrorDetails] = useState<PaymentError | null>(null);
  const [reconciliationNeeded, setReconciliationNeeded] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const isCancelledRef = useRef(false);
  const lastHandledReturnUrlRef = useRef<string | null>(null);
  const callbackFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debug: Log cambios en webviewVisible y webviewUrl
  useEffect(() => {
    console.log('🔵 [State] webviewVisible cambió a:', webviewVisible);
  }, [webviewVisible]);

  useEffect(() => {
    console.log('🔵 [State] webviewUrl cambió a:', webviewUrl);
  }, [webviewUrl]);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { amount, description, serviceType, metadata } = params;

  // Logging detallado
  const logPaymentEvent = (event: string, data?: any, level: 'info' | 'warn' | 'error' = 'info') => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      data,
      amount,
      serviceType,
      paymentMethod: selectedMethod,
      retryCount,
    };
    
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
    console.log(`${prefix} [PaymentGateway] ${event}:`, logEntry);
    
    // TODO: Enviar logs críticos al backend para monitoreo
    if (level === 'error') {
      // apiService.post('/logs/payment-error', logEntry).catch(() => {});
    }
  };

  useEffect(() => {
    loadPrices();
    logPaymentEvent('Payment Gateway Initialized');
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isWaitingForPayment]);

  // Polling automático para verificar pagos pendientes
  useEffect(() => {
    let pollingInterval: any = null;
    
    if (reconciliationNeeded && paymentStatus === 'verifying' && !isConfirming) {
      console.log('🔄 [Polling] Iniciando polling automático de verificación de pago');
      
      // Verificar inmediatamente
      checkPendingPayment();
      
      // Luego verificar cada 3 segundos
      pollingInterval = setInterval(async () => {
        if (pollingAttempts < 20) { // Máximo 20 intentos (1 minuto)
          console.log(`🔄 [Polling] Intento ${pollingAttempts + 1}/20`);
          setPollingAttempts(prev => prev + 1);
          await checkPendingPayment();
        } else {
          console.log('⏹️ [Polling] Máximo de intentos alcanzado');
          setReconciliationNeeded(false);
          Alert.alert(
            'Verificación Pendiente',
            'No pudimos confirmar automáticamente tu pago. Por favor, verifica tu saldo o contacta a soporte si realizaste el pago.',
            [{ text: 'OK' }]
          );
          if (pollingInterval) clearInterval(pollingInterval);
        }
      }, 3000); // Cada 3 segundos
    }
    
    return () => {
      if (pollingInterval) {
        console.log('🛑 [Polling] Deteniendo polling');
        clearInterval(pollingInterval);
      }
    };
  }, [reconciliationNeeded, paymentStatus, isConfirming, pollingAttempts]);

  const loadPrices = async () => {
    try {
      const data = await apiService.getPrices();
      setPrices(data);
    } catch (error) {
      console.error('Error loading prices:', error);
    }
  };

  // Función de reintentos con backoff exponencial
  const executeWithRetry = async <T,>(
    fn: () => Promise<T>,
    operation: string,
    currentRetry = 0
  ): Promise<T> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      );
      
      const result = await Promise.race([fn(), timeoutPromise]);
      
      if (currentRetry > 0) {
        logPaymentEvent(`${operation} succeeded after ${currentRetry} retries`);
      }
      
      return result;
    } catch (error: any) {
      const errorCode = error?.code || error?.message || 'UNKNOWN';
      const isNetworkError = ['TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'Network request failed'].some(
        code => errorCode.includes(code)
      );
      
      logPaymentEvent(`${operation} failed`, { 
        error: errorCode, 
        retry: currentRetry,
        isNetworkError 
      }, 'error');

      // Reintentar solo errores de red
      if (isNetworkError && currentRetry < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, currentRetry); // Backoff exponencial
        logPaymentEvent(`Retrying ${operation} in ${delay}ms`, { attempt: currentRetry + 1 }, 'warn');
        
        await new Promise(resolve => setTimeout(resolve, delay));
        setRetryCount(currentRetry + 1);
        return executeWithRetry(fn, operation, currentRetry + 1);
      }
      
      throw error;
    }
  };

  // Clasificar y categorizar errores
  const categorizeError = (error: any): PaymentError => {
    const errorMsg = error?.message || error?.toString() || 'Error desconocido';
    const errorCode = error?.code || error?.response?.status?.toString() || 'UNKNOWN';

    // Error 422: Transacción ya procesada (NO reintentar)
    if (errorCode === '422' || errorMsg.includes('already locked') || errorMsg.includes('Invalid status')) {
      return {
        code: 'ALREADY_PROCESSED',
        message: errorMsg,
        retryable: false,
        userMessage: 'Esta transacción ya fue procesada. Verificando estado...'
      };
    }

    // Errores de red
    if (['TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].some(code => errorMsg.includes(code))) {
      return {
        code: 'NETWORK_ERROR',
        message: errorMsg,
        retryable: true,
        userMessage: 'Problemas de conexión. Estamos verificando el estado de tu pago...'
      };
    }

    // Errores de configuración (401, 403)
    if (['401', '403'].includes(errorCode)) {
      return {
        code: 'AUTH_ERROR',
        message: errorMsg,
        retryable: false,
        userMessage: 'Error de configuración. Contacta a soporte.'
      };
    }

    // Errores de validación (400)
    if (errorCode === '400') {
      return {
        code: 'VALIDATION_ERROR',
        message: errorMsg,
        retryable: false,
        userMessage: 'Los datos del pago son inválidos. Verifica e intenta nuevamente.'
      };
    }

    // Errores de Webpay caído (503)
    if (errorCode === '503') {
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: errorMsg,
        retryable: true,
        userMessage: 'El servicio de pago está temporalmente no disponible. Intenta en unos minutos.'
      };
    }

    // Error genérico
    return {
      code: 'UNKNOWN_ERROR',
      message: errorMsg,
      retryable: false,
      userMessage: 'Ocurrió un error inesperado. Contacta a soporte si el problema persiste.'
    };
  };

  const WEBPAY_CALLBACK_PATH = '/payments/webpay/callback';

  const extractWebPayTokensFromUrl = (url: string): { tokenWs?: string; tbkToken?: string } => {
    try {
      const parsedUrl = new URL(url);
      const tokenWs = parsedUrl.searchParams.get('token_ws') || undefined;
      const tbkToken = parsedUrl.searchParams.get('TBK_TOKEN') || undefined;
      return { tokenWs, tbkToken };
    } catch {
      const tokenWsMatch = url.match(/[?&]token_ws=([^&]+)/i);
      const tbkTokenMatch = url.match(/[?&]TBK_TOKEN=([^&]+)/i);
      return {
        tokenWs: tokenWsMatch?.[1] ? decodeURIComponent(tokenWsMatch[1]) : undefined,
        tbkToken: tbkTokenMatch?.[1] ? decodeURIComponent(tbkTokenMatch[1]) : undefined,
      };
    }
  };

  // Detecta URLs que son el RETORNO FINAL de WebPay (deep links, cancelaciones)
  // NO incluye la callback URL del backend (esa debe cargarse para que el backend procese)
  const isWebPayReturnUrl = (url: string): boolean => {
    return (
      url.startsWith('autobox://') ||
      url.includes('TBK_TOKEN=')
    );
  };

  // Detecta la callback URL del backend (donde Transbank hace POST con token_ws)
  // Esta URL DEBE ser cargada por el WebView para que el backend reciba el callback
  const isWebPayCallbackUrl = (url: string): boolean => {
    return url.includes(WEBPAY_CALLBACK_PATH) && !url.startsWith('autobox://');
  };

  const waitForPaymentCompletion = async (paymentId: string, attempts = 8, delayMs = 1200): Promise<boolean> => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const paymentRecord = await apiService.get(`/payments/${paymentId}`);
        if (paymentRecord?.estado === 'Completado') {
          return true;
        }
      } catch (error: any) {
        logPaymentEvent('Error checking payment status while waiting completion', { paymentId, attempt, error: error?.message }, 'warn');
      }

      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return false;
  };

  const handleWebPayReturnFromWebView = (url: string) => {
    if (lastHandledReturnUrlRef.current === url) {
      return;
    }
    lastHandledReturnUrlRef.current = url;

    logPaymentEvent('WebView detected payment return URL', { url: url.substring(0, 120) });
    setWebviewVisible(false);

    // Extraer status del deep link (autobox://payment-result?status=...)
    let deepLinkStatus: string | undefined;
    try {
      const parsedUrl = new URL(url);
      deepLinkStatus = parsedUrl.searchParams.get('status') || undefined;
    } catch {
      const statusMatch = url.match(/[?&]status=([^&]+)/i);
      deepLinkStatus = statusMatch?.[1] ? decodeURIComponent(statusMatch[1]) : undefined;
    }

    const { tokenWs, tbkToken } = extractWebPayTokensFromUrl(url);

    // Pago anulado: por TBK_TOKEN (cancela en banco) o por status rejected/error/aborted
    if (tbkToken || deepLinkStatus === 'rejected' || deepLinkStatus === 'error' || deepLinkStatus === 'aborted') {
      void markPaymentCancelled(undefined, 'Transacción anulada por WebPay o por el usuario en el banco');
      return;
    }

    if (tokenWs) {
      void checkPendingPayment(tokenWs);
      return;
    }

    // Si llegó con status=success pero sin token, verificar igual
    setTimeout(() => {
      void checkPendingPayment();
    }, 1200);
  };

  const handleAppStateChange = async (nextAppState: string) => {
    if (nextAppState === 'active' && isWaitingForPayment) {
      console.log('App volvió del navegador, verificando pago...');
      await checkPendingPayment();
    }
  };

  const checkPendingPayment = async (directToken?: string) => {
    // Prevenir confirmaciones concurrentes o si fue cancelado
    if (isConfirming || isCancelledRef.current) {
      logPaymentEvent('Skipping payment check', { isConfirming, isCancelled: isCancelledRef.current }, 'warn');
      return;
    }

    try {
      setIsConfirming(true);
      
      if (isCancelledRef.current) return;
      
      setLoading(true);
      setPaymentStatus('verifying');
      logPaymentEvent('Checking pending payment', { hasDirectToken: !!directToken });
      
      const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');
      const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;

      if (!savedPaymentId && !(serviceTypeStr === 'wallet_deposit' && directToken)) {
        logPaymentEvent('No pending payment found', {}, 'warn');
        setLoading(false);
        setIsConfirming(false);
        return;
      }
      
      // CASO ESPECIAL: WALLET DEPOSIT - usar endpoint diferente
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Checking wallet deposit status');
        
        let isConfirmed = false;
        const tokenFromStorage = savedPaymentId ? await AsyncStorage.getItem(`payment_${savedPaymentId}_token`) : null;
        const tokenForWalletConfirmation = directToken || tokenFromStorage;

        // Intentar confirmar si tenemos el token guardado
        if (tokenForWalletConfirmation) {
            try {
                    console.log('🔵 [Wallet Check] Intentando confirmar con token:', tokenForWalletConfirmation.substring(0, 10));
                    const result = await walletService.confirmTransbankDeposit(tokenForWalletConfirmation, savedPaymentId || undefined);
                    console.log('✅ [Wallet Check] Resultado confirmación:', result);
                    
                    // Verificar estructura de respuesta (puede venir anidada en 'data' o directa)
                    const status = result?.status || result?.data?.status;
                    const responseCode = result?.response_code ?? result?.data?.response_code;
                    const isSuccess = result?.success === true;

                    if (isSuccess || status === 'AUTHORIZED' || responseCode === 0) {
                        isConfirmed = true;
                    }

                    const isFailure = status === 'FAILED' || (responseCode !== undefined && responseCode !== 0);
                    if (isFailure) {
                        console.log('❌ [Wallet Check] Pago fallido/rechazado explícitamente');
                        setReconciliationNeeded(false);
                        setPaymentStatus('failure');
                        setIsConfirming(false);
                        setIsWaitingForPayment(false);
                        setLoading(false); // Stop loading!
                         // Limpiar token
                        await AsyncStorage.removeItem('waitingForPayment');
                        if (savedPaymentId) await AsyncStorage.removeItem(`payment_${savedPaymentId}_token`);
                        return;
                }
            } catch (e: any) {
                console.warn('⚠️ [Wallet Check] Error confirmando:', e);
                // Si el error es "ya confirmado" o similar, lo tomamos como éxito
                if (e.message?.includes('ya fue confirmado') || e.message?.includes('processed')) {
                    isConfirmed = true;
                }
            }
                } else {
                  console.log('⚠️ [Wallet Check] No hay token para confirmar depósito.');
        }
        
        // Refrescar saldo siempre
        const oldBalance = balance;
        await refreshWallet();
        
        // Si el saldo aumentó en el monto esperado, o si confirmamos explícitamente
        // TODO: Comparar saldos para mayor seguridad
        
        if (isConfirmed) {
            logPaymentEvent('Wallet deposit confirmed');
            setPaymentStatus('success');
            setIsWaitingForPayment(false);
            setLoading(false);
            await AsyncStorage.removeItem('waitingForPayment');
            // Limpiar token
            if (savedPaymentId) await AsyncStorage.removeItem(`payment_${savedPaymentId}_token`);
        } else {
             // Si no pudimos confirmar, mantenemos verificando o pedimos al usuario revisar
             // Por ahora, para no bloquear, si no falló explícitamente, cancelamos la espera
             // OJO: Esto puede ser arriesgado. Mejor dejar en estado "verifying" si falla confirmación?
             // El usuario se quejaba de "loops". Si no podemos confirmar, asumimos que no pasó nada y volvemos?
             
             // Si estamos en este bloque, es porque checkPendingPayment fue llamado.
             // Si fue llamado muy rápido (antes de pagar), esto daría falso positivo de fallo.
             
             console.log('⚠️ [Wallet Check] No se pudo confirmar el depósito. Manteniendo estado...');
             // No cambiar estado a success si no estamos seguros
             // Pero si el usuario volvió del navegador, probablemente terminó o canceló.
             
             // Si el webview NO está visible, y estamos aquí, probablemente el usuario canceló o terminó.
             // Si webview está visible, este check NO debería correr (protegido por lógica).
             
             // Si llegamos aquí sin confirmación positiva, marcamos como cancelado/fallido para que intente de nuevo
             // setPaymentStatus('failure'); // O 'verifying'?
        }
        
        // HACK TEMPORAL: Como el backend maneja el callback, a veces el front no se entera
        // Si el usuario cerró el webview manual, se llama markPaymentCancelled
        // Si el webview redireccionó al app, se llama checkPendingPayment
        
        if (!isConfirmed) {
            // Reintentar un par de veces?
            if (pollingAttempts < 3) {
                 console.log(`⚠️ [Wallet Check] Intento ${pollingAttempts + 1}/3 fallido. Reintentando...`);
                 setPollingAttempts(prev => prev + 1);
                 setReconciliationNeeded(true); // Activar polling
                 setIsConfirming(false);
                 return;
            }
            // Si después de 3 intentos no hay confirmación, asumir error
            console.log('❌ [Wallet Check] No se pudo confirmar el depósito tras varios intentos.');
            setReconciliationNeeded(false);
            setPaymentStatus('failure');
            setIsConfirming(false);
            return;
        } else {
             setIsConfirming(false);
             return;
        }
      }

      // FLUJO NORMAL: Publicaciones e inspecciones
      let tokenToConfirm: string | undefined = directToken;

      if (!tokenToConfirm) {
        const response = await executeWithRetry(
          () => apiService.get('/payments/webpay/check-pending'),
          'check_pending_payment'
        );

        if (response?.hasPending && response?.token) {
          tokenToConfirm = response.token;
        }
      }
      
      if (tokenToConfirm) {
        logPaymentEvent('Pending payment found', { token: tokenToConfirm.substring(0, 10) + '...' });

        // Confirmar el pago (sin reintentos automáticos para evitar 422)
        let result;
        try {
          result = await apiService.confirmWebPayTransaction(tokenToConfirm);
        } catch (confirmError: any) {
          // Si es error 422, verificar el estado del pago en lugar de fallar
          if (confirmError?.message?.includes('422') || 
              confirmError?.message?.includes('already locked') || 
              confirmError?.message?.includes('Invalid status')) {
            logPaymentEvent('Transaction already processed, checking payment status', {}, 'warn');
            
            // Verificar el estado del pago directamente
            const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
            if (paymentCheck?.estado === 'Completado') {
              logPaymentEvent('Payment confirmed as completed', { paymentId: savedPaymentId });
              result = { success: true, status: 'AUTHORIZED', alreadyProcessed: true };
            } else {
              throw confirmError;
            }
          } else {
            throw confirmError;
          }
        }
        
        logPaymentEvent('WebPay confirmation response', { 
          status: result?.status,
          responseCode: result?.response_code,
          authorizationCode: result?.authorization_code,
          fullResult: result
        });

        // El payment service puede devolver diferentes formatos:
        // 1. Confirmación exitosa: { response_code: 0, status: 'AUTHORIZED', ... }
        // 2. Transacción anidada: { transaction: { response_code: 0 } }
        // 3. Solo info de transacción: { token, url } (esto significa que no se confirmó aún)
        
        const responseCode = result?.response_code ?? result?.transaction?.response_code;
        const status = result?.status ?? result?.transaction?.status;
        const hasOnlyTokenUrl = result?.token && result?.url && !responseCode && !status;
        
        console.log('🔍 Response analysis:', {
          hasResponseCode: !!responseCode,
          responseCode,
          hasStatus: !!status,
          status,
          hasOnlyTokenUrl,
          fullResult: result
        });
        
        // Si solo tiene token/url, significa que el pago aún no se confirmó
        if (hasOnlyTokenUrl) {
          logPaymentEvent('Payment not yet confirmed - waiting for user to complete', { result }, 'warn');
          setReconciliationNeeded(true);
          setPaymentStatus('verifying');
          setLoading(false);
          return;
        }

        const isAuthorized = responseCode === 0 || status === 'AUTHORIZED';

        console.log('🔍 isAuthorized:', isAuthorized, '| response_code:', responseCode, '| status:', status);

        if (isAuthorized) {
          logPaymentEvent('Payment authorized successfully');
          setReconciliationNeeded(false);
          // Update state IMMEDIATELY to success
          setPaymentStatus('success');
          setIsWaitingForPayment(false);
          setLoading(true); // Mantener loading mientras procesa entidades
          await AsyncStorage.removeItem('waitingForPayment');
          
          // Process successful payment
          try {
            await processSuccessfulPayment(savedPaymentId);
            logPaymentEvent('Successfully processed payment entities');
          } catch (processError: any) {
            logPaymentEvent('Error processing payment entities', { error: processError?.message }, 'error');
            console.error('❌ Error in processSuccessfulPayment:', processError);
            // Already set to success, so user sees payment succeeded even if post-processing failed
          } finally {
            setLoading(false);
          }
        } else if (responseCode && responseCode > 0) {
          // Rechazo explícito del banco
          logPaymentEvent('Payment rejected by bank', { responseCode }, 'warn');
          
          setReconciliationNeeded(false); // Detener polling
          setIsWaitingForPayment(false);
          await AsyncStorage.removeItem('waitingForPayment');
          
          // Marcar pago como fallido en backend
          await markPaymentCancelled(savedPaymentId, `Rechazado por el banco (código: ${responseCode})`);
          
          setPaymentStatus('failure'); // Actualizar estado para UI
          
          Alert.alert(
            'Pago Rechazado',
            'Tu pago fue rechazado por el banco. Verifica los datos de tu tarjeta e intenta nuevamente.',
            [{ text: 'OK' }]
          );
          setLoading(false);
        } else {
          // Estado ambiguo - mantener verificando
          logPaymentEvent('Ambiguous payment state - continuing verification', { result }, 'warn');
          setReconciliationNeeded(true);
          // Mantener en estado 'verifying' para que el usuario vea el mensaje en pantalla
          setPaymentStatus('verifying');
          setLoading(false);
        }
      } else {
        logPaymentEvent('No pending payment response from backend - starting auto-polling', {}, 'warn');
        setReconciliationNeeded(true);
        setPollingAttempts(0);
        setPaymentStatus('verifying');
        setLoading(false);
      }
    } catch (error: any) {
      logPaymentEvent('Error checking pending payment', { error: error?.message }, 'error');
      
      const errorCategory = categorizeError(error);
      setErrorDetails(errorCategory);
      
      // Si es error 422, verificar estado final del pago
      if (errorCategory.code === 'ALREADY_PROCESSED') {
        const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');
        if (savedPaymentId) {
          try {
            const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
            if (paymentCheck?.estado === 'Completado') {
              logPaymentEvent('Payment verified as completed after 422 error');
              setPaymentStatus('success');
              setIsWaitingForPayment(false);
              await AsyncStorage.removeItem('waitingForPayment');
              setLoading(true);
              try {
                await processSuccessfulPayment(savedPaymentId);
              } catch (e) {
                console.error('Error processing after verification:', e);
              } finally {
                setLoading(false);
              }
              setIsConfirming(false);
              return;
            }
          } catch (e) {
            logPaymentEvent('Could not verify payment status', { error: e }, 'error');
          }
        }
      } else if (!errorCategory.retryable) {
        // ERROR NO RECUPERABLE: Antes de cancelar, verificar si el backend ya completó el pago
        // (El callback del backend pudo haber confirmado la transacción independientemente)
        logPaymentEvent('Non-retryable error, checking payment status before cancelling', { errorCategory }, 'warn');
        const savedPidForCheck = await AsyncStorage.getItem('waitingForPayment');
        if (savedPidForCheck) {
          try {
            const paymentCheck = await apiService.get(`/payments/${savedPidForCheck}`);
            if (paymentCheck?.estado === 'Completado') {
              logPaymentEvent('Payment actually completed despite frontend error', { paymentId: savedPidForCheck });
              setPaymentStatus('success');
              setIsWaitingForPayment(false);
              await AsyncStorage.removeItem('waitingForPayment');
              setLoading(true);
              try {
                await processSuccessfulPayment(savedPidForCheck);
              } catch (e) {
                console.error('Error processing after late verification:', e);
              } finally {
                setLoading(false);
              }
              setIsConfirming(false);
              return;
            }
          } catch (checkErr) {
            logPaymentEvent('Could not verify payment status before cancelling', { error: checkErr }, 'warn');
          }
        }
        // Solo cancelar si el pago realmente no fue completado
        markPaymentCancelled(undefined, errorCategory.message || 'Error no recuperable');
        setLoading(false);
        setIsConfirming(false);
        return;
      }
      
      setReconciliationNeeded(true);
      
      // No marcar como fallido - mantener verificando
      setPaymentStatus('verifying');
      setLoading(false);
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePayment = async () => {

    setLoading(true);
    setErrorDetails(null);
    // --- AGREGA ESTO ---
    setWebviewHtml(null); // Limpia basura anterior
    setWebviewUrl(null);  // Limpia URL anterior
    lastHandledReturnUrlRef.current = null;
    // -------------------
    isCancelledRef.current = false;
    
    // Validaciones previas
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      logPaymentEvent('Invalid amount', { amount }, 'error');
      Alert.alert('Error', 'Monto inválido. Por favor, intenta nuevamente.');
      return;
    }

    if (amountNum > 10000000) { // 10M max
      logPaymentEvent('Amount exceeds limit', { amount }, 'error');
      Alert.alert('Error', 'El monto excede el límite permitido.');
      return;
    }

    setLoading(true);
    setErrorDetails(null);
    isCancelledRef.current = false;

    try {
      const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
      
      // CASO ESPECIAL: WALLET DEPOSIT (viene desde wallet.tsx o similar)
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Wallet deposit WebPay flow initiated', { amount: amountNum });
        
        const user = await authService.getUser();
        if (!user) {
          logPaymentEvent('User not authenticated', {}, 'error');
          throw new Error('Usuario no autenticado');
        }

        console.log('🔵 [Wallet Deposit] Iniciando depósito de wallet...');
        
        // FORZAR ESTADO INICIAL
        setPaymentStatus('pending');
        setWebviewVisible(false);

        let depositResponse;
        try {
            // Iniciar depósito de wallet
            depositResponse = await executeWithRetry(
              () => walletService.initiateTransbankDeposit(amountNum),
              'initiate_wallet_deposit'
            );
        } catch (initError: any) {
            console.error('❌ [Wallet Deposit] Error en initiateTransbankDeposit:', initError);
            // Mostrar error específico
            throw new Error(initError.message || 'Error al conectar con el servicio de pagos');
        }
        
        console.log('🔵 [Wallet Deposit] Respuesta del backend:', JSON.stringify(depositResponse, null, 2));
        
        const paymentId = depositResponse?.paymentId;
        const webpayUrl = depositResponse?.url;
        const token = depositResponse?.token;
        
        if (!webpayUrl) {
          throw new Error('El servicio no entregó una URL de pago válida');
        }

        logPaymentEvent('Wallet deposit initiated', { paymentId, url: webpayUrl.substring(0, 50) + '...' });

        // Guardar paymentId para reconciliación
        if (paymentId) {
            await AsyncStorage.setItem('waitingForPayment', String(paymentId));
            await AsyncStorage.setItem(`payment_${paymentId}_timestamp`, Date.now().toString());
            await AsyncStorage.setItem(`payment_${paymentId}_amount`, amountNum.toString());
            if (token) {
                await AsyncStorage.setItem(`payment_${paymentId}_token`, token);
            }
        }

        console.log('🔵 [Wallet Deposit] Configurando WebView...');
        
        // Generar formulario HTML para auto-submit POST (Requerido para Transbank initTransaction)
        const autoSubmitHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Redirigiendo a WebPay...</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body onload="document.forms[0].submit()">
              <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
                <p>Redirigiendo a WebPay...</p>
                <form action="${webpayUrl}" method="POST">
                  <input type="hidden" name="token_ws" value="${token}" />
                  <noscript>
                    <input type="submit" value="Ir a pagar" />
                  </noscript>
                </form>
              </div>
            </body>
          </html>
        `;

        // Configurar estados
        setIsWaitingForPayment(true);
        setWebviewHtml(autoSubmitHtml);
        setWebviewUrl(webpayUrl); // Mantener URL para referencia
        setLoading(false);
        
        // Pequeño delay para asegurar que los estados se actualicen antes de abrir el modal
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('🔵 [Wallet Deposit] Abriendo WebView con formulario POST...');
        setWebviewVisible(true);

        if (Platform.OS !== 'web') {
           // Opcional: Toast o indicador
        }
        
        return;
      }
      
      if (selectedMethod === 'wallet') {
        logPaymentEvent('Wallet payment initiated', { balance, amount });
        
        if (balance < amountNum) {
           logPaymentEvent('Insufficient balance', { balance, required: amountNum }, 'warn');
           Alert.alert('Saldo Insuficiente', 'No tienes suficiente saldo para realizar este pago.');
           setLoading(false);
           return;
        }
        
        const descriptionStr = Array.isArray(description) ? description[0] : description;
        const walletResponse = await executeWithRetry(
          () => apiService.post('/wallet/payment', {
            amount: amountNum,
            description: descriptionStr || 'Pago de servicio'
          }),
          'wallet_payment'
        );
        
        if (walletResponse && walletResponse.success) {
          logPaymentEvent('Wallet payment success', { paymentId: walletResponse.paymentId });
          try {
            await processSuccessfulPayment(walletResponse.paymentId);
            refreshWallet();
          } catch (paymentError: any) {
            console.error('❌ Error en processSuccessfulPayment (wallet):', paymentError);
            setLoading(false);
            // El error ya fue mostrado por processSuccessfulPayment
          }
        } else {
          throw new Error('La respuesta del pago no fue exitosa');
        }
        setLoading(false);
        return;
      }

      // MODO WEBPAY: crear registro de Payment en backend, luego crear transacción WebPay
      logPaymentEvent('WebPay payment initiated');
      
      const user = await authService.getUser();
      if (!user) {
        logPaymentEvent('User not authenticated', {}, 'error');
        throw new Error('Usuario no autenticado');
      }

      logPaymentEvent('Creating payment record', { userId: user.id, amount: amountNum });

      // Crear registro de pago con reintentos
      const createdPayment = await executeWithRetry(
        () => apiService.post('/payments', {
          usuarioId: user.id,
          monto: amountNum,
          metodo: 'WebPay',
        }),
        'create_payment_record'
      );

      const paymentId = createdPayment?.id;
      if (!paymentId) {
        logPaymentEvent('Payment record creation failed', { response: createdPayment }, 'error');
        throw new Error('No se pudo crear el registro de pago');
      }

      logPaymentEvent('Payment record created', { paymentId });

      // Guardar el paymentId para reconciliación
      await AsyncStorage.setItem('waitingForPayment', paymentId);
      await AsyncStorage.setItem(`payment_${paymentId}_timestamp`, Date.now().toString());
      await AsyncStorage.setItem(`payment_${paymentId}_amount`, amountNum.toString());

      logPaymentEvent('Creating WebPay transaction', { paymentId });
      // Limpiar fallback timer si existía
      if (callbackFallbackRef.current) {
        clearTimeout(callbackFallbackRef.current);
        callbackFallbackRef.current = null;
      }

      // Crear transacción de WebPay con reintentos
      const webpayData = await executeWithRetry(
        () => apiService.createWebPayTransaction({
          amount: amountNum,
          returnUrl: `${API_URL}/payments/webpay/callback`,
          paymentId,
        }),
        'create_webpay_transaction'
      );

      logPaymentEvent('WebPay transaction created', { 
        hasUrl: !!webpayData?.url,
        token: webpayData?.token?.substring(0, 10) + '...' 
      });

      if (!webpayData || !webpayData.url) {
        logPaymentEvent('Invalid WebPay response', { webpayData }, 'error');
        // Marcar como necesita reconciliación
        setReconciliationNeeded(true);
        throw new Error('No se recibió una URL válida de WebPay');
      }

      setIsWaitingForPayment(true);

      // Guardar token de Transbank para reconciliación posterior
      if (webpayData.token) {
        await AsyncStorage.setItem(`payment_${paymentId}_token`, webpayData.token);
      }

      // Abrir la URL dentro de la app usando WebView con formulario POST
      // (Requerido por Transbank WebPay Plus - la URL debe recibir token_ws via POST)
      const originalUrl = webpayData.url as string;
      
      console.log('🔵 [WebPay] Limpiando estado loading antes de abrir WebView...');
      setLoading(false);  // Limpiar loading ANTES de abrir WebView
      
      const autoSubmitHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Redirigiendo a WebPay...</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body onload="document.forms[0].submit()">
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
              <p>Redirigiendo a WebPay...</p>
              <form action="${originalUrl}" method="POST">
                <input type="hidden" name="token_ws" value="${webpayData.token}" />
                <noscript>
                  <input type="submit" value="Ir a pagar" />
                </noscript>
              </form>
            </div>
          </body>
        </html>
      `;

      setWebviewHtml(autoSubmitHtml);
      setWebviewUrl(originalUrl); // Mantener URL para referencia
      
      // Pequeño delay para que React actualice estados
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setWebviewVisible(true);
      
      console.log('🔵 [WebPay] WebView configurado con POST form. Visible:', true);
      
      return; // Importante: salir aquí para no ejecutar el catch
    } catch (error: any) {
      logPaymentEvent('Payment initiation failed', { error: error?.message }, 'error');
      
      const errorCategory = categorizeError(error);
      setErrorDetails(errorCategory);
      
      if (errorCategory.retryable && retryCount < MAX_RETRIES) {
        Alert.alert(
          'Error Temporal',
          errorCategory.userMessage + ' ¿Deseas reintentar?',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => setLoading(false) },
            { text: 'Reintentar', onPress: () => {
              setRetryCount(retryCount + 1);
              setTimeout(() => handlePayment(), 1000);
            }}
          ]
        );
      } else {
        Alert.alert('Error', errorCategory.userMessage);
        setIsWaitingForPayment(false);
        setLoading(false);
        setPaymentStatus('failure');
      }
    }
  };

  const markPaymentCancelled = async (paymentId?: string, reason?: string) => {
    isCancelledRef.current = true;
    try {
      if (!paymentId) {
        // Try to read saved paymentId
        paymentId = await AsyncStorage.getItem('waitingForPayment');
      }
      
      if (paymentId) {
        // Intentar notificar al backend, pero no bloquear la UI si falla
        apiService.fetch(`/payments/${paymentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'Fallido', detalles: reason || 'Anulado por el usuario' }),
        }).catch(err => console.log('Error notifying backend of cancellation:', err));

        // Clean up async storage
        await AsyncStorage.removeItem('waitingForPayment');
      }
    } catch (e) {
      console.error('Error marcando pago como anulado:', e);
    } finally {
        // UI Cleanup - FORCE reset ALWAYS
        console.log('🛑 [PaymentGateway] Forcing cancellation state');
        // Limpiar fallback timer si existe
        if (callbackFallbackRef.current) {
          clearTimeout(callbackFallbackRef.current);
          callbackFallbackRef.current = null;
        }
        setIsWaitingForPayment(false);
        setReconciliationNeeded(false);
        setPollingAttempts(0);
        setPaymentStatus('cancelled');
        setLoading(false);
        setWebviewVisible(false); // Ensure modal is closed
        setWebviewHtml(null);
    }
  };

  const processSuccessfulPayment = async (paymentId?: string) => {
    try {
      const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
      
      // CASO ESPECIAL: WALLET DEPOSIT
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Processing wallet deposit confirmation');
        
        // Refrescar saldo de wallet
        await refreshWallet();
        
        setPaymentStatus('success');
        setIsWaitingForPayment(false);
        await AsyncStorage.removeItem('waitingForPayment');
        logPaymentEvent('Wallet deposit processed successfully');
        return;
      }
      
      // RESTO DE CASOS: Publicaciones e inspecciones
      // Safety: ensure payment is confirmed in backend before creating any entities
      if (paymentId) {
        const isCompleted = await waitForPaymentCompletion(paymentId);
        if (!isCompleted) {
          logPaymentEvent('Payment not marked as completed yet after authorization', { paymentId }, 'warn');
          setReconciliationNeeded(true);
          setPollingAttempts(0);
          setPaymentStatus('verifying');
          setIsWaitingForPayment(true);
          Alert.alert('Verificando pago', 'Tu pago fue autorizado, pero aún estamos confirmando el estado final. Esto puede tomar unos segundos.');
          return;
        }
      }
      if (!metadata) {
        throw new Error('No se encontraron datos de la publicación');
      }

      const user = await authService.getUser();
      if (!user) throw new Error('Usuario no autenticado');
      
      console.log('👤 [PaymentGateway] Usuario autenticado:', user.id);

      const metadataStr = Array.isArray(metadata) ? metadata[0] : metadata;
      if (!metadataStr) throw new Error('Metadata inválida');

      const vehicleData = JSON.parse(metadataStr);
      console.log('Procesando pago exitoso para vehículo:', vehicleData.plate || vehicleData.patente);
      console.log('Vehicle Data Keys:', Object.keys(vehicleData));

      // 2. Crear publicación (o inspección directa)
      if (serviceTypeStr === 'inspection_only') {
          console.log('Procesando pago de inspección para vehículo existente');
          const { publicationId, inspectionDate, inspectionTime, inspectionLocation, horarioId, solicitanteId } = vehicleData;
          
          let fechaProgramada = null;
          if (inspectionDate && inspectionTime) {
              try {
                  if (inspectionDate.includes('T')) {
                      const dateObj = new Date(inspectionDate);
                      const [hours, minutes] = inspectionTime.split(':');
                      dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                      fechaProgramada = dateObj.toISOString();
                  } else if (inspectionDate.includes('/')) {
                      const [day, month, year] = inspectionDate.split('/');
                      const [hours, minutes] = inspectionTime.split(':');
                      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
                      fechaProgramada = dateObj.toISOString();
                  } else {
                      const dateObj = new Date(inspectionDate);
                      const [hours, minutes] = inspectionTime.split(':');
                      dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                      fechaProgramada = dateObj.toISOString();
                  }
              } catch (e) {
                  console.error('Error parsing date:', e);
              }
          }

          const inspectionPrice = prices.find(p => p.nombre.toLowerCase() === 'inspeccion')?.precio || 40000;
          const valorEntero = Math.round(Number(inspectionPrice));

          const inspectionData = {
            solicitanteId: solicitanteId || user.id,
            publicacionId: publicationId,
            valor: valorEntero,
            estado_pago: 'Confirmado',
            paymentId: paymentId,
            horarioId: horarioId ? Number(horarioId) : undefined,
            fechaProgramada: fechaProgramada,
            estado_insp: 'Pendiente'
          };

          console.log('Creando inspección (inspection_only):', inspectionData);
          console.log('Valor de inspección (entero):', valorEntero);
          await apiService.createInspection(inspectionData);
          
          setPaymentStatus('success');
          setIsWaitingForPayment(false);
          await AsyncStorage.removeItem('waitingForPayment');
          return;
      }

      // Mapear datos al formato que espera el backend (CreateVehicleDto)
      const backendVehicleData = {
        patente: vehicleData.plate || vehicleData.patente,
        marca: vehicleData.brand,
        modelo: vehicleData.model,
        version: vehicleData.version,
        anio: typeof vehicleData.year === 'number' ? vehicleData.year : parseInt(String(vehicleData.year)),
        color: vehicleData.color,
        kilometraje: typeof vehicleData.kilometers === 'number' ? vehicleData.kilometers : Number(String(vehicleData.kilometers ?? '0').replace(/\D/g, '')),
        transmision: vehicleData.transmission,
        tipoCombustible: vehicleData.fuelType,
        tipoCarroceria: vehicleData.bodyType,
        puertas: typeof vehicleData.doors === 'number' ? vehicleData.doors : (Number(String(vehicleData.doors ?? '4').replace(/\D/g, '')) || 4),
        vin: vehicleData.vin || '',
        motor: vehicleData.motor || '',
        numeroMotor: vehicleData.numeroMotor || '',
        tipoVehiculo: vehicleData.tipoVehiculo,
        imagenes: vehicleData.images || []
      };

      console.log('Enviando vehículo al backend:', backendVehicleData);

      const vehicleResponse = await apiService.createVehicle(backendVehicleData);
      
      console.log('Vehículo creado:', vehicleResponse);

      if (!vehicleResponse || !vehicleResponse.id) {
        throw new Error('Error al crear el vehículo');
      }

      // 3. Crear publicación
      const publicationData = {
        vendedorId: user.id,
        vehiculoId: vehicleResponse.id,
        valor: typeof vehicleData.price === 'number' ? vehicleData.price : Number(String(vehicleData.price ?? '0').replace(/\D/g, '')),
        descripcion: vehicleData.description || '',
        estado: 'Pendiente',
        fotos: vehicleData.images || []
      };

      console.log('Creando publicación:', publicationData);
      const publicationResponse = await apiService.createPublication(publicationData);

      if (!publicationResponse) {
        throw new Error('Error al crear la publicación');
      }

      console.log('Publicación creada:', publicationResponse);

      // 4. Si es con inspección, agendarla
      if (serviceTypeStr === 'publication_with_inspection') {
        const { inspectionDate, inspectionTime, inspectionLocation, horarioId } = vehicleData;
        console.log('Agendando inspección...', { inspectionDate, inspectionTime, inspectionLocation, horarioId });

        let fechaProgramada = new Date().toISOString();
        if (inspectionDate && inspectionTime) {
          try {
            const [hours, minutes] = inspectionTime.split(':');
            let dateObj: Date;
            
            // Manejar diferentes formatos de fecha
            if (typeof inspectionDate === 'string') {
              // Si ya es ISO string
              if (inspectionDate.includes('T')) {
                dateObj = new Date(inspectionDate);
              } 
              // Si es formato DD/MM/YYYY
              else if (inspectionDate.includes('/')) {
                const [day, month, year] = inspectionDate.split('/');
                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              }
              // Si es formato YYYY-MM-DD
              else if (inspectionDate.includes('-')) {
                dateObj = new Date(inspectionDate);
              }
              // Intentar parseo directo
              else {
                dateObj = new Date(inspectionDate);
              }
            } else if (inspectionDate instanceof Date) {
              dateObj = new Date(inspectionDate);
            } else {
              // Fallback: usar la fecha actual
              console.warn('⚠️ Formato de fecha no reconocido, usando fecha actual');
              dateObj = new Date();
            }
            
            // Validar que la fecha es válida
            if (isNaN(dateObj.getTime())) {
              console.error('❌ Fecha inválida después del parseo:', inspectionDate);
              throw new Error('Fecha de inspección inválida');
            }
            
            dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            // Validar nuevamente después de setHours
            if (isNaN(dateObj.getTime())) {
              console.error('❌ Fecha inválida después de setHours');
              throw new Error('Hora de inspección inválida');
            }
            
            fechaProgramada = dateObj.toISOString();
            console.log('✅ Fecha programada parseada:', fechaProgramada);
          } catch (dateError) {
            console.error('❌ Error parseando fecha de inspección:', dateError);
            // Usar fecha actual + 1 día como fallback
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() + 1);
            fallbackDate.setHours(10, 0, 0, 0);
            fechaProgramada = fallbackDate.toISOString();
            console.log('⚠️ Usando fecha fallback:', fechaProgramada);
          }
        }

        const inspectionPrice = prices.find(p => p.nombre.toLowerCase() === 'inspeccion')?.precio || 40000;
        const valorEntero = Math.round(Number(inspectionPrice));

        const inspectionData = {
          solicitanteId: user.id,
          publicacionId: publicationResponse.id,
          horarioId: horarioId ? Number(horarioId) : undefined,
          fechaProgramada: fechaProgramada,
          valor: valorEntero,
          estado_insp: 'Pendiente',
          estado_pago: 'Confirmado',
          paymentId: paymentId
        };

        console.log('Datos de inspección a crear:', inspectionData);
        console.log('Valor de inspección (entero):', valorEntero);
        await apiService.createInspection(inspectionData);
        console.log('Inspección creada correctamente');
      }

      setPaymentStatus('success');
      setIsWaitingForPayment(false);
      await AsyncStorage.removeItem('waitingForPayment');

    } catch (error: any) {
      console.error('❌ Error procesando pago exitoso:', error);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error stack:', error?.stack);
      console.error('❌ Error response:', error?.response?.data);
      
      const errorMsg = error?.message || error?.response?.data?.message || 'Error desconocido';
      Alert.alert(
        'Error al Procesar Pago', 
        `El pago fue exitoso pero hubo un error al crear la publicación.\n\nDetalle: ${errorMsg}\n\nContacta a soporte.`,
        [{ text: 'OK' }]
      );
      setPaymentStatus('success'); // Dejar en success para que el usuario vea que pagó, aunque falló el post-proceso
      setLoading(false);
    }
  };

// --- INICIO DEL BLOQUE DE RENDERIZADO Y MODAL ---
  const renderContent = () => {
    // 1. Si está cargando o verificando (y no estamos en el WebView), mostramos spinner
    if ((loading || paymentStatus === 'verifying') && !webviewVisible) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>
            {paymentStatus === 'verifying' ? 'Confirmando tu pago...' : 'Procesando...'}
          </Text>
        </View>
      );
    }

    // 2. PANTALLA DE ÉXITO (Aquí es donde queremos llegar)
    if (paymentStatus === 'success') {
      const isWalletDeposit = (Array.isArray(serviceType) ? serviceType[0] : serviceType) === 'wallet_deposit';
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>{isWalletDeposit ? '¡Carga Exitosa!' : '¡Pago Exitoso!'}</Text>
          <Text style={styles.successText}>
             {isWalletDeposit ? 'Tu saldo ha sido actualizado.' : 'Tu transacción se completó correctamente.'}
          </Text>
          <Button
            title={isWalletDeposit ? "Volver a Billetera" : "Continuar"}
            onPress={() => {
                // Limpiamos navegación para evitar volver atrás al pago
                if (isWalletDeposit) {
                    router.dismissAll();
                    router.replace('/(tabs)/wallet');
                } else {
                    router.dismissAll();
                    router.replace('/(tabs)');
                }
            }}
            style={styles.homeButton}
          />
        </View>
      );
    }
    
    // 3. PANTALLA DE FALLO
    if (paymentStatus === 'failure' || paymentStatus === 'cancelled') {
        return (
            <View style={styles.centerContainer}>
                <Ionicons name="close-circle" size={80} color="#F44336" />
                <Text style={styles.successTitle}>Pago No Completado</Text>
                <Text style={styles.successText}>
                    {paymentStatus === 'cancelled' ? 'La operación fue anulada.' : 'Hubo un error al procesar el pago.'}
                </Text>
                <Button 
                    title="Intentar Nuevamente" 
                    onPress={() => {
                        setPaymentStatus('pending');
                        setIsWaitingForPayment(false);
                        setWebviewVisible(false);
                    }} 
                    style={styles.homeButton} 
                />
                <Button 
                    variant="outline" 
                    title="Volver" 
                    onPress={() => router.back()} 
                    style={{ marginTop: 10, width: 200 }} 
                />
            </View>
        );
    }

    // 4. PLACEHOLDER MIENTRAS ESTÁ EL WEBVIEW ABIERTO
    if (webviewVisible) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Completando pago en WebPay...</Text>
        </View>
      );
    }

    // 5. PANTALLA NORMAL (Formulario de pago)
    return (
      <View style={styles.container}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen de Pago</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Servicio:</Text>
            <Text style={styles.value}>{Array.isArray(description) ? description[0] : description}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total a Pagar:</Text>
            <Text style={styles.totalValue}>${Number(amount).toLocaleString('es-CL')}</Text>
          </View>
        </View>

        <Text style={styles.methodTitle}>Selecciona Medio de Pago</Text>
        
        {/* Botón WebPay */}
        <TouchableOpacity 
          style={[styles.methodCard, selectedMethod === 'webpay' && styles.selectedMethod]}
          onPress={() => setSelectedMethod('webpay')}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="card" size={24} color="#333" />
                <Text style={styles.methodText}>WebPay Plus</Text>
            </View>
            {selectedMethod === 'webpay' && <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />}
        </TouchableOpacity>

        {/* Botón Wallet (Solo si no es recarga) */}
        {(Array.isArray(serviceType) ? serviceType[0] : serviceType) !== 'wallet_deposit' && (
        <TouchableOpacity 
          style={[styles.methodCard, selectedMethod === 'wallet' && styles.selectedMethod]}
          onPress={() => setSelectedMethod('wallet')}
        >
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="wallet" size={24} color="#333" />
                <View>
                    <Text style={styles.methodText}>Billetera AutoBox</Text>
                    <Text style={styles.balanceText}>Saldo: ${balance.toLocaleString()}</Text>
                </View>
            </View>
            {selectedMethod === 'wallet' && <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />}
        </TouchableOpacity>
        )}

        <Button 
            title={`Pagar $${Number(amount).toLocaleString('es-CL')}`} 
            onPress={handlePayment} 
            style={styles.payButton} 
        />
      </View>
    );
  };

  return (
    <Screen backgroundColor="#F5F5F5">
      {renderContent()}

{/* --- MODAL DE PRODUCCIÓN (SEGURIDAD MÁXIMA) --- */}
{/* --- MODAL CORREGIDO: DEJA ENTRAR A TRANSBANK --- */}
<Modal
        visible={webviewVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
            // Si el usuario presiona "Atrás" físico en Android
            Alert.alert('Cancelar Pago', '¿Deseas salir sin pagar?', [
                { text: 'No', style: 'cancel' },
                { text: 'Sí, Salir', style: 'destructive', onPress: () => { setWebviewVisible(false); markPaymentCancelled(); } }
            ]);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <StatusBar barStyle="dark-content" />
            
            {/* Header Simple */}
            <View style={styles.webviewHeader}>
                <Text style={styles.webviewTitle}>WebPay</Text>
                <TouchableOpacity onPress={() => {
                     // Botón X Manual
                     setWebviewVisible(false);
                     checkPendingPayment(); // Siempre verificamos, por si acaso
                }}>
                    <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            {/* Debug URL: Muestra qué está pasando realmente */}
            <View style={{ padding: 4, backgroundColor: '#eee' }}>
                <Text numberOfLines={1} style={{ fontSize: 10, color: '#555', textAlign: 'center' }}>
                    {webviewUrl || 'Esperando URL...'}
                </Text>
            </View>

            {(webviewUrl || webviewHtml) ? (
                <WebView
                    key="webview-payment" // Forzamos re-render si cambia
                    
                    // 1. PERMISOS TOTALES
                    originWhitelist={['*']} 
                    
                    source={webviewHtml ? { html: webviewHtml, baseUrl: 'https://webpay3gint.transbank.cl' } : { uri: webviewUrl as string }}
                    
                    style={{ flex: 1 }}
                    startInLoadingState={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    
                    // 2. DEBUG DE ERRORES DE CARGA (Para saber si falla la red)
                    onError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        console.warn('WebView error: ', nativeEvent);
                        Alert.alert('Error de Conexión', 'No pudimos cargar el banco via WebPay.');
                    }}
                    
                    // 3. INTERCEPTOR: Deep links y cancelaciones se capturan, callback se deja pasar
                    onShouldStartLoadWithRequest={(request) => {
                        const url = request.url;
                        console.log('⚡ Navegando a:', url);

                      // Deep links (autobox://) y TBK_TOKEN (cancelación): interceptar
                      if (isWebPayReturnUrl(url)) {
                        // Limpiar fallback timer si existe (el redirect llegó correctamente)
                        if (callbackFallbackRef.current) {
                          clearTimeout(callbackFallbackRef.current);
                          callbackFallbackRef.current = null;
                        }
                        handleWebPayReturnFromWebView(url);
                        return false;
                      }

                      // Callback del backend: DEJAR PASAR para que el backend procese
                      // el commit de Transbank y redirija al deep link
                      if (isWebPayCallbackUrl(url)) {
                        console.log('🔵 [WebView] Callback URL detectada, permitiendo carga para que backend procese');
                        return true;
                      }
                        
                      // DEJAR PASAR TODO LO DEMÁS (Transbank, Redirecciones, etc.)
                      return true;
                    }}
                    
                    // 4. RESPALDO: Detectar retorno y callback del backend
                    onNavigationStateChange={(navState) => {
                        // Deep links y cancelaciones
                        if (isWebPayReturnUrl(navState.url)) {
                          if (callbackFallbackRef.current) {
                            clearTimeout(callbackFallbackRef.current);
                            callbackFallbackRef.current = null;
                          }
                          handleWebPayReturnFromWebView(navState.url);
                          return;
                        }

                        // Callback del backend cargada: el backend está procesando.
                        // Si el backend no redirige a un deep link, hacer fallback a polling.
                        if (isWebPayCallbackUrl(navState.url) && !navState.loading && !callbackFallbackRef.current) {
                          console.log('🔵 [WebView] Callback del backend cargada, esperando redirect...');
                          callbackFallbackRef.current = setTimeout(() => {
                            callbackFallbackRef.current = null;
                            // Si aún no se procesó el retorno, cerrar WebView y verificar estado
                            if (!lastHandledReturnUrlRef.current && !isCancelledRef.current) {
                              console.log('⚠️ [WebView] Backend no redirigió a deep link, cerrando y verificando pago...');
                              setWebviewVisible(false);
                              void checkPendingPayment();
                            }
                          }, 4000);
                        }
                    }}
                />
            ) : (
                <View style={[styles.centerContainer, { flex: 1 }]}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={{ marginTop: 16, color: '#666' }}>Iniciando conexión...</Text>
                </View>
            )}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  homeButton: {
    width: '100%',
    maxWidth: 300,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedMethod: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  methodText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
  },
  balanceText: {
      fontSize: 14,
      color: '#666',
      marginLeft: 12,
  },
  payButton: {
    marginTop: 'auto',
    marginBottom: 16,
  },
  webviewHeader: {
      height: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
  },
  webviewTitle: {
      fontSize: 16,
      fontWeight: 'bold',
  },
  retryText: {
    marginTop: 8,
    fontSize: 14,
    color: '#FF9800',
  },
  warningText: {
    marginTop: 8,
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
  },
  infoText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});