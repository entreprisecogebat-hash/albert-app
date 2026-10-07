import type { ClassifiedBy, ContactKind, ExpenseCategory, FinanceKind, FinanceStatus, PaymentMethod, ReminderChannel, DocumentType, InterventionStatus, ReserveKind, ReserveStatus, SitePhase, SiteRole, TaskPriority } from './types';

/** Libellés d'interface. Un mot simple, jamais de jargon technique. */

export const roleLabel: Record<SiteRole, string> = {
  manager: 'Responsable du chantier',
  worker: 'Équipe',
  client: 'Client',
};

export const docTypeLabel: Record<DocumentType, string> = {
  plan: 'Plan',
  devis: 'Devis',
  facture: 'Facture',
  pv: 'PV ou compte rendu',
  photo: 'Photo',
  administratif: 'Administratif',
  autre: 'Autre',
};

/** Filtres de la recherche, dans l'ordre des maquettes */
export const searchFilters: { kind: 'all' | DocumentType | 'photos' | 'messages'; label: string }[] = [
  { kind: 'all', label: 'Tout' },
  { kind: 'plan', label: 'Plans' },
  { kind: 'devis', label: 'Devis' },
  { kind: 'photos', label: 'Photos' },
  { kind: 'messages', label: 'Messages' },
  { kind: 'facture', label: 'Factures' },
  { kind: 'pv', label: 'PV' },
];

/** Filtres du fil */
export const feedFilters: { filter: 'all' | 'photos' | 'documents' | 'messages'; label: string }[] = [
  { filter: 'all', label: 'Tout' },
  { filter: 'photos', label: 'Photos' },
  { filter: 'documents', label: 'Documents' },
  { filter: 'messages', label: 'Messages' },
];

export const classifiedByLabel: Record<ClassifiedBy, string> = {
  rule: 'Classé automatiquement',
  fingerprint: 'Reconnu par son empreinte',
  title: 'Reconnu par son titre',
  user: 'Classé à la main',
  default: 'Rangé par défaut',
};

export const channelLabel = {
  internal: 'Équipe',
  client: 'Canal client',
} as const;

export const phaseLabel: Record<SitePhase, string> = {
  avant: 'Avant chantier',
  pendant: 'En cours',
  apres: 'Après chantier',
};

export const contactKindLabel: Record<ContactKind, string> = {
  prospect: 'Prospect',
  client: 'Client',
  fournisseur: 'Fournisseur',
  partenaire: 'Partenaire',
  sous_traitant: 'Sous-traitant',
};

export const reserveKindLabel: Record<ReserveKind, string> = {
  reserve: 'Réserve',
  sav: 'SAV',
  garantie: 'Garantie',
};

export const reserveStatusLabel: Record<ReserveStatus, string> = {
  open: 'À traiter',
  in_progress: 'En cours',
  done: 'Levée',
};

export const interventionStatusLabel: Record<InterventionStatus, string> = {
  draft: 'À signer',
  signed: 'Signée',
};

export const taskPriorityLabel: Record<TaskPriority, string> = {
  normal: 'Normale',
  urgent: 'Urgent',
};

/** "7 h 30", "45 min" */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export const financeKindLabel: Record<FinanceKind, string> = {
  devis: 'Devis',
  facture: 'Facture',
  depense: 'Dépense',
};

export const financeStatusLabel: Record<FinanceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  refused: 'Refusé',
  partially_paid: 'Payée en partie',
  paid: 'Payé',
  to_pay: 'À payer',
};

/** Statut accordé au type de pièce : « Envoyée » pour une facture, « Envoyé » pour un devis. */
export function financeStatusText(kind: FinanceKind, status: FinanceStatus): string {
  if (kind === 'facture' || kind === 'depense') {
    const fem: Partial<Record<FinanceStatus, string>> = { sent: 'Envoyée', paid: 'Payée', partially_paid: 'Payée en partie', to_pay: 'À payer' };
    return fem[status] ?? financeStatusLabel[status];
  }
  return financeStatusLabel[status];
}

export const expenseCategoryLabel: Record<ExpenseCategory, string> = {
  materiaux: 'Matériaux',
  sous_traitance: 'Sous-traitance',
  location: 'Location de matériel',
  main_oeuvre: 'Main-d’œuvre',
  autre: 'Autre',
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
  carte: 'Carte',
  autre: 'Autre',
};

export const reminderChannelLabel: Record<ReminderChannel, string> = {
  telephone: 'Appel',
  email: 'Email',
  courrier: 'Courrier',
  sms: 'SMS',
};

/** Taux de TVA du bâtiment, en points de base */
export const vatRates: { bps: number; label: string }[] = [
  { bps: 2000, label: '20 %' },
  { bps: 1000, label: '10 %' },
  { bps: 550, label: '5,5 %' },
  { bps: 0, label: '0 % (autoliquidation)' },
];
