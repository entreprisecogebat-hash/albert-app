import { durationLabel, fmt, type TodayItem, type TodayKind } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
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

export function boLink(it: TodayItem): string {
  if (it.kind === 'appointment') return '/agenda';
  // Une pièce financière précise : le lien mobile se termine par son identifiant (/finances/{id})
  const fin = /\/finances\/([0-9a-f-]{36})$/.exec(it.link);
  if (fin) return `/finances/${fin[1]}`;
  if (!it.site) return '/';
  const tab = KIND_TAB[it.kind];
  return `/chantiers/${it.site.id}${tab ? `?onglet=${tab}` : ''}`;
}

/** F-18 : le tableau de priorités du jour. Ce qui demande une action, dans l'ordre. */
export function TodayPage() {
  const nav = useNavigate();
  const today = useQuery({ queryKey: ['today'], queryFn: api.today, refetchInterval: 60_000 });

  if (today.isLoading) return <div className="page"><Loading /></div>;
  if (today.error) return <div className="page"><ErrorBox error={today.error} /></div>;
  const d = today.data!;
  const high = d.items.filter((i) => i.urgency === 'high');
  const normal = d.items.filter((i) => i.urgency !== 'high');

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>{d.greeting}</h1>
          <div className="sub">
            {d.summary}
            {d.generatedBy === 'ai' ? ' · synthèse rédigée par Albert' : ''}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="stat"><div className="n">{d.stats.activeSites}</div><div className="t">chantiers en cours</div></div>
        <div className="stat"><div className="n">{d.stats.openTasks}</div><div className="t">tâches ouvertes</div></div>
        <div className="stat"><div className="n">{d.stats.openReserves}</div><div className="t">réserves et SAV ouverts</div></div>
        <div className="stat"><div className="n">{d.stats.clientWaiting}</div><div className="t">clients attendent une réponse</div></div>
      </div>

      <div className="cols">
        <div className="stack">
          <PointList title="À traiter en priorité" items={high} empty="Rien d’urgent. Bonne journée." onOpen={(it) => nav(boLink(it))} />
          {normal.length > 0 && <PointList title="À suivre" items={normal} onOpen={(it) => nav(boLink(it))} />}
        </div>

        <div className="stack">
          <div className="card">
            <div className="cardhead"><h2>Rendez-vous du jour</h2><Link to="/agenda" className="btn btn--text btn--sm">Agenda</Link></div>
            {d.appointments.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>Aucun rendez-vous aujourd’hui.</p> : (
              <div className="kv">
                {d.appointments.map((a) => (
                  <div key={a.id}>
                    <span>
                      <span style={{ fontWeight: 600, display: 'block' }}>{a.title}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                        {[a.site?.name, a.contact?.name, a.location].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    <span className="num">{fmt.time(a.startsAt)}{a.endsAt ? `–${fmt.time(a.endsAt)}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Mon pointage</h2>
            <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8 }}>
              {d.clock.open
                ? `Pointé sur ${d.clock.open.siteName} depuis ${fmt.time(d.clock.open.startedAt)}.`
                : 'Pas de pointage en cours. Le pointage se fait depuis l’application, sur le chantier.'}
            </p>
            <div className="kv" style={{ marginTop: 16 }}>
              <div><span className="k">Aujourd’hui</span><span className="v num">{durationLabel(d.clock.todayMinutes) || '0 min'}</span></div>
              <div><span className="k">Cette semaine</span><span className="v num">{durationLabel(d.clock.weekMinutes) || '0 min'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PointList({ title, items, empty, onOpen }: { title: string; items: TodayItem[]; empty?: string; onOpen: (it: TodayItem) => void }) {
  return (
    <div className="card">
      <div className="cardhead"><h2>{title}</h2><span className="num">{items.length}</span></div>
      {items.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>{empty}</p> : (
        <div className="kv">
          {items.map((it) => (
            <div key={it.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
              onClick={() => onOpen(it)} onKeyDown={(e) => e.key === 'Enter' && onOpen(it)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span className={`tag${it.urgency === 'high' ? ' tag--alerte' : ''}`}>{KIND_TAG[it.kind]}</span>
                  {it.site && <span className="tag tag--off">{it.site.name}</span>}
                </span>
                <span style={{ fontWeight: 600, display: 'block' }}>{it.title}</span>
                {it.subtitle && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{it.subtitle}</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {it.at && <span className="num">{fmt.relative(it.at)}</span>}
                <ChevronRight size={18} strokeWidth={1.75} color="var(--ink-3)" />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
