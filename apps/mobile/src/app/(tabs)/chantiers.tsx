import { fmt, outboxSentence, type SitePhase } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOnline } from '../../lib/network';
import { useOutbox } from '../../lib/outbox';
import { Empty, ErrorText, Field, Loading, NetBanner } from '../../ui/components';
import { Segmented } from '../../ui/kit';
import { SiteCard } from '../../ui/feed';
import { colors, font, radius, space, t } from '../../ui/theme';

/** J'entre : il atteint le bon chantier en un geste. */
export default function SitesScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const online = useOnline();
  const { state } = useOutbox();
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<SitePhase | 'all'>('all');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });

  // Filtre local : la recherche marche aussi sans réseau.
  const items = useMemo(() => {
    const all = sites.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    return all
      .filter((x) => phase === 'all' || x.phase === phase)
      .filter((x) => !needle || `${x.name} ${x.address} ${x.reference ?? ''} ${x.clientName ?? ''}`.toLowerCase().includes(needle));
  }, [sites.data, q, phase]);
  const phases = (['avant', 'pendant', 'apres'] as const).filter((p) => (sites.data?.items ?? []).some((x) => x.phase === p));

  const sentence = outboxSentence(state, online);
  const canCreate = me?.kind === 'staff';

  const count = (p: SitePhase) => (sites.data?.items ?? []).filter((x) => x.phase === p).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s3, gap: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.display700, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: colors.ink }}>Chantiers</Text>
            <Text style={[t.secondary, { marginTop: 2 }]}>{sites.data ? fmt.plural(sites.data.items.length, 'chantier') : ' '} · {me?.company.name}</Text>
          </View>
          {canCreate ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Nouveau chantier" disabled={!online} onPress={() => router.push('/chantiers/nouveau')}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.night, borderRadius: radius.pill,
                paddingHorizontal: space.s4, minHeight: 44 }, pressed && { opacity: 0.85 }, !online && { opacity: 0.45 }]}>
              <Plus size={18} strokeWidth={2.25} color={colors.nightInk} />
              <Text style={{ fontFamily: font.sans600, fontSize: 15, color: colors.nightInk }}>Nouveau</Text>
            </Pressable>
          ) : null}
        </View>
        <Field
          icon={<Search size={22} strokeWidth={1.75} color={colors.ink3} />}
          value={q}
          onChangeText={setQ}
          placeholder="Nom, adresse, client, référence"
          accessibilityLabel="Rechercher un chantier"
          returnKeyType="search"
        />
        {phases.length > 1 ? (
          <Segmented
            items={[{ key: 'all' as const, label: 'Tous' }, ...phases.map((p) => ({ key: p, label: `${p === 'pendant' ? 'En cours' : p === 'avant' ? 'Avant' : 'Après'} ${count(p)}` }))]}
            value={phase}
            onChange={setPhase}
          />
        ) : null}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.s4, paddingTop: space.s1, gap: space.s3, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={sites.isRefetching} onRefresh={() => sites.refetch()} tintColor={colors.ink3} />}
      >
        {sentence ? <NetBanner text={sentence} /> : !online ? <NetBanner text="Hors ligne. Vos chantiers restent consultables ; ce que vous ajoutez partira dès que vous captez." /> : null}

        {sites.isLoading ? <Loading /> : null}
        {sites.error && !sites.data ? <ErrorText text={(sites.error as Error).message} /> : null}
        {items.map((site) => (
          <SiteCard key={site.id} site={site} onPress={() => router.push({ pathname: '/chantiers/[id]', params: { id: site.id } })} />
        ))}
        {sites.data && items.length === 0 ? (
          <Empty text={q || phase !== 'all' ? 'Aucun chantier ne correspond.' : 'Vous n’êtes encore sur aucun chantier. Votre responsable vous y ajoutera.'} />
        ) : null}
      </ScrollView>
    </View>
  );
}
