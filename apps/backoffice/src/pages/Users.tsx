import { fmt, type AdminUser } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { ErrorBox, Field, Loading, Sheet, useFormError, useToast } from '../ui';

/** Annuaire des intervenants. Pas d'inscription depuis l'application : c'est ici qu'on ajoute les équipes. */
export function UsersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'staff' | 'client'>('');
  const [creating, setCreating] = useState(false);
  const users = useQuery({ queryKey: ['admin-users', q, kind], queryFn: () => api.admin.users(q, kind || undefined) });

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Intervenants</h1>
          <div className="sub">Votre équipe et les clients invités. Chacun se connecte avec son numéro de téléphone.</div>
        </div>
        <div className="actions"><button className="btn btn--primary" onClick={() => setCreating(true)}>Ajouter un intervenant</button></div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 320px' }}>
          <Search size={20} strokeWidth={1.75} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, fonction ou numéro" aria-label="Rechercher un intervenant" />
        </div>
        <div className="chips">
          <button className="chip-f" aria-pressed={kind === ''} onClick={() => setKind('')}>Tous</button>
          <button className="chip-f" aria-pressed={kind === 'staff'} onClick={() => setKind('staff')}>Équipe</button>
          <button className="chip-f" aria-pressed={kind === 'client'} onClick={() => setKind('client')}>Clients</button>
        </div>
      </div>

      {users.isLoading ? <Loading /> : users.error ? <ErrorBox error={users.error} /> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Téléphone</th><th>Type</th><th>Chantiers</th><th>Dernière connexion</th></tr></thead>
            <tbody>
              {users.data!.items.map((u) => (
                <tr key={u.id} className="link" onClick={() => nav(`/intervenants/${u.id}`)}>
                  <td><div className="main-t">{u.fullName}</div><div className="sub-t">{u.jobTitle ?? ' '}</div></td>
                  <td className="num">{u.phoneDisplay}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      {u.kind === 'client'
                        ? <span className="tag"><span className="dot" style={{ background: 'var(--client)' }} />Client</span>
                        : <span className="tag">Équipe</span>}
                      {u.admin && <span className="tag tag--night">Administrateur</span>}
                      {u.active === false && <span className="tag tag--off">Désactivé</span>}
                    </span>
                  </td>
                  <td className="num">{u.sitesCount}</td>
                  <td className="num">{u.lastLoginAt ? fmt.relative(u.lastLoginAt) : 'Jamais'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.data!.items.length === 0 && <div className="empty">Personne ne correspond.</div>}
        </div>
      )}

      {creating && <UserSheet onClose={() => setCreating(false)} onSaved={(u) => nav(`/intervenants/${u.id}`)} />}
    </div>
  );
}

export function UserSheet({ user, onClose, onSaved }: { user?: AdminUser; onClose: () => void; onSaved?: (u: AdminUser) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phoneDisplay ?? '',
    jobTitle: user?.jobTitle ?? '',
    kind: user?.kind ?? ('staff' as 'staff' | 'client'),
    admin: user?.admin ?? false,
  });
  const set = (k: 'firstName' | 'lastName' | 'phone' | 'jobTitle') => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => (user ? api.admin.updateUser(user.id, v) : api.admin.createUser(v)),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-user', u.id] });
      toast(user ? 'Fiche mise à jour.' : `${u.fullName} peut se connecter avec le ${u.phoneDisplay}.`);
      onSaved?.(u);
      onClose();
    },
    onError: form.catchError,
  });

  return (
    <Sheet title={user ? 'Modifier la fiche' : 'Ajouter un intervenant'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>{user ? 'Enregistrer' : 'Ajouter'}</button>
    </>}>
      <div className="form">
        <div className="chips">
          <button type="button" className="chip-f" aria-pressed={v.kind === 'staff'} onClick={() => setV({ ...v, kind: 'staff' })}>Membre de l’équipe</button>
          <button type="button" className="chip-f" aria-pressed={v.kind === 'client'} onClick={() => setV({ ...v, kind: 'client', admin: false })}>Client</button>
        </div>
        <div className="row">
          <Field label="Prénom" error={form.field('firstName')}><input className="input" value={v.firstName} onChange={set('firstName')} autoFocus /></Field>
          <Field label="Nom" error={form.field('lastName')}><input className="input" value={v.lastName} onChange={set('lastName')} /></Field>
        </div>
        <Field label="Téléphone portable" error={form.field('phone')} hint="Il recevra son code de connexion par SMS sur ce numéro.">
          <input className="input mono" value={v.phone} onChange={set('phone')} inputMode="tel" placeholder="06 12 34 56 78" />
        </Field>
        <Field label={v.kind === 'client' ? 'Société ou qualité' : 'Fonction'}>
          <input className="input" value={v.jobTitle} onChange={set('jobTitle')} placeholder={v.kind === 'client' ? 'Maître d’ouvrage' : 'Chef de chantier'} />
        </Field>
        {v.kind === 'staff' && (
          <label className="check"><input type="checkbox" checked={v.admin} onChange={(e) => setV({ ...v, admin: e.target.checked })} />Accès au back-office (administrateur)</label>
        )}
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}
