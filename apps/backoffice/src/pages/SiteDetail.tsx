import { feedFilters, fmt, phaseLabel, roleLabel, type AdminSiteDetail, type FeedFilter, type SiteRole } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Download, Folder } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, downloadWithAuth } from '../api';
import { ErrorBox, FeedList, Field, Loading, Sheet, Tabs, useFormError, useToast } from '../ui';
import { SiteFinancesTab } from './Finances';
import { ClockTab, DoeTab, InterventionsTab, PhaseCard, SiteReservesTab, TasksTab } from './SiteModules';

const TABS = [
  { key: 'activite', label: 'Activité' },
  { key: 'taches', label: 'Tâches' },
  { key: 'pointages', label: 'Pointages' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'reserves', label: 'Réserves et SAV' },
  { key: 'finances', label: 'Finances' },
  { key: 'doe', label: 'DOE' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function SiteDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const site = useQuery({ queryKey: ['admin-site', id], queryFn: () => api.admin.site(id) });
  const [filter, setFilter] = useState<FeedFilter>('all');
  const activity = useQuery({ queryKey: ['admin-activity', id, filter], queryFn: () => api.admin.activity(id, filter) });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === params.get('onglet')) ? (params.get('onglet') as TabKey) : 'activite';
  const setTab = (k: TabKey) => setParams(k === 'activite' ? {} : { onglet: k }, { replace: true });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => api.admin.removeMember(id, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-site', id] });
      toast('Accès retiré.');
    },
  });

  if (site.isLoading) return <div className="page"><Loading /></div>;
  if (site.error) return <div className="page"><ErrorBox error={site.error} /></div>;
  const s = site.data!;

  return (
    <div className="page">
      <Link to="/chantiers" className="crumb"><ChevronLeft size={16} strokeWidth={1.75} />Chantiers</Link>
      <div className="pagehead">
        <div>
          <h1>{s.name}</h1>
          <div className="sub">
            {s.address}
            {s.reference ? ` · ${s.reference}` : ''}
            {s.startedOn ? ` · ${fmt.startedOn(s.startedOn)}` : ''}
            {s.phase ? ` · ${phaseLabel[s.phase].toLowerCase()}` : ''}
            {s.deliveredOn ? ` · reçu le ${fmt.day(s.deliveredOn)}` : ''}
            {s.status === 'archived' ? ' · archivé' : ''}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => setEditing(true)}>Modifier</button>
          <button className="btn btn--ghost" onClick={() => downloadWithAuth(api.admin.exportUrl(id), `albert-${s.name}.csv`).catch((e) => toast(e.message))}>
            <Download size={18} strokeWidth={1.75} />Exporter le journal
          </button>
          <button className="btn btn--primary" onClick={() => setAdding(true)}>Ajouter un intervenant</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="stat"><div className="n">{s.stats.members}</div><div className="t">intervenants</div></div>
        <div className="stat"><div className="n">{s.stats.documents}</div><div className="t">documents</div></div>
        <div className="stat"><div className="n">{s.stats.photos}</div><div className="t">photos</div></div>
        <div className="stat"><div className="n">{s.stats.messages}</div><div className="t">messages</div></div>
      </div>

      <Tabs items={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />

      {tab === 'taches' && <TasksTab site={s} />}
      {tab === 'pointages' && <ClockTab site={s} />}
      {tab === 'interventions' && <InterventionsTab site={s} />}
      {tab === 'reserves' && <SiteReservesTab site={s} />}
      {tab === 'finances' && <SiteFinancesTab site={s} />}
      {tab === 'doe' && <DoeTab site={s} />}

      {tab === 'activite' && <div className="cols">
        <div>
          <div className="cardhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 20 }}>Activité du chantier</h2>
            <div className="chips">
              {feedFilters.map((f) => (
                <button key={f.filter} className="chip-f" aria-pressed={filter === f.filter} onClick={() => setFilter(f.filter)}>{f.label}</button>
              ))}
            </div>
          </div>
          {activity.isLoading ? <Loading /> : <FeedList items={activity.data?.items ?? []} />}
          <p className="hint">Supervision : le fil complet, canal interne compris. L’export reprend ce journal horodaté, dans l’ordre.</p>
        </div>

        <div className="stack">
          <div className="card">
            <div className="cardhead"><h2>Intervenants</h2></div>
            {s.members.length === 0 ? <p className="hint">Personne n’a encore accès à ce chantier.</p> : (
              <div className="kv">
                {s.members.map((m) => (
                  <div key={m.id}>
                    <span>
                      <Link to={`/intervenants/${m.user.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{m.user.fullName}</Link>
                      <span className="sub-t" style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>
                        {roleLabel[m.role]}{m.lastSeenAt ? ` · vu ${fmt.relative(m.lastSeenAt).toLowerCase()}` : ' · pas encore venu'}
                      </span>
                    </span>
                    <button className="btn btn--text btn--sm" onClick={() => removeMember.mutate(m.id)}>Retirer</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FoldersCard site={s} />

          <PhaseCard site={s} />
        </div>
      </div>}

      {editing && <EditSiteSheet site={s} onClose={() => setEditing(false)} />}
      {adding && <AddMemberSheet site={s} onClose={() => setAdding(false)} />}
    </div>
  );
}

function FoldersCard({ site }: { site: AdminSiteDetail }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.admin.addFolder(site.id, name),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['admin-site', site.id] });
    },
  });
  return (
    <div className="card">
      <h2>Arborescence</h2>
      <div className="kv" style={{ marginTop: 16 }}>
        {site.folders.map((f) => (
          <div key={f.id}><span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Folder size={18} strokeWidth={1.75} color="var(--ink-3)" />{f.name}</span></div>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau dossier" aria-label="Nom du nouveau dossier" />
        <button className="btn btn--ghost btn--sm" disabled={!name.trim() || add.isPending}>Ajouter</button>
      </form>
    </div>
  );
}

function EditSiteSheet({ site, onClose }: { site: AdminSiteDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState({ name: site.name, address: site.address, reference: site.reference ?? '', clientName: site.clientName ?? '', startedOn: site.startedOn ?? '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => api.admin.updateSite(site.id, { ...v, startedOn: v.startedOn || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-site', site.id] });
      qc.invalidateQueries({ queryKey: ['admin-sites'] });
      toast('Chantier mis à jour.');
      onClose();
    },
    onError: form.catchError,
  });
  return (
    <Sheet title="Modifier le chantier" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>Enregistrer</button>
    </>}>
      <div className="form">
        <Field label="Nom du chantier" error={form.field('name')}><input className="input" value={v.name} onChange={set('name')} /></Field>
        <Field label="Adresse" error={form.field('address')}><input className="input" value={v.address} onChange={set('address')} /></Field>
        <div className="row">
          <Field label="Référence interne"><input className="input" value={v.reference} onChange={set('reference')} /></Field>
          <Field label="Démarrage"><input className="input" type="date" value={v.startedOn} onChange={set('startedOn')} /></Field>
        </div>
        <Field label="Client"><input className="input" value={v.clientName} onChange={set('clientName')} /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

function AddMemberSheet({ site, onClose }: { site: AdminSiteDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const users = useQuery({ queryKey: ['admin-users', '', ''], queryFn: () => api.admin.users() });
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<SiteRole>('worker');
  const already = new Set(site.members.map((m) => m.user.id));
  const candidates = (users.data?.items ?? []).filter((u) => !already.has(u.id) && u.active !== false);
  const selected = candidates.find((u) => u.id === userId);

  const add = useMutation({
    mutationFn: () => api.admin.addMember(site.id, userId, selected?.kind === 'client' ? 'client' : role),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['admin-site', site.id] });
      toast(`${m.user.fullName} a maintenant accès à ${site.name}.`);
      onClose();
    },
    onError: form.catchError,
  });

  return (
    <Sheet title={`Ajouter à ${site.name}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={!userId || add.isPending} onClick={() => add.mutate()}>Donner accès</button>
    </>}>
      <div className="form">
        <Field label="Intervenant" error={form.field('userId')} hint="Absent de la liste ? Créez-le d’abord dans Intervenants.">
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choisir…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}{u.jobTitle ? ` · ${u.jobTitle}` : ''}{u.kind === 'client' ? ' (client)' : ''}</option>
            ))}
          </select>
        </Field>
        {selected?.kind === 'client' ? (
          <p className="hint">Compte client : il verra uniquement le canal client et ce qui est marqué « visible aussi par le client ».</p>
        ) : (
          <Field label="Rôle sur ce chantier" error={form.field('role')}>
            <div className="chips">
              {(['manager', 'worker'] as const).map((r) => (
                <button type="button" key={r} className="chip-f" aria-pressed={role === r} onClick={() => setRole(r)}>{roleLabel[r]}</button>
              ))}
            </div>
          </Field>
        )}
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}
