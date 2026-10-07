import { ApiError, fmt, type FeedItem } from '@albert/shared';
import { Archive, Banknote, Calendar, CalendarDays, Camera, CheckSquare, ClipboardCheck, Clock, FileCheck, FileSignature, FileText, Flag, Link2, MessageSquare, PencilLine, Receipt, Route, UserPlus, X } from 'lucide-react';
import { api } from './api';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/* ---------- Toast : la confirmation tient en une phrase ---------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Feuille modale ---------- */

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2>{title}</h2>
          <button className="btn btn--text" onClick={onClose} aria-label="Fermer"><X size={22} strokeWidth={1.75} /></button>
        </div>
        {children}
        <div className="foot">{footer}</div>
      </div>
    </div>
  );
}

/* ---------- Erreurs de formulaire ---------- */

export function useFormError() {
  const [error, setError] = useState<ApiError | null>(null);
  const catchError = useCallback((e: unknown) => {
    setError(e instanceof ApiError ? e : new ApiError(500, { error: 'Une erreur est survenue.' }));
  }, []);
  return {
    error,
    clear: () => setError(null),
    catchError,
    field: (name: string) => error?.fields?.[name],
    message: error && Object.keys(error.fields ?? {}).length === 0 ? error.message : null,
  };
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label">{label}</span>
      {children}
      {error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </label>
  );
}

/* ---------- Fil d'activite ---------- */

const ICONS: Record<string, typeof FileText> = {
  photos_added: Camera,
  document_added: FileText,
  document_version: FileText,
  document_reclassified: PencilLine,
  message: MessageSquare,
  member_added: UserPlus,
  site_created: Flag,
  note: Calendar,
  task_done: CheckSquare,
  clock_in: Clock,
  clock_out: Clock,
  intervention_signed: FileSignature,
  reserve_opened: ClipboardCheck,
  reserve_updated: ClipboardCheck,
  appointment: CalendarDays,
  phase_changed: Route,
  doe_generated: Archive,
  share_created: Link2,
  quote_accepted: FileCheck,
  invoice_sent: Receipt,
  payment_received: Banknote,
};

export function FeedList({ items }: { items: FeedItem[] }) {
  if (!items.length) return <div className="feed"><div className="empty">Rien pour le moment.</div></div>;
  return (
    <div className="feed">
      {items.map((it) => {
        const Icon = ICONS[it.type] ?? FileText;
        const isClient = it.type === 'message' ? it.channel === 'client' : false;
        return (
          <div key={it.id} className={`item${isClient ? ' client' : ''}`}>
            <div className="ic"><Icon size={20} strokeWidth={1.75} /></div>
            <div className="bd">
              <div className="meta">
                {fmt.relative(it.occurredAt)}
                {it.actor ? ` · ${it.actor.fullName}` : ''}
                {it.visibility === 'client' && it.type !== 'message' ? ' · visible par le client' : ''}
              </div>
              {isClient && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span className="tag"><span className="dot" style={{ background: 'var(--client)' }} />Canal client</span>
                  {it.awaitingReply && <span className="tag tag--night">Réponse attendue</span>}
                </div>
              )}
              <div className="ttl">{it.type === 'message' ? it.body : it.title}</div>
              {it.type === 'photos_added' && it.caption && <div className="subl">{it.caption}</div>}
              {it.type !== 'message' && it.subtitle && it.type !== 'photos_added' && <div className="subl">{it.subtitle}</div>}
              {it.photos && it.photos.length > 0 && (
                <>
                  <div className="thumbs">
                    {it.photos.slice(0, 8).map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.thumbUrl} alt="" loading="lazy" /></a>
                    ))}
                  </div>
                  <div className="subl" style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 8 }}>
                    {fmt.takenRange(it.takenFrom, it.takenTo)}
                    {it.located && it.latitude !== undefined ? ` · ${it.latitude.toFixed(5)}, ${it.longitude?.toFixed(5)}` : ' · sans position'}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Loading() {
  return <div className="empty">Chargement…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div className="card"><p className="err" style={{ marginTop: 0 }}>{error instanceof Error ? error.message : 'Une erreur est survenue.'}</p></div>;
}

/* ---------- Outils partagés des modules (dates, CSV, documents) ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-JJ en heure locale */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Lundi de la semaine de d, à minuit */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** "Lundi 6 octobre" */
export function dayTitle(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${fmt.day(d)}`;
}

/** Date AAAA-MM-JJ lisible : "6 octobre" */
export function dueLabel(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return fmt.day(new Date(y!, (m ?? 1) - 1, d ?? 1));
}

/** Téléchargement d'un CSV construit dans le navigateur (séparateur ; pour Excel français, BOM UTF-8) */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Bouton qui ouvre la version en cours d'un document (lien signé, nouvel onglet) */
export function OpenDocButton({ documentId, label = 'Ouvrir le PDF' }: { documentId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button className="btn btn--text btn--sm" disabled={busy} onClick={async () => {
      // Onglet ouvert tout de suite (sinon le navigateur le bloque après l'attente réseau)
      const w = window.open('', '_blank');
      setBusy(true);
      try {
        const url = (await api.documents.get(documentId)).current?.url ?? null;
        if (url && w) w.location.href = url;
        else { w?.close(); toast('Document indisponible.'); }
      } catch (e) {
        w?.close();
        toast(e instanceof Error ? e.message : 'Document indisponible.');
      } finally {
        setBusy(false);
      }
    }}>{label}</button>
  );
}

/** Onglets de section : même vocabulaire que les filtres (nuit = actif) */
export function Tabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="chips" role="tablist" style={{ marginBottom: 16 }}>
      {items.map((it) => (
        <button key={it.key} role="tab" className="chip-f" aria-pressed={value === it.key} aria-selected={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}{it.count ? <span className="num" style={{ marginLeft: 8, color: 'inherit' }}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
