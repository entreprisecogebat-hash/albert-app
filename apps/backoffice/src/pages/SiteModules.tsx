import {
  durationLabel, fmt, interventionStatusLabel, phaseLabel, reserveKindLabel, taskPriorityLabel,
  type AdminSiteDetail, type ReserveKind, type SitePhase, type Task, type TaskPriority, type TimeEntry,
} from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { dayTitle, downloadCsv, dueLabel, ErrorBox, Field, isoDay, Loading, mondayOf, OpenDocButton, Sheet, useFormError, useToast } from '../ui';
import { ReservesTable } from './Reserves';

/* ---------- Phase, réception, archivage (F-14) ---------- */

const PHASES = Object.keys(phaseLabel) as SitePhase[];

export function PhaseCard({ site }: { site: AdminSiteDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [delivered, setDelivered] = useState(site.deliveredOn ?? '');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-site', site.id] });
    qc.invalidateQueries({ queryKey: ['admin-sites'] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };
  const update = useMutation({
    mutationFn: (data: Parameters<typeof api.siteAdmin.update>[1]) => api.siteAdmin.update(site.id, data),
    onSuccess: (s, data) => {
      refresh();
      if (data.status) toast(s.status === 'archived' ? 'Chantier archivé. Il reste consultable.' : 'Chantier réactivé.');
      else if (data.phase) toast(`Phase : ${phaseLabel[s.phase].toLowerCase()}.`);
      else toast('Date de réception enregistrée.');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Modification impossible.'),
  });

  return (
    <div className="card">
      <h2>Avancement</h2>
      <div className="chips" style={{ marginTop: 12 }}>
        {PHASES.map((p) => (
          <button key={p} className="chip-f" aria-pressed={site.phase === p} disabled={update.isPending}
            onClick={() => site.phase !== p && update.mutate({ phase: p })}>{phaseLabel[p]}</button>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'flex-end' }}
        onSubmit={(e) => { e.preventDefault(); update.mutate({ deliveredOn: delivered || null }); }}>
        <Field label="Réception des travaux">
          <input className="input" type="date" value={delivered} onChange={(e) => setDelivered(e.target.value)} />
        </Field>
        <button className="btn btn--ghost btn--sm" style={{ marginBottom: 4 }}
          disabled={update.isPending || (site.deliveredOn ?? '') === delivered}>Enregistrer</button>
      </form>
      <p className="hint">Point de départ des garanties (parfait achèvement, biennale, décennale).</p>
      <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 16 }}>
        {site.status === 'archived'
          ? 'Archivé : le chantier n’apparaît plus dans l’application, mais tout reste consultable, exportable et transmissible.'
          : 'Actif : visible dans l’application de tous les intervenants.'}
      </p>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} disabled={update.isPending}
        onClick={() => update.mutate({ status: site.status === 'archived' ? 'active' : 'archived' })}>
        {site.status === 'archived' ? 'Réactiver le chantier' : 'Archiver le chantier'}
      </button>
    </div>
  );
}

/* ---------- Tâches ---------- */

export function TasksTab({ site }: { site: AdminSiteDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const tasks = useQuery({ queryKey: ['tasks', site.id], queryFn: () => api.tasks.list({ siteId: site.id }) });
  const toggle = useMutation({
    mutationFn: (t: Task) => api.tasks.update(t.id, { status: t.status === 'done' ? 'todo' : 'done' }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['tasks', site.id] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast(t.status === 'done' ? 'Tâche terminée.' : 'Tâche rouverte.');
    },
  });

  if (tasks.isLoading) return <Loading />;
  if (tasks.error) return <ErrorBox error={tasks.error} />;
  const all = tasks.data!.items;
  const todo = all.filter((t) => t.status === 'todo');
  const done = all.filter((t) => t.status === 'done');
  const shown = showDone ? [...todo, ...done] : todo;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16 }}>
        <span className="hint" style={{ marginTop: 0 }}>{fmt.plural(todo.length, 'tâche ouverte', 'tâches ouvertes')} · {fmt.plural(done.length, 'terminée')}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--text btn--sm" onClick={() => setShowDone(!showDone)}>{showDone ? 'Masquer les terminées' : 'Voir les terminées'}</button>
          <button className="btn btn--night btn--sm" onClick={() => setCreating(true)}>Nouvelle tâche</button>
        </span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th style={{ width: 48 }}>Fait</th><th>Tâche</th><th>Échéance</th><th>Pour</th></tr></thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id}>
                <td>
                  <input type="checkbox" checked={t.status === 'done'} disabled={toggle.isPending} onChange={() => toggle.mutate(t)}
                    aria-label={t.status === 'done' ? `Rouvrir ${t.title}` : `Marquer ${t.title} comme faite`} style={{ width: 20, height: 20, accentColor: 'var(--night)' }} />
                </td>
                <td>
                  <div className="main-t" style={t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {t.priority === 'urgent' && t.status === 'todo' && <span className="tag tag--night">Urgent</span>}
                    {t.overdue && t.status === 'todo' && <span className="tag tag--alerte">En retard</span>}
                    {t.status === 'done' && t.doneAt && <span className="tag tag--off">Faite le {fmt.day(t.doneAt)}</span>}
                  </div>
                  {t.notes && <div className="sub-t">{t.notes}</div>}
                </td>
                <td className="num">{dueLabel(t.dueOn) || '—'}</td>
                <td style={{ fontSize: 14 }}>{t.assignee?.fullName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Aucune tâche ouverte.</div>}
      </div>
      {creating && <TaskSheet site={site} onClose={() => setCreating(false)} />}
    </div>
  );
}

function TaskSheet({ site, onClose }: { site: AdminSiteDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState({ title: '', notes: '', dueOn: '', priority: 'normal' as TaskPriority, assigneeId: '' });
  const staff = site.members.filter((m) => m.role !== 'client');
  const save = useMutation({
    mutationFn: () => api.tasks.create(site.id, { title: v.title, notes: v.notes || null, dueOn: v.dueOn || null, priority: v.priority, assigneeId: v.assigneeId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', site.id] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast('Tâche ajoutée.');
      onClose();
    },
    onError: form.catchError,
  });
  return (
    <Sheet title="Nouvelle tâche" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !v.title.trim()} onClick={() => save.mutate()}>Ajouter la tâche</button>
    </>}>
      <div className="form">
        <Field label="Tâche" error={form.field('title')}><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus placeholder="Commander les menuiseries" /></Field>
        <div className="row">
          <Field label="Échéance" error={form.field('dueOn')}><input className="input" type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} /></Field>
          <Field label="Pour" error={form.field('assigneeId')}>
            <select className="select" value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: e.target.value })}>
              <option value="">Personne en particulier</option>
              {staff.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.fullName}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Priorité">
          <div className="chips">
            {(['normal', 'urgent'] as const).map((p) => <button type="button" key={p} className="chip-f" aria-pressed={v.priority === p} onClick={() => setV({ ...v, priority: p })}>{taskPriorityLabel[p]}</button>)}
          </div>
        </Field>
        <Field label="Précisions"><textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Pointages (F-10, F-11) ---------- */

export function ClockTab({ site }: { site: AdminSiteDetail }) {
  const toast = useToast();
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const entries = useQuery({ queryKey: ['time-entries', site.id, isoDay(week)], queryFn: () => api.clock.entries(site.id, week.toISOString()) });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; }), [week]);
  const next = new Date(week); next.setDate(next.getDate() + 7);

  const inWeek = (entries.data?.items ?? []).filter((e) => new Date(e.startedAt) < next && new Date(e.startedAt) >= week);
  // Minutes d'un pointage : durée enregistrée, ou temps écoulé s'il est encore ouvert
  const mins = (e: TimeEntry) => e.minutes ?? (e.endedAt ? 0 : Math.max(0, Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60000)));
  const people = useMemo(() => {
    const m = new Map<string, { name: string; perDay: number[]; total: number; open: boolean }>();
    for (const e of inWeek) {
      const row = m.get(e.user.id) ?? { name: e.user.fullName, perDay: Array(7).fill(0) as number[], total: 0, open: false };
      const idx = (new Date(e.startedAt).getDay() + 6) % 7;
      row.perDay[idx] = (row.perDay[idx] ?? 0) + mins(e);
      row.total += mins(e);
      if (!e.endedAt) row.open = true;
      m.set(e.user.id, row);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.data, week]);
  const grand = people.reduce((s, p) => s + p.total, 0);

  const exportCsv = () => {
    const h = (n: number) => (n / 60).toFixed(2).replace('.', ',');
    downloadCsv(`pointages-${site.name}-${isoDay(week)}.csv`, [
      ['Intervenant', 'Jour', 'Arrivée', 'Départ', 'Durée (h)', 'Distance au chantier à l’arrivée (m)', 'Note'],
      ...inWeek
        .slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((e) => [e.user.fullName, isoDay(new Date(e.startedAt)), fmt.time(e.startedAt), e.endedAt ? fmt.time(e.endedAt) : 'en cours', h(mins(e)), e.startDistance ?? '', e.note ?? '']),
      [],
      ['Total semaine', '', '', '', h(grand)],
    ]);
    toast('Export des pointages téléchargé.');
  };

  const shift = (w: number) => setWeek((s) => { const n = new Date(s); n.setDate(n.getDate() + w * 7); return n; });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn--ghost btn--sm" onClick={() => shift(-1)} aria-label="Semaine précédente"><ChevronLeft size={18} strokeWidth={1.75} /></button>
          <span style={{ fontWeight: 600 }}>Semaine du {fmt.day(week)}</span>
          <button className="btn btn--ghost btn--sm" onClick={() => shift(1)} aria-label="Semaine suivante"><ChevronRight size={18} strokeWidth={1.75} /></button>
        </span>
        <button className="btn btn--ghost btn--sm" disabled={inWeek.length === 0} onClick={exportCsv}><Download size={16} strokeWidth={1.75} />Exporter (CSV)</button>
      </div>
      {entries.isLoading ? <Loading /> : entries.error ? <ErrorBox error={entries.error} /> : (
        <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Intervenant</th>
                {days.map((d) => <th key={d.toISOString()} style={{ textAlign: 'right' }}>{dayTitle(d).split(' ')[0]!.slice(0, 3)}. {d.getDate()}</th>)}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <td><div className="main-t">{p.name}</div>{p.open && <span className="tag tag--night" style={{ marginTop: 4 }}>Sur le chantier</span>}</td>
                  {p.perDay.map((m, i) => <td key={i} className="num" style={{ textAlign: 'right' }}>{m ? durationLabel(m) : '·'}</td>)}
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{durationLabel(p.total)}</td>
                </tr>
              ))}
              {people.length > 0 && (
                <tr>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  {days.map((_, i) => <td key={i} className="num" style={{ textAlign: 'right' }}>{durationLabel(people.reduce((s, p) => s + (p.perDay[i] ?? 0), 0)) || '·'}</td>)}
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>{durationLabel(grand)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {people.length === 0 && <div className="empty">Aucun pointage cette semaine. Les équipes pointent depuis l’application, sur le chantier.</div>}
        </div>
      )}
      <p className="hint">Le pointage enregistre l’heure et, si le téléphone l’autorise, la position à l’arrivée et au départ.</p>
    </div>
  );
}

/* ---------- Fiches d'intervention (F-12) ---------- */

export function InterventionsTab({ site }: { site: AdminSiteDetail }) {
  const list = useQuery({ queryKey: ['interventions', site.id], queryFn: () => api.interventions.list(site.id) });
  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} />;
  const items = list.data!.items;
  return (
    <div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>N°</th><th>Intervention</th><th>Date</th><th>Durée</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="num">{i.number}</td>
                <td><div className="main-t">{i.title}</div><div className="sub-t">{[i.technicians, i.author ? `rédigée par ${i.author.fullName}` : null].filter(Boolean).join(' · ')}</div></td>
                <td className="num">{dueLabel(i.interventionOn)}</td>
                <td className="num">{durationLabel(i.minutes) || '—'}</td>
                <td>
                  <span className={`tag${i.status === 'signed' ? ' tag--off' : ' tag--night'}`}>{interventionStatusLabel[i.status]}</span>
                  {i.status === 'signed' && i.signerName && <div className="sub-t" style={{ marginTop: 4 }}>par {i.signerName}{i.signedAt ? `, ${fmt.day(i.signedAt)}` : ''}</div>}
                </td>
                <td style={{ textAlign: 'right' }}>{i.documentId ? <OpenDocButton documentId={i.documentId} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Aucune fiche d’intervention. Elles se remplissent et se signent sur le chantier, depuis l’application.</div>}
      </div>
    </div>
  );
}

/* ---------- Réserves du chantier (F-15) ---------- */

export function SiteReservesTab({ site }: { site: AdminSiteDetail }) {
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['reserves', site.id], queryFn: () => api.reserves.list({ siteId: site.id }) });
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn--night btn--sm" onClick={() => setCreating(true)}>Signaler une réserve</button>
      </div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : <ReservesTable items={list.data!.items} />}
      {creating && <ReserveCreateSheet site={site} onClose={() => setCreating(false)} />}
    </div>
  );
}

function ReserveCreateSheet({ site, onClose }: { site: AdminSiteDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState({ kind: (site.phase === 'apres' ? 'sav' : 'reserve') as ReserveKind, title: '', description: '', location: '', dueOn: '', assigneeId: '', client: false });
  const staff = site.members.filter((m) => m.role !== 'client');
  const save = useMutation({
    mutationFn: () => api.reserves.create(site.id, {
      kind: v.kind, title: v.title, description: v.description || null, location: v.location || null,
      dueOn: v.dueOn || null, assigneeId: v.assigneeId || null, visibility: v.client ? 'client' : 'team',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reserves'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast('Réserve enregistrée.');
      onClose();
    },
    onError: form.catchError,
  });
  return (
    <Sheet title="Signaler une réserve" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !v.title.trim()} onClick={() => save.mutate()}>Enregistrer</button>
    </>}>
      <div className="form">
        <Field label="Type">
          <div className="chips">
            {(Object.keys(reserveKindLabel) as ReserveKind[]).map((k) => <button type="button" key={k} className="chip-f" aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k })}>{reserveKindLabel[k]}</button>)}
          </div>
        </Field>
        <Field label="Objet" error={form.field('title')}><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus placeholder="Joint de carrelage fissuré, salle de bain" /></Field>
        <Field label="Emplacement" error={form.field('location')}><input className="input" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Étage 1, salle de bain" /></Field>
        <div className="row">
          <Field label="À lever avant le" error={form.field('dueOn')}><input className="input" type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} /></Field>
          <Field label="Suivi par" error={form.field('assigneeId')}>
            <select className="select" value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: e.target.value })}>
              <option value="">Personne en particulier</option>
              {staff.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.fullName}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description"><textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={v.client} onChange={(e) => setV({ ...v, client: e.target.checked })} />Visible aussi par le client</label>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- DOE et transmission (F-13, F-14) ---------- */

export function DoeTab({ site }: { site: AdminSiteDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const doe = useQuery({ queryKey: ['doe', site.id], queryFn: () => api.doe.get(site.id) });
  const generate = useMutation({
    mutationFn: () => api.doe.generate(site.id),
    onSuccess: (d) => { qc.setQueryData(['doe', site.id], d); qc.invalidateQueries({ queryKey: ['admin-activity', site.id] }); toast('DOE généré et rangé dans le chantier.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Génération impossible.'),
  });
  const share = useMutation({
    mutationFn: () => api.doe.share(site.id, 30),
    onSuccess: (d) => { qc.setQueryData(['doe', site.id], d); toast('Lien de transmission créé, valable 30 jours.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Création du lien impossible.'),
  });

  if (doe.isLoading) return <Loading />;
  if (doe.error) return <ErrorBox error={doe.error} />;
  const d = doe.data!;
  const total = d.sections.reduce((s, x) => s + x.count, 0);

  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>Contenu du dossier</h2>
        <p className="hint" style={{ marginTop: 8 }}>Le Dossier des Ouvrages Exécutés est composé à partir des données du chantier : {fmt.plural(total, 'pièce')}.</p>
        <div className="kv" style={{ marginTop: 16 }}>
          {d.sections.map((s) => <div key={s.key}><span className="k">{s.label}</span><span className="v num">{s.count}</span></div>)}
        </div>
      </div>
      <div className="card">
        <h2>Génération et transmission</h2>
        <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8 }}>
          {d.generatedAt ? `Dernier DOE généré ${fmt.relative(d.generatedAt).toLowerCase()}.` : 'Aucun DOE généré pour le moment.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button className="btn btn--night btn--sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? 'Génération…' : d.generatedAt ? 'Régénérer le DOE' : 'Générer le DOE'}
          </button>
          {d.documentId && <OpenDocButton documentId={d.documentId} label="Ouvrir le PDF" />}
          {d.zipUrl && <a className="btn btn--text btn--sm" href={d.zipUrl}>Télécharger toutes les pièces (ZIP)</a>}
        </div>
        <div style={{ borderTop: '1px solid var(--rule)', marginTop: 20, paddingTop: 16 }}>
          <span className="label">Lien de transmission (client, acquéreur, notaire)</span>
          {d.share && d.share.active ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" readOnly value={d.share.url} onFocus={(e) => e.currentTarget.select()} aria-label="Lien de transmission" />
                <button className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard.writeText(d.share!.url).then(() => toast('Lien copié.'))}>Copier</button>
              </div>
              <p className="hint">Valable jusqu’au {fmt.day(d.share.expiresAt)} · {fmt.plural(d.share.views, 'consultation')}.</p>
            </>
          ) : (
            <button className="btn btn--ghost btn--sm" disabled={!d.documentId || share.isPending} onClick={() => share.mutate()}>Créer un lien de transmission</button>
          )}
          {!d.documentId && <p className="hint">Générez d’abord le DOE.</p>}
        </div>
      </div>
    </div>
  );
}
