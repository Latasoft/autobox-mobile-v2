import { Platform } from 'react-native';
import * as Device from 'expo-device';

// 1. Configuración Local (Tu lógica original para cuando trabajas en casa)
const DEFAULT_LOCAL_IP = '192.168.56.1'; // <-- Tu IP local
const EMULATOR_IP = '10.0.2.2';

const isAndroidEmulator = Platform.OS === 'android' && !Device.isDevice;
export const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || (isAndroidEmulator ? EMULATOR_IP : DEFAULT_LOCAL_IP);

// 2. Definición de URLs (Lógica Híbrida)
// Si existe la variable de entorno (Render), úsala. Si no, usa la Local.

// --- BACKEND PRINCIPAL ---
export const API_URL = process.env.EXPO_PUBLIC_API_URL
  ? `${process.env.EXPO_PUBLIC_API_URL}/api` // En Producción (Render)
  : (Platform.OS === 'web' ? 'http://localhost:3000/api' : `http://${LOCAL_IP}:3000/api`); // En Local

// --- SERVICIO DE PAGOS ---
export const PAYMENT_API_URL = process.env.EXPO_PUBLIC_PAYMENT_URL
  ? process.env.EXPO_PUBLIC_PAYMENT_URL // En Producción (Render)
  : (Platform.OS === 'web' ? 'http://localhost:3001' : `http://${LOCAL_IP}:3001`); // En Local

// --- WEBSOCKET ---
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL
  ? process.env.EXPO_PUBLIC_SOCKET_URL // En Producción (Render)
  : (Platform.OS === 'web' ? 'http://localhost:3002' : `http://${LOCAL_IP}:3002`); // En Local