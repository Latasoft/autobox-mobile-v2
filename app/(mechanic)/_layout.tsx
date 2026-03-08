import { Tabs, useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from "react-native";
import { useEffect, useState, useCallback } from 'react';
import authService from '../../services/authService';
import socketService from '../../services/socketService';
import apiService from '../../services/apiService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

export default function MechanicLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom;
  const [notificationCount, setNotificationCount] = useState(0);

  const fetchUnreadNotifications = async () => {
    try {
      const count = await apiService.getUnreadNotificationsCount();
      setNotificationCount(count);
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUnreadNotifications();
      // Polling every 10 seconds? Admin has 5s. 
      // User requested "tal cual como en admin". So 5s.
      const interval = setInterval(fetchUnreadNotifications, 5000);
      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    // Conectar al socket
    socketService.connect();

    // Handler para nueva inspección
    const handleNewInspection = (data: any) => {
      setNotificationCount(prev => prev + 1);
      Alert.alert(
        'Nueva Inspección Asignada',
        `Se te ha asignado una nueva inspección${data.vehiclePatent ? ` para el vehículo ${data.vehiclePatent}` : ''}`,
        [
          {
            text: 'Ver',
            onPress: () => {
              router.push('/(mechanic)');
            }
          },
          { text: 'OK' }
        ]
      );
    };

    // Suscribirse al evento
    socketService.on('inspection_assigned', handleNewInspection);

    return () => {
      // Limpiar listener
      socketService.off('inspection_assigned', handleNewInspection);
    };
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await authService.logout();
            router.replace('/auth');
          }
        }
      ]
    );
  };

  const handleNotificationsPress = () => {
    router.push('/(mechanic)/notifications');
  };

  return (
    <>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#FF9800" 
        translucent={false}
      />
      
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: '#FF9800',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          tabBarActiveTintColor: '#FF9800',
          tabBarInactiveTintColor: 'gray',
          tabBarStyle: {
            height: 60 + bottomInset,
            paddingBottom: bottomInset + 4,
            paddingTop: 8,
          },
          headerRight: () => (
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.headerIcon} onPress={handleNotificationsPress}>
                <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                {notificationCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIcon} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inspecciones',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Horario',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="my-autobox"
          options={{
            title: 'Seleccionar sedes',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="my-autobox-list"
          options={{
            title: 'Mis Autobox',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="payments"
          options={{
            title: 'Mis Pagos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ratings"
          options={{
            title: 'Mis Calificaciones',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="star-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: null, // Ocultar de la barra de pestañas
            title: 'Notificaciones',
          }}
        />
        <Tabs.Screen
          name="inspection-detail"
          options={{
            href: null, // Ocultar de la barra de pestañas
            title: 'Detalle Inspección',
          }}
        />
        <Tabs.Screen
          name="my-autobox-schedule"
          options={{
            href: null,
            title: 'Seleccionar Horario',
          }}
        />
        <Tabs.Screen
          name="my-autobox-success"
          options={{
            href: null,
            title: 'Horario Configurado',
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  headerIcon: {
    marginLeft: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FF9800',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
