import {
  expenseCategoryLabel, financeKindLabel, financeStatusText, fmt, paymentMethodLabel, reminderChannelLabel, vatRates,
  type AdminSite, type ExpenseCategory, type FinanceDetail, type FinanceEntry, type FinanceInput, type FinanceKind,
  type FinanceStatus, type FinanceSummary, type PaymentMethod, type ReminderChannel,
} from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, Download, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, downloadWithAuth } from '../api';
import { dueLabel, ErrorBox, Field, isoDay, Loading, OpenDocButton, Sheet, useFormError, useToast } from '../ui';

/*
 * Finances : devis, factures, dépenses (montants en centimes, TVA en points de base).
 * Suivi opérationnel, pas une comptabilité certifiée : l'export sert à transmettre au comptable.
 */

const money = (c: number) => fmt.money(c, { decimals: true });
const KINDS = Object.keys(financeKindLabel) as FinanceKind[];

/** Statuts proposés à la création, et transitions possibles depuis l'écran détail */
const INITIAL_STATUS: Record<FinanceKind, FinanceStatus[]> = {
  devis: ['draft', 'sent', 'accepted'],
  facture: ['draft', 'sent'],
  depense: ['to_pay', 'paid'],
};

function StatusTag({ e }: { e: Pick<FinanceEntry, 'kind' | 'status' | 'overdue'> }) {
  const strong = e.status === 'draft' || e.status === 'sent' || e.status === 'to_pay' || e.status === 'partially_paid';
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <span className={`tag${e.status === 'paid' || e.status === 'refused' ? ' tag--off' : strong ? '' : ' tag--night'}`}>{financeStatusText(e.kind, e.status)}</span>
      {e.overdue && <span className="tag tag--alerte">En retard</span>}
    </span>
  );
}

/* ---------- Synthèse ---------- */

export function SummaryTiles({ s }: { s: FinanceSummary }) {
  return (
    <div className="grid g3" style={{ marginBottom: 24 }}>
      <div className="stat"><div className="n">{fmt.money(s.quotedHt)}</div><div className="t">devis acceptés, HT{s.quotesPendingHt ? ` · ${fmt.money(s.quotesPendingHt)} en attente de réponse` : ''}</div></div>
      <div className="stat"><div className="n">{fmt.money(s.invoicedHt)}</div><div className="t">facturé, HT ({fmt.money(s.invoicedTtc)} TTC)</div></div>
      <div className="stat"><div className="n">{fmt.money(s.paidTtc)}</div><div className="t">encaissé, TTC</div></div>
      <div className="stat">
        <div className="n">{fmt.money(s.outstandingTtc)}</div>
        <div className="t">reste à encaisser, TTC{s.overdueTtc ? <> · <span style={{ color: 'var(--alerte)', fontWeight: 600 }}>{fmt.money(s.overdueTtc)} en retard</span></> : ''}</div>
      </div>
      <div className="stat"><div className="n">{fmt.money(s.expensesToPayTtc)}</div><div className="t">dépenses à payer, TTC · {fmt.money(s.expensesHt)} HT engagés</div></div>
      <div className="stat"><div className="n">{fmt.money(s.marginHt)}</div><div className="t">marge prévisionnelle, HT · taux {fmt.percent(s.marginRate)}</div></div>
    </div>
  );
}

/* ---------- Tableau des pièces ---------- */

type SortKey = 'number' | 'date' | 'site' | 'contact' | 'title' | 'ht' | 'ttc' | 'paid' | 'remaining' | 'due' | 'status';

const sortValue: Record<SortKey, (e: FinanceEntry) => string | number> = {
  number: (e) => e.number ?? '',
  date: (e) => e.issuedOn ?? e.createdAt.slice(0, 10),
  site: (e) => e.siteName,
  contact: (e) => e.contact?.name ?? '',
  title: (e) => e.title,
  ht: (e) => e.amountHt,
  ttc: (e) => e.amountTtc,
  paid: (e) => e.paid,
  remaining: (e) => e.remaining,
  due: (e) => e.dueOn ?? '9999',
  status: (e) => (e.overdue ? '0' : '1') + e.status,
};

export function FinanceTable({ items, showSite = true, empty }: { items: FinanceEntry[]; showSite?: boolean; empty?: string }) {
  const nav = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'date', asc: false });
  const sorted = useMemo(() => {
    const f = sortValue[sort.key];
    return [...items].sort((a, b) => {
      const x = f(a), y = f(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr');
      return sort.asc ? r : -r;
    });
  }, [items, sort]);

  const th = (key: SortKey, label: string, right = false) => (
    <th style={{ textAlign: right ? 'right' : 'left', cursor: 'pointer', whiteSpace: 'nowrap' }} aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key !== 'date' }))}>
      {label}
      {sort.key === key && (sort.asc ? <ArrowUp size={12} strokeWidth={2} style={{ marginLeft: 4 }} /> : <ArrowDown size={12} strokeWidth={2} style={{ marginLeft: 4 }} />)}
    </th>
  );

  return (
    <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            {th('number', 'N°')}
            {th('date', 'Date')}
            {showSite && th('site', 'Chantier')}
            {th('contact', 'Tiers')}
            {th('title', 'Libellé')}
            {th('ht', 'HT', true)}
            {th('ttc', 'TTC', true)}
            {th('paid', 'Payé', true)}
            {th('remaining', 'Reste', true)}
            {th('due', 'Échéance')}
            {th('status', 'Statut')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id} className="link" onClick={() => nav(`/finances/${e.id}`)}>
              <td className="num">{e.number ?? '—'}</td>
              <td className="num">{dueLabel(e.issuedOn) || '—'}</td>
              {showSite && <td style={{ fontSize: 14 }}>{e.siteName}</td>}
              <td style={{ fontSize: 14 }}>{e.contact?.name ?? '—'}</td>
              <td>
                <div className="main-t">{e.title}</div>
                <div className="sub-t">{financeKindLabel[e.kind]}{e.category ? ` · ${expenseCategoryLabel[e.category]}` : ''}{e.remindersCount ? ` · ${fmt.plural(e.remindersCount, 'relance')}` : ''}</div>
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{money(e.amountHt)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{money(e.amountTtc)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{e.kind === 'devis' ? '—' : money(e.paid)}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: e.remaining ? 600 : 400, color: e.remaining ? 'var(--ink)' : undefined }}>{e.kind === 'devis' ? '—' : money(e.remaining)}</td>
              <td className="num">{dueLabel(e.dueOn) || '—'}</td>
              <td><StatusTag e={e} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="empty">{empty ?? 'Aucune pièce.'}</div>}
    </div>
  );
}

/* ---------- Page entreprise ---------- */

type StatusFilter = 'all' | 'unpaid' | 'overdue' | FinanceStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'unpaid', label: 'Non soldé' },
  { key: 'overdue', label: 'En retard' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'sent', label: 'Envoyés' },
  { key: 'accepted', label: 'Devis acceptés' },
  { key: 'paid', label: 'Payés' },
];

export function FinancesPage() {
  const toast = useToast();
  const [kind, setKind] = useState<FinanceKind | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [siteId, setSiteId] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sites = useQuery({ queryKey: ['admin-sites', '', ''], queryFn: () => api.admin.sites() });
  // Toute la liste de l'entreprise : sert aux totaux, à la marge par chantier et aux filtres locaux
  const all = useQuery({ queryKey: ['finances', 'all'], queryFn: () => api.finances.list() });
  const filtered = useQuery({
    queryKey: ['finances', 'filtered', kind, status, siteId],
    queryFn: () => api.finances.list({ kind: kind === 'all' ? undefined : kind, status: status === 'all' ? undefined : status, siteId: siteId || undefined }),
    enabled: kind !== 'all' || status !== 'all' || !!siteId,
  });
  const list = kind !== 'all' || status !== 'all' || siteId ? filtered : all;

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const src = list.data?.items ?? [];
    return needle ? src.filter((e) => `${e.number ?? ''} ${e.title} ${e.siteName} ${e.contact?.name ?? ''}`.toLowerCase().includes(needle)) : src;
  }, [list.data, q]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadWithAuth(api.finances.exportUrl({ siteId: siteId || undefined }), `albert-finances-${isoDay(new Date())}.csv`);
      toast('Export téléchargé.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export impossible.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Finances</h1>
          <div className="sub">Devis, factures et dépenses de tous les chantiers. Suivi de gestion, pas une comptabilité certifiée.</div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" disabled={exporting} onClick={exportCsv}><Download size={18} strokeWidth={1.75} />Exporter pour le comptable</button>
          <button className="btn btn--primary" onClick={() => setCreating(true)}>Nouvelle pièce</button>
        </div>
      </div>

      {all.isLoading ? <Loading /> : all.error ? <ErrorBox error={all.error} /> : (
        <>
          <SummaryTiles s={all.data!.summary} />

          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="chips">
                <button className="chip-f" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Tout</button>
                {KINDS.map((k) => <button key={k} className="chip-f" aria-pressed={kind === k} onClick={() => setKind(k)}>{financeKindLabel[k]}s</button>)}
              </div>
              <select className="select" style={{ width: 'auto', minWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Statut">
                {STATUS_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <select className="select" style={{ width: 'auto', minWidth: 200 }} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Chantier">
                <option value="">Tous les chantiers</option>
                {(sites.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Rechercher un numéro, un tiers, un libellé" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : (
            <>
              <div className="hint" style={{ margin: '0 0 8px' }}>
                {fmt.plural(items.length, 'pièce')} · {money(items.reduce((s, e) => s + e.amountHt, 0))} HT · reste {money(items.filter((e) => e.kind !== 'devis').reduce((s, e) => s + e.remaining, 0))}
              </div>
              <FinanceTable items={items} empty="Aucune pièce ne correspond." />
            </>
          )}

          <MarginBySite items={all.data!.items} />
        </>
      )}

      {creating && <FinanceSheet sites={sites.data?.items ?? []} onClose={() => setCreating(false)} />}
    </div>
  );
}

function MarginBySite({ items }: { items: FinanceEntry[] }) {
  const nav = useNavigate();
  const rows = useMemo(() => {
    const m = new Map<string, { id: string; name: string; quoted: number; expenses: number; outstanding: number }>();
    for (const e of items) {
      const r = m.get(e.siteId) ?? { id: e.siteId, name: e.siteName, quoted: 0, expenses: 0, outstanding: 0 };
      if (e.kind === 'devis' && e.status === 'accepted') r.quoted += e.amountHt;
      if (e.kind === 'depense') r.expenses += e.amountHt;
      if (e.kind === 'facture' && e.status !== 'draft') r.outstanding += e.remaining;
      m.set(e.siteId, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [items]);

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Marge par chantier</h2>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Chantier</th>
              <th style={{ textAlign: 'right' }}>Devis acceptés HT</th>
              <th style={{ textAlign: 'right' }}>Dépenses HT</th>
              <th style={{ textAlign: 'right' }}>Marge HT</th>
              <th style={{ textAlign: 'right' }}>Taux</th>
              <th style={{ textAlign: 'right' }}>Reste à encaisser</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const margin = r.quoted - r.expenses;
              const rate = r.quoted ? margin / r.quoted : null;
              return (
                <tr key={r.id} className="link" onClick={() => nav(`/chantiers/${r.id}?onglet=finances`)}>
                  <td className="main-t">{r.name}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(r.quoted)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(r.expenses)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: margin < 0 ? 'var(--alerte)' : 'var(--ink)' }}>{money(margin)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="num">{fmt.percent(rate)}</span>
                    {margin < 0 && <span className="tag tag--alerte" style={{ marginLeft: 8 }}>Déficitaire</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(r.outstanding)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Aucune pièce financière pour le moment.</div>}
      </div>
      <p className="hint">Marge prévisionnelle : devis acceptés moins dépenses engagées, hors taxes.</p>
    </div>
  );
}

/* ---------- Onglet de la fiche chantier ---------- */

export function SiteFinancesTab({ site }: { site: AdminSite }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<FinanceKind | 'all'>('all');
  const list = useQuery({ queryKey: ['finances', 'site', site.id], queryFn: () => api.finances.list({ siteId: site.id }) });
  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} />;
  const d = list.data!;
  const items = kind === 'all' ? d.items : d.items.filter((e) => e.kind === kind);
  return (
    <div>
      <SummaryTiles s={d.summary} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 16, flexWrap: 'wrap' }}>
        <div className="chips">
          <button className="chip-f" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Tout</button>
          {KINDS.map((k) => <button key={k} className="chip-f" aria-pressed={kind === k} onClick={() => setKind(k)}>{financeKindLabel[k]}s</button>)}
        </div>
        <button className="btn btn--night btn--sm" onClick={() => setCreating(true)}>Nouvelle pièce</button>
      </div>
      <FinanceTable items={items} showSite={false} empty="Aucune pièce pour ce chantier." />
      {creating && <FinanceSheet sites={[site]} fixedSiteId={site.id} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ---------- Section de la fiche contact ---------- */

export function ContactFinances({ contactId }: { contactId: string }) {
  const list = useQuery({ queryKey: ['finances', 'contact', contactId], queryFn: () => api.finances.list({ contactId }) });
  if (list.isLoading) return <div className="card"><Loading /></div>;
  if (list.error) return null; // pas d'accès aux finances : la section disparaît
  const items = list.data!.items;
  const due = items.filter((e) => e.kind === 'facture' && e.status !== 'draft').reduce((s, e) => s + e.remaining, 0);
  const owed = items.filter((e) => e.kind === 'depense').reduce((s, e) => s + e.remaining, 0);
  return (
    <div className="card">
      <div className="cardhead"><h2>Pièces financières</h2><span className="num">{items.length}</span></div>
      {items.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>Aucun devis, facture ou dépense lié à ce contact.</p> : (
        <>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 12 }}>
            {due ? <>Reste dû par ce client : <b className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{money(due)}</b>. </> : null}
            {owed ? <>Reste à lui payer : <b className="num" style={{ fontSize: 15, color: 'var(--ink)' }}>{money(owed)}</b>.</> : null}
            {!due && !owed ? 'Tout est soldé.' : null}
          </p>
          <div className="kv">
            {items.map((e) => (
              <Link key={e.id} to={`/finances/${e.id}`} style={{ textDecoration: 'none', display: 'flex' }}>
                <span>
                  <span style={{ fontWeight: 600, display: 'block' }}>{financeKindLabel[e.kind]} {e.number ?? ''} · {e.title}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{e.siteName} · {money(e.amountTtc)} TTC{e.kind !== 'devis' && e.remaining ? ` · reste ${money(e.remaining)}` : ''}</span>
                </span>
                <StatusTag e={e} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Détail d'une pièce ---------- */

export function FinanceDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['finance', id], queryFn: () => api.finances.get(id) });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [invoicing, setInvoicing] = useState(false);

  const done = (f: FinanceDetail | null, msg: string) => {
    if (f) qc.setQueryData(['finance', id], f);
    qc.invalidateQueries({ queryKey: ['finances'] });
    qc.invalidateQueries({ queryKey: ['today'] });
    toast(msg);
  };
  const setStatus = useMutation({
    mutationFn: (status: FinanceStatus) => api.finances.update(id, { status }),
    onSuccess: (f) => done(f, `Statut : ${financeStatusText(f.kind, f.status).toLowerCase()}.`),
    onError: (e) => toast(e instanceof Error ? e.message : 'Modification impossible.'),
  });
  const removePayment = useMutation({
    mutationFn: (paymentId: string) => api.finances.removePayment(paymentId),
    onSuccess: (f) => done(f, 'Paiement supprimé.'),
    onError: (e) => toast(e instanceof Error ? e.message : 'Suppression impossible.'),
  });
  const remove = useMutation({
    mutationFn: () => api.finances.remove(id),
    onSuccess: () => { done(null, 'Brouillon supprimé.'); nav('/finances'); },
    onError: (e) => toast(e instanceof Error ? e.message : 'Suppression impossible.'),
  });

  if (q.isLoading) return <div className="page"><Loading /></div>;
  if (q.error) return <div className="page"><ErrorBox error={q.error} /></div>;
  const f = q.data!;
  const busy = setStatus.isPending;
  const payable = f.kind !== 'devis' && f.status !== 'draft' && f.remaining > 0;

  // Action principale (le seul jaune de l'écran) selon le type et l'état
  let primary: { label: string; run: () => void } | null = null;
  if (f.kind === 'devis' && f.status === 'draft') primary = { label: 'Marquer comme envoyé', run: () => setStatus.mutate('sent') };
  else if (f.kind === 'devis' && f.status === 'sent') primary = { label: 'Le client a accepté', run: () => setStatus.mutate('accepted') };
  else if (f.kind === 'devis' && f.status === 'accepted' && (f.invoicedPercent ?? 0) < 1) primary = { label: 'Facturer ce devis', run: () => setInvoicing(true) };
  else if (f.kind === 'facture' && f.status === 'draft') primary = { label: 'Émettre la facture', run: () => setStatus.mutate('sent') };
  else if (payable) primary = { label: f.kind === 'depense' ? 'Enregistrer un paiement' : 'Enregistrer un encaissement', run: () => setPaying(true) };

  return (
    <div className="page">
      <Link to="/finances" className="crumb"><ChevronLeft size={16} strokeWidth={1.75} />Finances</Link>
      <div className="pagehead">
        <div>
          <h1>{financeKindLabel[f.kind]} {f.number ?? '(brouillon)'}</h1>
          <div className="sub">
            {f.title} · <Link to={`/chantiers/${f.siteId}?onglet=finances`}>{f.siteName}</Link>
            {f.contact ? <> · <Link to={`/contacts/${f.contact.id}`}>{f.contact.name}</Link></> : null}
          </div>
          <div style={{ marginTop: 8 }}><StatusTag e={f} /></div>
        </div>
        <div className="actions">
          {f.canEdit && <button className="btn btn--ghost" onClick={() => setEditing(true)}>Modifier</button>}
          {primary && <button className="btn btn--primary" disabled={busy} onClick={primary.run}>{primary.label}</button>}
        </div>
      </div>

      <div className="cols">
        <div className="stack">
          <div className="kv">
            <div><span className="k">Montant HT</span><span className="v num">{money(f.amountHt)}</span></div>
            <div><span className="k">TVA {vatRates.find((r) => r.bps === f.vatRate)?.label ?? `${f.vatRate / 100} %`}</span><span className="v num">{money(f.amountVat)}</span></div>
            <div><span className="k">Montant TTC</span><span className="v num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{money(f.amountTtc)}</span></div>
            {f.kind !== 'devis' && <div><span className="k">{f.kind === 'depense' ? 'Payé' : 'Encaissé'}</span><span className="v num">{money(f.paid)}</span></div>}
            {f.kind !== 'devis' && <div><span className="k">Reste</span><span className="v num" style={{ fontWeight: 600, color: f.overdue ? 'var(--alerte)' : 'var(--ink)' }}>{money(f.remaining)}</span></div>}
            {f.kind === 'devis' && f.invoicedPercent != null && <div><span className="k">Déjà facturé</span><span className="v num">{fmt.percent(f.invoicedPercent)}</span></div>}
          </div>

          {f.kind !== 'devis' && (
            <div className="card">
              <div className="cardhead">
                <h2>{f.kind === 'depense' ? 'Paiements' : 'Encaissements'}</h2>
                {payable && !primary?.label.startsWith('Enregistrer') && <button className="btn btn--night btn--sm" onClick={() => setPaying(true)}>Ajouter</button>}
              </div>
              {f.payments.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>{f.status === 'draft' ? 'La facture doit d’abord être émise.' : 'Aucun paiement enregistré.'}</p> : (
                <div className="kv">
                  {f.payments.map((p) => (
                    <div key={p.id}>
                      <span>
                        <span style={{ fontWeight: 600, display: 'block' }}>{money(p.amount)} · {paymentMethodLabel[p.method]}</span>
                        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{dueLabel(p.paidOn)}{p.note ? ` · ${p.note}` : ''}{p.createdBy ? ` · saisi par ${p.createdBy.fullName}` : ''}</span>
                      </span>
                      <button className="btn btn--text btn--sm" disabled={removePayment.isPending} aria-label={`Supprimer le paiement de ${money(p.amount)}`}
                        onClick={() => window.confirm('Supprimer ce paiement ?') && removePayment.mutate(p.id)}><Trash2 size={16} strokeWidth={1.75} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {f.kind === 'devis' && (
            <div className="card">
              <div className="cardhead">
                <h2>Factures établies</h2>
                {f.status === 'accepted' && (f.invoicedPercent ?? 0) < 1 && primary?.label !== 'Facturer ce devis' && <button className="btn btn--night btn--sm" onClick={() => setInvoicing(true)}>Facturer</button>}
              </div>
              {f.invoices.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>{f.status === 'accepted' ? 'Aucune facture : acompte, situation ou solde.' : 'Le devis doit être accepté pour être facturé.'}</p> : (
                <div className="kv">
                  {f.invoices.map((i) => (
                    <Link key={i.id} to={`/finances/${i.id}`} style={{ textDecoration: 'none', display: 'flex' }}>
                      <span><span style={{ fontWeight: 600, display: 'block' }}>{i.number ?? 'Brouillon'} · {i.title}</span></span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="num">{money(i.amountTtc)}</span>
                        <span className={`tag${i.status === 'paid' ? ' tag--off' : ''}`}>{financeStatusText(i.kind, i.status)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {(f.kind === 'facture' || f.kind === 'devis') && f.status !== 'draft' && (
            <div className="card">
              <div className="cardhead">
                <h2>Relances</h2>
                {f.status !== 'paid' && f.status !== 'refused' && f.status !== 'accepted' && <button className="btn btn--ghost btn--sm" onClick={() => setReminding(true)}>Noter une relance</button>}
              </div>
              {f.reminders.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>Aucune relance.</p> : (
                <div className="kv">
                  {f.reminders.map((r) => (
                    <div key={r.id}>
                      <span>
                        <span style={{ fontWeight: 600, display: 'block' }}>{reminderChannelLabel[r.channel]}{r.note ? ` · ${r.note}` : ''}</span>
                        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{r.by?.fullName ?? ''}</span>
                      </span>
                      <span className="num">{fmt.day(r.at)}, {fmt.time(r.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="kv">
            <div><span className="k">Type</span><span className="v">{financeKindLabel[f.kind]}{f.category ? ` · ${expenseCategoryLabel[f.category]}` : ''}</span></div>
            <div><span className="k">Date</span><span className="v num">{dueLabel(f.issuedOn) || '—'}</span></div>
            <div><span className="k">{f.kind === 'devis' ? 'Valable jusqu’au' : 'Échéance'}</span><span className="v num">{dueLabel(f.dueOn) || '—'}</span></div>
            <div><span className="k">Créée par</span><span className="v">{f.createdBy?.fullName ?? '—'}</span></div>
            <div><span className="k">Modifiée</span><span className="v num">{fmt.relative(f.updatedAt)}</span></div>
          </div>
          <div className="card">
            <h2>Pièce jointe</h2>
            {f.documentId ? <div style={{ marginTop: 8 }}><OpenDocButton documentId={f.documentId} label="Ouvrir le document" /></div>
              : <p className="hint">Aucun document lié. Modifiez la pièce pour y rattacher un PDF du chantier.</p>}
            {f.quoteId && <p style={{ fontSize: 15, marginTop: 12 }}><Link to={`/finances/${f.quoteId}`}>Voir le devis d’origine</Link></p>}
          </div>
          {f.notes && <div className="card"><h2>Notes</h2><p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{f.notes}</p></div>}
          {(f.kind === 'devis' && f.status === 'sent') || f.status === 'draft' ? (
            <div className="card">
              <h2>Autres actions</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {f.kind === 'devis' && f.status === 'sent' && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setStatus.mutate('refused')}>Le client a refusé</button>}
                {f.status === 'draft' && <button className="btn btn--danger btn--sm" disabled={remove.isPending} onClick={() => window.confirm('Supprimer ce brouillon ?') && remove.mutate()}>Supprimer le brouillon</button>}
              </div>
              {f.kind === 'facture' && f.status === 'draft' && <p className="hint">Le numéro de facture est attribué à l’émission, dans l’ordre, sans trou.</p>}
            </div>
          ) : null}
        </div>
      </div>

      {editing && <FinanceSheet sites={[]} existing={f} onClose={() => setEditing(false)} />}
      {paying && <PaymentSheet f={f} onClose={() => setPaying(false)} onDone={(x) => done(x, 'Paiement enregistré.')} />}
      {reminding && <ReminderSheet f={f} onClose={() => setReminding(false)} onDone={(x) => done(x, 'Relance notée.')} />}
      {invoicing && <InvoiceFromQuoteSheet f={f} onClose={() => setInvoicing(false)} />}
    </div>
  );
}

function PaymentSheet({ f, onClose, onDone }: { f: FinanceDetail; onClose: () => void; onDone: (f: FinanceDetail) => void }) {
  const form = useFormError();
  const [v, setV] = useState({ amount: (f.remaining / 100).toFixed(2).replace('.', ','), paidOn: isoDay(new Date()), method: 'virement' as PaymentMethod, note: '' });
  const cents = fmt.parseMoney(v.amount);
  const save = useMutation({
    mutationFn: () => api.finances.addPayment(f.id, { amount: cents!, paidOn: v.paidOn, method: v.method, note: v.note || null }),
    onSuccess: (x) => { onDone(x); onClose(); },
    onError: form.catchError,
  });
  return (
    <Sheet title={f.kind === 'depense' ? 'Paiement au fournisseur' : 'Encaissement'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !cents || cents <= 0} onClick={() => save.mutate()}>Enregistrer {cents ? money(cents) : ''}</button>
    </>}>
      <div className="form">
        <div className="row">
          <Field label="Montant TTC (€)" error={form.field('amount') ?? (v.amount && cents == null ? 'Montant illisible.' : undefined)} hint={`Reste : ${money(f.remaining)}`}>
            <input className="input mono" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Date" error={form.field('paidOn')}><input className="input" type="date" value={v.paidOn} onChange={(e) => setV({ ...v, paidOn: e.target.value })} /></Field>
        </div>
        <Field label="Moyen de paiement">
          <div className="chips">
            {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((m) => <button type="button" key={m} className="chip-f" aria-pressed={v.method === m} onClick={() => setV({ ...v, method: m })}>{paymentMethodLabel[m]}</button>)}
          </div>
        </Field>
        <Field label="Note"><input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Acompte, référence du virement…" /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

function ReminderSheet({ f, onClose, onDone }: { f: FinanceDetail; onClose: () => void; onDone: (f: FinanceDetail) => void }) {
  const form = useFormError();
  const [channel, setChannel] = useState<ReminderChannel>('telephone');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.finances.addReminder(f.id, { channel, note: note || null }),
    onSuccess: (x) => { onDone(x); onClose(); },
    onError: form.catchError,
  });
  return (
    <Sheet title="Noter une relance" onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>Noter la relance</button>
    </>}>
      <div className="form">
        <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>Albert garde la trace de la relance. Il n’envoie rien au client.</p>
        <Field label="Comment">
          <div className="chips">
            {(Object.keys(reminderChannelLabel) as ReminderChannel[]).map((c) => <button type="button" key={c} className="chip-f" aria-pressed={channel === c} onClick={() => setChannel(c)}>{reminderChannelLabel[c]}</button>)}
          </div>
        </Field>
        <Field label="Note"><textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paiement promis pour vendredi" /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

function InvoiceFromQuoteSheet({ f, onClose }: { f: FinanceDetail; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const left = 1 - (f.invoicedPercent ?? 0);
  const [mode, setMode] = useState<'percent' | 'solde'>(f.invoicedPercent ? 'solde' : 'percent');
  const [pct, setPct] = useState('30');
  const [title, setTitle] = useState('');
  const p = Number(pct.replace(',', '.'));
  const valid = mode === 'solde' || (p > 0 && p <= Math.round(left * 100));
  const save = useMutation({
    mutationFn: () => api.finances.invoiceFromQuote(f.id, { percent: mode === 'percent' ? p : undefined, title: title || undefined }),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['finances'] });
      qc.invalidateQueries({ queryKey: ['finance', f.id] });
      toast('Facture brouillon créée. Vérifiez-la, puis émettez-la.');
      nav(`/finances/${x.id}`);
    },
    onError: form.catchError,
  });
  const ht = mode === 'solde' ? Math.round(f.amountHt * left) : Math.round((f.amountHt * (Number.isFinite(p) ? p : 0)) / 100);
  return (
    <Sheet title={`Facturer le devis ${f.number ?? ''}`} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !valid} onClick={() => save.mutate()}>Créer la facture brouillon</button>
    </>}>
      <div className="form">
        <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>Déjà facturé : {fmt.percent(f.invoicedPercent ?? 0)} du devis ({money(f.amountHt)} HT).</p>
        <div className="chips">
          <button type="button" className="chip-f" aria-pressed={mode === 'percent'} onClick={() => setMode('percent')}>Acompte ou situation (%)</button>
          <button type="button" className="chip-f" aria-pressed={mode === 'solde'} onClick={() => setMode('solde')}>Solde ({fmt.percent(left)})</button>
        </div>
        {mode === 'percent' && (
          <Field label="Pourcentage du devis" error={form.field('percent') ?? (!valid ? `Entre 1 et ${Math.round(left * 100)} %.` : undefined)}>
            <input className="input mono" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label="Libellé (facultatif)"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'solde' ? 'Facture de solde' : 'Acompte à la commande'} /></Field>
        <p className="hint">Montant de la facture : {money(ht)} HT, {money(ht + fmt.vatOf(ht, f.vatRate))} TTC.</p>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Création et modification ---------- */

export function FinanceSheet({ sites, fixedSiteId, existing, onClose }: {
  sites: Pick<AdminSite, 'id' | 'name'>[];
  fixedSiteId?: string;
  existing?: FinanceDetail;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const form = useFormError();
  const [v, setV] = useState(() => ({
    siteId: existing?.siteId ?? fixedSiteId ?? '',
    kind: (existing?.kind ?? 'devis') as FinanceKind,
    title: existing?.title ?? '',
    number: existing?.kind === 'depense' ? existing.number ?? '' : '',
    amount: existing ? (existing.amountHt / 100).toFixed(2).replace('.', ',') : '',
    vatRate: existing?.vatRate ?? 2000,
    category: (existing?.category ?? 'materiaux') as ExpenseCategory,
    contactId: existing?.contact?.id ?? '',
    documentId: existing?.documentId ?? '',
    issuedOn: existing?.issuedOn ?? isoDay(new Date()),
    dueOn: existing?.dueOn ?? '',
    status: (existing?.status ?? 'draft') as FinanceStatus,
    notes: existing?.notes ?? '',
  }));
  const cents = fmt.parseMoney(v.amount);
  const contacts = useQuery({ queryKey: ['contacts', 'all'], queryFn: () => api.contacts.list() });
  const docs = useQuery({ queryKey: ['documents', v.siteId], queryFn: () => api.documents.list(v.siteId), enabled: !!v.siteId });

  const setKind = (k: FinanceKind) => setV((s) => ({ ...s, kind: k, status: INITIAL_STATUS[k][0]! }));

  const save = useMutation({
    mutationFn: () => {
      const data: FinanceInput = {
        kind: v.kind,
        title: v.title,
        number: v.kind === 'depense' ? v.number || null : undefined,
        category: v.kind === 'depense' ? v.category : null,
        contactId: v.contactId || null,
        documentId: v.documentId || null,
        amountHt: cents ?? 0,
        vatRate: v.vatRate,
        issuedOn: v.issuedOn || null,
        dueOn: v.dueOn || null,
        notes: v.notes || null,
      };
      if (existing) {
        const { kind: _k, ...patch } = data;
        return api.finances.update(existing.id, patch);
      }
      return api.finances.create(v.siteId, { ...data, status: v.status });
    },
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ['finances'] });
      qc.setQueryData(['finance', f.id], f);
      toast(existing ? 'Pièce modifiée.' : `${financeKindLabel[f.kind]} enregistré${f.kind === 'devis' ? '' : 'e'}.`);
      onClose();
      if (!existing) nav(`/finances/${f.id}`);
    },
    onError: form.catchError,
  });

  const vat = cents != null ? fmt.vatOf(cents, v.vatRate) : 0;
  const contactOptions = (contacts.data?.items ?? []).filter((c) => (v.kind === 'depense' ? c.kind !== 'client' && c.kind !== 'prospect' : true));
  const pdfs = (docs.data?.items ?? []).filter((d) => v.kind === 'depense' || d.type === v.kind || d.type === 'autre');

  return (
    <Sheet title={existing ? `Modifier ${financeKindLabel[existing.kind].toLowerCase()} ${existing.number ?? ''}` : 'Nouvelle pièce'} onClose={onClose} footer={<>
      <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn--primary" disabled={save.isPending || !v.title.trim() || !v.siteId || cents == null} onClick={() => save.mutate()}>
        {existing ? 'Enregistrer' : `Créer ${v.kind === 'devis' ? 'le devis' : v.kind === 'facture' ? 'la facture' : 'la dépense'}`}
      </button>
    </>}>
      <div className="form">
        {!existing && (
          <Field label="Type">
            <div className="chips">
              {KINDS.map((k) => <button type="button" key={k} className="chip-f" aria-pressed={v.kind === k} onClick={() => setKind(k)}>{financeKindLabel[k]}</button>)}
            </div>
          </Field>
        )}
        {!existing && !fixedSiteId && (
          <Field label="Chantier" error={form.field('siteId')}>
            <select className="select" value={v.siteId} onChange={(e) => setV({ ...v, siteId: e.target.value, documentId: '' })}>
              <option value="">Choisir un chantier</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Libellé" error={form.field('title')}>
          <input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus
            placeholder={v.kind === 'devis' ? 'Rénovation salle de bain' : v.kind === 'facture' ? 'Situation n°2' : 'Plaques de plâtre BA13'} />
        </Field>
        {v.kind === 'depense' && (
          <div className="row">
            <Field label="Référence du fournisseur" error={form.field('number')}><input className="input mono" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} placeholder="FA-88231" /></Field>
            <Field label="Catégorie">
              <select className="select" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ExpenseCategory })}>
                {(Object.keys(expenseCategoryLabel) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{expenseCategoryLabel[c]}</option>)}
              </select>
            </Field>
          </div>
        )}
        {v.kind !== 'depense' && !existing && <p className="hint" style={{ marginTop: -8 }}>Le numéro ({v.kind === 'devis' ? 'D' : 'F'}-AAAA-NNNN) est attribué par Albert{v.kind === 'facture' ? ', à l’émission' : ''}.</p>}
        <div className="row">
          <Field label="Montant HT (€)" error={form.field('amountHt') ?? (v.amount && cents == null ? 'Montant illisible.' : undefined)}
            hint={cents != null ? `TVA ${money(vat)} · TTC ${money(cents + vat)}` : undefined}>
            <input className="input mono" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="12 480,50" />
          </Field>
          <Field label="TVA" error={form.field('vatRate')}>
            <select className="select" value={v.vatRate} onChange={(e) => setV({ ...v, vatRate: Number(e.target.value) })}>
              {vatRates.map((r) => <option key={r.bps} value={r.bps}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label={v.kind === 'depense' ? 'Fournisseur' : 'Client'} error={form.field('contactId')}>
          <select className="select" value={v.contactId} onChange={(e) => setV({ ...v, contactId: e.target.value })}>
            <option value="">Aucun</option>
            {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.companyName && c.companyName !== c.name ? ` (${c.companyName})` : ''}</option>)}
          </select>
        </Field>
        <div className="row">
          <Field label="Date" error={form.field('issuedOn')}><input className="input" type="date" value={v.issuedOn} onChange={(e) => setV({ ...v, issuedOn: e.target.value })} /></Field>
          <Field label={v.kind === 'devis' ? 'Valable jusqu’au' : 'Échéance de paiement'} error={form.field('dueOn')}><input className="input" type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} /></Field>
        </div>
        {!existing && (
          <Field label="Statut" error={form.field('status')}>
            <div className="chips">
              {INITIAL_STATUS[v.kind].map((s) => <button type="button" key={s} className="chip-f" aria-pressed={v.status === s} onClick={() => setV({ ...v, status: s })}>{financeStatusText(v.kind, s)}</button>)}
            </div>
          </Field>
        )}
        <Field label="Document lié" error={form.field('documentId')} hint={v.siteId ? undefined : 'Choisissez d’abord le chantier.'}>
          <select className="select" value={v.documentId} disabled={!v.siteId} onChange={(e) => setV({ ...v, documentId: e.target.value })}>
            <option value="">Aucun</option>
            {pdfs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.current ? ` ${d.current.label}` : ''} · {d.folder.name}</option>)}
          </select>
        </Field>
        <Field label="Notes"><textarea className="input" style={{ minHeight: 72, paddingTop: 12 }} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {form.message && <p className="err">{form.message}</p>}
      </div>
    </Sheet>
  );
}
