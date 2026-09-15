// Import per peso: dall'indice del pacchetto finirebbero nel bundle tutti i pesi e i corsivi.
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppFrame, ToastProvider, colors } from '@/design-system';
import { ServerUnavailable } from '@/features/auth/ServerUnavailable';
import { useSessionHydrated, useSignedIn } from '@/services/http/session';
import { useActiveBrand, useWorkspace } from '@/services/queries';
import { queryClient } from '@/services/query-client';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <AppFrame>
          <ToastProvider>
            <RootNavigator />
          </ToastProvider>
        </AppFrame>
        <StatusBar style="dark" />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
  });
  const sessionHydrated = useSessionHydrated();
  const signedIn = useSignedIn();
  const workspace = useWorkspace();
  const { brand } = useActiveBrand();
  // Senza sessione il workspace non si chiede: si aspetta solo di aver riletto la sessione salvata.
  const ready = (fontsLoaded || fontError !== null) && sessionHydrated && (!signedIn || !workspace.isPending);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  if (signedIn && workspace.isError) {
    return (
      <ServerUnavailable error={workspace.error} retrying={workspace.isFetching} onRetry={() => workspace.refetch()} />
    );
  }

  // L'ordine conta: quando una guardia si chiude, il router porta alla prima schermata ancora aperta.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceApp } }}>
      <Stack.Protected guard={signedIn && brand !== null}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="brand/[section]" />
        <Stack.Screen name="idea/[id]" />
        <Stack.Screen name="brands" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-idea" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan-session" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-content" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="create"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen name="content/[slotId]" />
        <Stack.Screen name="draft/[contentId]" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="design-system" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
