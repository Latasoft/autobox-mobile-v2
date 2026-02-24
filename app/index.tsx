import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import authService from '../services/authService';
import pushNotificationService from '../services/pushNotificationService';
import { UserRole } from '../types';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    // Timeout de seguridad por si algo se cuelga (10s)
    const safetyTimeout = setTimeout(() => {
      console.log('⚠️ [INDEX] Auth check timed out - forcing redirect to Auth');
      router.replace('/auth');
    }, 10000);

    try {
      console.log('🔍 [INDEX] Checking authentication...');
      const isAuthenticated = await authService.isAuthenticated();
      
      if (isAuthenticated) {
        console.log('✅ [INDEX] User is authenticated locally');
        // Try to refresh profile from backend to get latest role
        let user = await authService.refreshProfile();
        
        // Fallback to local storage if refresh fails (e.g. offline)
        if (!user) {
          console.log('⚠️ [INDEX] Refresh failed/timeout, falling back to local storage');
          user = await authService.getUser();
        }

        clearTimeout(safetyTimeout);

        // Register and sync push notifications token in background
        pushNotificationService.registerAndSyncPushToken(user?.id).catch(err => 
          console.error('Error registering push token:', err)
        );

        const userRole = user?.rol;
        console.log('👤 [INDEX] User Role:', userRole);
        
        // Normalizar el rol para evitar problemas de encoding o espacios
        const role = String(userRole || '').trim();
        
        // DEBUG: Mostrar alerta si el rol no es reconocido claramente
        // if (role !== 'Administrador' && role !== 'Mecánico' && role !== 'Usuario') {
        //   Alert.alert('Debug Index', `Rol detectado: "${role}"`);
        // }

        if (role === 'Administrador' || role === UserRole.ADMIN) {
          console.log('👉 Redirecting to Admin Dashboard');
          router.replace('/(admin)/mechanics');
        } else if (role === 'Mecánico' || role === 'Mecanico' || role === UserRole.MECHANIC) {
          console.log('👉 Redirecting to Mechanic Dashboard');
          router.replace('/(mechanic)');
        } else {
          console.log('👉 Redirecting to User Tabs');
          router.replace('/(tabs)');
        }
      } else {
        clearTimeout(safetyTimeout);
        console.log('❌ [INDEX] Not authenticated');
        router.replace('/auth');
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      console.error('Auth check error:', error);
      router.replace('/auth');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4CAF50" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
