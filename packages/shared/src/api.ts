import type {
  AdminSite,
  AdminSiteDetail,
  AdminSiteMember,
  AdminUser,
  ApiErrorBody,
  Appointment,
  AppointmentInput,
  AssistantProposal,
  Channel,
  ChannelSummary,
  ClockInput,
  ClockState,
  Contact,
  ContactDetail,
  ContactImportResult,
  ContactInput,
  ContactKind,
  Doe,
  FinanceDetail,
  FinanceInput,
  FinanceKind,
  FinanceList,
  FinanceStatus,
  PaymentInput,
  ReminderChannel,
  Intervention,
  InterventionInput,
  Reserve,
  ReserveDetail,
  ReserveInput,
  ReserveKind,
  ReserveStatus,
  ShareLink,
  SignatureInput,
  SitePhase,
  Task,
  TaskInput,
  TaskStatus,
  TimeEntry,
  Today,
  ClassificationProposal,
  ClassificationRule,
  Document,
  DocumentDetail,
  FeedFilter,
  FeedItem,
  Folder,
  FolderTemplateItem,
  Me,
  Message,
  Notification,
  Overview,
  Page,
  Photo,
  RuleTestResult,
  SearchKind,
  SearchResult,
  Site,
  SiteCard,
  SiteDetail,
  SiteRole,
  UploadResult,
  User,
  Visibility,
} from './types';

/** Erreur de l'API, avec un message déjà rédigé pour l'utilisateur. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error ?? 'Une erreur est survenue.');
    this.status = status;
    this.code = body.code ?? 'unknown';
    this.fields = body.fields ?? {};
  }

  /** Pas de réseau, ou serveur injoignable : l'action peut attendre dans la file. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
  /** Délai avant d'abandonner une requête (ms). Sur un chantier, le réseau peut être très lent. */
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(q?: Query): string {
  if (!q) return '';
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Client de l'API, écrit une fois pour l'application mobile et le back-office.
 * Les envois de fichiers prennent un FormData construit par l'appelant
 * ({ uri, name, type } sur React Native, Blob sur le web).
 */
export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const token = await opts.getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000) : undefined;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}${qs(query)}`, { method, headers, body: payload, signal: controller?.signal });
    } catch {
      throw new ApiError(0, { error: 'Pas de réseau pour le moment.', code: 'network' });
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: 'Réponse illisible du serveur.', code: 'bad_response' };
      }
    }
    if (!res.ok) {
      if (res.status === 401) opts.onUnauthorized?.();
      throw new ApiError(res.status, (data as ApiErrorBody) ?? {});
    }
    return data as T;
  }

  const get = <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query);
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
  const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
  const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
  const del = <T>(path: string) => request<T>('DELETE', path);

  return {
    baseUrl: base,
    request,

    auth: {
      requestCode: (phone: string) =>
        post<{ sent: boolean; phone: string; phoneDisplay: string; resendIn: number; devCode?: string }>('/api/auth/request-code', { phone }),
      verify: (phone: string, code: string, deviceName?: string) =>
        post<{ token: string; user: Me }>('/api/auth/verify', { phone, code, deviceName }),
      me: () => get<Me>('/api/auth/me'),
      logout: () => post<{ ok: true }>('/api/auth/logout'),
    },

    sites: {
      list: (q?: string) => get<{ items: SiteCard[] }>('/api/sites', { q }),
      get: (id: string) => get<SiteDetail>(`/api/sites/${id}`),
      create: (data: { name: string; address: string; reference?: string; clientName?: string; startedOn?: string }) =>
        post<SiteDetail>('/api/sites', data),
      seen: (id: string) => post<{ ok: true }>(`/api/sites/${id}/seen`),
      feed: (id: string, filter: FeedFilter = 'all', before?: string | null) =>
        get<Page<FeedItem>>(`/api/sites/${id}/feed`, { filter, before }),
      folders: (id: string) => get<{ items: Folder[] }>(`/api/sites/${id}/folders`),
      members: (id: string) => get<{ items: { role: SiteRole; user: User }[] }>(`/api/sites/${id}/members`),
      search: (id: string, q: string, kind: SearchKind = 'all') =>
        get<{ items: SearchResult[]; query: string; kind: SearchKind }>(`/api/sites/${id}/search`, { q, kind }),
      photos: (id: string, batchId?: string) => get<{ items: Photo[] }>(`/api/sites/${id}/photos`, { batchId }),
    },

    documents: {
      list: (siteId: string, query: { q?: string; type?: string; folderId?: string } = {}) =>
        get<{ items: Document[] }>(`/api/sites/${siteId}/documents`, query),
      analyze: (siteId: string, filename: string, sha256?: string, mimeType?: string) =>
        post<ClassificationProposal>(`/api/sites/${siteId}/documents/analyze`, { filename, sha256, mimeType }),
      upload: (siteId: string, form: FormData) => request<UploadResult>('POST', `/api/sites/${siteId}/documents`, form),
      uploadVersion: (documentId: string, form: FormData) =>
        request<UploadResult>('POST', `/api/documents/${documentId}/versions`, form),
      get: (id: string) => get<DocumentDetail>(`/api/documents/${id}`),
      update: (id: string, data: { title?: string; type?: string; folderId?: string; visibility?: Visibility; contactId?: string | null }) =>
        patch<Document>(`/api/documents/${id}`, data),
    },

    photos: {
      upload: (siteId: string, form: FormData) => request<{ photo: Photo; replayed: boolean }>('POST', `/api/sites/${siteId}/photos`, form),
      get: (id: string) => get<Photo>(`/api/photos/${id}`),
    },

    channels: {
      messages: (channelId: string, query: { before?: string; after?: string; limit?: number } = {}) =>
        get<{ channel: Channel; items: Message[] }>(`/api/channels/${channelId}/messages`, query),
      send: (channelId: string, body: string, clientId: string, createdAt?: string) =>
        post<Message>(`/api/channels/${channelId}/messages`, { body, clientId, createdAt }),
      /** Note vocale (multipart : file, durationMs, clientId, createdAt), rangée dans la conversation de l'équipe. */
      voice: (siteId: string, form: FormData) => request<Message>('POST', `/api/sites/${siteId}/voice-notes`, form),
    },

    /** F-18 : tableau de priorités du jour, calculé par règles (IA activable par entreprise). */
    today: () => get<Today>('/api/today'),

    siteAdmin: {
      /** Phase et archivage (F-14), responsables du chantier. */
      update: (id: string, data: { phase?: SitePhase; status?: 'active' | 'archived'; deliveredOn?: string | null }) =>
        patch<SiteDetail>(`/api/sites/${id}`, data),
    },

    contacts: {
      list: (query: { q?: string; kind?: ContactKind; siteId?: string } = {}) => get<{ items: Contact[] }>('/api/contacts', query),
      get: (id: string) => get<ContactDetail>(`/api/contacts/${id}`),
      create: (data: ContactInput) => post<Contact>('/api/contacts', data),
      update: (id: string, data: Partial<ContactInput>) => patch<Contact>(`/api/contacts/${id}`, data),
      /** Import CSV (export Excel « CSV UTF-8 », séparateur ; ou ,) : nom, société, type, téléphone, email, adresse, notes */
      import: (form: FormData) => request<ContactImportResult>('POST', '/api/contacts/import', form),
    },

    tasks: {
      list: (query: { siteId?: string; status?: TaskStatus; mine?: boolean } = {}) => get<{ items: Task[] }>('/api/tasks', query),
      create: (siteId: string, data: TaskInput) => post<Task>(`/api/sites/${siteId}/tasks`, data),
      update: (id: string, data: Partial<TaskInput> & { status?: TaskStatus }) => patch<Task>(`/api/tasks/${id}`, data),
    },

    appointments: {
      list: (query: { from?: string; to?: string; siteId?: string; contactId?: string } = {}) =>
        get<{ items: Appointment[] }>('/api/appointments', query),
      create: (data: AppointmentInput) => post<Appointment>('/api/appointments', data),
      update: (id: string, data: Partial<AppointmentInput>) => patch<Appointment>(`/api/appointments/${id}`, data),
      remove: (id: string) => del<{ ok: true }>(`/api/appointments/${id}`),
    },

    assistant: {
      /** Commande dictée (multipart : file) ou écrite ({ text }), avec le chantier affiché s'il y en a un. */
      command: (input: FormData | { text: string; siteId?: string | null }) =>
        input instanceof FormData ? request<AssistantProposal>('POST', '/api/assistant/command', input) : post<AssistantProposal>('/api/assistant/command', input),
    },

    clock: {
      state: () => get<ClockState>('/api/clock'),
      in: (siteId: string, data: ClockInput = {}) => post<TimeEntry>(`/api/sites/${siteId}/clock/in`, data),
      out: (data: ClockInput = {}) => post<TimeEntry>('/api/clock/out', data),
      /** Responsable : toute l'équipe ; compagnon : ses propres pointages. */
      entries: (siteId: string, from?: string) => get<{ items: TimeEntry[]; totalMinutes: number }>(`/api/sites/${siteId}/time-entries`, { from }),
    },

    interventions: {
      list: (siteId: string) => get<{ items: Intervention[] }>(`/api/sites/${siteId}/interventions`),
      create: (siteId: string, data: InterventionInput) => post<Intervention>(`/api/sites/${siteId}/interventions`, data),
      get: (id: string) => get<Intervention>(`/api/interventions/${id}`),
      update: (id: string, data: Partial<InterventionInput>) => patch<Intervention>(`/api/interventions/${id}`, data),
      sign: (id: string, data: SignatureInput) => post<Intervention>(`/api/interventions/${id}/sign`, data),
    },

    reserves: {
      list: (query: { siteId?: string; status?: ReserveStatus | 'not_done'; kind?: ReserveKind } = {}) =>
        get<{ items: Reserve[] }>('/api/reserves', query),
      create: (siteId: string, data: ReserveInput) => post<Reserve>(`/api/sites/${siteId}/reserves`, data),
      get: (id: string) => get<ReserveDetail>(`/api/reserves/${id}`),
      update: (id: string, data: Partial<ReserveInput> & { status?: ReserveStatus; note?: string | null }) =>
        patch<ReserveDetail>(`/api/reserves/${id}`, data),
    },

    shares: {
      list: (documentId: string) => get<{ items: ShareLink[] }>(`/api/documents/${documentId}/shares`),
      create: (documentId: string, days = 7) => post<ShareLink>(`/api/documents/${documentId}/shares`, { days }),
      revoke: (id: string) => del<{ ok: true }>(`/api/shares/${id}`),
    },

    doe: {
      get: (siteId: string) => get<Doe>(`/api/sites/${siteId}/doe`),
      generate: (siteId: string) => post<Doe>(`/api/sites/${siteId}/doe`),
      /** Lien de transmission du DOE (30 jours par défaut) */
      share: (siteId: string, days = 30) => post<Doe>(`/api/sites/${siteId}/doe/share`, { days }),
    },

    finances: {
      /** Liste et totaux. status accepte aussi 'unpaid' (non soldé) et 'overdue' (échu). */
      list: (query: { siteId?: string; kind?: FinanceKind; status?: FinanceStatus | 'unpaid' | 'overdue'; contactId?: string } = {}) =>
        get<FinanceList>('/api/finances', query),
      create: (siteId: string, data: FinanceInput) => post<FinanceDetail>(`/api/sites/${siteId}/finances`, data),
      get: (id: string) => get<FinanceDetail>(`/api/finances/${id}`),
      update: (id: string, data: Partial<FinanceInput>) => patch<FinanceDetail>(`/api/finances/${id}`, data),
      /** Seulement un brouillon : un devis ou une facture émis ne s'effacent pas. */
      remove: (id: string) => del<{ ok: true }>(`/api/finances/${id}`),
      addPayment: (id: string, data: PaymentInput) => post<FinanceDetail>(`/api/finances/${id}/payments`, data),
      removePayment: (paymentId: string) => del<FinanceDetail>(`/api/payments/${paymentId}`),
      addReminder: (id: string, data: { channel: ReminderChannel; note?: string | null }) =>
        post<FinanceDetail>(`/api/finances/${id}/reminders`, data),
      /** Facture brouillon depuis un devis accepté : acompte ou situation en % du devis, ou le solde si percent absent. */
      invoiceFromQuote: (quoteId: string, data: { percent?: number; title?: string } = {}) =>
        post<FinanceDetail>(`/api/finances/${quoteId}/invoice`, data),
      /** Export CSV pour le comptable (séparateur ;, montants en euros) */
      exportUrl: (query: { siteId?: string; from?: string; to?: string } = {}) => `${base}/api/finances/export.csv${qs(query)}`,
    },

    summaries: {
      channel: (channelId: string) => get<ChannelSummary>(`/api/channels/${channelId}/summary`),
    },

    account: {
      registerDevice: (token: string, platform: 'ios' | 'android' | 'web') => post<{ ok: true }>('/api/devices', { token, platform }),
      notifications: () => get<{ items: Notification[]; unread: number }>('/api/notifications'),
      markNotificationsRead: () => post<{ ok: true }>('/api/notifications/read'),
    },

    admin: {
      overview: () => get<Overview>('/api/admin/overview'),
      sites: (q?: string, status?: string) => get<{ items: AdminSite[] }>('/api/admin/sites', { q, status }),
      site: (id: string) => get<AdminSiteDetail>(`/api/admin/sites/${id}`),
      createSite: (data: { name: string; address: string; reference?: string; clientName?: string; startedOn?: string }) =>
        post<AdminSite>('/api/admin/sites', data),
      updateSite: (id: string, data: Partial<Pick<Site, 'name' | 'address' | 'reference' | 'clientName' | 'startedOn' | 'status'>>) =>
        patch<AdminSite>(`/api/admin/sites/${id}`, data),
      addMember: (siteId: string, userId: string, role: SiteRole) =>
        post<{ id: string; role: SiteRole; user: User }>(`/api/admin/sites/${siteId}/members`, { userId, role }),
      removeMember: (siteId: string, memberId: string) => del<{ ok: true }>(`/api/admin/sites/${siteId}/members/${memberId}`),
      addFolder: (siteId: string, name: string) => post<Folder>(`/api/admin/sites/${siteId}/folders`, { name }),
      activity: (siteId: string, filter?: FeedFilter, before?: string) =>
        get<{ items: FeedItem[] }>(`/api/admin/sites/${siteId}/activity`, { filter: filter === 'all' ? undefined : filter, before }),
      exportUrl: (siteId: string) => `${base}/api/admin/sites/${siteId}/export.csv`,
      users: (q?: string, kind?: string) => get<{ items: AdminUser[] }>('/api/admin/users', { q, kind }),
      user: (id: string) => get<AdminUser>(`/api/admin/users/${id}`),
      createUser: (data: { phone: string; firstName: string; lastName: string; jobTitle?: string; kind: 'staff' | 'client'; admin?: boolean }) =>
        post<AdminUser>('/api/admin/users', data),
      updateUser: (id: string, data: Partial<{ phone: string; firstName: string; lastName: string; jobTitle: string | null; kind: 'staff' | 'client'; admin: boolean; active: boolean }>) =>
        patch<AdminUser>(`/api/admin/users/${id}`, data),
      folderTemplate: () => get<{ items: FolderTemplateItem[] }>('/api/admin/folder-template'),
      saveFolderTemplate: (items: FolderTemplateItem[]) => put<{ items: FolderTemplateItem[] }>('/api/admin/folder-template', { items }),
      rules: () => get<{ items: ClassificationRule[] }>('/api/admin/rules'),
      createRule: (data: Omit<ClassificationRule, 'id' | 'source' | 'hits'>) => post<ClassificationRule>('/api/admin/rules', data),
      updateRule: (id: string, data: Omit<ClassificationRule, 'id' | 'source' | 'hits'>) => put<ClassificationRule>(`/api/admin/rules/${id}`, data),
      deleteRule: (id: string) => del<{ ok: true }>(`/api/admin/rules/${id}`),
      testRules: (filename: string) => post<RuleTestResult>('/api/admin/rules/test', { filename }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { AdminSiteMember };
