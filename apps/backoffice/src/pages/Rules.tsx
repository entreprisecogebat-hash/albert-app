import { docTypeLabel, type ClassificationRule, type DocumentType } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { ErrorBox, Field, Loading, Sheet, useFormError, useToast } from '../ui';

const TYPES = Object.keys(docTypeLabel) as DocumentType[];
const SOURCE: Record<ClassificationRule['source'], string> = { default: 'Livrée', admin: 'Ajoutée', learned: 'Apprise' };

/**
 * Règles de dépôt : étape 01 du classement, gratuite. Le nom du fichier est comparé
 * à ces règles, dans l'ordre. La première qui correspond donne le type et le dossier.
 */
export function RulesPage() {
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.admin.rules });
  const [editing, setEditing] = useState<ClassificationRule | 'new' | null>(null);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Règles de classement</h1>
          <div className="sub">Albert lit le nom de chaque fichier déposé et le range selon ces règles, sans intelligence artificielle.</div>
        </div>
        <div className="actions"><button className="btn btn--primary" onClick={() => setEditing('new')}>Ajouter une règle</button></div>
      </div>

      <div className="cols">
        <div>
          {rules.isLoading ? <Loading /> : rules.error ? <ErrorBox error={rules.error} /> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Ordre</th><th>Le nom contient</th><th>Type</th><th>Origine</th><th>Utilisée</th></tr></thead>
                <tbody>
                  {rules.data!.items.map((r) => (
                    <tr key={r.id} className="link" onClick={() => setEditing(r)}>
                      <td className="num">{r.priority}</td>
                      <td><code className="num" style={{ wordBreak: 'break-all' }}>{readable(r.pattern)}</code></td>
                      <td>{docTypeLabel[r.type]}</td>
                      <td><span className="tag">{SOURCE[r.source]}</span></td>
                      <td className="num">{r.hits} fois</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <TestCard />
      </div>

      {editing && <RuleSheet rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** "\b(devis|dqe)\b" -> "devis, dqe" */
function readable(pattern: string): string {
  const m = /^\\b\((.+)\)\\b$/.exec(pattern);
  return m ? m[1]!.split('|').join(', ') : pattern;
}

function TestCard() {
  const [filename, setFilename] = useState('Plan_calepinage_final_v3.pdf');
  const test = useMutation({ mutationFn: () => api.admin.testRules(filename) });
  return (
    <div className="card">
      <h2>Essayer un nom de fichier</h2>
      <form style={{ display: 'flex', gap: 8, marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); test.mutate(); }}>
        <input className="input mono" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="Nom de fichier à tester" />
        <button className="btn btn--night btn--sm">Essayer</button>
      </form>
      {test.data && (
        <div className="kv" style={{ marginTop: 16 }}>
          <div><span className="k">Titre retenu</span><span className="v">{test.data.title}</span></div>
          <div><span className="k">Version lue</span><span className="v">{test.data.version.label ?? 'Aucune, V1 par défaut'}</span></div>
          <div><span className="k">Type</span><span className="v">{test.data.rule ? docTypeLabel[test.data.rule.type] : 'Non reconnu : rangé dans Divers'}</span></div>
          <div><span className="k">Règle</span><span className="v num">{test.data.rule ? `n° ${test.data.rule.priority}` : 'Aucune'}</span></div>
        </div>
      )}
      <p className="hint">Sur un chantier, un fichier dont le titre correspond à un document existant devient sa nouvelle version.</p>
    </div>
  );
}

function RuleSheet({ rule, onClose }: { rule?: ClassificationRule; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [words, setWords] = useState(rule ? readable(rule.pattern) : '');
  const [type, setType] = useState<DocumentType>(rule?.type ?? 'devis');
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));

  // Liste de mots -> motif ; un motif avancé saisi tel quel est conservé
  const toPattern = (w: string) =>
    /[\\()|[\]^$*+?]/.test(w) ? w : `\\b(${w.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).join('|')})\\b`;

  const data = () => ({ pattern: toPattern(words), type, folderKind: folderFor(type), priority: Number(priority) || 100 });
  const save = useMutation({
    mutationFn: () => (rule ? api.admin.updateRule(rule.id, data()) : api.admin.createRule(data())),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); toast('Règle enregistrée.'); onClose(); },
    onError: form.catchError,
  });
  const remove = useMutation({
    mutationFn: () => api.admin.deleteRule(rule!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); toast('Règle supprimée.'); onClose(); },
  });

  return (
    <Sheet title={rule ? 'Modifier la règle' : 'Nouvelle règle'} onClose={onClose} footer={<>
      {rule && <button className="btn btn--danger" style={{ marginRight: 'auto' }} onClick={() => remove.mutate()}>Supprimer</button>}
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !words.trim()} onClick={() => save.mutate()}>Enregistrer</button>
    </>}>
      <div className="form">
        <Field label="Le nom du fichier contient l’un de ces mots" error={form.field('pattern')} hint="Séparés par des virgules. Majuscules et accents ignorés.">
          <input className="input mono" value={words} onChange={(e) => setWords(e.target.value)} placeholder="devis, dqe, chiffrage" autoFocus />
        </Field>
        <Field label="Alors c’est">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {TYPES.map((t) => <option key={t} value={t}>{docTypeLabel[t]}</option>)}
          </select>
        </Field>
        <Field label="Ordre" hint="Les règles sont essayées de la plus petite à la plus grande valeur.">
          <input className="input mono" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
        </Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

function folderFor(t: DocumentType): string {
  return ({ plan: 'plans', devis: 'devis', facture: 'factures', pv: 'pv', photo: 'photos', administratif: 'administratif', autre: 'divers' } as const)[t];
}
