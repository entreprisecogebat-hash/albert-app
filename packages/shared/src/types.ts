/**
 * Contrat JSON de l'API Albert. Miroir de api/src/Api/Presenter.php.
 * Toutes les dates sont des chaînes ISO 8601.
 */

export type Iso = string;
export type Visibility = 'team' | 'client';
export type SiteRole = 'manager' | 'worker' | 'client';
export type UserKind = 'staff' | 'client';
export type DocumentType = 'plan' | 'devis' | 'facture' | 'pv' | 'photo' | 'administratif' | 'autre';
export type ChannelKind = 'internal' | 'client';
export type ClassifiedBy = 'rule' | 'fingerprint' | 'title' | 'user' | 'default';
export type FeedFilter = 'all' | 'photos' | 'documents' | 'messages';
export type SearchKind = 'all' | DocumentType | 'photos' | 'messages';

export interface Company {
  id: string;
  name: string;
  aiEnabled: boolean;
}

export interface Actor {
  id: string;
  fullName: string;
  firstName: string;
  kind: UserKind;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string | null;
  kind: UserKind;
  phone?: string;
  phoneDisplay?: string;
  admin?: boolean;
  active?: boolean;
  lastLoginAt?: Iso | null;
  createdAt?: Iso;
}

export interface Me extends User {
  company: Company;
}

/** Les trois temps du CDC : avant, pendant, après chantier. */
export type SitePhase = 'avant' | 'pendant' | 'apres';

export interface Site {
  id: string;
  name: string;
  address: string;
  reference: string | null;
  clientName: string | null;
  startedOn: string | null;
  status: 'active' | 'archived';
  phase: SitePhase;
  /** Date de réception (fin de chantier), point de départ des garanties. */
  deliveredOn: string | null;
  createdAt: Iso;
  lastActivityAt: Iso;
}

export interface SiteCard extends Site {
  role: SiteRole;
  newCount: number;
  awaitingReply: boolean;
  lastActivity: {
    type: string;
    text: string;
    at: Iso;
    marker: 'client' | 'sync';
  } | null;
}

export interface Folder {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  position: number;
  documentsCount?: number;
}

export interface Channel {
  id: string;
  siteId: string;
  kind: ChannelKind;
  awaitingReply: boolean;
  lastMessageAt: Iso | null;
}

export interface SiteCounts {
  documents: number;
  photos: number;
  tasksOpen: number;
  reservesOpen: number;
  interventions: number;
  appointmentsUpcoming: number;
  members: number;
  /** Devis, factures et dépenses non soldés ; null si l'utilisateur n'a pas accès aux finances */
  financesOpen: number | null;
}

export interface SiteDetail extends Site {
  role: SiteRole;
  canManage: boolean;
  channels: Channel[];
  folders: Folder[];
  /** Compteurs des modules du chantier (le client ne voit que ce qui lui est partagé). */
  counts: SiteCounts;
  /** Responsable du chantier ou administrateur : voit et gère les finances du chantier. */
  canSeeFinances: boolean;
  latitude: number | null;
  longitude: number | null;
}

/* ---------- CRM (F-01, F-03) ---------- */

export type ContactKind = 'prospect' | 'client' | 'fournisseur' | 'partenaire' | 'sous_traitant';

export interface SiteRef {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  kind: ContactKind;
  /** Nom de la personne ou de la société */
  name: string;
  companyName: string | null;
  jobTitle: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  sites: SiteRef[];
  createdAt: Iso;
  updatedAt: Iso;
}

export interface ContactDetail extends Contact {
  documents: Document[];
  appointments: Appointment[];
}

export interface ContactInput {
  kind: ContactKind;
  name: string;
  companyName?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  siteIds?: string[];
}

export interface ContactImportResult {
  created: number;
  updated: number;
  skipped: { line: number; reason: string }[];
}

/* ---------- Tâches (F-07, F-18) ---------- */

export type TaskStatus = 'todo' | 'done';
export type TaskPriority = 'normal' | 'urgent';

export interface Task {
  id: string;
  siteId: string;
  siteName: string;
  title: string;
  notes: string | null;
  /** AAAA-MM-JJ */
  dueOn: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  overdue: boolean;
  assignee: Actor | null;
  createdBy: Actor | null;
  createdAt: Iso;
  doneAt: Iso | null;
}

export interface TaskInput {
  title: string;
  notes?: string | null;
  dueOn?: string | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
}

/* ---------- Agenda partagé (F-01 RDV, F-03) ---------- */

export interface Appointment {
  id: string;
  title: string;
  startsAt: Iso;
  endsAt: Iso | null;
  location: string | null;
  notes: string | null;
  site: SiteRef | null;
  contact: { id: string; name: string } | null;
  createdBy: Actor | null;
}

export interface AppointmentInput {
  title: string;
  startsAt: Iso;
  endsAt?: Iso | null;
  location?: string | null;
  notes?: string | null;
  siteId?: string | null;
  contactId?: string | null;
}

/* ---------- Pointage virtuel (F-10, F-11) ---------- */

export interface TimeEntry {
  id: string;
  siteId: string;
  siteName: string;
  user: Actor;
  startedAt: Iso;
  endedAt: Iso | null;
  /** Durée en minutes, calculée à la sortie */
  minutes: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  /** Distance au chantier à l'arrivée, en mètres, si les deux positions sont connues */
  startDistance: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  note: string | null;
}

export interface ClockState {
  open: TimeEntry | null;
  todayMinutes: number;
  weekMinutes: number;
}

export interface ClockInput {
  at?: Iso;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  note?: string | null;
  clientId?: string;
}

/* ---------- Fiche d'intervention (F-12) ---------- */

export type InterventionStatus = 'draft' | 'signed';

export interface Intervention {
  id: string;
  siteId: string;
  siteName: string;
  /** FI-2026-0007 */
  number: string;
  /** AAAA-MM-JJ */
  interventionOn: string;
  title: string;
  workDone: string;
  materials: string | null;
  minutes: number | null;
  technicians: string | null;
  status: InterventionStatus;
  signerName: string | null;
  signedAt: Iso | null;
  signatureUrl: string | null;
  /** PDF généré à la signature, rangé dans le chantier */
  documentId: string | null;
  author: Actor | null;
  createdAt: Iso;
}

export interface InterventionInput {
  interventionOn: string;
  title: string;
  workDone: string;
  materials?: string | null;
  minutes?: number | null;
  technicians?: string | null;
}

/** Signature tracée au doigt : traits en coordonnées normalisées (0..1) dans un cadre de rapport width/height. */
export interface SignatureInput {
  signerName: string;
  strokes: [number, number][][];
  width: number;
  height: number;
}

/* ---------- Réserves, SAV, garanties (F-15) ---------- */

export type ReserveKind = 'reserve' | 'sav' | 'garantie';
export type ReserveStatus = 'open' | 'in_progress' | 'done';

export interface Reserve {
  id: string;
  siteId: string;
  siteName: string;
  kind: ReserveKind;
  title: string;
  description: string | null;
  location: string | null;
  status: ReserveStatus;
  reportedAt: Iso;
  dueOn: string | null;
  doneAt: Iso | null;
  overdue: boolean;
  reportedBy: Actor | null;
  assignee: Actor | null;
  visibility: Visibility;
}

export interface ReserveEvent {
  id: string;
  at: Iso;
  actor: Actor | null;
  status: ReserveStatus | null;
  note: string | null;
}

export interface ReserveDetail extends Reserve {
  history: ReserveEvent[];
  photos: Photo[];
}

export interface ReserveInput {
  kind: ReserveKind;
  title: string;
  description?: string | null;
  location?: string | null;
  dueOn?: string | null;
  assigneeId?: string | null;
  visibility?: Visibility;
}

/* ---------- Partage externe (F-06) ---------- */

export interface ShareLink {
  id: string;
  documentId: string;
  /** Lien public à envoyer, sans compte */
  url: string;
  expiresAt: Iso;
  revokedAt: Iso | null;
  createdAt: Iso;
  createdBy: Actor | null;
  views: number;
  active: boolean;
}

/* ---------- DOE et archivage (F-13, F-14) ---------- */

export interface DoeSection {
  key: string;
  label: string;
  count: number;
}

export interface Doe {
  siteId: string;
  sections: DoeSection[];
  /** Dernier DOE généré (PDF rangé dans le chantier) */
  documentId: string | null;
  generatedAt: Iso | null;
  /** Archive ZIP de toutes les pièces, lien signé */
  zipUrl: string | null;
  /** Lien de transmission (acquéreur, client), si créé */
  share: ShareLink | null;
}

/* ---------- Tableau de priorités (F-18) ---------- */

export type TodayKind =
  | 'clock_open'
  | 'task_overdue'
  | 'task_today'
  | 'client_waiting'
  | 'reserve_overdue'
  | 'reserve_open'
  | 'appointment'
  | 'intervention_unsigned'
  | 'document_new'
  | 'invoice_overdue'
  | 'quote_pending'
  | 'expense_due';

export interface TodayItem {
  id: string;
  kind: TodayKind;
  title: string;
  subtitle: string | null;
  at: Iso | null;
  site: SiteRef | null;
  /** Route de l'application mobile à ouvrir, ex. /chantiers/{id}/taches */
  link: string;
  urgency: 'high' | 'normal';
}

export interface Today {
  /** « Bonjour Karim » */
  greeting: string;
  /** Phrase de synthèse : « 3 points demandent votre attention aujourd'hui. » */
  summary: string;
  generatedBy: 'rules' | 'ai';
  items: TodayItem[];
  appointments: Appointment[];
  clock: ClockState;
  stats: { activeSites: number; openTasks: number; openReserves: number; clientWaiting: number };
}

/* ---------- Résumé des échanges (F-17) ---------- */

export interface ChannelSummary {
  channelId: string;
  generatedBy: 'rules' | 'ai';
  from: Iso | null;
  to: Iso | null;
  messagesCount: number;
  participants: string[];
  /** Questions restées sans réponse */
  openQuestions: { body: string; author: string; at: Iso }[];
  /** Points saillants : dates, décisions, livraisons */
  keyPoints: string[];
  text: string;
}

export interface DocumentVersion {
  id: string;
  number: number;
  label: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  comment: string | null;
  uploadedAt: Iso;
  uploadedBy: Actor | null;
  isCurrent: boolean;
  url: string;
  downloadUrl: string;
  clientId: string | null;
}

export interface Document {
  id: string;
  siteId: string;
  siteName: string;
  title: string;
  type: DocumentType;
  folder: Folder;
  visibility: Visibility;
  classifiedBy: ClassifiedBy;
  /** Fiche CRM liée (F-03, F-07) */
  contact: { id: string; name: string } | null;
  versionsCount: number;
  current: DocumentVersion | null;
  createdBy: Actor | null;
  createdAt: Iso;
  updatedAt: Iso;
}

export interface DocumentHistoryEntry {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  actor: Actor | null;
  occurredAt: Iso;
  recordedAt: Iso;
}

export interface DocumentDetail extends Document {
  versions: DocumentVersion[];
  history: DocumentHistoryEntry[];
  canEdit: boolean;
  /** Pièce financière enregistrée à partir de ce document (devis, facture, dépense), si accès aux finances */
  finance: FinanceRef | null;
}

export interface Photo {
  id: string;
  siteId: string;
  batchId: string;
  url: string;
  thumbUrl: string;
  mimeType: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  takenAt: Iso;
  uploadedAt: Iso;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  caption: string | null;
  visibility: Visibility;
  uploadedBy: Actor | null;
  clientId: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  channelKind: ChannelKind;
  body: string;
  createdAt: Iso;
  receivedAt: Iso;
  author: Actor | null;
  mine: boolean;
  clientId: string | null;
}

export type FeedItemType =
  | 'photos_added'
  | 'document_added'
  | 'document_version'
  | 'document_reclassified'
  | 'message'
  | 'member_added'
  | 'site_created'
  | 'note'
  | 'task_done'
  | 'clock_in'
  | 'clock_out'
  | 'intervention_signed'
  | 'reserve_opened'
  | 'reserve_updated'
  | 'appointment'
  | 'phase_changed'
  | 'doe_generated'
  | 'share_created'
  | 'quote_accepted'
  | 'invoice_sent'
  | 'payment_received';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  subtitle: string | null;
  occurredAt: Iso;
  recordedAt: Iso;
  actor: Actor | null;
  visibility: Visibility;
  documentId: string | null;
  versionLabel: string | null;
  folderName: string | null;
  // photos_added
  photos?: Photo[];
  caption?: string | null;
  takenFrom?: Iso;
  takenTo?: Iso;
  located?: boolean;
  latitude?: number;
  longitude?: number;
  // message
  channel?: ChannelKind;
  body?: string | null;
  awaitingReply?: boolean;
  // modules (tâche, intervention, réserve, rdv) : objet lié à ouvrir
  taskId?: string;
  interventionId?: string;
  reserveId?: string;
  appointmentId?: string;
  financeId?: string;
}

export interface Page<T> {
  items: T[];
  nextBefore?: Iso | null;
}

export interface ClassificationProposal {
  title: string;
  type: DocumentType;
  folder: Folder;
  versionNumber: number;
  versionLabel: string;
  reason: 'rule' | 'fingerprint' | 'title' | 'default';
  statement: string;
  newVersionOf: { id: string; title: string; currentLabel: string | null; currentUploadedAt: Iso | null } | null;
  duplicateOf: { documentId: string; versionId: string; label: string; uploadedAt: Iso } | null;
}

export interface UploadResult {
  document: Document;
  duplicate: boolean;
  replayed: boolean;
}

export type SearchResult =
  | { kind: 'document'; at: Iso; document: Document }
  | { kind: 'version'; at: Iso; document: Document; version: DocumentVersion }
  | { kind: 'photos'; at: Iso; caption: string | null; photos: Photo[] }
  | { kind: 'message'; at: Iso; message: Message };

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  siteId: string | null;
  readAt: Iso | null;
  createdAt: Iso;
}

// ---------- Back-office ----------

export interface SiteStats {
  members: number;
  documents: number;
  photos: number;
  messages: number;
  eventsLast7Days: number;
}

export interface AdminSite extends Site {
  stats: SiteStats;
}

export interface AdminSiteMember {
  id: string;
  role: SiteRole;
  addedAt: Iso;
  lastSeenAt: Iso | null;
  user: User;
}

export interface AdminSiteDetail extends AdminSite {
  members: AdminSiteMember[];
  folders: Folder[];
}

export interface AdminUser extends User {
  sitesCount?: number;
  sites?: { role: SiteRole; site: Site }[];
}

export interface FolderTemplateItem {
  kind: string;
  name: string;
}

export interface ClassificationRule {
  id: string;
  pattern: string;
  type: DocumentType;
  folderKind: string;
  priority: number;
  source: 'default' | 'admin' | 'learned';
  hits: number;
}

export interface RuleTestResult {
  normalized: string;
  title: string;
  version: { number: number | null; label: string | null };
  rule: ClassificationRule | null;
}

export interface Overview {
  company: Company;
  counts: {
    activeSites: number;
    archivedSites: number;
    staff: number;
    clients: number;
    documents: number;
    photos: number;
    eventsLast7Days: number;
  };
  classification: Partial<Record<ClassifiedBy, number>>;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string> | null;
  devCode?: string;
}

/* ---------- Finances : devis, factures, dépenses (repris de l'app Android 0.2) ----------
 * Montants en centimes entiers, TVA en points de base (2000 = 20 %), arrondi commercial.
 * Suivi opérationnel, pas une comptabilité certifiée.
 * Droits : responsables du chantier et administrateurs. L'équipe ne voit pas les finances ;
 * le client voit ses devis et factures émis (pas les dépenses, pas les brouillons), en lecture seule.
 */

export type FinanceKind = 'devis' | 'facture' | 'depense';

/**
 * devis   : draft -> sent -> accepted | refused
 * facture : draft -> sent -> partially_paid -> paid (le numéro F-AAAA-NNNN est attribué à l'émission, sans trou)
 * depense : to_pay -> paid
 */
export type FinanceStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'partially_paid' | 'paid' | 'to_pay';

export type ExpenseCategory = 'materiaux' | 'sous_traitance' | 'location' | 'main_oeuvre' | 'autre';
export type PaymentMethod = 'virement' | 'cheque' | 'especes' | 'carte' | 'autre';
export type ReminderChannel = 'telephone' | 'email' | 'courrier' | 'sms';

export interface FinanceRef {
  id: string;
  kind: FinanceKind;
  number: string | null;
  title: string;
  status: FinanceStatus;
  amountTtc: number;
}

export interface FinanceEntry {
  id: string;
  siteId: string;
  siteName: string;
  kind: FinanceKind;
  /** D-2026-0012, F-2026-0034 ; pour une dépense, la référence du fournisseur. Null pour une facture brouillon. */
  number: string | null;
  title: string;
  status: FinanceStatus;
  category: ExpenseCategory | null;
  /** Client (devis, facture) ou fournisseur (dépense) */
  contact: { id: string; name: string } | null;
  /** Pièce jointe dans les documents du chantier (F-07) */
  documentId: string | null;
  /** Pour une facture : le devis d'origine */
  quoteId: string | null;
  /** Centimes */
  amountHt: number;
  /** Points de base : 2000, 1000, 550, 0 */
  vatRate: number;
  amountVat: number;
  amountTtc: number;
  paid: number;
  remaining: number;
  /** AAAA-MM-JJ */
  issuedOn: string | null;
  /** Échéance de paiement ; pour un devis, fin de validité */
  dueOn: string | null;
  /** Facture ou dépense échue non soldée ; devis envoyé sans réponse après sa validité */
  overdue: boolean;
  remindersCount: number;
  lastReminderAt: Iso | null;
  notes: string | null;
  createdBy: Actor | null;
  createdAt: Iso;
  updatedAt: Iso;
}

export interface FinancePayment {
  id: string;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
  createdBy: Actor | null;
  createdAt: Iso;
}

export interface FinanceReminder {
  id: string;
  at: Iso;
  channel: ReminderChannel;
  note: string | null;
  by: Actor | null;
}

export interface FinanceDetail extends FinanceEntry {
  payments: FinancePayment[];
  reminders: FinanceReminder[];
  /** Pour un devis : factures déjà établies (acomptes, situations, solde) */
  invoices: FinanceRef[];
  /** Pour un devis : part déjà facturée, de 0 à 1 */
  invoicedPercent: number | null;
  canEdit: boolean;
}

export interface FinanceInput {
  kind: FinanceKind;
  title: string;
  number?: string | null;
  status?: FinanceStatus;
  category?: ExpenseCategory | null;
  contactId?: string | null;
  documentId?: string | null;
  quoteId?: string | null;
  amountHt: number;
  vatRate: number;
  issuedOn?: string | null;
  dueOn?: string | null;
  notes?: string | null;
}

export interface PaymentInput {
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note?: string | null;
}

export interface FinanceSummary {
  /** Devis acceptés, HT */
  quotedHt: number;
  /** Devis envoyés en attente de réponse, HT */
  quotesPendingHt: number;
  invoicedHt: number;
  invoicedTtc: number;
  /** Encaissé sur les factures, TTC */
  paidTtc: number;
  /** Reste à encaisser, TTC */
  outstandingTtc: number;
  /** Dont échu */
  overdueTtc: number;
  expensesHt: number;
  /** Dépenses restant à payer, TTC */
  expensesToPayTtc: number;
  /** Marge prévisionnelle : devis acceptés HT - dépenses HT */
  marginHt: number;
  /** marginHt / quotedHt, null si aucun devis accepté */
  marginRate: number | null;
}

export interface FinanceList {
  items: FinanceEntry[];
  summary: FinanceSummary;
}
