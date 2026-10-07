import { ApiError, fmt } from '@albert/shared';
import { Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

/** Connexion par téléphone et code SMS, comme sur l'application. Aucun mot de passe. */
export function Login({ notAdmin = false }: { notAdmin?: boolean }) {
  const { signIn, signOut, me } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fmt.normalizePhone(phone)) {
      setError('Ce numéro ne semble pas valide. Vérifiez-le.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.auth.requestCode(phone);
      setSentTo(r.phoneDisplay);
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.auth.verify(phone, code, 'Back-office web');
      signIn(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="left">
        <div className="grid-bg" />
        <div>
          <div className="wordmark"><span className="w">Albert</span><span className="bar" /></div>
          <p className="welcome">Le carnet de chantier<br />de vos équipes.</p>
        </div>
        <p className="note-n">Back-office d’administration : chantiers, intervenants, droits et arborescence. Réservé aux administrateurs de l’entreprise.</p>
      </div>
      <div className="right">
        <div className="box">
          {notAdmin ? (
            <>
              <h1>Accès réservé</h1>
              <p className="lead">Bonjour {me?.firstName}. Le back-office est réservé aux administrateurs de {me?.company.name}. Vos chantiers restent accessibles depuis l’application mobile.</p>
              <button className="btn btn--ghost btn--block" style={{ marginTop: 32 }} onClick={signOut}>Se connecter avec un autre numéro</button>
            </>
          ) : step === 'phone' ? (
            <form onSubmit={requestCode}>
              <h1>Connexion</h1>
              <p className="lead">Entrez votre numéro de téléphone professionnel.</p>
              <div className={`field${error ? ' error' : ''}`} style={{ marginTop: 24 }}>
                <Smartphone size={22} strokeWidth={1.75} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" aria-label="Numéro de téléphone professionnel" autoFocus />
              </div>
              {error && <p className="err">{error}</p>}
              <button className="btn btn--primary btn--block" style={{ marginTop: 24 }} disabled={busy}>
                {busy ? 'Envoi du code…' : 'Recevoir mon code pour me connecter'}
              </button>
              <p className="hint">Aucun mot de passe à retenir.</p>
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1>Entrez le code reçu par SMS</h1>
              <p className="lead">
                Code envoyé au <span style={{ fontFamily: 'var(--mono)' }}>{sentTo}</span>.{' '}
                <button type="button" className="btn btn--text" style={{ padding: 0, minHeight: 0 }} onClick={() => { setStep('phone'); setCode(''); setError(null); }}>Modifier</button>
              </p>
              <input
                className="input otp" style={{ marginTop: 24, minHeight: 64 }} value={code} maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code à 6 chiffres" autoFocus
              />
              {devCode && <div className="devcode">Environnement de développement : pas de vrai SMS. Code : {devCode}</div>}
              {error && <p className="err">{error}</p>}
              <button className="btn btn--primary btn--block" style={{ marginTop: 24 }} disabled={busy || code.length !== 6}>
                {busy ? 'Vérification…' : 'Me connecter'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
