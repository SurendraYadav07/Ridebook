import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { RideProvider } from '@/context/RideContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AccountBlockedView } from '@/components/AccountBlockedView';
import { setupPushNotifications, setupPushTokenRefreshListener } from '@/lib/notifications';
import { getApiBaseUrl } from '@/lib/api-url';

// EXPO_PUBLIC_API_URL works for local devices, simulators, and production.
// Keep the legacy deployment domain as a fallback for existing environments.
const apiBaseUrl = getApiBaseUrl();
if (!apiBaseUrl) {
  throw new Error('Set EXPO_PUBLIC_API_URL before creating a production app build.');
}
setBaseUrl(apiBaseUrl);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Route guard for auth state navigation.
 */
function RootLayoutNav() {
  const { isAuthenticated, isLoading, isBlocked, blockedReason } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Wire push notification registration, token refresh, and interaction handling
  useEffect(() => {
    if (!isAuthenticated) return;

    setupPushNotifications(true).catch((err) => {
      console.warn('[Push Notifications] Initial setup warning:', err);
    });

    const unsubscribeRefresh = setupPushTokenRefreshListener(() => isAuthenticated);

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
      if (data?.rideId) {
        router.push({ pathname: '/tracking', params: { rideId: data.rideId } });
      }
    });

    return () => {
      unsubscribeRefresh();
      responseSubscription.remove();
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isAuthenticated && isBlocked) {
    return <AccountBlockedView reason={blockedReason} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="booking"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="tracking"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="driver"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="admin"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RideProvider>
                  <RootLayoutNav />
                </RideProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
