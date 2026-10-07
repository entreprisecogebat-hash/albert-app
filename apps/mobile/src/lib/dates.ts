/** Dates locales au format de l'API (AAAA-MM-JJ), sans décalage UTC. */

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const DAYS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Aujourd'hui », « Demain », « Jeu. 9 » : libellé court pour les puces de choix de jour. */
export function chipDay(d: Date, today = new Date()): string {
  const diff = Math.round((addDays(d, 0).getTime() - addDays(today, 0).getTime()) / 86400000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  return `${DAYS[d.getDay()]} ${d.getDate()}`;
}

/** « Aujourd'hui », « Demain », « Jeudi 9 octobre » : titre de section de l'agenda. */
export function longDay(d: Date, today = new Date()): string {
  const diff = Math.round((addDays(d, 0).getTime() - addDays(today, 0).getTime()) / 86400000);
  const base = `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (diff === 0) return `Aujourd’hui · ${base}`;
  if (diff === 1) return `Demain · ${base}`;
  return base;
}

/** Échéance d'une tâche ou d'une réserve : « Aujourd'hui », « Demain », « Hier », « 12 octobre ». */
export function due(dateStr: string, today = new Date()): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const diff = Math.round((addDays(d, 0).getTime() - addDays(today, 0).getTime()) / 86400000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  const s = `${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

/** « 8:30 » -> [8, 30], ou null si l'heure n'est pas valable. */
export function parseHm(v: string): [number, number] | null {
  const m = /^\s*(\d{1,2})\s*[:hH.]\s*(\d{2})?\s*$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? [h, min] : null;
}

/** « pour aujourd'hui », « pour demain », « pour le 12 octobre » */
export function dueFor(dateStr: string, today = new Date()): string {
  const w = due(dateStr, today);
  return /^\d/.test(w) ? `pour le ${w}` : `pour ${w.toLowerCase()}`;
}

/** « 05/10/2026 » */
export function dmy(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** « 05/10/2026 » ou « 5/10/26 » -> « 2026-10-05 », ou null si la date n'existe pas. */
export function parseDmy(v: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(v);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return ymd(d);
}
