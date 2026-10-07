/**
 * File d'attente des actions faites sans réseau (slide 15 de la proposition).
 *
 *  - Le téléphone garde chaque action dans une file persistée.
 *  - Au retour du réseau, la file part seule, dans l'ordre.
 *  - La V1 ne synchronise que des ajouts (photos, documents, messages, vocaux) : pas de conflit possible.
 *  - Chaque action porte un clientId ; le serveur reconnaît un rejeu et ne crée pas de doublon.
 *
 * Indépendant de la plateforme : le stockage et l'envoi sont injectés.
 */

import { ApiError } from './api';

export type OutboxKind = 'photo' | 'document' | 'message' | 'voice';

export interface OutboxEntry<P = unknown> {
  /** Identique au clientId envoyé au serveur */
  id: string;
  kind: OutboxKind;
  siteId: string;
  createdAt: string;
  payload: P;
  attempts: number;
  lastError?: string;
  /** Erreur définitive (refus du serveur) : on ne réessaie plus, on le dit. */
  failed?: boolean;
}

export interface OutboxStorage {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
}

export type OutboxSender = (entry: OutboxEntry) => Promise<void>;

export interface OutboxState {
  pending: number;
  failed: number;
  sending: boolean;
  entries: OutboxEntry[];
}

type Listener = (s: OutboxState) => void;

export class Outbox {
  private entries: OutboxEntry[] = [];
  private loaded = false;
  private sending = false;
  private listeners = new Set<Listener>();

  constructor(
    private readonly storage: OutboxStorage,
    private readonly send: OutboxSender,
    /** Appelé après chaque envoi réussi (rafraîchir le fil, etc.) */
    private readonly onSent?: (entry: OutboxEntry) => void,
  ) {}

  async init(): Promise<void> {
    if (this.loaded) return;
    this.entries = await this.storage.load();
    this.loaded = true;
    this.emit();
  }

  state(): OutboxState {
    return {
      pending: this.entries.filter((e) => !e.failed).length,
      failed: this.entries.filter((e) => e.failed).length,
      sending: this.sending,
      entries: [...this.entries],
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  forSite(siteId: string): OutboxEntry[] {
    return this.entries.filter((e) => e.siteId === siteId);
  }

  async add<P>(entry: Omit<OutboxEntry<P>, 'attempts' | 'createdAt'> & { createdAt?: string }): Promise<void> {
    await this.init();
    if (this.entries.some((e) => e.id === entry.id)) return;
    this.entries.push({ ...entry, createdAt: entry.createdAt ?? new Date().toISOString(), attempts: 0 } as OutboxEntry);
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id);
    await this.persist();
  }

  async retryFailed(): Promise<void> {
    this.entries = this.entries.map((e) => ({ ...e, failed: false, attempts: 0 }));
    await this.persist();
    await this.flush();
  }

  /**
   * Envoie tout ce qui peut l'être, dans l'ordre.
   * S'arrête au premier échec réseau : inutile d'insister sans réseau.
   */
  async flush(): Promise<void> {
    await this.init();
    if (this.sending) return;
    this.sending = true;
    this.emit();
    try {
      for (const entry of [...this.entries]) {
        if (entry.failed) continue;
        try {
          await this.send(entry);
          this.entries = this.entries.filter((e) => e.id !== entry.id);
          await this.persist();
          this.onSent?.(entry);
        } catch (err) {
          const e = this.entries.find((x) => x.id === entry.id);
          if (!e) continue;
          e.attempts += 1;
          e.lastError = err instanceof Error ? err.message : String(err);
          const definitive = err instanceof ApiError && !err.isNetwork && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;
          if (definitive) {
            e.failed = true;
            await this.persist();
            continue;
          }
          await this.persist();
          break;
        }
      }
    } finally {
      this.sending = false;
      this.emit();
    }
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.entries);
    this.emit();
  }

  private emit(): void {
    const s = this.state();
    this.listeners.forEach((l) => l(s));
  }
}

/** "2 éléments en attente de réseau. Envoi automatique dès que vous captez." */
export function outboxSentence(state: Pick<OutboxState, 'pending' | 'sending'>, online: boolean): string | null {
  if (state.pending === 0) return null;
  const n = state.pending;
  const what = n > 1 ? `${n} éléments` : '1 élément';
  if (!online) return `${what} en attente de réseau. Envoi automatique dès que vous captez.`;
  return state.sending ? `Envoi en cours : ${what}.` : `${what} à envoyer. Envoi automatique dans un instant.`;
}

/** UUID v4 sans dépendance (crypto.getRandomValues disponible sur web et React Native). */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
