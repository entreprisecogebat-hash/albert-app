import { fmt } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { ErrorBox, Field, Loading, Sheet, useFormError, useToast } from '../ui';

export function SitesPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const sites = useQuery({ queryKey: ['admin-sites', q, status], queryFn: () => api.admin.sites(q, status) });

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Chantiers</h1>
          <div className="sub">Création, équipes et droits, suivi de l’activité.</div>
        </div>
        <div className="actions">
          <button className="btn btn--primary" onClick={() => setCreating(true)}>Nouveau chantier</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 320px' }}>
          <Search size={20} strokeWidth={1.75} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un chantier, une adresse, un client" aria-label="Rechercher un chantier" />
        </div>
        <div className="chips">
          <button className="chip-f" aria-pressed={status === 'active'} onClick={() => setStatus('active')}>En cours</button>
          <button className="chip-f" aria-pressed={status === 'archived'} onClick={() => setStatus('archived')}>Archivés</button>
        </div>
      </div>

      {sites.isLoading ? <Loading /> : sites.error ? <ErrorBox error={sites.error} /> : (
        <div className="tbl-wrap">
          {sites.data!.items.length === 0 ? <div className="empty">Aucun chantier.</div> : (
            <table>
              <thead>
                <tr><th>Chantier</th><th>Client</th><th>Équipe</th><th>Documents</th><th>Photos</th><th>Dernière activité</th></tr>
              </thead>
              <tbody>
                {sites.data!.items.map((s) => (
                  <tr key={s.id} className="link" onClick={() => nav(`/chantiers/${s.id}`)}>
                    <td>
                      <div className="main-t">{s.name}</div>
                      <div className="sub-t">{s.address}{s.reference ? ` · ${s.reference}` : ''}</div>
                    </td>
                    <td>{s.clientName ?? <span className="sub-t">Non renseigné</span>}</td>
                    <td className="num">{s.stats.members}</td>
                    <td className="num">{s.stats.documents}</td>
                    <td className="num">{s.stats.photos}</td>
                    <td className="num">{fmt.relative(s.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {creating && <CreateSiteSheet onClose={() => setCreating(false)} onCreated={(id) => nav(`/chantiers/${id}`)} />}
    </div>
  );
}

function CreateSiteSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState({ name: '', address: '', reference: '', clientName: '', startedOn: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => api.admin.createSite({ ...v, startedOn: v.startedOn || undefined }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['admin-sites'] });
      toast(`${s.name} est ouvert. L’arborescence et les deux canaux sont prêts.`);
      onCreated(s.id);
    },
    onError: form.catchError,
  });

  return (
    <Sheet
      title="Nouveau chantier"
      onClose={onClose}
      footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn--primary" disabled={create.isPending} onClick={() => create.mutate()}>Ouvrir le chantier</button>
      </>}
    >
      <div className="form">
        <Field label="Nom du chantier" error={form.field('name')}><input className="input" value={v.name} onChange={set('name')} placeholder="Villa Marceau" autoFocus /></Field>
        <Field label="Adresse" error={form.field('address')}><input className="input" value={v.address} onChange={set('address')} placeholder="18 rue Marceau, Levallois" /></Field>
        <div className="row">
          <Field label="Référence interne"><input className="input" value={v.reference} onChange={set('reference')} placeholder="CGB-2026-014" /></Field>
          <Field label="Démarrage"><input className="input" type="date" value={v.startedOn} onChange={set('startedOn')} /></Field>
        </div>
        <Field label="Client" hint="Le maître d’ouvrage. Vous pourrez l’inviter sur le canal client."><input className="input" value={v.clientName} onChange={set('clientName')} placeholder="Mme Lefèvre" /></Field>
        {form.message && <p className="err">{form.message}</p>}
        <p className="hint">L’arborescence type et les canaux Équipe et Client sont créés automatiquement.</p>
      </div>
    </Sheet>
  );
}
