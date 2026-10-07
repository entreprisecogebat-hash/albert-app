import { fmt } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { ErrorBox, Loading } from '../ui';

/**
 * Vue d'ensemble. Des chiffres simples, pas de graphique (charte : "retrouver et prouver").
 * La part de documents classés sans correction est l'indicateur suivi chaque semaine.
 */
export function Overview() {
  const nav = useNavigate();
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.admin.overview });
  const sites = useQuery({ queryKey: ['admin-sites', '', 'active'], queryFn: () => api.admin.sites('', 'active') });

  if (overview.isLoading) return <div className="page"><Loading /></div>;
  if (overview.error) return <div className="page"><ErrorBox error={overview.error} /></div>;
  const o = overview.data!;
  const cls = o.classification;
  const auto = (cls.rule ?? 0) + (cls.fingerprint ?? 0) + (cls.title ?? 0);
  const total = auto + (cls.user ?? 0) + (cls.default ?? 0);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Vue d’ensemble</h1>
          <div className="sub">{o.company.name}</div>
        </div>
      </div>

      <div className="grid g4">
        <div className="stat"><div className="n">{o.counts.activeSites}</div><div className="t">chantiers en cours</div></div>
        <div className="stat"><div className="n">{o.counts.staff}</div><div className="t">membres de l’équipe</div></div>
        <div className="stat"><div className="n">{o.counts.clients}</div><div className="t">clients invités</div></div>
        <div className="stat"><div className="n">{o.counts.eventsLast7Days}</div><div className="t">éléments ajoutés ces 7 derniers jours</div></div>
      </div>

      <div className="cols" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="cardhead"><h2>Chantiers les plus actifs</h2></div>
          {sites.data && sites.data.items.length > 0 ? (
            <div className="tbl-wrap" style={{ border: 0 }}>
              <table>
                <thead><tr><th>Chantier</th><th>Dernière activité</th><th>7 jours</th></tr></thead>
                <tbody>
                  {sites.data.items.slice(0, 8).map((s) => (
                    <tr key={s.id} className="link" onClick={() => nav(`/chantiers/${s.id}`)}>
                      <td><div className="main-t">{s.name}</div><div className="sub-t">{s.address}</div></td>
                      <td className="num">{fmt.relative(s.lastActivityAt)}</td>
                      <td className="num">{s.stats.eventsLast7Days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">Aucun chantier en cours.</div>}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Classement des documents</h2>
            <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8 }}>
              Part des documents rangés par Albert sans correction. Elle progresse à chaque règle ajoutée.
            </p>
            <div className="stat" style={{ border: 0, padding: '16px 0 0' }}>
              <div className="n">{total ? Math.round((auto / total) * 100) : 0} %</div>
              <div className="t">{auto} sur {total} documents</div>
            </div>
            <div className="kv" style={{ marginTop: 16 }}>
              <div><span className="k">Par règle de dépôt</span><span className="v num">{cls.rule ?? 0}</span></div>
              <div><span className="k">Par titre ou empreinte</span><span className="v num">{(cls.title ?? 0) + (cls.fingerprint ?? 0)}</span></div>
              <div><span className="k">Corrigés à la main</span><span className="v num">{cls.user ?? 0}</span></div>
              <div><span className="k">Rangés dans Divers</span><span className="v num">{cls.default ?? 0}</span></div>
            </div>
          </div>
          <div className="card">
            <h2>Volume</h2>
            <div className="kv" style={{ marginTop: 16 }}>
              <div><span className="k">Documents</span><span className="v num">{o.counts.documents}</span></div>
              <div><span className="k">Photos</span><span className="v num">{o.counts.photos}</span></div>
              <div><span className="k">Chantiers archivés</span><span className="v num">{o.counts.archivedSites}</span></div>
            </div>
            <p className="hint">Option intelligence artificielle : {o.company.aiEnabled ? 'activée' : 'non activée'}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
