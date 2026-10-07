import { Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import '../lib/network';
import { OutboxProvider } from '../lib/outbox';
import { colors } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Copie locale des données : chantiers, fils et documents déjà consultés restent
 * accessibles sans réseau (cache persisté sur le téléphone, 7 jours).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', staleTime: 20_000, gcTime: 7 * 24 * 3600_000, retry: 1 },
    mutations: { networkMode: 'offlineFirst' },
  },
});
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'albert.cache.v1' });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_600SemiBold,
    Archivo_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 3600_000 }}>
        <AuthProvider>
          <OutboxProvider>
            <StatusBar style="dark" />
            {fontsLoaded ? <Navigator /> : null}
          </OutboxProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { ready, me } = useAuth();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="connexion/index" />
        <Stack.Screen name="connexion/code" />
      </Stack.Protected>
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ajouter" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="commande" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="chantiers/nouveau" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chantiers/[id]/index" />
        <Stack.Screen name="chantiers/[id]/ajouter" />
        <Stack.Screen name="chantiers/[id]/document" />
        <Stack.Screen name="chantiers/[id]/photos" />
        <Stack.Screen name="chantiers/[id]/rechercher" />
        <Stack.Screen name="chantiers/[id]/messages/[kind]" />
        <Stack.Screen name="chantiers/[id]/documents" />
        <Stack.Screen name="chantiers/[id]/taches" />
        <Stack.Screen name="chantiers/[id]/pointage" />
        <Stack.Screen name="chantiers/[id]/interventions" />
        <Stack.Screen name="chantiers/[id]/intervention-nouvelle" />
        <Stack.Screen name="chantiers/[id]/reserves" />
        <Stack.Screen name="chantiers/[id]/reserve-nouvelle" />
        <Stack.Screen name="chantiers/[id]/agenda" />
        <Stack.Screen name="chantiers/[id]/equipe" />
        <Stack.Screen name="chantiers/[id]/doe" />
        <Stack.Screen name="chantiers/[id]/reglages" />
        <Stack.Screen name="chantiers/[id]/finances" />
        <Stack.Screen name="chantiers/[id]/finance-nouvelle" />
        <Stack.Screen name="finances/[id]" />
        <Stack.Screen name="interventions/[id]" />
        <Stack.Screen name="reserves/[id]" />
        <Stack.Screen name="contacts/[id]" />
        <Stack.Screen name="contacts/nouveau" options={{ presentation: 'modal' }} />
        <Stack.Screen name="agenda/nouveau" options={{ presentation: 'modal' }} />
        <Stack.Screen name="documents/[id]" />
        <Stack.Screen name="photo" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="compte" />
      </Stack.Protected>
    </Stack>
  );
}
