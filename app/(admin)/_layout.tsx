import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from "expo-router";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import authService from '../../services/authService';
import apiService from '../../services/apiService';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { UserRole } from '../../types';

function AdminTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  // List of routes that should not appear in the TabBar
  const hiddenRoutes = [
    'create-mechanic',
    'mechanic-schedule',
    'sede-schedule',
    'sedes',
    'sede-detail',
    'mechanic-detail',
    'mechanic-inspections',
    'mechanic-payments',
    'user-detail',
  ];

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
        style={styles.tabBarScroll}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          
          // Hide routes defined in hiddenRoutes or with href: null
          if (hiddenRoutes.includes(route.name) || (options as any).href === null) return null;

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const Icon = options.tabBarIcon;
          const color = isFocused ? '#007bff' : '#8e8e93';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[
                styles.tabItem,
                isFocused && styles.tabItemFocused
              ]}
            >
              <View style={styles.iconContainer}>
                 {Icon && Icon({ focused: isFocused, color, size: 24 })}
              </View>
              <Text style={[styles.tabLabel, { color }]}>
                {typeof label === 'string' ? label : route.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function AdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Validar que el usuario sea administrador
  useEffect(() => {
    const validateAdminAccess = async () => {
      try {
        console.log('🔒 [AdminLayout] Validando acceso de administrador...');
        const user = await authService.getUser();
        
        if (!user) {
          console.log('❌ [AdminLayout] No hay usuario. Redirigiendo a auth...');
          router.replace('/auth');
          return;
        }

        const userRole = String(user.rol || '').trim();
        console.log('👤 [AdminLayout] User role:', userRole);

        // Verificar si el usuario es administrador
        if (userRole === 'Administrador' || userRole === UserRole.ADMIN) {
          console.log('✅ [AdminLayout] Acceso de admin validado');
          setIsAuthorized(true);
        } else {
          console.log('⛔ [AdminLayout] Usuario no es administrador. Redirigiendo a tabs...');
          Alert.alert('Acceso Denegado', 'No tienes permisos para acceder a esta sección.');
          router.replace('/(tabs)');
        }
      } catch (error) {
        console.error('❌ [AdminLayout] Error validando acceso:', error);
        router.replace('/auth');
      } finally {
        setIsChecking(false);
      }
    };

    validateAdminAccess();
  }, [router]);

  const fetchUnreadNotifications = async () => {
    try {
      const count = await apiService.getUnreadNotificationsCount();
      setUnreadNotificationsCount(count);
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUnreadNotifications();
      // Poll every 5 seconds for admin to be responsive
      const interval = setInterval(fetchUnreadNotifications, 5000);
      return () => clearInterval(interval);
    }, [])
  );

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
    router.push('/(admin)/notifications');
  };

  // No mostrar header en pantallas específicas
  const currentSegment = segments[segments.length - 1];
  const hideHeaderScreens = [
    'create-mechanic', 
    'mechanic-schedule', 
    'sede-schedule',
    'sedes',
    'sede-detail',
    'notifications', 
    'mechanic-detail', 
    'mechanic-inspections',
    'mechanic-payments',
    'user-detail'
  ];
  const shouldHideHeader = hideHeaderScreens.includes(currentSegment);

  // Mostrar loading mientras se valida
  if (isChecking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Validando acceso...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // No renderizar nada si no está autorizado (la navegación se encarga del redireccionamiento)
  if (!isAuthorized) {
    return null;
  }

  return (
    <>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="#007bff" 
        translucent={false}
      />
      
      {/* Header para Admin - oculto en pantallas específicas */}
      {!shouldHideHeader && (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.appTitle}>AutoBox - Admin</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.headerIcon} onPress={handleNotificationsPress}>
                <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                {unreadNotificationsCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIcon} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      )}

      <Tabs 
        tabBar={props => <AdminTabBar {...props} />}
        screenOptions={{ 
          headerShown: false,
          tabBarActiveTintColor: '#007bff',
          tabBarInactiveTintColor: '#8e8e93',
        }}
      >
        <Tabs.Screen 
          name="mechanics" 
          options={{
            title: 'Mecánicos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }} 
        />
        <Tabs.Screen 
          name="inspections" 
          options={{
            title: 'Inspecciones',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard" size={size} color={color} />
            ),
          }} 
        />
        <Tabs.Screen 
          name="publications" 
          options={{
            title: 'Publicaciones',
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="document-text" size={size} color={color} />
                {unreadNotificationsCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    right: -6,
                    top: -3,
                    backgroundColor: 'red',
                    borderRadius: 8,
                    width: 16,
                    height: 16,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'white'
                  }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }} 
        />
        <Tabs.Screen 
          name="users" 
          options={{
            title: 'Usuarios',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }} 
        />
        <Tabs.Screen 
          name="settings" 
          options={{
            title: 'Ajustes',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }} 
        />
        <Tabs.Screen 
          name="payments" 
          options={{
            title: 'Pagos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet" size={size} color={color} />
            ),
          }} 
        />
        <Tabs.Screen 
          name="all-mechanic-payments" 
          options={{
            title: 'Pagos Mec.',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cash" size={size} color={color} />
            ),
          }} 
        />

        {/* Pantallas ocultas del TabBar */}
        <Tabs.Screen 
          name="create-mechanic" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="mechanic-schedule" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="sede-schedule" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="sedes" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="sede-detail" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="mechanic-detail" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="mechanic-inspections" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="mechanic-payments" 
          options={{ 
            href: null,
            tabBarStyle: { display: 'none' }
          }} 
        />
        <Tabs.Screen 
          name="notifications"  
          options={{
            title: 'Notificaciones',
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="notifications" size={size} color={color} />
                {unreadNotificationsCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    right: -6,
                    top: -3,
                    backgroundColor: 'red',
                    borderRadius: 8,
                    width: 16,
                    height: 16,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'white'
                  }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }} 
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#007bff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#007bff',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderColor: '#007bff',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabBarContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBarScroll: {
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
  },
  tabItemFocused: {
    borderTopColor: '#007bff',
  },
  iconContainer: {
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
