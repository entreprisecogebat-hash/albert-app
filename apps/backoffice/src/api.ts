import { createApiClient } from '@albert/shared';

const TOKEN_KEY = 'albert.bo.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* navigation privee */
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

// En dev, Vite relaie /api vers Symfony (vite.config.ts). En production, meme domaine.
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken,
  onUnauthorized: () => onUnauthorized(),
});

/** Telechargement authentifie (export CSV) */
export async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new Error('Export impossible.');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
