/**
 * Lecture du nom de fichier, identique à api/src/Classification/TitleNormalizer.php.
 * Utilisée par le téléphone pour présenter le classement même sans réseau :
 * "Albert a reconnu un plan, version 3." apparaît avant tout envoi.
 * Les deux implémentations partagent les cas de test de classification-cases.json.
 */

import type { DocumentType } from './types';

const NOISE = new Set(['final', 'finale', 'def', 'definitif', 'definitive', 'copie', 'copy', 'new', 'nouveau', 'nouvelle', 'maj', 'ok', 'bis', 'version', 'scan', 'signe', 'signee']);
const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'un', 'une', 'n', 'no']);

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}+/gu, '');
}

/** "Plan_calepinage_FINAL_v3.pdf" -> "plan calepinage final v3" */
export function normalizeName(filename: string): string {
  const base = filename.trim().replace(/\.[a-z0-9]{1,5}$/i, '');
  return stripAccents(base)
    .toLowerCase()
    .replace(/[_\-.+()[\]]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface ExtractedVersion {
  number: number | null;
  label: string | null;
}

export function extractVersion(filename: string): ExtractedVersion {
  const n = normalizeName(filename);
  let m = /\b(?:v|version|vers)\s?(\d{1,3})\b/u.exec(n);
  if (m) return { number: Number(m[1]), label: `V${Number(m[1])}` };
  m = /\b(?:ind|indice)\s?([a-z])\b/u.exec(n);
  if (m) {
    const letter = m[1]!.toUpperCase();
    return { number: letter.charCodeAt(0) - 64, label: `Ind. ${letter}` };
  }
  m = /\brev\s?(\d{1,3})\b/u.exec(n);
  if (m) return { number: Number(m[1]), label: `Rev. ${Number(m[1])}` };
  return { number: null, label: null };
}

/** Forme stable d'une version à l'autre : rattache la V3 à la V2. */
export function normalizeTitle(filenameOrTitle: string): string {
  let n = normalizeName(filenameOrTitle);
  n = n.replace(/\b(?:v|version|vers)\s?\d{1,3}\b/gu, ' ');
  n = n.replace(/\b(?:ind|indice)\s?[a-z]\b/gu, ' ');
  n = n.replace(/\brev\s?\d{1,3}\b/gu, ' ');
  n = n.replace(/\b\d{8}\b|\b\d{4}\s\d{2}\s\d{2}\b|\b\d{2}\s\d{2}\s\d{2,4}\b/gu, ' ');
  n = n.replace(/['’°]/gu, ' ');
  return n
    .split(' ')
    .filter((w) => w !== '' && !NOISE.has(w) && !STOP.has(w) && !/^\d$/.test(w))
    .join(' ');
}

/** "Plan_calepinage_final_v3.pdf" -> "Plan calepinage" */
export function displayTitle(filename: string): string {
  let s = filename.trim().replace(/\.[a-z0-9]{1,5}$/i, '');
  s = s.replace(/[_\-.+]+/gu, ' ');
  s = s.replace(/\b(?:v|version|vers)\s?\d{1,3}\b/giu, ' ');
  s = s.replace(/\b(?:ind|indice)\.?\s?[a-z]\b/giu, ' ');
  s = s.replace(/\brev\.?\s?\d{1,3}\b/giu, ' ');
  s = s.replace(/\b\d{8}\b|\b\d{4}\s\d{2}\s\d{2}\b|\b\d{2}\s\d{2}\s\d{2,4}\b/gu, ' ');
  const words = s.split(/\s+/u).filter((w) => {
    const plain = stripAccents(w).toLowerCase();
    return w !== '' && !NOISE.has(plain) && !/^\(?\d\)?$/.test(w);
  });
  let title = words.join(' ').trim();
  if (title === '') return 'Document';
  if (title.toUpperCase() === title) title = title.toLowerCase();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Règles livrées par défaut (copie de ClassificationRule::DEFAULTS), utilisées hors ligne. */
export const DEFAULT_RULES: { pattern: string; type: DocumentType; folderKind: string }[] = [
  { pattern: '\\b(plan|plans|calepinage|coupe|facade|elevation|niveau|r\\+?\\d|dwg|archi)\\b', type: 'plan', folderKind: 'plans' },
  { pattern: '\\b(devis|dqe|dpgf|chiffrage|proposition)\\b', type: 'devis', folderKind: 'devis' },
  { pattern: '\\b(facture|fact|fa|avoir|situation)\\b', type: 'facture', folderKind: 'factures' },
  { pattern: '\\b(pv|proces[ -]?verbal|compte[ -]?rendu|cr|reception|reserves?|osr|os)\\b', type: 'pv', folderKind: 'pv' },
  { pattern: '\\b(kbis|attestation|assurance|decennale|urssaf|contrat|dict|ppsps|doe)\\b', type: 'administratif', folderKind: 'administratif' },
];

export function matchRule<R extends { pattern: string }>(filename: string, rules: R[]): R | null {
  const name = normalizeName(filename);
  for (const r of rules) {
    try {
      if (new RegExp(r.pattern, 'iu').test(name)) return r;
    } catch {
      // motif invalide : ignoré
    }
  }
  return null;
}

const TYPE_LABEL: Record<DocumentType, string> = {
  plan: 'un plan',
  devis: 'un devis',
  facture: 'une facture',
  pv: 'un PV',
  photo: 'une photo',
  administratif: 'un document administratif',
  autre: 'un document',
};

export function typeArticle(t: DocumentType): string {
  return TYPE_LABEL[t];
}

export interface OfflinePreview {
  title: string;
  type: DocumentType;
  folderKind: string;
  versionNumber: number;
  versionLabel: string;
  statement: string;
  /** Document connu du téléphone dont ce fichier serait la nouvelle version */
  newVersionOf: { id: string; title: string; currentLabel: string | null } | null;
}

/**
 * Classement présenté sans réseau, à partir des documents déjà en cache sur le téléphone.
 * Le serveur refait le calcul à la réception et fait foi.
 */
export function previewOffline(
  filename: string,
  knownDocuments: { id: string; title: string; type: DocumentType; folder: { kind: string }; versionsCount: number; current: { label: string } | null }[],
  mimeType?: string,
): OfflinePreview {
  const normalized = normalizeTitle(filename);
  const version = extractVersion(filename);
  const existing = normalized ? knownDocuments.find((d) => normalizeTitle(d.title) === normalized) : undefined;
  const rule = matchRule(filename, DEFAULT_RULES);

  if (existing) {
    let number = existing.versionsCount + 1;
    if (version.number !== null && version.number > existing.versionsCount) number = version.number;
    // L'indice lu dans le nom ne sert que s'il fait avancer la série : jamais deux "V3".
    const label = number === version.number && version.label ? version.label : `V${number}`;
    return {
      title: existing.title,
      type: existing.type,
      folderKind: existing.folder.kind,
      versionNumber: number,
      versionLabel: label,
      statement: `Albert a reconnu ${typeArticle(existing.type)}, version ${label.replace(/^V/, '')}.`,
      newVersionOf: { id: existing.id, title: existing.title, currentLabel: existing.current?.label ?? null },
    };
  }

  const isImage = !!mimeType && mimeType.startsWith('image/');
  const type: DocumentType = rule?.type ?? (isImage ? 'photo' : 'autre');
  const number = version.number ?? 1;
  const label = version.label ?? `V${number}`;
  return {
    title: displayTitle(filename),
    type,
    folderKind: rule?.folderKind ?? (isImage ? 'photos' : 'divers'),
    versionNumber: number,
    versionLabel: label,
    statement: `Albert a reconnu ${typeArticle(type)}${number > 1 ? `, version ${label.replace(/^V/, '')}` : ''}.`,
    newVersionOf: null,
  };
}
