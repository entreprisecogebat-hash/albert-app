import type { Me } from '@albert/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, onUnauthorized, saveToken } from './api';
import { registerForPush } from './push';

const ME_KEY = 'albert.me';

interface AuthState {
  ready: boolean;
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Session longue : on reste connecté. Le profil est gardé sur le téléphone,
 * l'application s'ouvre sans réseau. Seule la première connexion demande du réseau.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const signOut = useCallback(async () => {
    api.auth.logout().catch(() => {});
    await saveToken(null);
    await AsyncStorage.removeItem(ME_KEY);
    qc.clear();
    setMe(null);
  }, [qc]);

  useEffect(() => {
    onUnauthorized(() => {
      saveToken(null);
      AsyncStorage.removeItem(ME_KEY);
      qc.clear();
      setMe(null);
    });
    (async () => {
      const token = await loadToken();
      const cached = await AsyncStorage.getItem(ME_KEY);
      if (token && cached) setMe(JSON.parse(cached));
      setReady(true);
      if (token) {
        // Rafraîchit le profil quand le réseau le permet ; sans réseau, on garde le cache.
        api.auth.me().then((m) => {
          setMe(m);
          AsyncStorage.setItem(ME_KEY, JSON.stringify(m));
        }).catch(() => {});
        registerForPush().catch(() => {});
      }
    })();
  }, [qc]);

  const signIn = useCallback(async (token: string, m: Me) => {
    await saveToken(token);
    await AsyncStorage.setItem(ME_KEY, JSON.stringify(m));
    setMe(m);
    registerForPush().catch(() => {});
  }, []);

  return <Ctx.Provider value={{ ready, me, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider manquant');
  return v;
}
