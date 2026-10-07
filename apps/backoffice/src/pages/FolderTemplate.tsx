import type { FolderTemplateItem } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Folder, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, useFormError, useToast } from '../ui';

const KINDS: { kind: string; label: string }[] = [
  { kind: 'plans', label: 'Plans' },
  { kind: 'devis', label: 'Devis' },
  { kind: 'factures', label: 'Factures' },
  { kind: 'pv', label: 'PV et comptes rendus' },
  { kind: 'photos', label: 'Photos' },
  { kind: 'administratif', label: 'Administratif' },
  { kind: 'divers', label: 'Divers' },
  { kind: 'custom', label: 'Autre' },
];

/** Arborescence créée automatiquement à l'ouverture de chaque chantier (F-02). */
export function FolderTemplatePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const tpl = useQuery({ queryKey: ['folder-template'], queryFn: api.admin.folderTemplate });
  const [items, setItems] = useState<FolderTemplateItem[]>([]);
  useEffect(() => {
    if (tpl.data) setItems(tpl.data.items);
  }, [tpl.data]);

  const save = useMutation({
    mutationFn: () => api.admin.saveFolderTemplate(items),
    onSuccess: (r) => {
      setItems(r.items);
      qc.setQueryData(['folder-template'], r);
      toast('Arborescence enregistrée. Elle s’appliquera aux prochains chantiers.');
    },
    onError: form.catchError,
  });

  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
  };

  if (tpl.isLoading) return <div className="page"><Loading /></div>;
  if (tpl.error) return <div className="page"><ErrorBox error={tpl.error} /></div>;
  const dirty = JSON.stringify(items) !== JSON.stringify(tpl.data?.items);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Arborescence type</h1>
          <div className="sub">Les dossiers créés à l’ouverture de chaque chantier. Les chantiers existants ne changent pas.</div>
        </div>
        <div className="actions">
          <button className="btn btn--primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Enregistrer l’arborescence</button>
        </div>
      </div>

      <div className="cols">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th style={{ width: 48 }} /><th>Dossier</th><th>Ce qu’Albert y range</th><th style={{ width: 150 }} /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td><Folder size={20} strokeWidth={1.75} color="var(--ink-3)" /></td>
                  <td>
                    <input className="input" value={it.name} aria-label="Nom du dossier"
                      onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                    {form.field(`items.${i}.name`) && <div className="err">{form.field(`items.${i}.name`)}</div>}
                  </td>
                  <td>
                    <select className="select" value={KINDS.some((k) => k.kind === it.kind) ? it.kind : 'custom'} aria-label="Type de dossier"
                      onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, kind: e.target.value } : x)))}>
                      {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn--text" aria-label="Monter" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={18} strokeWidth={1.75} /></button>
                    <button className="btn btn--text" aria-label="Descendre" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown size={18} strokeWidth={1.75} /></button>
                    <button className="btn btn--text" aria-label="Supprimer" onClick={() => setItems(items.filter((_, k) => k !== i))}><Trash2 size={18} strokeWidth={1.75} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 16, borderTop: '1px solid var(--rule)' }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setItems([...items, { kind: 'custom', name: '' }])}>Ajouter un dossier</button>
          </div>
        </div>
        <div className="card">
          <h2>Comment ça marche</h2>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8 }}>
            Le type d’un dossier dit à Albert ce qu’il peut y ranger : un devis déposé dans un chantier va dans le dossier de type Devis.
          </p>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 12 }}>
            Un dossier Divers est toujours conservé : Albert a toujours un endroit où ranger un document qu’il ne reconnaît pas. Rien n’est jamais bloqué.
          </p>
          {form.message && <p className="err">{form.message}</p>}
        </div>
      </div>
    </div>
  );
}
