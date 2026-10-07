import { feedFilters, fmt, phaseLabel, type FeedFilter, type FeedItem } from '@albert/shared';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Archive, CalendarClock, Camera, CheckSquare, ChevronLeft, Clock, Euro, FolderOpen, LogIn, MessageSquare, PenLine, Plus,
  Search, Settings2, Users, Wrench,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { useOutbox } from '../../../lib/outbox';
import { Chips, Empty, ErrorText, Loading, NetBanner } from '../../../ui/components';
import { FeedRow, PendingRow, feedCard } from '../../../ui/feed';
import {
  ActionRow, AvatarStack, Hero, Panel, PhaseSteps, Pill, Progress, QuickAction, QuickActions, Section, Segmented, Sheet, compactMoney, kit,
} from '../../../ui/kit';
import { colors, font, space, t } from '../../../ui/theme';

type Tab = 'resume' | 'fil' | 'dossier';

/**
 * La fiche chantier, en trois temps :
 *  - Résumé : où en est le chantier et ce qui attend une action (ouvert par défaut) ;
 *  - Activité : le fil horodaté, la preuve ;
 *  - Dossier : tout le reste, rangé (documents, interventions, réserves, finances, DOE…).
 * Les raccourcis de terrain (photo, message, tâche, pointage) restent sous le pouce.
 */
export default function SiteScreen() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const online = useOnline();
  const { outbox, state } = useOutbox();
  const [tab, setTab] = useState<Tab>(tabParam ?? 'resume');
  const [filter, setFilter] = useState<FeedFilter>('all');

  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const cards = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const card = cards.data?.items.find((s) => s.id === id);
  const d = site.data;
  const isClient = d?.role === 'client';

  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.sites.members(id) });
  const tasks = useQuery({ queryKey: ['tasks', id, 'todo'], queryFn: () => api.tasks.list({ siteId: id, status: 'todo' }), enabled: !!d && !isClient });
  const appts = useQuery({
    queryKey: ['appointments', id, 'next'],
    queryFn: () => api.appointments.list({ siteId: id, from: new Date().toISOString() }),
    enabled: !!d,
  });
  const finances = useQuery({
    queryKey: ['finances', id],
    queryFn: () => api.finances.list({ siteId: id }),
    enabled: !!d && (d.canSeeFinances || isClient),
    retry: false,
  });
  const feed = useInfiniteQuery({
    queryKey: ['feed', id, filter],
    queryFn: ({ pageParam }) => api.sites.feed(id, filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? null,
    enabled: tab === 'fil',
  });
  // Documents gardés en cache : servent au classement hors ligne au moment du dépôt.
  useQuery({ queryKey: ['documents', id], queryFn: () => api.documents.list(id) });

  const seen = useMutation({ mutationFn: () => api.sites.seen(id) });
  useEffect(() => {
    if (online) seen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const items: FeedItem[] = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const pending = outbox.forSite(id).filter((e) =>
    filter === 'all' || (filter === 'photos' && e.kind === 'photo') || (filter === 'documents' && e.kind === 'document') || (filter === 'messages' && e.kind === 'message'),
  );
  void state;

  const c = d?.counts;
  const channels = d?.channels ?? [];
  const clientChannel = channels.find((ch) => ch.kind === 'client');
  const team = (members.data?.items ?? []).filter((m) => m.role !== 'client').map((m) => m.user.fullName);
  const openTasks = tasks.data?.items ?? [];
  const lateTasks = openTasks.filter((tk) => tk.overdue);
  const next = appts.data?.items[0];
  const fin = finances.data?.summary;
  const showFinances = !!d && (d.canSeeFinances || (isClient && (finances.data?.items.length ?? 0) > 0));

  const openItem = (it: FeedItem) => {
    if (it.financeId) go(`/finances/${it.financeId}`);
    else if (it.documentId) router.push({ pathname: '/documents/[id]', params: { id: it.documentId } });
    else if (it.type === 'message' && it.channel) router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: it.channel } });
    else if (it.type === 'photos_added' && it.photos?.length) router.push({ pathname: '/photo', params: { siteId: id, batchId: it.photos[0]!.batchId } });
    else if (it.interventionId) go(`/interventions/${it.interventionId}`);
    else if (it.reserveId) go(`/reserves/${it.reserveId}`);
    else if (it.taskId) go(`/chantiers/${id}/taches`);
    else if (it.appointmentId) go(`/chantiers/${id}/agenda`);
    else if (it.type === 'clock_in' || it.type === 'clock_out') go(`/chantiers/${id}/pointage`);
    else if (it.type === 'doe_generated') go(`/chantiers/${id}/doe`);
  };
  const opens = (it: FeedItem) =>
    !!(it.financeId || it.documentId || it.type === 'message' || it.type === 'photos_added' || it.interventionId || it.reserveId || it.taskId || it.appointmentId
      || it.type === 'clock_in' || it.type === 'clock_out' || it.type === 'doe_generated');

  const refresh = () => {
    site.refetch();
    cards.refetch();
    tasks.refetch();
    appts.refetch();
    if (finances.isFetched) finances.refetch();
    if (tab === 'fil') feed.refetch();
  };
  const alertsCount = (clientChannel?.awaitingReply && !isClient ? 1 : 0) + lateTasks.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={site.isRefetching} onRefresh={refresh} tintColor={colors.night3} />}
        onScroll={({ nativeEvent: n }) => {
          if (tab === 'fil' && n.layoutMeasurement.height + n.contentOffset.y > n.contentSize.height - 400 && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        scrollEventThrottle={250}
      >
        {/* ---------- Bandeau ---------- */}
        <Hero>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              style={kit.heroIconBtn}>
              <ChevronLeft size={24} strokeWidth={2} color={colors.nightInk} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Rechercher dans ce chantier"
              onPress={() => router.push({ pathname: '/chantiers/[id]/rechercher', params: { id } })} style={kit.heroIconBtn}>
              <Search size={20} strokeWidth={2} color={colors.nightInk} />
            </Pressable>
          </View>
          <Text style={[kit.heroTitle, { marginTop: space.s4 }]} numberOfLines={2}>{d?.name ?? card?.name ?? ' '}</Text>
          <Text style={[kit.heroSub, { marginTop: 4 }]} numberOfLines={2}>
            {[d?.address ?? card?.address, d?.clientName ? `Client : ${d.clientName}` : null].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ marginTop: space.s4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3 }}>
            {d ? <PhaseSteps phase={d.phase} dark /> : <View />}
            {team.length ? <AvatarStack names={team} /> : null}
          </View>
          {card?.progress ? (
            <View style={{ marginTop: space.s4 }}>
              <Progress dark value={card.progress.value} label={card.progress.label} height={8} />
            </View>
          ) : null}
          {d?.status === 'archived' ? <View style={{ marginTop: space.s3 }}><Pill tone="neutral" label="Chantier archivé" /></View> : null}
        </Hero>

        <Sheet style={{ gap: space.s5 }}>
          {/* ---------- Raccourcis de terrain ---------- */}
          <Panel style={{ paddingVertical: space.s4 }}>
            {isClient ? (
              <QuickActions>
                <QuickAction primary icon={<MessageSquare size={22} strokeWidth={2} color={colors.ink} />} label="Écrire"
                  onPress={() => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: 'client' } })} />
                <QuickAction icon={<FolderOpen size={22} strokeWidth={1.75} color={colors.ink} />} label="Documents" onPress={() => go(`/chantiers/${id}/documents`)} />
                <QuickAction icon={<Wrench size={22} strokeWidth={1.75} color={colors.ink} />} label="Signaler" onPress={() => go(`/chantiers/${id}/reserve-nouvelle`)} />
                <QuickAction icon={<CalendarClock size={22} strokeWidth={1.75} color={colors.ink} />} label="Rendez-vous" onPress={() => go(`/chantiers/${id}/agenda`)} />
              </QuickActions>
            ) : (
              <QuickActions>
                <QuickAction primary icon={<Camera size={24} strokeWidth={2} color={colors.ink} />} label="Photo" onPress={() => go(`/chantiers/${id}/photos?source=camera`)} />
                <QuickAction icon={<MessageSquare size={22} strokeWidth={1.75} color={colors.ink} />} label="Message"
                  onPress={() => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: 'internal' } })} />
                <QuickAction icon={<LogIn size={22} strokeWidth={1.75} color={colors.ink} />} label="Pointage" onPress={() => go(`/chantiers/${id}/pointage`)} />
                <QuickAction icon={<Plus size={22} strokeWidth={2} color={colors.ink} />} label="Plus"
                  onPress={() => router.push({ pathname: '/chantiers/[id]/ajouter', params: { id } })} />
              </QuickActions>
            )}
          </Panel>

          <Segmented
            items={[
              { key: 'resume' as const, label: 'Résumé', badge: alertsCount || undefined },
              { key: 'fil' as const, label: 'Activité' },
              { key: 'dossier' as const, label: 'Dossier' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {!online ? <NetBanner text="Hors ligne. Vous voyez la dernière version enregistrée sur votre téléphone." /> : null}
          {site.isLoading ? <Loading /> : null}
          {site.error && !d ? <ErrorText text={(site.error as Error).message} /> : null}

          {/* =================== Résumé =================== */}
          {d && tab === 'resume' ? (
            <>
              {/* Ce qui attend une action */}
              {(clientChannel?.awaitingReply && !isClient) || lateTasks.length || (c?.reservesOpen ?? 0) > 0 ? (
                <Section title="À traiter">
                  <Panel padded={false}>
                    {clientChannel?.awaitingReply && !isClient ? (
                      <ActionRow tone="client" icon={<MessageSquare size={20} strokeWidth={2} color="#0B6E75" />}
                        title="Le client attend une réponse" sub="Répondez dans le canal client."
                        right={<Pill small tone="client" label="Client" />}
                        onPress={() => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: 'client' } })} />
                    ) : null}
                    {lateTasks.length ? (
                      <ActionRow tone="alerte" icon={<CheckSquare size={20} strokeWidth={2} color={colors.alerte} />}
                        title={fmt.plural(lateTasks.length, 'tâche en retard', 'tâches en retard')}
                        sub={lateTasks.slice(0, 2).map((tk) => tk.title).join(' · ')}
                        right={<Pill small tone="alerte" label="En retard" />} onPress={() => go(`/chantiers/${id}/taches`)} />
                    ) : null}
                    {(c?.reservesOpen ?? 0) > 0 ? (
                      <ActionRow tone="accent" icon={<Wrench size={20} strokeWidth={2} color="#7A5B00" />}
                        title={fmt.plural(c!.reservesOpen, 'réserve ou SAV à traiter', 'réserves ou SAV à traiter')}
                        onPress={() => go(`/chantiers/${id}/reserves`)} last />
                    ) : null}
                  </Panel>
                </Section>
              ) : (
                <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sync }} />
                  <Text style={[t.body, { flex: 1 }]}>Rien en retard sur ce chantier.</Text>
                </Panel>
              )}

              {/* Prochain rendez-vous */}
              {next ? (
                <Section title="Prochain rendez-vous" action="Agenda" onAction={() => go(`/chantiers/${id}/agenda`)}>
                  <Panel style={{ flexDirection: 'row', gap: space.s4, alignItems: 'center' }}>
                    <View style={{ width: 58, alignItems: 'center', paddingVertical: space.s2, borderRadius: 12, backgroundColor: colors.accentSoft }}>
                      <Text style={{ fontFamily: font.sans600, fontSize: 12, color: '#7A5B00', textTransform: 'uppercase' }}>
                        {new Date(next.startsAt).toLocaleDateString('fr-FR', { weekday: 'short' })}
                      </Text>
                      <Text style={{ fontFamily: font.display700, fontSize: 22, color: colors.ink }}>{new Date(next.startsAt).getDate()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: font.sans600, fontSize: 16, color: colors.ink }}>{next.title}</Text>
                      <Text style={[t.secondary, { marginTop: 2 }]}>{fmt.time(next.startsAt)}{next.contact ? ` · ${next.contact.name}` : ''}</Text>
                    </View>
                  </Panel>
                </Section>
              ) : null}

              {/* À faire */}
              {!isClient ? (
                <Section title="À faire" action={openTasks.length ? `Tout (${openTasks.length})` : 'Ajouter'} onAction={() => go(`/chantiers/${id}/taches`)}>
                  {openTasks.length ? (
                    <Panel padded={false}>
                      {openTasks.slice(0, 3).map((tk, i, arr) => (
                        <ActionRow key={tk.id} last={i === arr.length - 1} tone={tk.overdue ? 'alerte' : tk.priority === 'urgent' ? 'accent' : 'neutral'}
                          icon={<CheckSquare size={20} strokeWidth={2} color={tk.overdue ? colors.alerte : colors.ink2} />}
                          title={tk.title} sub={[tk.dueOn ? `Pour le ${fmt.day(tk.dueOn)}` : null, tk.assignee?.fullName].filter(Boolean).join(' · ') || null}
                          onPress={() => go(`/chantiers/${id}/taches`)} />
                      ))}
                    </Panel>
                  ) : <Panel><Text style={t.secondary}>Aucune tâche ouverte.</Text></Panel>}
                </Section>
              ) : null}

              {/* Finances */}
              {showFinances && fin ? (
                <Section title={isClient ? 'Devis et factures' : 'Finances'} action="Détail" onAction={() => go(`/chantiers/${id}/finances`)}>
                  <Panel>
                    <View style={{ flexDirection: 'row', gap: space.s4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={t.mention}>{isClient ? 'Réglé' : 'Encaissé'}</Text>
                        <Text style={{ fontFamily: font.display700, fontSize: 22, color: colors.ink }}>{compactMoney(fin.paidTtc)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={t.mention}>{isClient ? 'Reste à régler' : 'À encaisser'}</Text>
                        <Text style={{ fontFamily: font.display700, fontSize: 22, color: fin.overdueTtc ? colors.alerte : colors.ink }}>{compactMoney(fin.outstandingTtc)}</Text>
                      </View>
                      {!isClient && fin.marginRate != null ? (
                        <View style={{ flex: 1 }}>
                          <Text style={t.mention}>Marge prévue</Text>
                          <Text style={{ fontFamily: font.display700, fontSize: 22, color: colors.ink }}>{fmt.percent(fin.marginRate)}</Text>
                        </View>
                      ) : null}
                    </View>
                    {fin.quotedHt > 0 ? (
                      <View style={{ marginTop: space.s4 }}>
                        <Progress value={fin.invoicedHt / fin.quotedHt} label={`Facturé ${fmt.percent(fin.invoicedHt / fin.quotedHt)} du marché (${compactMoney(fin.quotedHt)} HT)`} />
                      </View>
                    ) : null}
                    {fin.overdueTtc ? <View style={{ marginTop: space.s3 }}><Pill tone="alerte" label={`${compactMoney(fin.overdueTtc)} en retard de paiement`} /></View> : null}
                  </Panel>
                </Section>
              ) : null}

              {/* Conversations */}
              {channels.length > 0 ? (
                <Section title="Conversations">
                  <Panel padded={false}>
                    {channels.map((ch, i) => (
                      <ActionRow key={ch.id} last={i === channels.length - 1} tone={ch.kind === 'client' ? 'client' : 'neutral'}
                        icon={<MessageSquare size={20} strokeWidth={2} color={ch.kind === 'client' ? '#0B6E75' : colors.ink2} />}
                        title={ch.kind === 'client' ? (isClient ? 'Échanges avec l’équipe' : 'Canal client') : 'Équipe'}
                        sub={ch.lastMessageAt ? `Dernier message ${fmt.relative(ch.lastMessageAt).toLowerCase()}` : 'Aucun message'}
                        right={ch.awaitingReply && !isClient ? <Pill small tone="client" label="Réponse attendue" /> : undefined}
                        onPress={() => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: ch.kind } })} />
                    ))}
                  </Panel>
                </Section>
              ) : null}
            </>
          ) : null}

          {/* =================== Activité =================== */}
          {tab === 'fil' ? (
            <>
              <Chips items={feedFilters.map((f) => ({ key: f.filter, label: f.label }))} value={filter} onChange={setFilter} />
              {pending.length > 0 ? (
                <View style={feedCard}>
                  {pending.map((e, i) => <PendingRow key={e.id} entry={e} last={i === pending.length - 1} />)}
                </View>
              ) : null}
              {feed.isLoading ? <Loading /> : null}
              {feed.error && !feed.data ? <ErrorText text={(feed.error as Error).message} /> : null}
              {items.length > 0 ? (
                <View style={feedCard}>
                  {items.map((it, i) => (
                    <FeedRow key={it.id} item={it} last={i === items.length - 1} onPress={opens(it) ? () => openItem(it) : undefined} />
                  ))}
                </View>
              ) : feed.data && pending.length === 0 ? <Empty text="Rien pour le moment." /> : null}
              {feed.isFetchingNextPage ? <Loading /> : null}
            </>
          ) : null}

          {/* =================== Dossier =================== */}
          {d && tab === 'dossier' ? (
            <>
              <Section title="Pièces du chantier">
                <Panel padded={false}>
                  <ActionRow icon={<FolderOpen size={20} strokeWidth={2} color={colors.ink2} />} title="Documents"
                    sub={c ? (c.documents ? `${fmt.plural(c.documents, 'document')} · ${fmt.plural(c.photos, 'photo')}` : 'Aucun document') : null}
                    onPress={() => go(`/chantiers/${id}/documents`)} />
                  <ActionRow icon={<PenLine size={20} strokeWidth={2} color={colors.ink2} />} title="Fiches d’intervention"
                    sub={c ? (c.interventions ? fmt.plural(c.interventions, 'fiche') : 'Aucune fiche') : null}
                    onPress={() => go(`/chantiers/${id}/interventions`)} />
                  <ActionRow icon={<Wrench size={20} strokeWidth={2} color={colors.ink2} />} title="Réserves et SAV"
                    sub={c ? (c.reservesOpen ? `${c.reservesOpen} à traiter` : 'Rien en cours') : null}
                    onPress={() => go(`/chantiers/${id}/reserves`)} />
                  {showFinances ? (
                    <ActionRow icon={<Euro size={20} strokeWidth={2} color={colors.ink2} />} title={isClient ? 'Devis et factures' : 'Finances'}
                      sub={c?.financesOpen != null ? (c.financesOpen ? `${fmt.plural(c.financesOpen, 'pièce ouverte', 'pièces ouvertes')}` : 'Tout est soldé') : null}
                      onPress={() => go(`/chantiers/${id}/finances`)} />
                  ) : null}
                  {d.phase === 'apres' || d.canManage ? (
                    <ActionRow icon={<Archive size={20} strokeWidth={2} color={colors.ink2} />} title="DOE"
                      sub={d.phase === 'apres' ? 'Dossier des ouvrages exécutés' : 'À préparer pour la réception'}
                      onPress={() => go(`/chantiers/${id}/doe`)} last />
                  ) : null}
                </Panel>
              </Section>
              <Section title="Organisation">
                <Panel padded={false}>
                  <ActionRow icon={<CalendarClock size={20} strokeWidth={2} color={colors.ink2} />} title="Rendez-vous"
                    sub={c ? (c.appointmentsUpcoming ? `${c.appointmentsUpcoming} à venir` : 'Aucun prévu') : null}
                    onPress={() => go(`/chantiers/${id}/agenda`)} />
                  {!isClient ? (
                    <ActionRow icon={<CheckSquare size={20} strokeWidth={2} color={colors.ink2} />} title="Tâches"
                      sub={c ? (c.tasksOpen ? `${c.tasksOpen} à faire` : 'Rien à faire') : null} onPress={() => go(`/chantiers/${id}/taches`)} />
                  ) : null}
                  {!isClient ? (
                    <ActionRow icon={<Clock size={20} strokeWidth={2} color={colors.ink2} />} title="Pointage" sub="Arrivées, départs et heures de l’équipe"
                      onPress={() => go(`/chantiers/${id}/pointage`)} />
                  ) : null}
                  <ActionRow icon={<Users size={20} strokeWidth={2} color={colors.ink2} />} title="Équipe"
                    sub={c ? fmt.plural(c.members, 'personne') : null} onPress={() => go(`/chantiers/${id}/equipe`)} last={!d.canManage} />
                  {d.canManage ? (
                    <ActionRow icon={<Settings2 size={20} strokeWidth={2} color={colors.ink2} />} title="Phase et archivage"
                      sub={phaseLabel[d.phase]} onPress={() => go(`/chantiers/${id}/reglages`)} last />
                  ) : null}
                </Panel>
              </Section>
              {d.reference ? <Text style={[t.small, { textAlign: 'center' }]}>Référence {d.reference}{d.startedOn ? ` · ${fmt.startedOn(d.startedOn)}` : ''}</Text> : null}
            </>
          ) : null}
        </Sheet>
      </ScrollView>
    </View>
  );
}
