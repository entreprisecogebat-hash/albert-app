import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * État du réseau. Le hors ligne est un état, pas une panne :
 * les écrans restent utilisables, rien n'est bloqué.
 */
let online = true;
const listeners = new Set<() => void>();

NetInfo.addEventListener((s) => {
  const next = !!s.isConnected && s.isInternetReachable !== false;
  if (next !== online) {
    online = next;
    onlineManager.setOnline(next);
    listeners.forEach((l) => l());
  }
});

export function isOnline(): boolean {
  return online;
}

export function subscribeOnline(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, isOnline);
}
