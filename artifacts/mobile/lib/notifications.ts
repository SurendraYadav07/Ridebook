import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushDevice } from '@workspace/api-client-react';

const LAST_PUSH_TOKEN_KEY = 'ridebooker.last_push_token.v1';

// Configure foreground notification presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers device for push notifications, requests necessary permissions,
 * fetches Expo/FCM push token, and syncs it with the backend API.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  // Push notifications require a physical device on Android / iOS
  if (!Device.isDevice) {
    console.log('[Push Notifications] Must use physical device for push notifications.');
    return null;
  }

  try {
    // 1. Android specific channel configuration
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'RideGo Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF238C',
        enableLights: true,
        enableVibrate: true,
      });
    }

    // 2. Check and request notification permissions
    const settings = await Notifications.getPermissionsAsync();
    let isGranted =
      (settings as any).granted ||
      (settings as any).status === 'granted' ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

    if (!isGranted) {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      isGranted =
        (requested as any).granted ||
        (requested as any).status === 'granted' ||
        requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
        requested.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
    }

    if (!isGranted) {
      console.warn('[Push Notifications] Permission not granted for push notifications.');
      return null;
    }

    // 3. Resolve Project ID for Expo Push Service
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;

    return token;
  } catch (error) {
    console.error('[Push Notifications] Failed to get push token:', error);
    return null;
  }
}

/**
 * Sends device push token to backend server `/users/devices` and caches locally.
 */
export async function syncPushTokenWithServer(token: string): Promise<boolean> {
  if (!token) return false;

  try {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android';
    
    // Register device token with backend API
    await registerPushDevice({
      pushToken: token,
      platform,
    });

    await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
    return true;
  } catch (error) {
    console.warn('[Push Notifications] Failed to register token with backend:', error);
    return false;
  }
}

/**
 * High-level initializer: gets token and registers it if authenticated.
 */
export async function setupPushNotifications(isAuthenticated: boolean): Promise<string | null> {
  if (!isAuthenticated) return null;

  const token = await registerForPushNotificationsAsync();
  if (token) {
    await syncPushTokenWithServer(token);
  }
  return token;
}

/**
 * Attaches token refresh listener to automatically update server on token rotation.
 */
export function setupPushTokenRefreshListener(isAuthenticatedGetter: () => boolean) {
  if (Platform.OS === 'web') {
    return () => {};
  }

  const subscription = Notifications.addPushTokenListener(async (tokenObj) => {
    if (tokenObj?.data && isAuthenticatedGetter()) {
      await syncPushTokenWithServer(tokenObj.data);
    }
  });

  return () => {
    subscription.remove();
  };
}
