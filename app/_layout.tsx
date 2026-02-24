import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import pushNotificationService from '../services/pushNotificationService';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // 1. Register for permissions on startup
    pushNotificationService.registerAndSyncPushToken();

    // 2. Handle notification clicks
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('🔔 Notification clicked (Root):', data);
      
      // Navigation logic based on data type
      if (data?.type === 'inspection' && data?.inspectionId) {
        // Navigate to inspection detail, for example (adjust route as needed)
        // router.push({ pathname: "/(mechanic)/inspection-detail", params: { id: data.inspectionId } });
         // For now, if we don't have a specific deep link structure, we can log it.
         // If "actionUrl" exists from previous patterns, use it.
      }
      
      if (data?.actionUrl) {
        try {
          router.push(data.actionUrl as any);
        } catch (error) {
          console.error('Error navigating from notification:', error);
        }
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(mechanic)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="register" />
        <Stack.Screen name="loading" />
        <Stack.Screen name="setup-avatar" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="payment-callback" />
      </Stack>
    </SafeAreaProvider>
  );
}
