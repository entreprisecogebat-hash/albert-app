import { fmt, type Appointment } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { dayTitle, ErrorBox, Field, isoDay, Loading, mondayOf, Sheet, useFormError, useToast } from '../ui';

const WEEKS = 4;

/** Agenda partagé (F-01, F-03) : quatre semaines, jour par jour. */
export function AgendaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const [creating, setCreating] = useState<string | null>(null);
  const end = useMemo(() => { const e = new Date(start); e.setDate(e.getDate() + WEEKS * 7); return e; }, [start]);
  const list = useQuery({
    queryKey: ['appointments', isoDay(start)],
    queryFn: () => api.appointments.list({ from: start.toISOString(), to: end.toISOString() }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.appointments.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['today'] }); toast('Rendez-vous supprimé.'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Suppression impossible.'),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of list.data?.items ?? []) {
      const k = isoDay(new Date(a.startsAt));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    for (const v of m.values()) v.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return m;
  }, [list.data]);

  const days: Date[] = [];
  for (let i = 0; i < WEEKS * 7; i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
  const todayKey = isoDay(new Date());
  const shift = (w: number) => setStart((s) => { const n = new Date(s); n.setDate(n.getDate() + w * 7); return n; });
  const last = new Date(end); last.setDate(last.getDate() - 1);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Agenda</h1>
          <div className="sub">Rendez-vous de l’équipe, visibles aussi dans l’application. Du {fmt.day(start)} au {fmt.day(last)}.</div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost btn--sm" onClick={() => shift(-1)} aria-label="Semaine précédente"><ChevronLeft size={18} strokeWidth={1.75} /></button>
          <button className="btn btn--ghost btn--sm" onClick={() => setStart(mondayOf(new Date()))}>Cette semaine</button>
          <button className="btn btn--ghost btn--sm" onClick={() => shift(1)} aria-label="Semaine suivante"><ChevronRight size={18} strokeWidth={1.75} /></button>
          <button className="btn btn--primary" onClick={() => setCreating(todayKey)}>Nouveau rendez-vous</button>
        </div>
      </div>

      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : (
        <div className="feed">
          {days.map((d) => {
            const k = isoDay(d);
            const items = byDay.get(k) ?? [];
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            if (weekend && items.length === 0) return null;
            return (
              <div key={k} className="item" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 180px' }}>
                  <div style={{ fontWeight: 600 }}>{dayTitle(d)}</div>
                  {k === todayKey && <span className="tag tag--night" style={{ marginTop: 4 }}>Aujourd’hui</span>}
                </div>
                <div className="bd">
                  {items.length === 0 ? (
                    <button className="btn btn--text btn--sm" style={{ paddingLeft: 0, color: 'var(--ink-3)' }} onClick={() => setCreating(k)}>Rien de prévu · ajouter</button>
                  ) : items.map((a) => (
                    <div key={a.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '4px 0' }}>
                      <span className="num" style={{ flex: '0 0 96px', paddingTop: 2 }}>{fmt.time(a.startsAt)}{a.endsAt ? `–${fmt.time(a.endsAt)}` : ''}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, display: 'block' }}>{a.title}</span>
                        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
                          {a.site && <Link to={`/chantiers/${a.site.id}`}>{a.site.name}</Link>}
                          {a.site && a.contact ? ' · ' : ''}
                          {a.contact && <Link to={`/contacts/${a.contact.id}`}>{a.contact.name}</Link>}
                          {a.location ? `${a.site || a.contact ? ' · ' : ''}${a.location}` : ''}
                          {a.createdBy ? ` · par ${a.createdBy.fullName}` : ''}
                        </span>
                      </span>
                      <button className="btn btn--text btn--sm" disabled={remove.isPending}
                        onClick={() => { if (window.confirm(`Supprimer « ${a.title} » ?`)) remove.mutate(a.id); }}>Supprimer</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <AppointmentSheet onClose={() => setCreating(null)} initial={{ date: creating }} />}
    </div>
  );
}

export function AppointmentSheet({ onClose, initial }: { onClose: () => void; initial?: { date?: string; siteId?: string; contactId?: string } }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const sites = useQuery({ queryKey: ['admin-sites', '', 'active'], queryFn: () => api.admin.sites('', 'active') });
  const contacts = useQuery({ queryKey: ['contacts', '', ''], queryFn: () => api.contacts.list() });
  const [v, setV] = useState({
    title: '', date: initial?.date ?? isoDay(new Date()), start: '09:00', end: '10:00', location: '', notes: '',
    siteId: initial?.siteId ?? '', contactId: initial?.contactId ?? '',
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const at = (hm: string) => new Date(`${v.date}T${hm}:00`).toISOString();
      return api.appointments.create({
        title: v.title, startsAt: at(v.start), endsAt: v.end ? at(v.end) : null,
        location: v.location || null, notes: v.notes || null, siteId: v.siteId || null, contactId: v.contactId || null,
      });
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      if (a.contact) qc.invalidateQueries({ queryKey: ['contact', a.contact.id] });
      toast(`Rendez-vous ajouté le ${fmt.day(a.startsAt)} à ${fmt.time(a.startsAt)}.`);
      onClose();
    },
    onError: form.catchError,
  });

  return (
    <Sheet title="Nouveau rendez-vous" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !v.title.trim()} onClick={() => save.mutate()}>Ajouter à l’agenda</button>
    </>}>
      <div className="form">
        <Field label="Objet" error={form.field('title')}><input className="input" value={v.title} onChange={set('title')} autoFocus placeholder="Visite de chantier avec l’architecte" /></Field>
        <div className="row">
          <Field label="Jour" error={form.field('startsAt')}><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Début"><input className="input mono" type="time" value={v.start} onChange={set('start')} /></Field>
            <Field label="Fin" error={form.field('endsAt')}><input className="input mono" type="time" value={v.end} onChange={set('end')} /></Field>
          </div>
        </div>
        <div className="row">
          <Field label="Chantier" error={form.field('siteId')}>
            <select className="select" value={v.siteId} onChange={set('siteId')}>
              <option value="">Aucun</option>
              {(sites.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Contact" error={form.field('contactId')}>
            <select className="select" value={v.contactId} onChange={set('contactId')}>
              <option value="">Aucun</option>
              {(contacts.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.companyName ? ` · ${c.companyName}` : ''}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Lieu" error={form.field('location')}><input className="input" value={v.location} onChange={set('location')} placeholder="Sur le chantier" /></Field>
        <Field label="Notes"><textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={v.notes} onChange={set('notes')} /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}
