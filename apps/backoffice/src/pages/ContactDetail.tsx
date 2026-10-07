import { contactKindLabel, docTypeLabel, fmt } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { ErrorBox, Loading, OpenDocButton } from '../ui';
import { AppointmentSheet } from './Agenda';
import { ContactSheet } from './Contacts';
import { ContactFinances } from './Finances';

export function ContactDetailPage() {
  const { id = '' } = useParams();
  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.contacts.get(id) });
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);

  if (contact.isLoading) return <div className="page"><Loading /></div>;
  if (contact.error) return <div className="page"><ErrorBox error={contact.error} /></div>;
  const c = contact.data!;

  return (
    <div className="page">
      <Link to="/contacts" className="crumb"><ChevronLeft size={16} strokeWidth={1.75} />Contacts</Link>
      <div className="pagehead">
        <div>
          <h1>{c.name}</h1>
          <div className="sub">{[contactKindLabel[c.kind], c.companyName, c.jobTitle].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => setEditing(true)}>Modifier</button>
          <button className="btn btn--primary" onClick={() => setPlanning(true)}>Planifier un rendez-vous</button>
        </div>
      </div>

      <div className="cols">
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h2>Documents liés</h2><span className="num">{c.documents.length}</span></div>
            {c.documents.length === 0 ? (
              <p className="hint" style={{ marginTop: 0 }}>Aucun document. Depuis l’application, un devis ou une facture peut être rattaché à cette fiche.</p>
            ) : (
              <div className="kv">
                {c.documents.map((d) => (
                  <div key={d.id}>
                    <span>
                      <span style={{ fontWeight: 600, display: 'block' }}>{d.title}{d.current ? ` ${d.current.label}` : ''}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{docTypeLabel[d.type]} · {d.siteName} · {fmt.relative(d.updatedAt)}</span>
                    </span>
                    <OpenDocButton documentId={d.id} label="Ouvrir" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <ContactFinances contactId={c.id} />

          <div className="card">
            <div className="cardhead"><h2>Rendez-vous</h2><span className="num">{c.appointments.length}</span></div>
            {c.appointments.length === 0 ? <p className="hint" style={{ marginTop: 0 }}>Aucun rendez-vous.</p> : (
              <div className="kv">
                {c.appointments.map((a) => (
                  <div key={a.id}>
                    <span>
                      <span style={{ fontWeight: 600, display: 'block' }}>{a.title}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{[a.site?.name, a.location].filter(Boolean).join(' · ') || ' '}</span>
                    </span>
                    <span className="num">{fmt.day(a.startsAt)}, {fmt.time(a.startsAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="kv">
            <div><span className="k">Téléphone</span><span className="v num">{c.phoneDisplay ?? c.phone ?? '—'}</span></div>
            <div><span className="k">Email</span><span className="v">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</span></div>
            <div><span className="k">Adresse</span><span className="v">{c.address ?? '—'}</span></div>
            <div><span className="k">Ajouté</span><span className="v num">{fmt.day(c.createdAt)}</span></div>
          </div>
          <div className="card">
            <h2>Chantiers</h2>
            {c.sites.length === 0 ? <p className="hint">Lié à aucun chantier.</p> : (
              <div className="chips" style={{ marginTop: 12 }}>
                {c.sites.map((s) => <Link key={s.id} to={`/chantiers/${s.id}`} className="tag" style={{ textDecoration: 'none' }}>{s.name}</Link>)}
              </div>
            )}
          </div>
          {c.notes && (
            <div className="card">
              <h2>Notes</h2>
              <p style={{ fontSize: 15, color: 'var(--ink-2)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.notes}</p>
            </div>
          )}
        </div>
      </div>

      {editing && <ContactSheet contact={c} onClose={() => setEditing(false)} />}
      {planning && <AppointmentSheet onClose={() => setPlanning(false)} initial={{ contactId: c.id, siteId: c.sites[0]?.id }} />}
    </div>
  );
}
