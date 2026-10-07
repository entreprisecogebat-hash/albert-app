import { Building2, CalendarDays, ClipboardCheck, Contact, Euro, FolderTree, LayoutGrid, ListChecks, LogOut, ScanText, Users } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { AgendaPage } from './pages/Agenda';
import { ContactDetailPage } from './pages/ContactDetail';
import { ContactsPage } from './pages/Contacts';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { SiteDetailPage } from './pages/SiteDetail';
import { SitesPage } from './pages/Sites';
import { FinanceDetailPage, FinancesPage } from './pages/Finances';
import { FolderTemplatePage } from './pages/FolderTemplate';
import { ReservesPage } from './pages/Reserves';
import { RulesPage } from './pages/Rules';
import { TodayPage } from './pages/Today';
import { UserDetailPage } from './pages/UserDetail';
import { UsersPage } from './pages/Users';
import { Loading, ToastProvider } from './ui';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}

function Gate() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Login />;
  if (!me.admin) return <Login notAdmin />;
  return <Shell />;
}

function Shell() {
  const { me, signOut } = useAuth();
  const ic = { size: 20, strokeWidth: 1.75 };
  return (
    <div className="shell">
      <aside className="side">
        <NavLink to="/" className="wordmark" aria-label="Albert, accueil du back-office">
          <span className="w">Albert</span>
          <span className="bar" />
        </NavLink>
        <div className="co">{me?.company.name} · back-office</div>
        <nav className="nav">
          <NavLink to="/" end><ListChecks {...ic} />Aujourd’hui</NavLink>
          <NavLink to="/chantiers"><Building2 {...ic} />Chantiers</NavLink>
          <NavLink to="/agenda"><CalendarDays {...ic} />Agenda</NavLink>
          <NavLink to="/reserves"><ClipboardCheck {...ic} />Réserves et SAV</NavLink>
          <NavLink to="/finances"><Euro {...ic} />Finances</NavLink>
          <NavLink to="/contacts"><Contact {...ic} />Contacts</NavLink>
          <NavLink to="/intervenants"><Users {...ic} />Intervenants</NavLink>
          <NavLink to="/vue-ensemble"><LayoutGrid {...ic} />Vue d’ensemble</NavLink>
          <div className="grp">Paramétrage</div>
          <NavLink to="/parametres/arborescence"><FolderTree {...ic} />Arborescence type</NavLink>
          <NavLink to="/parametres/classement"><ScanText {...ic} />Règles de classement</NavLink>
        </nav>
        <div className="me">
          <b>{me?.fullName}</b>
          <span>{me?.jobTitle ?? 'Administrateur'}</span>
          <div>
            <button className="btn btn--text" style={{ paddingLeft: 0 }} onClick={signOut}>
              <LogOut size={16} strokeWidth={1.75} /> Se déconnecter
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/vue-ensemble" element={<Overview />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/reserves" element={<ReservesPage />} />
          <Route path="/finances" element={<FinancesPage />} />
          <Route path="/finances/:id" element={<FinanceDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/chantiers" element={<SitesPage />} />
          <Route path="/chantiers/:id" element={<SiteDetailPage />} />
          <Route path="/intervenants" element={<UsersPage />} />
          <Route path="/intervenants/:id" element={<UserDetailPage />} />
          <Route path="/parametres/arborescence" element={<FolderTemplatePage />} />
          <Route path="/parametres/classement" element={<RulesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
