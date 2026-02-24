import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import authService from '../services/authService';
import pushNotificationService from '../services/pushNotificationService';
import { UserRole } from '../types';

export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAuthSuccess = async (result: any) => {
    const userRole = result.user?.rol;
    console.log('👤 [LOGIN] User Role received:', userRole);

    // Register for push notifications
    try {
      await pushNotificationService.registerAndSyncPushToken(result.user?.id);
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }

    // Use setTimeout to ensure navigation happens after state updates
    setTimeout(() => {
      // Normalizar el rol para evitar problemas de encoding o espacios
      const role = String(userRole || '').trim();

      if (role === 'Administrador' || role === UserRole.ADMIN) {
        console.log('👉 Redirecting to Admin Dashboard');
        router.replace('/(admin)/mechanics');
      } else if (role === 'Mecánico' || role === 'Mecanico' || role === UserRole.MECHANIC) {
        console.log('👉 Redirecting to Mechanic Dashboard');
        router.replace('/(mechanic)');
      } else {
        console.log('👉 Redirecting to User Tabs (Role: ' + role + ')');
        router.replace('/(tabs)');
      }
    }, 100);
  };

  const login = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const result = await authService.login({ email, password });
      handleAuthSuccess(result);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (quickEmail: string, quickPassword: string) => {
    if (loading) return;
    setLoading(true);
    setEmail(quickEmail);
    setPassword(quickPassword);
    try {
      const result = await authService.login({ email: quickEmail, password: quickPassword });
      handleAuthSuccess(result);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const socialLogin = async (provider: string) => {
    if (loading) return;
    setLoading(true);
    try {
      // TODO: Implementar lógica real de OAuth
      const mockUser = {
        email: `test.${provider}@example.com`,
        provider: provider,
        providerId: `${provider}-123456`,
        firstName: 'Usuario',
        lastName: provider.charAt(0).toUpperCase() + provider.slice(1),
        avatarUrl: 'https://via.placeholder.com/150'
      };
      
      const result = await authService.socialLogin(mockUser);
      handleAuthSuccess(result);
    } catch (error: any) {
      Alert.alert('Error', error.message || `Error al iniciar sesión con ${provider}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    login,
    quickLogin,
    socialLogin
  };
};
