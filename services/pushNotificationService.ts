import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Constants from 'expo-constants';
import { Platform } from 'react-native';
import authService from './authService';
import apiService from './apiService';

// Configure how notifications behave when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class PushNotificationService {
  private pushToken: string | null = null;

  /**
   * Registers the device for push notifications
   */
  async registerForPushNotificationsAsync() {
    if (this.pushToken) {
      return this.pushToken;
    }

    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
      
      // Get the Expo Push Token
      try {
        const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId ?? Constants.default?.easConfig?.projectId;
        
        if (!projectId) {
            console.warn('⚠️ Project ID not found. Remote push notifications will not work. Run `npx eas init` to configure.');
            // Only rely on local notifications via socket for now
            return null;
        }

        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        this.pushToken = token;
        console.log('Expo Push Token:', token);
      } catch (e) {
          console.error("Error fetching push token:", e);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  }

  /**
   * Registers and syncs Expo Push Token with backend for authenticated users
   */
  async registerAndSyncPushToken(userId?: string) {
    try {
      const token = await this.registerForPushNotificationsAsync();

      if (!token) {
        return null;
      }

      let targetUserId = userId;

      if (!targetUserId) {
        const user = await authService.getUser();
        targetUserId = user?.id as string | undefined;
      }

      if (targetUserId) {
        await apiService.updatePushToken(targetUserId, token);
      } else {
        console.log('⚠️ Push token generado, pero no hay usuario autenticado para sincronizarlo');
      }

      return token;
    } catch (error) {
      console.error('Error registering and syncing push token:', error);
      return null;
    }
  }

  /**
   * Triggers a local system notification immediately
   */
  async sendLocalNotification(title: string, body: string, data = {}) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        data: data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // null means "send immediately"
    });
  }
}

export default new PushNotificationService();
