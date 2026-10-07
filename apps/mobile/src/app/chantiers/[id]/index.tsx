import { feedFilters, fmt, phaseLabel, type FeedFilter, type FeedItem } from '@albert/shared';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Archive, CalendarDays, CheckSquare, ChevronRight, Clock, Euro, FolderOpen, MessageSquare, PenLine, Search, Settings2, Users, Wrench,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../lib/api';
import { useOnline } from '../../../lib/network';
import { useOutbox } from '../../../lib/outbox';
import { go } from '../../../lib/nav';
import { ModuleTile, TileGrid } from '../../../ui/blocks';
import { Button, Chips, Dot, Empty, ErrorText, Loading, NetBanner, NightTag, StateTag, s } from '../../../ui/components';
import { FeedRow, PendingRow, feedCard } from '../../../ui/feed';
import { colors, font, space, t } from '../../../ui/theme';
import { ChevronLeft } from 'lucide-react-native';

/** Je vois ce qui a bougé : l'écran pivot, ouvert dix fois par jour. */
export default function SiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { outbox, state } = useOutbox();
  const [filter, setFilter] = useState<FeedFilter>('all');

  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const feed = useInfiniteQuery({
    queryKey: ['feed', id, filter],
    queryFn: ({ pageParam }) => api.sites.feed(id, filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? null,
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
  void state; // re-rendu quand la file change

  const d = site.data;
  const isClient = d?.role === 'client';
  // Le client voit ses devis et factures émis : la tuile n'apparaît que s'il en a.
  const clientFinances = useQuery({
    queryKey: ['finances', id],
    queryFn: () => api.finances.list({ siteId: id }),
    enabled: !!d && !d.canSeeFinances && isClient,
  });
  const channels = d?.channels ?? [];

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
  const c = d?.counts;
  const n = (v: number | undefined, one: string, zero: string) => (v === undefined ? null : v === 0 ? zero : fmt.plural(v, one));

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
          <ChevronLeft size={28} strokeWidth={1.75} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={t.appbar} numberOfLines={2}>{d?.name ?? ' '}</Text>
          {d ? <Text style={[t.mention, { marginTop: 2 }]} numberOfLines={2}>{[d.address, fmt.startedOn(d.startedOn)].filter(Boolean).join(' · ')}</Text> : null}
          {d ? <StateTag on={d.phase === 'pendant'} label={d.status === 'archived' ? 'Archivé' : phaseLabel[d.phase]} /> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Rechercher dans ce chantier" onPress={() => router.push({ pathname: '/chantiers/[id]/rechercher', params: { id } })}
          style={{ alignItems: 'center', minWidth: 56, minHeight: 48, justifyContent: 'center' }}>
          <Search size={22} strokeWidth={1.75} color={colors.ink} />
          <Text style={[t.small, { fontSize: 12, color: colors.ink2 }]}>Rechercher</Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.view}
        contentContainerStyle={[s.content, { paddingBottom: (isClient ? 32 : 132) + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => { feed.refetch(); site.refetch(); }} tintColor={colors.ink3} />}
        onScroll={({ nativeEvent: n }) => {
          if (n.layoutMeasurement.height + n.contentOffset.y > n.contentSize.height - 400 && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        scrollEventThrottle={250}
      >
        {!online ? <NetBanner text="Hors ligne. Ce fil est la dernière version enregistrée sur votre téléphone." /> : null}

        {/* Les modules du chantier : avant, pendant, après */}
        {d ? (
          <TileGrid>
            <ModuleTile icon={<FolderOpen size={22} strokeWidth={1.75} color={colors.ink2} />} label="Documents"
              count={n(c?.documents, 'document', 'Aucun document')} onPress={() => go(`/chantiers/${id}/documents`)} />
            {!isClient ? (
              <ModuleTile icon={<CheckSquare size={22} strokeWidth={1.75} color={colors.ink2} />} label="Tâches"
                count={c ? (c.tasksOpen ? `${fmt.plural(c.tasksOpen, 'à faire', 'à faire')}` : 'Rien à faire') : null} onPress={() => go(`/chantiers/${id}/taches`)} />
            ) : null}
            {!isClient ? (
              <ModuleTile icon={<Clock size={22} strokeWidth={1.75} color={colors.ink2} />} label="Pointage"
                count="Arrivées et départs" onPress={() => go(`/chantiers/${id}/pointage`)} />
            ) : null}
            <ModuleTile icon={<PenLine size={22} strokeWidth={1.75} color={colors.ink2} />} label="Interventions"
              count={n(c?.interventions, 'fiche', 'Aucune fiche')} onPress={() => go(`/chantiers/${id}/interventions`)} />
            <ModuleTile icon={<Wrench size={22} strokeWidth={1.75} color={colors.ink2} />} label="Réserves et SAV"
              count={c ? (c.reservesOpen ? fmt.plural(c.reservesOpen, 'à traiter', 'à traiter') : 'Rien en cours') : null} onPress={() => go(`/chantiers/${id}/reserves`)} />
            <ModuleTile icon={<CalendarDays size={22} strokeWidth={1.75} color={colors.ink2} />} label="Rendez-vous"
              count={c ? (c.appointmentsUpcoming ? fmt.plural(c.appointmentsUpcoming, 'à venir', 'à venir') : 'Aucun prévu') : null} onPress={() => go(`/chantiers/${id}/agenda`)} />
            {d.canSeeFinances ? (
              <ModuleTile icon={<Euro size={22} strokeWidth={1.75} color={colors.ink2} />} label="Finances"
                count={c?.financesOpen != null ? (c.financesOpen ? fmt.plural(c.financesOpen, 'pièce ouverte', 'pièces ouvertes') : 'Tout est soldé') : 'Devis, factures, dépenses'}
                onPress={() => go(`/chantiers/${id}/finances`)} />
            ) : isClient && (clientFinances.data?.items.length ?? 0) > 0 ? (
              <ModuleTile icon={<Euro size={22} strokeWidth={1.75} color={colors.ink2} />} label="Devis et factures"
                count={fmt.plural(clientFinances.data!.items.length, 'pièce')} onPress={() => go(`/chantiers/${id}/finances`)} />
            ) : null}
            <ModuleTile icon={<Users size={22} strokeWidth={1.75} color={colors.ink2} />} label="Équipe"
              count={n(c?.members, 'personne', 'Personne')} onPress={() => go(`/chantiers/${id}/equipe`)} />
            {d.phase === 'apres' || d.canManage ? (
              <ModuleTile icon={<Archive size={22} strokeWidth={1.75} color={colors.ink2} />} label="DOE"
                count={d.phase === 'apres' ? 'Dossier des ouvrages' : 'À la réception'} onPress={() => go(`/chantiers/${id}/doe`)} />
            ) : null}
            {d.canManage ? (
              <ModuleTile icon={<Settings2 size={22} strokeWidth={1.75} color={colors.ink2} />} label="Phase et archivage"
                count={phaseLabel[d.phase]} onPress={() => go(`/chantiers/${id}/reglages`)} />
            ) : null}
          </TileGrid>
        ) : null}

        {/* Les deux conversations du chantier */}
        {channels.length > 0 ? (
          <View style={[s.card, { paddingVertical: 0 }]}>
            {channels.map((c, i) => (
              <Pressable key={c.id} accessibilityRole="button"
                onPress={() => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: c.kind } })}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: 56 }, i < channels.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.rule }, pressed && { backgroundColor: colors.bg }]}>
                {c.kind === 'client' ? <Dot color={colors.client} /> : <MessageSquare size={20} strokeWidth={1.75} color={colors.ink3} />}
                <Text style={[t.body, { flex: 1, fontFamily: font.sans500, lineHeight: 22 }]}>
                  {c.kind === 'client' ? (isClient ? 'Échanges avec l’équipe' : 'Canal client') : 'Messages de l’équipe'}
                </Text>
                {c.awaitingReply && !isClient ? <NightTag label="Réponse attendue" /> : null}
                <ChevronRight size={18} strokeWidth={1.75} color={colors.ink3} />
              </Pressable>
            ))}
          </View>
        ) : null}

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
              <FeedRow key={it.id} item={it} last={i === items.length - 1}
                onPress={opens(it) ? () => openItem(it) : undefined} />
            ))}
          </View>
        ) : feed.data && pending.length === 0 ? <Empty text="Rien pour le moment." /> : null}
        {feed.isFetchingNextPage ? <Loading /> : null}
      </ScrollView>

      {!isClient ? (
        <View style={[s.actionbar, { paddingBottom: Math.max(insets.bottom, space.s5) }]}>
          <Button label="Ajouter au chantier" onPress={() => router.push({ pathname: '/chantiers/[id]/ajouter', params: { id } })} />
        </View>
      ) : null}
    </View>
  );
}
