import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from 'expo-notifications';
import { View, ActivityIndicator } from 'react-native';

import { UserProvider, useUser } from "../Context/UserContext"
import { logFcmToken } from '../utils/getFcmToken';
import { logExpoPushToken } from '../utils/getExpoPushToken';
import { Platform } from 'react-native';

// Must be called at module scope (not inside a component) so it's registered
// before any notification arrives — enables foreground notification banners.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function InitialLayout() {
  const { isAuthenticated, isLoading } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inProtectedGroup = segments[0] === '(tabs)' || ['proceedRequests', 'rejectedRequests', 'documents', 'patients'].includes(segments[0]);
    const isRootIndex = segments[0] === undefined || segments[0] === 'index';

    if (!isAuthenticated && (inProtectedGroup || isRootIndex)) {
      router.replace('/(auth)/sign-in');
    } else if (isAuthenticated && (inAuthGroup || isRootIndex)) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b192c' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="proceedRequests" options={{ headerShown: true, headerTitle: 'Approved Requests', headerBackTitle: 'Info' }} />
      <Stack.Screen name="rejectedRequests" options={{ headerShown: true, headerTitle: 'Rejected Requests', headerBackTitle: 'Info' }} />
      <Stack.Screen name="documents" options={{ headerShown: true, headerTitle: 'Documents', headerBackTitle: 'docs' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Android: raw FCM token — tested via Firebase Console (Phase 1)
      logFcmToken();
    } else if (Platform.OS === 'ios') {
      // iOS: Expo push token — uses Expo Push Service → APNs (Phase 1b)
      logExpoPushToken();
    }
  }, []);

  return (
    <UserProvider>
      <InitialLayout />
    </UserProvider>
  ) 
}
