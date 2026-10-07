import { createApiClient } from '@albert/shared';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'albert.token';

/**
 * Adresse de l'API.
 *  - EXPO_PUBLIC_API_URL si défini (recette, production).
 *  - Sinon, en dev, la machine qui sert le bundle Expo, port 8000 (l'API Symfony locale).
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  if (Platform.OS === 'web') return 'http://localhost:8000';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:8000`;
}

let memoryToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = Platform.OS === 'web' ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function saveToken(token: string | null): Promise<void> {
  memoryToken = token;
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

let unauthorized: () => void = () => {};
export function onUnauthorized(fn: () => void): void {
  unauthorized = fn;
}

export const API_URL = resolveBaseUrl();

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: loadToken,
  onUnauthorized: () => unauthorized(),
  // expo/fetch accepte les fichiers expo-file-system dans un FormData (envoi des photos et documents)
  fetch: Platform.OS === 'web' ? undefined : (expoFetch as unknown as typeof fetch),
  // Les envois de photos depuis un sous-sol peuvent être lents : on laisse du temps.
  timeoutMs: 60_000,
});
