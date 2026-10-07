import type { Me } from '@albert/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTok] = useState(getToken());

  const signOut = useCallback(() => {
    api.auth.logout().catch(() => {});
    setToken(null);
    setTok(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setTok(null);
      qc.clear();
    });
  }, [qc]);

  const me = useQuery({ queryKey: ['me', token], queryFn: api.auth.me, enabled: !!token, retry: false });

  const value = useMemo<AuthState>(
    () => ({
      me: token ? (me.data ?? null) : null,
      loading: !!token && me.isLoading,
      signIn: (t) => {
        setToken(t);
        setTok(t);
      },
      signOut,
    }),
    [token, me.data, me.isLoading, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider manquant');
  return v;
}
