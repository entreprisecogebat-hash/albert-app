import { contactKindLabel, type Contact, type ContactImportResult, type ContactKind } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { downloadCsv, ErrorBox, Field, Loading, Sheet, useFormError, useToast } from '../ui';

const KINDS = Object.keys(contactKindLabel) as ContactKind[];

/** CRM (F-01, F-03) : prospects, clients, fournisseurs, partenaires, sous-traitants. */
export function ContactsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ContactKind | ''>('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const contacts = useQuery({ queryKey: ['contacts', q, kind], queryFn: () => api.contacts.list({ q: q || undefined, kind: kind || undefined }) });

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Contacts</h1>
          <div className="sub">Prospects, clients, fournisseurs et partenaires. Chaque fiche se rattache aux chantiers et aux documents.</div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => setImporting(true)}><Upload size={18} strokeWidth={1.75} />Importer depuis Excel</button>
          <button className="btn btn--primary" onClick={() => setCreating(true)}>Ajouter un contact</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 320px' }}>
          <Search size={20} strokeWidth={1.75} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, société, téléphone ou email" aria-label="Rechercher un contact" />
        </div>
        <div className="chips">
          <button className="chip-f" aria-pressed={kind === ''} onClick={() => setKind('')}>Tous</button>
          {KINDS.map((k) => (
            <button key={k} className="chip-f" aria-pressed={kind === k} onClick={() => setKind(k)}>{contactKindLabel[k]}</button>
          ))}
        </div>
      </div>

      {contacts.isLoading ? <Loading /> : contacts.error ? <ErrorBox error={contacts.error} /> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th>Chantiers</th></tr></thead>
            <tbody>
              {contacts.data!.items.map((c) => (
                <tr key={c.id} className="link" onClick={() => nav(`/contacts/${c.id}`)}>
                  <td><div className="main-t">{c.name}</div><div className="sub-t">{[c.companyName, c.jobTitle].filter(Boolean).join(' · ') || ' '}</div></td>
                  <td><span className="tag">{contactKindLabel[c.kind]}</span></td>
                  <td className="num">{c.phoneDisplay ?? c.phone ?? ''}</td>
                  <td style={{ fontSize: 14 }}>{c.email ?? ''}</td>
                  <td style={{ fontSize: 14, color: 'var(--ink-2)' }}>{c.sites.map((s) => s.name).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {contacts.data!.items.length === 0 && <div className="empty">{q || kind ? 'Aucun contact ne correspond.' : 'Aucun contact. Importez votre fichier Excel ou ajoutez-en un.'}</div>}
        </div>
      )}

      {creating && <ContactSheet onClose={() => setCreating(false)} onSaved={(c) => nav(`/contacts/${c.id}`)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </div>
  );
}

export function ContactSheet({ contact, onClose, onSaved }: { contact?: Contact; onClose: () => void; onSaved?: (c: Contact) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const sites = useQuery({ queryKey: ['admin-sites', '', ''], queryFn: () => api.admin.sites() });
  const [v, setV] = useState({
    kind: contact?.kind ?? ('client' as ContactKind),
    name: contact?.name ?? '',
    companyName: contact?.companyName ?? '',
    jobTitle: contact?.jobTitle ?? '',
    phone: contact?.phoneDisplay ?? contact?.phone ?? '',
    email: contact?.email ?? '',
    address: contact?.address ?? '',
    notes: contact?.notes ?? '',
    siteIds: contact?.sites.map((s) => s.id) ?? ([] as string[]),
  });
  const set = (k: 'name' | 'companyName' | 'jobTitle' | 'phone' | 'email' | 'address' | 'notes') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const toggleSite = (id: string) => setV({ ...v, siteIds: v.siteIds.includes(id) ? v.siteIds.filter((x) => x !== id) : [...v.siteIds, id] });

  const save = useMutation({
    mutationFn: () => {
      const data = {
        ...v,
        companyName: v.companyName || null, jobTitle: v.jobTitle || null, phone: v.phone || null,
        email: v.email || null, address: v.address || null, notes: v.notes || null,
      };
      return contact ? api.contacts.update(contact.id, data) : api.contacts.create(data);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', c.id] });
      toast(contact ? 'Fiche mise à jour.' : `${c.name} ajouté aux contacts.`);
      onSaved?.(c);
      onClose();
    },
    onError: form.catchError,
  });

  return (
    <Sheet title={contact ? 'Modifier le contact' : 'Ajouter un contact'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>{contact ? 'Enregistrer' : 'Ajouter'}</button>
    </>}>
      <div className="form">
        <Field label="Type" error={form.field('kind')}>
          <div className="chips">
            {KINDS.map((k) => (
              <button type="button" key={k} className="chip-f" aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k })}>{contactKindLabel[k]}</button>
            ))}
          </div>
        </Field>
        <Field label="Nom" error={form.field('name')}><input className="input" value={v.name} onChange={set('name')} autoFocus placeholder="Claire Lefèvre ou Toitec" /></Field>
        <div className="row">
          <Field label="Société" error={form.field('companyName')}><input className="input" value={v.companyName} onChange={set('companyName')} /></Field>
          <Field label="Fonction" error={form.field('jobTitle')}><input className="input" value={v.jobTitle} onChange={set('jobTitle')} /></Field>
        </div>
        <div className="row">
          <Field label="Téléphone" error={form.field('phone')}><input className="input mono" value={v.phone} onChange={set('phone')} inputMode="tel" placeholder="06 12 34 56 78" /></Field>
          <Field label="Email" error={form.field('email')}><input className="input" type="email" value={v.email} onChange={set('email')} /></Field>
        </div>
        <Field label="Adresse" error={form.field('address')}><input className="input" value={v.address} onChange={set('address')} /></Field>
        <Field label="Notes" error={form.field('notes')}>
          <textarea className="input" style={{ minHeight: 88, paddingTop: 12 }} value={v.notes} onChange={set('notes')} />
        </Field>
        <Field label="Chantiers liés" error={form.field('siteIds')}>
          <div className="chips">
            {(sites.data?.items ?? []).map((s) => (
              <button type="button" key={s.id} className="chip-f" aria-pressed={v.siteIds.includes(s.id)} onClick={() => toggleSite(s.id)}>{s.name}</button>
            ))}
          </div>
        </Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Import CSV ---------- */

const TEMPLATE_HEADERS = ['nom', 'société', 'type', 'téléphone', 'email', 'adresse', 'notes'];

/** Lecture CSV minimale (guillemets, ; ou ,) pour l'aperçu. Le serveur refait la lecture complète. */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<ContactImportResult | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    form.clear();
    setResult(null);
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setFile(null);
      setPreview([]);
      toast('Enregistrez d’abord votre fichier Excel au format « CSV UTF-8 ».');
      return;
    }
    setFile(f);
    setPreview(parseCsv(await f.text()).slice(0, 6));
  };

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!, file!.name);
      return api.contacts.import(fd);
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: form.catchError,
  });

  return (
    <Sheet title="Importer des contacts" onClose={onClose} footer={result ? (
      <button className="btn btn--primary" onClick={onClose}>Terminer</button>
    ) : <>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={!file || send.isPending} onClick={() => send.mutate()}>
        {send.isPending ? 'Import en cours…' : 'Importer'}
      </button>
    </>}>
      {result ? (
        <div className="stack">
          <div className="kv">
            <div><span className="k">Contacts créés</span><span className="v num">{result.created}</span></div>
            <div><span className="k">Contacts mis à jour</span><span className="v num">{result.updated}</span></div>
            <div><span className="k">Lignes ignorées</span><span className="v num">{result.skipped.length}</span></div>
          </div>
          {result.skipped.length > 0 && (
            <div className="kv">
              {result.skipped.slice(0, 20).map((s) => (
                <div key={s.line}><span className="k">Ligne {s.line}</span><span className="v" style={{ fontWeight: 400 }}>{s.reason}</span></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="form">
          <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>
            Dans Excel : <b>Fichier › Enregistrer sous › CSV UTF-8</b>. Une ligne par contact, avec ces colonnes :
            nom, société, type (prospect, client, fournisseur, partenaire, sous-traitant), téléphone, email, adresse, notes.
            Un contact déjà présent (même téléphone ou même email) est mis à jour.
          </p>
          <button type="button" className="btn btn--text btn--sm" style={{ justifySelf: 'start', paddingLeft: 0 }}
            onClick={() => downloadCsv('modele-contacts-albert.csv', [TEMPLATE_HEADERS, ['Claire Lefèvre', '', 'client', '06 98 76 54 32', 'claire.lefevre@exemple.fr', '18 rue Marceau, Levallois', 'Villa Marceau']])}>
            <Download size={16} strokeWidth={1.75} /> Télécharger le modèle
          </button>
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            style={{
              display: 'block', border: `1px dashed ${over ? 'var(--ink)' : 'var(--rule-2)'}`, borderRadius: 'var(--r2)',
              padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: over ? 'var(--bg-2)' : 'var(--bg)',
            }}>
            <input type="file" accept=".csv,text/csv,.txt" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
            <Upload size={22} strokeWidth={1.75} color="var(--ink-3)" />
            <div style={{ fontWeight: 600, marginTop: 8 }}>{file ? file.name : 'Déposez le fichier ici'}</div>
            <div className="hint" style={{ marginTop: 4 }}>{file ? 'Cliquez pour en choisir un autre.' : 'ou cliquez pour le choisir'}</div>
          </label>
          {preview.length > 0 && (
            <div>
              <span className="label">Aperçu des premières lignes</span>
              <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ fontSize: 13 }}>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j} style={i === 0 ? { fontWeight: 600 } : undefined}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {form.message && <p className="err">{form.message}</p>}
        </div>
      )}
    </Sheet>
  );
}
