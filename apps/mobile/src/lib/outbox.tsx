import { ApiError, Outbox, type OutboxEntry, type OutboxState } from '@albert/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { appendFile, forgetUpload } from './files';
import { isOnline, subscribeOnline } from './network';

/** Ce que le téléphone garde en attente de réseau. Seulement des ajouts (V1). */
export interface PhotoPayload {
  fileUri: string;
  filename: string;
  mimeType: string;
  batchId: string;
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  caption: string | null;
  visibility: 'team' | 'client';
}

export interface DocumentPayload {
  fileUri: string;
  filename: string;
  mimeType: string;
  size: number | null;
  title?: string;
  type?: string;
  folderId?: string;
  documentId?: string;
  versionLabel?: string;
  comment?: string;
  visibility: 'team' | 'client';
  /** Ce qu'Albert a annoncé au dépôt, pour l'afficher dans le fil en attendant */
  statement: string;
  folderName: string;
}

export interface MessagePayload {
  channelId: string;
  channelKind: 'internal' | 'client';
  body: string;
}

const KEY = 'albert.outbox.v1';

const storage = {
  load: async (): Promise<OutboxEntry[]> => {
    try {
      return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    } catch {
      return [];
    }
  },
  save: async (entries: OutboxEntry[]) => {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  },
};

async function send(entry: OutboxEntry): Promise<void> {
  if (entry.kind === 'message') {
    const p = entry.payload as MessagePayload;
    await api.channels.send(p.channelId, p.body, entry.id, entry.createdAt);
    return;
  }
  const form = new FormData();
  form.append('clientId', entry.id);
  if (entry.kind === 'photo') {
    const p = entry.payload as PhotoPayload;
    await appendFile(form, p.fileUri, p.filename, p.mimeType);
    form.append('batchId', p.batchId);
    form.append('takenAt', p.takenAt);
    if (p.latitude !== null && p.longitude !== null) {
      form.append('latitude', String(p.latitude));
      form.append('longitude', String(p.longitude));
      if (p.accuracy !== null) form.append('accuracy', String(p.accuracy));
    }
    if (p.caption) form.append('caption', p.caption);
    form.append('visibility', p.visibility);
    await api.photos.upload(entry.siteId, form);
  } else {
    const p = entry.payload as DocumentPayload;
    await appendFile(form, p.fileUri, p.filename, p.mimeType);
    form.append('filename', p.filename);
    form.append('createdAt', entry.createdAt);
    form.append('visibility', p.visibility);
    for (const k of ['title', 'type', 'folderId', 'versionLabel', 'comment'] as const) {
      if (p[k]) form.append(k, p[k]!);
    }
    if (p.documentId) await api.documents.uploadVersion(p.documentId, form);
    else await api.documents.upload(entry.siteId, form);
  }
  forgetUpload(entry.id);
}

const Ctx = createContext<{ outbox: Outbox; state: OutboxState } | null>(null);

export function OutboxProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const outbox = useMemo(
    () =>
      new Outbox(storage, send, (entry) => {
        // Le fil et les listes se mettent à jour dès qu'un élément est arrivé.
        qc.invalidateQueries({ queryKey: ['feed', entry.siteId] });
        qc.invalidateQueries({ queryKey: ['sites'] });
        qc.invalidateQueries({ queryKey: ['documents', entry.siteId] });
        if (entry.kind === 'message') qc.invalidateQueries({ queryKey: ['messages', (entry.payload as MessagePayload).channelId] });
        if (entry.kind === 'document' && (entry.payload as DocumentPayload).documentId) {
          qc.invalidateQueries({ queryKey: ['document', (entry.payload as DocumentPayload).documentId] });
        }
      }),
    [qc],
  );
  const [state, setState] = useState<OutboxState>(outbox.state());
  useEffect(() => {
    const unsub = outbox.subscribe(setState);
    outbox.init().then(() => {
      if (isOnline()) outbox.flush();
    });
    // Au retour du réseau, la file part seule.
    const unNet = subscribeOnline(() => isOnline() && outbox.flush());
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && isOnline() && outbox.flush());
    // Filet de sécurité : un essai toutes les 30 s s'il reste quelque chose.
    const timer = setInterval(() => {
      if (isOnline() && outbox.state().pending > 0) outbox.flush();
    }, 30_000);
    return () => {
      unsub();
      unNet();
      appSub.remove();
      clearInterval(timer);
    };
  }, [outbox]);

  return <Ctx.Provider value={{ outbox, state }}>{children}</Ctx.Provider>;
}

export function useOutbox() {
  const v = useContext(Ctx);
  if (!v) throw new Error('OutboxProvider manquant');
  return v;
}

/** Ajoute à la file et tente l'envoi tout de suite si le réseau est là. */
export async function enqueue(outbox: Outbox, entry: Parameters<Outbox['add']>[0]): Promise<void> {
  await outbox.add(entry);
  if (isOnline()) outbox.flush().catch(() => {});
}

export { ApiError };
