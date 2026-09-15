// Import per peso: dall'indice del pacchetto finirebbero nel bundle tutti i pesi e i corsivi.
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppFrame, ToastProvider, colors } from '@/design-system';
import { useActiveBrand, useWorkspace } from '@/services/queries';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // I dati del mock cambiano solo con le mutation, che aggiornano la cache da sole.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  );

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
  const workspace = useWorkspace();
  const { brand } = useActiveBrand();
  const ready = (fontsLoaded || fontError !== null) && !workspace.isPending;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceApp } }}>
      <Stack.Protected guard={brand !== null}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="brand/[section]" />
        <Stack.Screen name="idea/[id]" />
        <Stack.Screen name="slot/[id]" />
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
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="design-system" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
