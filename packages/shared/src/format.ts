/**
 * Dates, tailles et numéros, rédigés comme dans les maquettes :
 * "Il y a 12 min", "Hier, 17:24", "Lundi", "3 septembre", "4,2 Mo".
 * Les heures sont toujours affichées en IBM Plex Mono par les interfaces.
 */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const pad = (n: number) => String(n).padStart(2, '0');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
}

/** "9:42" */
export function time(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

/** "3 septembre", "1er mai", "3 septembre 2025" si une autre année */
export function day(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const n = d.getDate();
  const base = `${n === 1 ? '1er' : n} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Moment relatif pour le fil :
 * "À l'instant", "Il y a 12 min", "Il y a 2 h", "Hier, 17:24", "Lundi", "3 septembre".
 */
export function relative(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  const days = daysBetween(now, d);
  // Minuit pile : c'est une date sans heure (échéance), pas un moment. "Hier, 0:00" ne veut rien dire.
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days === -1) return 'Demain';
    if (days > 1 && days < 7) return capitalize(DAYS[d.getDay()]!);
    return day(d, now);
  }
  if (diffMin < 1 && diffMin > -2) return "À l'instant";
  if (days === 0 && diffMin < 60) return `Il y a ${diffMin} min`;
  if (days === 0) return `Il y a ${Math.floor(diffMin / 60)} h`;
  if (days === 1) return `Hier, ${time(d)}`;
  if (days > 1 && days < 7) return capitalize(DAYS[d.getDay()]!);
  return day(d, now);
}

/** "Déposée le 22 septembre à 9:14" (la preuve : date et heure exactes) */
export function exact(iso: string | Date, now: Date = new Date()): string {
  return `le ${day(iso, now)} à ${time(iso)}`;
}

/** "il y a 3 semaines", pour les résultats de recherche */
export function ago(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const days = daysBetween(now, d);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 14) return 'il y a 1 semaine';
  if (days < 31) return `il y a ${Math.floor(days / 7)} semaines`;
  return `le ${day(d, now)}`;
}

/** "4,2 Mo", "820 Ko" */
export function bytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  const mo = n / (1024 * 1024);
  return `${mo.toFixed(mo < 10 ? 1 : 0).replace('.', ',')} Mo`;
}

/** "prises entre 9:42 et 9:47" */
export function takenRange(from?: string, to?: string): string | null {
  if (!from) return null;
  if (!to || time(from) === time(to)) return `prise à ${time(from)}`;
  return `prises entre ${time(from)} et ${time(to)}`;
}

/** "Démarré le 4 mai" */
export function startedOn(dateStr: string | null, now: Date = new Date()): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  return d > now ? `Démarre le ${day(d, now)}` : `Démarré le ${day(d, now)}`;
}

/** Saisie libre -> E.164 France. "06 12 34 56 78" -> "+33612345678". Même règle que l'API. */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(s)) s = `+33${s.slice(1)}`;
  const m = /^\+330(\d{9})$/.exec(s);
  if (m) s = `+33${m[1]}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** "+33612345678" -> "+33 6 12 34 56 78" */
export function formatPhone(e164: string): string {
  const m = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+33 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : e164;
}

/** "3 nouveautés", "1 nouveauté" */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n > 1 ? (pluralForm ?? `${singular}s`) : singular}`;
}

/** Montant en centimes -> "12 480,50 €" (espace fine insécable entre les milliers). */
export function money(cents: number, opts: { decimals?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const int = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  const showDec = opts.decimals ?? rest !== 0;
  return `${neg ? '−' : ''}${int}${showDec ? `,${String(rest).padStart(2, '0')}` : ''}\u00a0€`;
}

/** "12 480,50" ou "12480.5" saisi -> centimes, ou null si illisible. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[\s\u202f\u00a0€]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** TVA arrondie au centime (arrondi commercial), comme le serveur. */
export function vatOf(amountHt: number, vatRate: number): number {
  return Math.round((amountHt * vatRate) / 10000);
}

/** 0.18 -> "18 %" */
export function percent(ratio: number | null | undefined): string {
  if (ratio == null) return '—';
  return `${Math.round(ratio * 100)}\u00a0%`;
}
