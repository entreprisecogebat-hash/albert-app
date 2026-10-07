import { durationLabel, fmt, phaseLabel, type TodayItem, type TodayKind } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Building2, CalendarClock, CheckSquare, ChevronRight, Clock, FileText, HandCoins, MessageSquare, PenLine, ReceiptEuro, ShoppingCart,
  TrendingUp, Wallet, Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { ErrorBox, Loading } from '../ui';

/** Mot affiché à côté de chaque point : le statut n'est jamais porté par la seule couleur. */
const KIND_TAG: Record<TodayKind, string> = {
  clock_open: 'Pointage en cours',
  task_overdue: 'Tâche en retard',
  task_today: 'Tâche du jour',
  client_waiting: 'Client en attente',
  reserve_overdue: 'Réserve en retard',
  reserve_open: 'Réserve à lever',
  appointment: 'Rendez-vous',
  intervention_unsigned: 'Fiche à signer',
  document_new: 'Nouveau document',
  invoice_overdue: 'Facture impayée',
  quote_pending: 'Devis sans réponse',
  expense_due: 'Dépense à payer',
};

/** Onglet de la fiche chantier du back-office correspondant à un point du jour */
const KIND_TAB: Partial<Record<TodayKind, string>> = {
  clock_open: 'pointages',
  task_overdue: 'taches',
  task_today: 'taches',
  reserve_overdue: 'reserves',
  reserve_open: 'reserves',
  intervention_unsigned: 'interventions',
  invoice_overdue: 'finances',
  quote_pending: 'finances',
  expense_due: 'finances',
};

const KIND_ICON: Record<TodayKind, typeof Clock> = {
  clock_open: Clock,
  task_overdue: CheckSquare,
  task_today: CheckSquare,
  client_waiting: MessageSquare,
  reserve_overdue: AlertTriangle,
  reserve_open: Wrench,
  appointment: CalendarClock,
  intervention_unsigned: PenLine,
  document_new: FileText,
  invoice_overdue: ReceiptEuro,
  quote_pending: HandCoins,
  expense_due: ShoppingCart,
};

export function boLink(it: TodayItem): string {
  if (it.kind === 'appointment') return '/agenda';
  // Une pièce financière précise : le lien mobile se termine par son identifiant (/finances/{id})
  const fin = /\/finances\/([0-9a-f-]{36})$/.exec(it.link);
  if (fin) return `/finances/${fin[1]}`;
  if (!it.site) return '/';
  const tab = KIND_TAB[it.kind];
  return `/chantiers/${it.site.id}${tab ? `?onglet=${tab}` : ''}`;
}

/** Teinte d'un point du jour : le mot reste écrit, la couleur aide à trier d'un coup d'œil. */
function toneOf(it: TodayItem): string {
  switch (it.kind) {
    case 'client_waiting': return 'client';
    case 'task_overdue':
    case 'reserve_overdue':
    case 'invoice_overdue': return 'alerte';
    case 'expense_due': return it.urgency === 'high' ? 'alerte' : 'accent';
    case 'intervention_unsigned':
    case 'task_today': return 'accent';
    case 'document_new':
    case 'clock_open': return 'sync';
    default: return '';
  }
}

/** 203 450 € -> « 203 k€ » ; 30 690 € -> « 30,7 k€ » */
function k(cents: number): string {
  const eur = Math.round(cents / 100);
  if (Math.abs(eur) >= 100_000) return `${Math.round(eur / 1000)} k€`;
  if (Math.abs(eur) >= 10_000) return `${(eur / 1000).toFixed(1).replace('.', ',')} k€`;
  return fmt.money(eur * 100, { decimals: false });
}

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/**
 * Tableau de bord (F-18) : la journée et l'entreprise sur un écran.
 * Bandeau : bonjour et la phrase de synthèse. Puis quatre chiffres, les priorités, l'avancement
 * des chantiers, la trésorerie par chantier et l'agenda du jour.
 */
export function TodayPage() {
  const nav = useNavigate();
  const [all, setAll] = useState(false);
  const today = useQuery({ queryKey: ['today'], queryFn: api.today, refetchInterval: 60_000 });
  const sites = useQuery({ queryKey: ['sites', 'cards'], queryFn: () => api.sites.list() });
  const finances = useQuery({ queryKey: ['finances', 'dashboard'], queryFn: () => api.finances.list({}), retry: false });

  if (today.isLoading) return <div className="page"><Loading /></div>;
  if (today.error) return <div className="page"><ErrorBox error={today.error} /></div>;
  const d = today.data!;
  const high = d.items.filter((i) => i.urgency === 'high');
  const shown = all ? d.items : (high.length ? high : d.items).slice(0, 6);
  const sum = finances.data?.summary;
  const cards = (sites.data?.items ?? []).filter((s) => s.status === 'active');

  // Facturé et encaissé par chantier (factures émises)
  const bySite = new Map<string, { name: string; invoiced: number; paid: number }>();
  for (const f of finances.data?.items ?? []) {
    if (f.kind !== 'facture' || f.status === 'draft') continue;
    const row = bySite.get(f.siteId) ?? { name: f.siteName, invoiced: 0, paid: 0 };
    row.invoiced += f.amountTtc;
    row.paid += f.paid;
    bySite.set(f.siteId, row);
  }
  const siteMoney = [...bySite.entries()].sort((a, b) => b[1].invoiced - a[1].invoiced);
  const maxInv = Math.max(1, ...siteMoney.map(([, r]) => r.invoiced));

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="date">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <h1>{d.greeting}</h1>
        <p className="summary">{d.summary}{d.generatedBy === 'ai' ? ' · synthèse rédigée par Albert' : ''}</p>
        {d.clock.open ? (
          <div className="clock"><i />Pointé sur {d.clock.open.siteName} depuis {fmt.time(d.clock.open.startedAt)}</div>
        ) : null}
      </section>

      <div className="kpis">
        <Link to="/chantiers" className={`kpi${d.stats.clientWaiting ? ' client' : ''}`}>
          <span className="ic"><Building2 size={18} /></span>
          <span className="v">{d.stats.activeSites}</span>
          <span className="l">chantiers suivis</span>
          <span className="h">
            {d.stats.clientWaiting ? `${d.stats.clientWaiting} client${d.stats.clientWaiting > 1 ? 's' : ''} en attente de réponse` : 'Aucun client en attente'}
          </span>
        </Link>
        <a href="#priorites" className={`kpi${high.length ? ' alerte' : ' sync'}`}>
          <span className="ic"><AlertTriangle size={18} /></span>
          <span className="v">{high.length}</span>
          <span className="l">{high.length > 1 ? 'points urgents' : 'point urgent'}</span>
          <span className="h">{d.items.length - high.length} autres à suivre</span>
        </a>
        {sum ? (
          <Link to="/finances" className={`kpi${sum.overdueTtc ? ' alerte' : ' sync'}`}>
            <span className="ic"><Wallet size={18} /></span>
            <span className="v">{k(sum.outstandingTtc)}</span>
            <span className="l">à encaisser</span>
            <span className="h">{sum.overdueTtc ? `dont ${k(sum.overdueTtc)} en retard` : 'Aucun retard de paiement'}</span>
          </Link>
        ) : (
          <div className="kpi">
            <span className="ic"><CheckSquare size={18} /></span>
            <span className="v">{d.stats.openTasks}</span>
            <span className="l">tâches ouvertes</span>
          </div>
        )}
        {sum && sum.marginRate != null ? (
          <Link to="/finances" className="kpi accent">
            <span className="ic"><TrendingUp size={18} /></span>
            <span className="v">{fmt.percent(sum.marginRate)}</span>
            <span className="l">marge prévue</span>
            <span className="h">{k(sum.marginHt)} HT sur {k(sum.quotedHt)} signés</span>
          </Link>
        ) : (
          <Link to="/reserves" className="kpi">
            <span className="ic"><Wrench size={18} /></span>
            <span className="v">{d.stats.openReserves}</span>
            <span className="l">réserves et SAV ouverts</span>
          </Link>
        )}
      </div>

      <div className="dash-grid">
        <div>
          <section className="panel" id="priorites">
            <div className="panel-h">
              <h2>{all ? 'Tout ce qui vous attend' : 'À traiter en priorité'}</h2>
              {d.items.length > shown.length || all ? (
                <button onClick={() => setAll((v) => !v)}>{all ? 'Réduire' : `Tout voir (${d.items.length})`}</button>
              ) : null}
            </div>
            {shown.length === 0 ? <p className="empty">Rien d’urgent. Bonne journée.</p> : shown.map((it) => {
              const Icon = KIND_ICON[it.kind] ?? FileText;
              const tone = toneOf(it);
              return (
                <div key={it.id} className="prow" role="button" tabIndex={0}
                  onClick={() => nav(boLink(it))} onKeyDown={(e) => e.key === 'Enter' && nav(boLink(it))}>
                  <span className={`ico ${tone}`}><Icon size={19} strokeWidth={2} /></span>
                  <span className="txt">
                    <span className="meta" style={{ display: 'block' }}>{it.site?.name ?? KIND_TAG[it.kind]}</span>
                    <span className="tt" style={{ display: 'block' }}>{it.title}</span>
                    {it.subtitle && <span className="ss" style={{ display: 'block' }}>{it.subtitle}</span>}
                  </span>
                  <span className={`pill ${tone}`}>{tone ? <i /> : null}{KIND_TAG[it.kind]}</span>
                  <ChevronRight size={18} strokeWidth={1.75} color="var(--ink-3)" />
                </div>
              );
            })}
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Chantiers</h2><Link to="/chantiers">Tous les chantiers</Link></div>
            <table className="sites">
              <tbody>
                {cards.map((s) => (
                  <tr key={s.id} className="link" onClick={() => nav(`/chantiers/${s.id}`)}>
                    <td>
                      <div className="who">
                        {s.cover ? <img className="cover" src={s.cover} alt="" /> : <span className="cover">{initialsOf(s.name)}</span>}
                        <div style={{ minWidth: 0 }}>
                          <div className="main-t">{s.name}</div>
                          <div className="sub-t">{s.clientName ?? s.address}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ width: 220 }}>
                      {s.progress ? (
                        <>
                          <div className="bar"><span style={{ width: `${Math.round(s.progress.value * 100)}%` }} /></div>
                          <div className="sub-t" style={{ fontSize: 13, marginTop: 4 }}>{s.progress.label}</div>
                        </>
                      ) : <span className="sub-t">—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className={`pill ${s.phase === 'pendant' ? 'accent' : s.phase === 'apres' ? 'sync' : ''}`}>{phaseLabel[s.phase]}</span>
                        {s.alerts > 0 && <span className="pill alerte"><i />{s.alerts} en retard</span>}
                        {s.awaitingReply && <span className="pill client"><i />Client</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div>
          {sum ? (
            <section className="panel">
              <div className="panel-h"><h2>Trésorerie</h2><Link to="/finances">Finances</Link></div>
              <div className="panel-b">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div><div className="sub-t">Encaissé</div><div className="money-big">{k(sum.paidTtc)}</div></div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="sub-t">Facturé TTC</div>
                    <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>{k(sum.invoicedTtc)}</div>
                  </div>
                </div>
                <div className="bar" style={{ marginTop: 12, height: 10 }}>
                  <span style={{ width: `${sum.invoicedTtc ? Math.round((sum.paidTtc / sum.invoicedTtc) * 100) : 0}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  {sum.overdueTtc ? <span className="pill alerte"><i />{k(sum.overdueTtc)} en retard</span> : <span className="pill sync"><i />Aucun retard</span>}
                  {sum.expensesToPayTtc ? <span className="pill accent"><i />{k(sum.expensesToPayTtc)} de dépenses à payer</span> : null}
                  {sum.quotesPendingHt ? <span className="pill">{k(sum.quotesPendingHt)} HT de devis en attente</span> : null}
                </div>
                {siteMoney.length ? (
                  <div className="bars" style={{ marginTop: 24 }}>
                    {siteMoney.map(([id, r]) => (
                      <div key={id} className="row" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                        onClick={() => nav(`/chantiers/${id}?onglet=finances`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/chantiers/${id}?onglet=finances`)}>
                        <div className="top"><b>{r.name}</b><span>{k(r.paid)} / {k(r.invoiced)}</span></div>
                        <div className="stacked" aria-label={`${r.name} : ${k(r.paid)} encaissés sur ${k(r.invoiced)} facturés`}>
                          <span className="inv" style={{ width: `${(r.invoiced / maxInv) * 100}%` }} />
                          <span className="pay" style={{ width: `${(r.paid / maxInv) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="legend">
                      <span><i style={{ background: 'var(--accent)' }} />Encaissé</span>
                      <span><i style={{ background: '#E3DCC2' }} />Facturé non encaissé</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-h"><h2>Aujourd’hui</h2><Link to="/agenda">Agenda</Link></div>
            {d.appointments.length === 0 ? <p className="empty" style={{ paddingTop: 8 }}>Aucun rendez-vous aujourd’hui.</p> : d.appointments.map((a) => (
              <div key={a.id} className="agenda-row">
                <div>
                  <div className="t">{fmt.time(a.startsAt)}</div>
                  {a.endsAt && <div className="sub-t" style={{ fontSize: 13 }}>{fmt.time(a.endsAt)}</div>}
                </div>
                <div className="line" />
                <div style={{ minWidth: 0 }}>
                  <div className="main-t">{a.title}</div>
                  <div className="sub-t">{[a.site?.name, a.contact?.name].filter(Boolean).join(' · ') || ' '}</div>
                </div>
              </div>
            ))}
            <div style={{ height: 12 }} />
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Mon pointage</h2></div>
            <div className="panel-b" style={{ display: 'flex', gap: 32 }}>
              <div>
                <div className="sub-t">Aujourd’hui</div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{durationLabel(d.clock.todayMinutes) || '0 h'}</div>
              </div>
              <div>
                <div className="sub-t">Cette semaine</div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24 }}>{durationLabel(d.clock.weekMinutes) || '0 h'}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
