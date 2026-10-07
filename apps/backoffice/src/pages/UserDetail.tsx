import { ApiError, fmt, roleLabel } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { ErrorBox, Loading, useToast } from '../ui';
import { UserSheet } from './Users';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const user = useQuery({ queryKey: ['admin-user', id], queryFn: () => api.admin.user(id) });
  const [editing, setEditing] = useState(false);

  const toggle = useMutation({
    mutationFn: (active: boolean) => api.admin.updateUser(id, { active }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast(u.active ? 'Compte réactivé.' : 'Compte désactivé. Ses téléphones sont déconnectés.');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Une erreur est survenue.'),
  });

  if (user.isLoading) return <div className="page"><Loading /></div>;
  if (user.error) return <div className="page"><ErrorBox error={user.error} /></div>;
  const u = user.data!;

  return (
    <div className="page">
      <Link to="/intervenants" className="crumb"><ChevronLeft size={16} strokeWidth={1.75} />Intervenants</Link>
      <div className="pagehead">
        <div>
          <h1>{u.fullName}</h1>
          <div className="sub">{u.jobTitle ?? (u.kind === 'client' ? 'Client' : 'Équipe')}</div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => toggle.mutate(!u.active)}>{u.active ? 'Désactiver le compte' : 'Réactiver le compte'}</button>
          <button className="btn btn--night" onClick={() => setEditing(true)}>Modifier la fiche</button>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <div className="cardhead"><h2>Chantiers</h2></div>
          {u.sites && u.sites.length > 0 ? (
            <div className="kv">
              {u.sites.map((s) => (
                <div key={s.site.id}>
                  <Link to={`/chantiers/${s.site.id}`} style={{ textDecoration: 'none' }}>
                    <span style={{ fontWeight: 600 }}>{s.site.name}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>{s.site.address}</span>
                  </Link>
                  <span className="tag">{roleLabel[s.role]}</span>
                </div>
              ))}
            </div>
          ) : <p className="hint">Aucun chantier. Ajoutez-le depuis la fiche d’un chantier.</p>}
        </div>

        <div className="card">
          <h2>Compte</h2>
          <div className="kv" style={{ marginTop: 16 }}>
            <div><span className="k">Téléphone</span><span className="v num">{u.phoneDisplay}</span></div>
            <div><span className="k">Type</span><span className="v">{u.kind === 'client' ? 'Client' : 'Équipe'}</span></div>
            <div><span className="k">Back-office</span><span className="v">{u.admin ? 'Administrateur' : 'Non'}</span></div>
            <div><span className="k">Statut</span><span className="v">{u.active ? 'Actif' : 'Désactivé'}</span></div>
            <div><span className="k">Dernière connexion</span><span className="v num">{u.lastLoginAt ? fmt.relative(u.lastLoginAt) : 'Jamais'}</span></div>
            <div><span className="k">Créé</span><span className="v num">{u.createdAt ? fmt.day(u.createdAt) : ''}</span></div>
          </div>
        </div>
      </div>

      {editing && <UserSheet user={u} onClose={() => setEditing(false)} />}
    </div>
  );
}
