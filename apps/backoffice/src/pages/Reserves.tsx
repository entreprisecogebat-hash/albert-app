import { fmt, reserveKindLabel, reserveStatusLabel, type Reserve, type ReserveKind, type ReserveStatus } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { dueLabel, ErrorBox, Field, Loading, Sheet, useFormError, useToast } from '../ui';

const KINDS = Object.keys(reserveKindLabel) as ReserveKind[];
const STATUSES = Object.keys(reserveStatusLabel) as ReserveStatus[];
type StatusFilter = ReserveStatus | 'not_done' | '';

/** F-15 : réserves, SAV et garanties de tous les chantiers. */
export function ReservesPage() {
  const [status, setStatus] = useState<StatusFilter>('not_done');
  const [kind, setKind] = useState<ReserveKind | ''>('');
  const list = useQuery({
    queryKey: ['reserves', 'all', status, kind],
    queryFn: () => api.reserves.list({ status: status || undefined, kind: kind || undefined }),
  });
  const items = list.data?.items ?? [];
  const late = items.filter((r) => r.overdue).length;

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Réserves et SAV</h1>
          <div className="sub">
            Réserves de réception, demandes après chantier et garanties, sur tous les chantiers.
            {late > 0 ? ` ${fmt.plural(late, 'demande')} en retard.` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="chips">
          <button className="chip-f" aria-pressed={status === 'not_done'} onClick={() => setStatus('not_done')}>À lever</button>
          {STATUSES.map((s) => <button key={s} className="chip-f" aria-pressed={status === s} onClick={() => setStatus(s)}>{reserveStatusLabel[s]}</button>)}
          <button className="chip-f" aria-pressed={status === ''} onClick={() => setStatus('')}>Toutes</button>
        </div>
        <div className="chips">
          <button className="chip-f" aria-pressed={kind === ''} onClick={() => setKind('')}>Tous types</button>
          {KINDS.map((k) => <button key={k} className="chip-f" aria-pressed={kind === k} onClick={() => setKind(k)}>{reserveKindLabel[k]}</button>)}
        </div>
      </div>

      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : <ReservesTable items={items} showSite />}
    </div>
  );
}

export function ReserveStatusTag({ r }: { r: Reserve }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <span className={`tag${r.status === 'done' ? ' tag--off' : r.status === 'in_progress' ? ' tag--night' : ''}`}>{reserveStatusLabel[r.status]}</span>
      {r.overdue && r.status !== 'done' && <span className="tag tag--alerte">En retard</span>}
    </span>
  );
}

export function ReservesTable({ items, showSite }: { items: Reserve[]; showSite?: boolean }) {
  const [open, setOpen] = useState<Reserve | null>(null);
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Objet</th>{showSite && <th>Chantier</th>}<th>Type</th><th>Statut</th><th>Échéance</th><th>Suivi par</th></tr></thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="link" onClick={() => setOpen(r)}>
              <td><div className="main-t">{r.title}</div><div className="sub-t">{[r.location, `signalé ${fmt.relative(r.reportedAt).toLowerCase()}`].filter(Boolean).join(' · ')}</div></td>
              {showSite && <td onClick={(e) => e.stopPropagation()}><Link to={`/chantiers/${r.siteId}?onglet=reserves`}>{r.siteName}</Link></td>}
              <td><span className="tag">{reserveKindLabel[r.kind]}</span></td>
              <td><ReserveStatusTag r={r} /></td>
              <td className="num">{r.status === 'done' && r.doneAt ? `levée le ${fmt.day(r.doneAt)}` : dueLabel(r.dueOn) || '—'}</td>
              <td style={{ fontSize: 14 }}>{r.assignee?.fullName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="empty">Aucune réserve ni demande SAV.</div>}
      {open && <ReserveSheet reserve={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Détail, historique et changement de statut avec une note */
function ReserveSheet({ reserve, onClose }: { reserve: Reserve; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const detail = useQuery({ queryKey: ['reserve', reserve.id], queryFn: () => api.reserves.get(reserve.id) });
  const [status, setStatus] = useState<ReserveStatus>(reserve.status);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.reserves.update(reserve.id, { status, note: note || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['reserves'] });
      qc.invalidateQueries({ queryKey: ['reserve', r.id] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast(r.status === 'done' ? 'Réserve levée.' : 'Suivi enregistré.');
      onClose();
    },
    onError: form.catchError,
  });
  const r = detail.data ?? reserve;

  return (
    <Sheet title={r.title} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Fermer</button>
      <button className="btn btn--primary" disabled={save.isPending || (status === reserve.status && !note.trim())} onClick={() => save.mutate()}>Enregistrer le suivi</button>
    </>}>
      <div className="stack">
        <div className="kv">
          <div><span className="k">Chantier</span><span className="v">{r.siteName}</span></div>
          <div><span className="k">Type</span><span className="v">{reserveKindLabel[r.kind]}</span></div>
          <div><span className="k">Statut</span><span className="v"><ReserveStatusTag r={r} /></span></div>
          {r.location && <div><span className="k">Emplacement</span><span className="v">{r.location}</span></div>}
          <div><span className="k">Signalé</span><span className="v num">{fmt.day(r.reportedAt)}{r.reportedBy ? ` · ${r.reportedBy.fullName}` : ''}</span></div>
          {r.dueOn && <div><span className="k">Échéance</span><span className="v num">{dueLabel(r.dueOn)}</span></div>}
          <div><span className="k">Visibilité</span><span className="v">{r.visibility === 'client' ? 'Visible aussi par le client' : 'Équipe seulement'}</span></div>
        </div>
        {r.description && <p style={{ fontSize: 15, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{r.description}</p>}

        {detail.data && detail.data.photos.length > 0 && (
          <div className="thumbs">
            {detail.data.photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.thumbUrl} alt="" /></a>)}
          </div>
        )}

        {detail.data && detail.data.history.length > 0 && (
          <div>
            <span className="label">Historique</span>
            <div className="feed">
              {detail.data.history.map((h) => (
                <div key={h.id} className="item" style={{ padding: '10px 0' }}>
                  <div className="bd">
                    <div className="meta">{fmt.exact(h.at)}{h.actor ? ` · ${h.actor.fullName}` : ''}</div>
                    <div style={{ fontSize: 15 }}>
                      {h.status ? <b>{reserveStatusLabel[h.status]}. </b> : null}{h.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form">
          <Field label="Nouveau statut" error={form.field('status')}>
            <div className="chips">
              {STATUSES.map((s) => <button type="button" key={s} className="chip-f" aria-pressed={status === s} onClick={() => setStatus(s)}>{reserveStatusLabel[s]}</button>)}
            </div>
          </Field>
          <Field label="Note de suivi" error={form.field('note')}>
            <textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Passage du carreleur prévu jeudi." />
          </Field>
          {form.message && <p className="err">{form.message}</p>}
        </div>
      </div>
    </Sheet>
  );
}
