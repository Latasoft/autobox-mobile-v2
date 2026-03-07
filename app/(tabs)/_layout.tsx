import { Tabs, useRouter, useSegments } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderProvider, useHeader } from '../../contexts/HeaderContext';
import { ChatProvider, useChat } from '../../contexts/ChatContext';
import { useState, useCallback } from 'react';
import apiService from '../../services/apiService';
import { useFocusEffect } from 'expo-router';

function TabsContent() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom;
  const { isHeaderVisible } = useHeader();
  const { unreadMessagesCount } = useChat();
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

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
      const interval = setInterval(fetchUnreadNotifications, 30000);
      return () => clearInterval(interval);
    }, [])
  );

  const hideHeaderRoutes = ['car-detail-by-searchbar', 'search', 'chat', 'chat-detail', 'wallet', 'notifications'];
  const shouldHideHeader = segments.some(segment => hideHeaderRoutes.includes(segment));

  const handleSearchPress = () => router.push('/search');
  const handleChatPress = () => router.push('/(tabs)/chat');
  const handleNotificationsPress = () => router.push('/(tabs)/notifications');

  return (
    <>
      {isHeaderVisible && !shouldHideHeader && (
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.appTitle}>AutoBox</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.headerIcon} onPress={handleSearchPress}>
              <Ionicons name="search" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
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

            <TouchableOpacity style={styles.headerIcon} onPress={handleChatPress}>
              <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
              {unreadMessagesCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E0E0E0',
            height: 60 + bottomInset,
            paddingBottom: bottomInset + 5,
            paddingTop: 10,
          },
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#9E9E9E',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="publish"
          options={{
            title: 'Vender',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="add-circle" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="inspections"
          options={{
            title: 'Inspecciones',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="construct" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: 'Menú',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="menu" size={size} color={color} />
            ),
          }}
        />
        
        {/* Hidden tabs */}
        <Tabs.Screen name="chat" options={{ href: null }} />
        <Tabs.Screen name="chat-detail" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="wallet" options={{ href: null }} />
      </Tabs>
    </>
  );
}

export default function TabsLayout() {
  return (
    <HeaderProvider>
      <ChatProvider>
        <TabsContent />
      </ChatProvider>
    </HeaderProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIcon: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
