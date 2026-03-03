import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, AppState, Platform, TouchableOpacity, Modal, SafeAreaView, useWindowDimensions, StatusBar, BackHandler } from 'react-native';
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
import { PAYMENT_API_URL } from '../../../constants/Config';

// Configuración de reintentos
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 10000;

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
  const bankSuccessEvidenceRef = useRef(false);
  const callbackFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.log('🔵 [State] webviewVisible cambió a:', webviewVisible);
  }, [webviewVisible]);

  useEffect(() => {
    console.log('🔵 [State] webviewUrl cambió a:', webviewUrl);
  }, [webviewUrl]);

  // Bloquear botón de retroceso en Android cuando el WebView de pago está visible
  useEffect(() => {
    if (!webviewVisible) return;
    const backAction = () => {
      Alert.alert(
        'Pago en proceso',
        '¿Estás seguro de que deseas cancelar el pago?',
        [
          { text: 'Continuar pagando', style: 'cancel' },
          { text: 'Sí, Salir', style: 'destructive', onPress: () => { setWebviewVisible(false); markPaymentCancelled(); } },
        ]
      );
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [webviewVisible]);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { amount, description, serviceType, metadata } = params;

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
    let localAttempts = 0;
    
    if (reconciliationNeeded && paymentStatus === 'verifying') {
      console.log('🔄 [Polling] Iniciando polling automático de verificación de pago');
      
      checkPendingPayment();
      
      pollingInterval = setInterval(async () => {
        localAttempts++;
        if (localAttempts < 20) {
          console.log(`🔄 [Polling] Intento ${localAttempts}/20`);
          setPollingAttempts(localAttempts);
          await checkPendingPayment();
        } else {
          console.log('⏹️ [Polling] Máximo de intentos alcanzado');

          if (bankSuccessEvidenceRef.current) {
            console.log('✅ [Polling] Evidencia de éxito bancario detectada, finalizando flujo en frontend');
            setReconciliationNeeded(false);
            setIsWaitingForPayment(false);

            const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
            if (serviceTypeStr === 'wallet_deposit') {
              try {
                await refreshWallet();
              } catch (refreshError: any) {
                console.warn('⚠️ [Polling] Error refrescando wallet tras éxito bancario:', refreshError?.message);
              }
              setPaymentStatus('success');
              setLoading(false);
              if (pollingInterval) clearInterval(pollingInterval);
              return;
            }

            setLoading(true);
            try {
              await processSuccessfulPayment(undefined);
            } catch (processError: any) {
              console.warn('⚠️ [Polling] Error en finalización post-pago:', processError?.message);
            } finally {
              setPaymentStatus('success');
              setLoading(false);
            }

            if (pollingInterval) clearInterval(pollingInterval);
            return;
          }

          setReconciliationNeeded(false);
          Alert.alert(
            'Verificación Pendiente',
            'No pudimos confirmar automáticamente tu pago. Por favor, verifica tu saldo o contacta a soporte si realizaste el pago.',
            [{ text: 'OK' }]
          );
          if (pollingInterval) clearInterval(pollingInterval);
        }
      }, 3000);
    }
    
    return () => {
      if (pollingInterval) {
        console.log('🛑 [Polling] Deteniendo polling');
        clearInterval(pollingInterval);
      }
    };
  }, [reconciliationNeeded, paymentStatus]);

  const loadPrices = async () => {
    try {
      // FIX: usar el endpoint correcto que expone el backend (/payments/prices)
      const data = await apiService.getPrices();
      setPrices(data);
    } catch (error) {
      console.error('Error loading prices:', error);
    }
  };

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

      if (isNetworkError && currentRetry < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, currentRetry);
        logPaymentEvent(`Retrying ${operation} in ${delay}ms`, { attempt: currentRetry + 1 }, 'warn');
        
        await new Promise(resolve => setTimeout(resolve, delay));
        setRetryCount(currentRetry + 1);
        return executeWithRetry(fn, operation, currentRetry + 1);
      }
      
      throw error;
    }
  };

  const categorizeError = (error: any): PaymentError => {
    const errorMsg = error?.message || error?.toString() || 'Error desconocido';
    const errorCode = error?.code || error?.response?.status?.toString() || 'UNKNOWN';

    if (errorCode === '422' || errorMsg.includes('already locked') || errorMsg.includes('Invalid status')) {
      return {
        code: 'ALREADY_PROCESSED',
        message: errorMsg,
        retryable: false,
        userMessage: 'Esta transacción ya fue procesada. Verificando estado...'
      };
    }

    if (['TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].some(code => errorMsg.includes(code))) {
      return {
        code: 'NETWORK_ERROR',
        message: errorMsg,
        retryable: true,
        userMessage: 'Problemas de conexión. Estamos verificando el estado de tu pago...'
      };
    }

    if (['401', '403'].includes(errorCode)) {
      return {
        code: 'AUTH_ERROR',
        message: errorMsg,
        retryable: false,
        userMessage: 'Error de configuración. Contacta a soporte.'
      };
    }

    if (errorCode === '400') {
      return {
        code: 'VALIDATION_ERROR',
        message: errorMsg,
        retryable: false,
        userMessage: 'Los datos del pago son inválidos. Verifica e intenta nuevamente.'
      };
    }

    if (errorCode === '503') {
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: errorMsg,
        retryable: true,
        userMessage: 'El servicio de pago está temporalmente no disponible. Intenta en unos minutos.'
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: errorMsg,
      retryable: false,
      userMessage: 'Ocurrió un error inesperado. Contacta a soporte si el problema persiste.'
    };
  };

  const WEBPAY_CALLBACK_PATH = '/payments/webpay/callback';
  const WEBPAY_CALLBACK_LEGACY_PATH = '/webpay/callback';
  const WEBPAY_PAY_PATH = '/payments/webpay/pay';
  const WEBPAY_PAY_LEGACY_PATH = '/webpay/pay';
  const normalizedPaymentApiUrl = PAYMENT_API_URL.endsWith('/') ? PAYMENT_API_URL.slice(0, -1) : PAYMENT_API_URL;
  const WEBPAY_RETURN_URL = `${normalizedPaymentApiUrl}${WEBPAY_CALLBACK_LEGACY_PATH}`;

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

  // ─── BUG FIX INTACTO ───────────────────────────────────────────────────────
  // isWebPayReturnUrl: detecta deep links y cancelaciones TBK_TOKEN.
  // NO incluye la URL del callback del backend — esa debe cargarse para que
  // el backend haga el commit con Transbank y luego redirija al deep link.
  const isWebPayReturnUrl = (url: string): boolean => {
    return (
      url.startsWith('autobox://') ||
      url.includes('TBK_TOKEN=')
    );
  };

  // isWebPayCallbackUrl: detecta cuándo el WebView está llegando a la URL del
  // backend — en ese caso se deja pasar (return true) para que el backend
  // reciba el POST con token_ws y procese el commit.
  // También deja pasar /webpay/pay (endpoint intermedio del backend que genera
  // el form POST hacia Transbank), para no interceptarlo antes de tiempo.
  const isWebPayCallbackUrl = (url: string): boolean => {
    return (
      (
        url.includes(WEBPAY_CALLBACK_PATH) ||
        url.includes(WEBPAY_CALLBACK_LEGACY_PATH)
      ) &&
      !url.startsWith('autobox://')
    );
  };

  const isWebPayIntermediateUrl = (url: string): boolean => {
    return (
      (
        url.includes(WEBPAY_PAY_PATH) ||
        url.includes(WEBPAY_PAY_LEGACY_PATH)
      ) &&
      !url.startsWith('autobox://')
    );
  };

  const normalizeResponseCode = (code: any): number | null => {
    if (code === undefined || code === null || code === '') return null;
    const parsed = Number(code);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const isPaymentCompletedStatus = (estado: any): boolean => {
    const normalized = typeof estado === 'string' ? estado.toUpperCase() : '';
    return normalized === 'COMPLETED' || normalized === 'COMPLETADO' || normalized === 'AUTHORIZED' || normalized === 'PAGADO';
  };
  // ──────────────────────────────────────────────────────────────────────────

  const waitForPaymentCompletion = async (paymentId: string, attempts = 8, delayMs = 1200): Promise<boolean> => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const paymentRecord = await apiService.get(`/payments/${paymentId}`);
        if (isPaymentCompletedStatus(paymentRecord?.estado)) {
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

    let deepLinkStatus: string | undefined;
    try {
      const parsedUrl = new URL(url);
      deepLinkStatus = parsedUrl.searchParams.get('status') || undefined;
    } catch {
      const statusMatch = url.match(/[?&]status=([^&]+)/i);
      deepLinkStatus = statusMatch?.[1] ? decodeURIComponent(statusMatch[1]) : undefined;
    }

    const { tokenWs, tbkToken } = extractWebPayTokensFromUrl(url);

    if (tokenWs || deepLinkStatus === 'success') {
      bankSuccessEvidenceRef.current = true;
      logPaymentEvent('Bank success evidence captured from return URL', {
        hasTokenWs: !!tokenWs,
        deepLinkStatus,
      });
    }

    if (tbkToken || deepLinkStatus === 'rejected' || deepLinkStatus === 'error' || deepLinkStatus === 'aborted') {
      void markPaymentCancelled(undefined, 'Transacción anulada por WebPay o por el usuario en el banco');
      return;
    }

    if (tokenWs) {
      void checkPendingPayment(tokenWs);
      return;
    }

    // Si llegó con status=success pero sin token, verificar igual
    if (deepLinkStatus === 'success') {
      setTimeout(() => {
        void checkPendingPayment();
      }, 1200);
      return;
    }

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

        if (bankSuccessEvidenceRef.current) {
          logPaymentEvent('No pending payment ID but bank evidence exists - finishing as success', {}, 'warn');
          setReconciliationNeeded(false);
          setIsWaitingForPayment(false);
          setPaymentStatus('success');
        }

        setLoading(false);
        setIsConfirming(false);
        return;
      }
      
      // CASO ESPECIAL: WALLET DEPOSIT
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Checking wallet deposit status');
        
        let isConfirmed = false;
        const tokenFromStorage = savedPaymentId ? await AsyncStorage.getItem(`payment_${savedPaymentId}_token`) : null;
        const tokenForWalletConfirmation = directToken || tokenFromStorage;

        if (tokenForWalletConfirmation) {
            try {
                    console.log('🔵 [Wallet Check] Intentando confirmar con token:', tokenForWalletConfirmation.substring(0, 10));
                    const result = await walletService.confirmTransbankDeposit(tokenForWalletConfirmation, savedPaymentId || undefined);
                    console.log('✅ [Wallet Check] Resultado confirmación:', result);
                    
                    const status = result?.status || result?.data?.status;
                    const responseCode = result?.response_code ?? result?.data?.response_code;
                    const responseCodeNum = normalizeResponseCode(responseCode);
                    const isSuccess = result?.success === true;

                    if (isSuccess || status === 'AUTHORIZED' || responseCodeNum === 0) {
                        isConfirmed = true;
                    }

                    const isFailure = status === 'FAILED' || (responseCodeNum !== null && responseCodeNum !== 0);
                    if (isFailure) {
                        console.log('❌ [Wallet Check] Pago fallido/rechazado explícitamente');
                        setReconciliationNeeded(false);
                        setPaymentStatus('failure');
                        setIsConfirming(false);
                        setIsWaitingForPayment(false);
                        setLoading(false);
                        await AsyncStorage.removeItem('waitingForPayment');
                        if (savedPaymentId) await AsyncStorage.removeItem(`payment_${savedPaymentId}_token`);
                        return;
                }
            } catch (e: any) {
                console.warn('⚠️ [Wallet Check] Error confirmando:', e);
                if (e.message?.includes('ya fue confirmado') || e.message?.includes('processed')) {
                    isConfirmed = true;
                }
            }
        } else {
          console.log('⚠️ [Wallet Check] No hay token para confirmar depósito.');
        }
        
        await refreshWallet();
        
        if (isConfirmed) {
            logPaymentEvent('Wallet deposit confirmed');
            setPaymentStatus('success');
            setIsWaitingForPayment(false);
            setLoading(false);
            await AsyncStorage.removeItem('waitingForPayment');
            if (savedPaymentId) await AsyncStorage.removeItem(`payment_${savedPaymentId}_token`);
        } else {
             console.log('⚠️ [Wallet Check] No se pudo confirmar el depósito. Manteniendo estado...');
        }
        
        if (!isConfirmed) {
            if (pollingAttempts < 3) {
                 console.log(`⚠️ [Wallet Check] Intento ${pollingAttempts + 1}/3 fallido. Reintentando...`);
                 setPollingAttempts(prev => prev + 1);
                 setReconciliationNeeded(true);
                 setIsConfirming(false);
                 setLoading(false);
                 return;
            }
            console.log('❌ [Wallet Check] No se pudo confirmar el depósito tras varios intentos.');
            setReconciliationNeeded(false);
            setPaymentStatus('failure');
            setIsConfirming(false);
            setLoading(false);
            return;
        } else {
             setIsConfirming(false);
             return;
        }
      }

      // FLUJO NORMAL: Publicaciones e inspecciones
      let tokenToConfirm: string | undefined = directToken;

      if (!tokenToConfirm) {
        // FIX: el backend expone GET /payments/webpay/check-pending (con JwtAuthGuard)
        const response = await executeWithRetry(
          () => apiService.get('/payments/webpay/check-pending'),
          'check_pending_payment'
        );

        if (response?.hasPending && response?.token) {
          tokenToConfirm = response.token;
          if (savedPaymentId) {
            await AsyncStorage.setItem(`payment_${savedPaymentId}_token`, response.token);
          }
        }
      }
      
      if (tokenToConfirm) {
        logPaymentEvent('Pending payment found', { token: tokenToConfirm.substring(0, 10) + '...' });

        let result;
        try {
          result = await apiService.confirmWebPayTransaction(tokenToConfirm);
        } catch (confirmError: any) {
          if (confirmError?.message?.includes('422') || 
              confirmError?.message?.includes('already locked') || 
              confirmError?.message?.includes('Invalid status')) {
            logPaymentEvent('Transaction already processed, checking payment status', {}, 'warn');
            
            const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
            if (isPaymentCompletedStatus(paymentCheck?.estado)) {
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

        const responseCode = result?.response_code ?? result?.transaction?.response_code ?? result?.data?.response_code ?? null;
        const responseCodeNum = normalizeResponseCode(responseCode);
        const status = result?.status ?? null;
        const hasOnlyTokenUrl = result?.token && result?.url && responseCodeNum === null && !status;
        
        console.log('🔍 Response analysis:', {
          hasResponseCode: !!responseCode,
          responseCode,
          hasStatus: !!status,
          status,
          hasOnlyTokenUrl,
          fullResult: result
        });
        
        if (hasOnlyTokenUrl) {
          logPaymentEvent('Payment not yet confirmed - waiting for user to complete', { result }, 'warn');
          setReconciliationNeeded(true);
          setPaymentStatus('verifying');
          setLoading(false);
          return;
        }

        const isAuthorized = responseCodeNum === 0 || status === 'AUTHORIZED';

        console.log('🔍 isAuthorized:', isAuthorized, '| response_code:', responseCode, '| status:', status);

        if (isAuthorized) {
          logPaymentEvent('Payment authorized successfully');
          setReconciliationNeeded(false);
          setPaymentStatus('success');
          setIsWaitingForPayment(false);
          setLoading(true);
          await AsyncStorage.removeItem('waitingForPayment');
          
          try {
            await processSuccessfulPayment(savedPaymentId);
            logPaymentEvent('Successfully processed payment entities');
          } catch (processError: any) {
            logPaymentEvent('Error processing payment entities', { error: processError?.message }, 'error');
            console.error('❌ Error in processSuccessfulPayment:', processError);
          } finally {
            setLoading(false);
          }
        } else if (responseCodeNum !== null && responseCodeNum > 0) {
          logPaymentEvent('Payment rejected by bank', { responseCode }, 'warn');
          
          setReconciliationNeeded(false);
          setIsWaitingForPayment(false);
          await AsyncStorage.removeItem('waitingForPayment');
          
          await markPaymentCancelled(savedPaymentId, `Rechazado por el banco (código: ${responseCode})`);
          
          setPaymentStatus('failure');
          
          Alert.alert(
            'Pago Rechazado',
            'Tu pago fue rechazado por el banco. Verifica los datos de tu tarjeta e intenta nuevamente.',
            [{ text: 'OK' }]
          );
          setLoading(false);
        } else {
          logPaymentEvent('Ambiguous payment state - continuing verification', { result }, 'warn');
          setReconciliationNeeded(true);
          setPaymentStatus('verifying');
          setLoading(false);
        }
      } else {
        logPaymentEvent('No pending payment response from backend', {
          hasBankSuccessEvidence: bankSuccessEvidenceRef.current,
          savedPaymentId,
        }, 'warn');

        if (bankSuccessEvidenceRef.current) {
          logPaymentEvent('Finishing as success based on bank evidence while backend sync catches up', {}, 'warn');
          setReconciliationNeeded(false);
          setIsWaitingForPayment(false);

          setLoading(true);
          try {
            await processSuccessfulPayment(undefined);
          } catch (processError: any) {
            logPaymentEvent('Error processing entities after bank-evidence success', { error: processError?.message }, 'warn');
          } finally {
            setPaymentStatus('success');
            setLoading(false);
          }
          return;
        }

        setReconciliationNeeded(true);
        setPollingAttempts(0);
        setPaymentStatus('verifying');
        setLoading(false);
      }
    } catch (error: any) {
      logPaymentEvent('Error checking pending payment', { error: error?.message }, 'error');
      
      const errorCategory = categorizeError(error);
      setErrorDetails(errorCategory);
      
      if (errorCategory.code === 'ALREADY_PROCESSED') {
        const savedPaymentId = await AsyncStorage.getItem('waitingForPayment');
        if (savedPaymentId) {
          try {
            const paymentCheck = await apiService.get(`/payments/${savedPaymentId}`);
            if (isPaymentCompletedStatus(paymentCheck?.estado)) {
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
        logPaymentEvent('Non-retryable error, checking payment status before cancelling', { errorCategory }, 'warn');
        const savedPidForCheck = await AsyncStorage.getItem('waitingForPayment');
        if (savedPidForCheck) {
          try {
            const paymentCheck = await apiService.get(`/payments/${savedPidForCheck}`);
            if (isPaymentCompletedStatus(paymentCheck?.estado)) {
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
        markPaymentCancelled(undefined, errorCategory.message || 'Error no recuperable');
        setLoading(false);
        setIsConfirming(false);
        return;
      }
      
      setReconciliationNeeded(true);
      setPaymentStatus('verifying');
      setLoading(false);
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePayment = async () => {

    setLoading(true);
    setErrorDetails(null);
    setWebviewHtml(null);
    setWebviewUrl(null);
    lastHandledReturnUrlRef.current = null;
    bankSuccessEvidenceRef.current = false;
    isCancelledRef.current = false;
    
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      logPaymentEvent('Invalid amount', { amount }, 'error');
      Alert.alert('Error', 'Monto inválido. Por favor, intenta nuevamente.');
      return;
    }

    if (amountNum > 10000000) {
      logPaymentEvent('Amount exceeds limit', { amount }, 'error');
      Alert.alert('Error', 'El monto excede el límite permitido.');
      setLoading(false);
      return;
    }

    try {
      const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
      
      // CASO ESPECIAL: WALLET DEPOSIT
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Wallet deposit WebPay flow initiated', { amount: amountNum });
        
        const user = await authService.getUser();
        if (!user) {
          logPaymentEvent('User not authenticated', {}, 'error');
          throw new Error('Usuario no autenticado');
        }

        console.log('🔵 [Wallet Deposit] Iniciando depósito de wallet...');
        
        setPaymentStatus('pending');
        setWebviewVisible(false);

        let depositResponse;
        try {
            depositResponse = await executeWithRetry(
              () => walletService.initiateTransbankDeposit(amountNum),
              'initiate_wallet_deposit'
            );
        } catch (initError: any) {
            console.error('❌ [Wallet Deposit] Error en initiateTransbankDeposit:', initError);
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

        if (paymentId) {
            await AsyncStorage.setItem('waitingForPayment', String(paymentId));
            await AsyncStorage.setItem(`payment_${paymentId}_timestamp`, Date.now().toString());
            await AsyncStorage.setItem(`payment_${paymentId}_amount`, amountNum.toString());
            await AsyncStorage.setItem(`payment_${paymentId}_serviceType`, 'wallet_deposit');
            if (token) {
                await AsyncStorage.setItem(`payment_${paymentId}_token`, token);
            }
        }

        console.log('🔵 [Wallet Deposit] Configurando WebView...');
        
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

        setIsWaitingForPayment(true);
        setWebviewHtml(autoSubmitHtml);
        setWebviewUrl(webpayUrl);
        setLoading(false);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('🔵 [Wallet Deposit] Abriendo WebView con formulario POST...');
        setWebviewVisible(true);
        
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
          }
        } else {
          throw new Error('La respuesta del pago no fue exitosa');
        }
        setLoading(false);
        return;
      }

      // MODO WEBPAY
      logPaymentEvent('WebPay payment initiated');
      
      const user = await authService.getUser();
      if (!user) {
        logPaymentEvent('User not authenticated', {}, 'error');
        throw new Error('Usuario no autenticado');
      }

      logPaymentEvent('Creating WebPay transaction', { userId: user.id, amount: amountNum });

      // Limpiar fallback timer si existía
      if (callbackFallbackRef.current) {
        clearTimeout(callbackFallbackRef.current);
        callbackFallbackRef.current = null;
      }

      // Paso 1: Intentar flujo principal (backend crea payment + transacción en un solo endpoint)
      let webpayData: any = null;
      let paymentId: string | null = null;

      const extractWebpayFields = (payload: any) => {
        const resolvedUrl = payload?.url || payload?.response?.url || payload?.data?.url;
        const resolvedToken = payload?.token || payload?.response?.token || payload?.data?.token;
        // El backend /webpay/create devuelve pagoId en el nivel raíz.
        // buyOrder se excluye como fallback de ID porque es una cadena tipo "WP-..." que
        // no corresponde a un UUID de Payment — usarlo causaría un GET /payments/WP-... inválido.
        const resolvedPaymentId =
          payload?.pagoId ||
          payload?.paymentId ||
          payload?.payment?.id ||
          payload?.data?.pagoId ||
          payload?.data?.paymentId ||
          payload?.data?.payment?.id ||
          null;
        return {
          resolvedUrl,
          resolvedToken,
          resolvedPaymentId,
        };
      };

      try {
        webpayData = await executeWithRetry(
          () => apiService.createWebPayTransaction({
            amount: amountNum,
            returnUrl: WEBPAY_RETURN_URL,
          }),
          'create_webpay_transaction_primary'
        );

        const primaryFields = extractWebpayFields(webpayData);
        paymentId = primaryFields.resolvedPaymentId;

        // Si el backend no devuelve URL+token válidos, hacemos fallback al flujo explícito de 2 pasos
        if (!primaryFields.resolvedUrl || !primaryFields.resolvedToken) {
          throw new Error('Primary create did not return url/token');
        }
      } catch (primaryError: any) {
        logPaymentEvent('Primary WebPay create failed, trying fallback flow', {
          error: primaryError?.message,
        }, 'warn');

        // Paso 1 fallback: crear payment record explícitamente
        const createdPayment = await executeWithRetry(
          () => apiService.post('/payments', {
            usuarioId: user.id,
            monto: amountNum,
            metodo: 'WebPay', // Coincide con PaymentMethod.WEBPAY del backend
            estado: 'Pendiente', // Coincide con PaymentStatus.PENDING del backend
          }),
          'create_payment_record'
        );

        paymentId = createdPayment?.id || null;
        if (!paymentId) {
          throw new Error('No se pudo crear el registro de pago');
        }

        // Paso 2 fallback: crear transacción WebPay asociada al paymentId
        webpayData = await executeWithRetry(
          () => apiService.createWebPayTransaction({
            amount: amountNum,
            returnUrl: WEBPAY_RETURN_URL,
            paymentId,
          }),
          'create_webpay_transaction_fallback'
        );
      }

      const { resolvedUrl, resolvedToken, resolvedPaymentId } = extractWebpayFields(webpayData);
      paymentId = paymentId || resolvedPaymentId;

      logPaymentEvent('WebPay transaction created', {
        paymentId,
        hasUrl: !!resolvedUrl,
        hasToken: !!resolvedToken,
      });

      if (!resolvedUrl || !resolvedToken) {
        logPaymentEvent('Invalid WebPay response', { webpayData }, 'error');
        setReconciliationNeeded(true);
        throw new Error('No se recibió una URL o token válidos de WebPay');
      }

      setIsWaitingForPayment(true);

      // Guardar paymentId y token para reconciliación posterior
      if (paymentId) {
        await AsyncStorage.setItem('waitingForPayment', String(paymentId));
        await AsyncStorage.setItem(`payment_${paymentId}_timestamp`, Date.now().toString());
        await AsyncStorage.setItem(`payment_${paymentId}_amount`, amountNum.toString());
        await AsyncStorage.setItem(`payment_${paymentId}_serviceType`, 'webpay');
        await AsyncStorage.setItem(`payment_${paymentId}_token`, resolvedToken);
      }

      // Paso 3: Construir HTML de redirección según el tipo de URL recibida.
      // - Si la URL es la URL intermedia del backend (/pay?token=...), navegar con GET directo.
      //   El endpoint GET /webpay/pay ya tiene el token en el query string y genera el form POST
      //   hacia Transbank por su cuenta.
      // - Si la URL es directamente de Transbank (webpay3g*.transbank.cl), hacer form POST con token_ws.
      const redirectUrl = resolvedUrl as string;
      const isIntermediateBackendUrl = redirectUrl.includes(WEBPAY_PAY_PATH) || redirectUrl.includes(WEBPAY_PAY_LEGACY_PATH);

      console.log('🔵 [WebPay] Limpiando estado loading antes de abrir WebView...');
      setLoading(false);

      let autoSubmitHtml: string;

      if (isIntermediateBackendUrl) {
        // El backend maneja el POST a Transbank — solo navegar al endpoint GET intermedio
        autoSubmitHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Redirigiendo a WebPay...</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body onload="window.location.href='${redirectUrl}'">
              <div style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;">
                <p>Redirigiendo a WebPay...</p>
              </div>
            </body>
          </html>
        `;
      } else {
        // URL directa de Transbank — hacer form POST con token_ws (requerido por Transbank)
        autoSubmitHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Redirigiendo a WebPay...</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body onload="document.forms[0].submit()">
              <div style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;">
                <p>Redirigiendo a WebPay...</p>
                <form action="${redirectUrl}" method="POST">
                  <input type="hidden" name="token_ws" value="${resolvedToken}" />
                  <noscript><input type="submit" value="Ir a pagar" /></noscript>
                </form>
              </div>
            </body>
          </html>
        `;
      }

      setWebviewHtml(autoSubmitHtml);
      setWebviewUrl(redirectUrl);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setWebviewVisible(true);
      
      console.log('🔵 [WebPay] WebView configurado con POST form. Visible:', true);
      
      return;
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
        paymentId = await AsyncStorage.getItem('waitingForPayment') || undefined;
      }
      
      if (paymentId) {
        // FIX: usar PATCH /payments/:id/status (requiere rol ADMINISTRADOR en backend)
        // Si el usuario no es admin, esto fallará silenciosamente — está bien, es best-effort
        apiService.fetch(`/payments/${paymentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'Fallido', detalles: reason || 'Anulado por el usuario' }),
        }).catch(err => console.log('Error notifying backend of cancellation (non-critical):', err));

        await AsyncStorage.removeItem('waitingForPayment');
      }
    } catch (e) {
      console.error('Error marcando pago como anulado:', e);
    } finally {
        console.log('🛑 [PaymentGateway] Forcing cancellation state');
        if (callbackFallbackRef.current) {
          clearTimeout(callbackFallbackRef.current);
          callbackFallbackRef.current = null;
        }
        setIsWaitingForPayment(false);
        setReconciliationNeeded(false);
        setPollingAttempts(0);
        setPaymentStatus('cancelled');
        setLoading(false);
        setWebviewVisible(false);
        setWebviewHtml(null);
    }
  };

  const processSuccessfulPayment = async (paymentId?: string) => {
    try {
      const serviceTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
      
      // CASO ESPECIAL: WALLET DEPOSIT
      if (serviceTypeStr === 'wallet_deposit') {
        logPaymentEvent('Processing wallet deposit confirmation');
        
        await refreshWallet();
        
        setPaymentStatus('success');
        setIsWaitingForPayment(false);
        await AsyncStorage.removeItem('waitingForPayment');
        logPaymentEvent('Wallet deposit processed successfully');
        return;
      }
      
      // RESTO DE CASOS: Publicaciones e inspecciones
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
          await apiService.createInspection(inspectionData);
          
          setPaymentStatus('success');
          setIsWaitingForPayment(false);
          await AsyncStorage.removeItem('waitingForPayment');
          return;
      }

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

      const vehicleResponse = await apiService.createVehicle(backendVehicleData);
      
      if (!vehicleResponse || !vehicleResponse.id) {
        throw new Error('Error al crear el vehículo');
      }

      const publicationData = {
        vendedorId: user.id,
        vehiculoId: vehicleResponse.id,
        valor: typeof vehicleData.price === 'number' ? vehicleData.price : Number(String(vehicleData.price ?? '0').replace(/\D/g, '')),
        descripcion: vehicleData.description || '',
        estado: 'Pendiente',
        fotos: vehicleData.images || []
      };

      const publicationResponse = await apiService.createPublication(publicationData);

      if (!publicationResponse) {
        throw new Error('Error al crear la publicación');
      }

      if (serviceTypeStr === 'publication_with_inspection') {
        const { inspectionDate, inspectionTime, inspectionLocation, horarioId } = vehicleData;

        let fechaProgramada = new Date().toISOString();
        if (inspectionDate && inspectionTime) {
          try {
            const [hours, minutes] = inspectionTime.split(':');
            let dateObj: Date;
            
            if (typeof inspectionDate === 'string') {
              if (inspectionDate.includes('T')) {
                dateObj = new Date(inspectionDate);
              } else if (inspectionDate.includes('/')) {
                const [day, month, year] = inspectionDate.split('/');
                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              } else if (inspectionDate.includes('-')) {
                dateObj = new Date(inspectionDate);
              } else {
                dateObj = new Date(inspectionDate);
              }
            } else if (inspectionDate instanceof Date) {
              dateObj = new Date(inspectionDate);
            } else {
              console.warn('⚠️ Formato de fecha no reconocido, usando fecha actual');
              dateObj = new Date();
            }
            
            if (isNaN(dateObj.getTime())) {
              throw new Error('Fecha de inspección inválida');
            }
            
            dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            fechaProgramada = dateObj.toISOString();
          } catch (dateError) {
            console.error('❌ Error parseando fecha de inspección:', dateError);
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() + 1);
            fallbackDate.setHours(10, 0, 0, 0);
            fechaProgramada = fallbackDate.toISOString();
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

        await apiService.createInspection(inspectionData);
      }

      setPaymentStatus('success');
      setIsWaitingForPayment(false);
      await AsyncStorage.removeItem('waitingForPayment');

    } catch (error: any) {
      console.error('❌ Error procesando pago exitoso:', error);
      
      const errorMsg = error?.message || error?.response?.data?.message || 'Error desconocido';
      Alert.alert(
        'Error al Procesar Pago', 
        `El pago fue exitoso pero hubo un error al crear la publicación.\n\nDetalle: ${errorMsg}\n\nContacta a soporte.`,
        [{ text: 'OK' }]
      );
      setPaymentStatus('success');
      setLoading(false);
    }
  };

  const renderContent = () => {
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

    if (paymentStatus === 'success') {
      const isWalletDeposit = (Array.isArray(serviceType) ? serviceType[0] : serviceType) === 'wallet_deposit';
      const descriptionText = Array.isArray(description) ? description[0] : description;
      const amountNumber = Number(amount) || 0;
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>{isWalletDeposit ? '¡Carga Exitosa!' : 'Pago completado exitosamente'}</Text>
          <Text style={styles.successText}>
             {isWalletDeposit ? 'Tu saldo ha sido actualizado.' : 'Tu transacción se completó correctamente.'}
          </Text>
          <View style={styles.successSummaryCard}>
            <View style={styles.successSummaryRow}>
              <Text style={styles.successSummaryLabel}>Detalle</Text>
              <Text style={styles.successSummaryValue}>{descriptionText || 'Pago de servicio'}</Text>
            </View>
            <View style={styles.successSummaryDivider} />
            <View style={styles.successSummaryRow}>
              <Text style={styles.successSummaryLabel}>Monto pagado</Text>
              <Text style={styles.successSummaryAmount}>${amountNumber.toLocaleString('es-CL')}</Text>
            </View>
          </View>
          <Button
            title={isWalletDeposit ? "Volver a Billetera" : "Continuar"}
            onPress={() => {
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

    if (webviewVisible) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Completando pago en WebPay...</Text>
        </View>
      );
    }

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

<Modal
        visible={webviewVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
            Alert.alert('Cancelar Pago', '¿Deseas salir sin pagar?', [
                { text: 'No', style: 'cancel' },
                { text: 'Sí, Salir', style: 'destructive', onPress: () => { setWebviewVisible(false); markPaymentCancelled(); } }
            ]);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.webviewHeader}>
                <Text style={styles.webviewTitle}>WebPay</Text>
                <TouchableOpacity onPress={() => {
                     setWebviewVisible(false);
                     checkPendingPayment();
                }}>
                    <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            <View style={{ padding: 4, backgroundColor: '#eee' }}>
                <Text numberOfLines={1} style={{ fontSize: 10, color: '#555', textAlign: 'center' }}>
                    {webviewUrl || 'Esperando URL...'}
                </Text>
            </View>

            {(webviewUrl || webviewHtml) ? (
                <WebView
                    key="webview-payment"
                    
                    originWhitelist={['*']} 
                    
                    source={webviewHtml
                      ? { html: webviewHtml, baseUrl: 'https://webpay3gint.transbank.cl' }
                      : { uri: webviewUrl as string }
                    }
                    
                    style={{ flex: 1 }}
                    startInLoadingState={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    
                    onError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        console.warn('WebView error: ', nativeEvent);
                        Alert.alert('Error de Conexión', 'No pudimos cargar el banco via WebPay.');
                    }}
                    
                    // ─── BUG FIX INTACTO ───────────────────────────────────────
                    // El intercepción de isWebPayCallbackUrl devuelve TRUE (deja pasar)
                    // para que el backend reciba el POST con token_ws y procese el commit.
                    // Solo se interceptan deep links (autobox://) y TBK_TOKEN (cancelación).
                    onShouldStartLoadWithRequest={(request) => {
                        const url = request.url;
                        console.log('⚡ Navegando a:', url);

                      if (isWebPayReturnUrl(url)) {
                        if (callbackFallbackRef.current) {
                          clearTimeout(callbackFallbackRef.current);
                          callbackFallbackRef.current = null;
                        }
                        handleWebPayReturnFromWebView(url);
                        return false;
                      }

                      if (isWebPayCallbackUrl(url)) {
                        console.log('🔵 [WebView] Callback URL detectada, permitiendo carga para que backend procese');
                        return true;
                      }

                      if (isWebPayIntermediateUrl(url)) {
                        console.log('🔵 [WebView] URL intermedia de backend detectada, permitiendo navegación');
                        return true;
                      }
                        
                      return true;
                    }}
                    // ──────────────────────────────────────────────────────────
                    
                    onNavigationStateChange={(navState) => {
                        if (isWebPayReturnUrl(navState.url)) {
                          if (callbackFallbackRef.current) {
                            clearTimeout(callbackFallbackRef.current);
                            callbackFallbackRef.current = null;
                          }
                          handleWebPayReturnFromWebView(navState.url);
                          return;
                        }

                        if (isWebPayCallbackUrl(navState.url) && !navState.loading && !callbackFallbackRef.current) {
                          console.log('🔵 [WebView] Callback del backend cargada, esperando redirect...');
                          callbackFallbackRef.current = setTimeout(() => {
                            callbackFallbackRef.current = null;
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
  successSummaryCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  successSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successSummaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  successSummaryValue: {
    flex: 1,
    marginLeft: 12,
    textAlign: 'right',
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  successSummaryDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 10,
  },
  successSummaryAmount: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '700',
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