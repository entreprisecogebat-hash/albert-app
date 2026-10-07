import { outboxSentence, phaseLabel, type SitePhase } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Search, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOnline } from '../../lib/network';
import { useOutbox } from '../../lib/outbox';
import { Button, Chips, Empty, ErrorText, Field, Loading, NetBanner, s } from '../../ui/components';
import { SiteCard } from '../../ui/feed';
import { colors, space, t } from '../../ui/theme';

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

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <View style={{ flex: 1 }}>
          <Text style={t.appbar}>Mes chantiers</Text>
          <Text style={[t.mention, { marginTop: 2 }]}>{me?.fullName} · {me?.company.name}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Mon compte" onPress={() => router.push('/compte')} style={{ alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <UserRound size={22} strokeWidth={1.75} color={colors.ink} />
          <Text style={[t.small, { fontSize: 12, color: colors.ink2 }]}>Compte</Text>
        </Pressable>
      </View>
      <ScrollView
        style={s.view}
        contentContainerStyle={[s.content, { paddingBottom: canCreate ? 120 : 32 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={sites.isRefetching} onRefresh={() => sites.refetch()} tintColor={colors.ink3} />}
      >
        <Field
          icon={<Search size={22} strokeWidth={1.75} color={colors.ink3} />}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un chantier"
          accessibilityLabel="Rechercher un chantier"
          returnKeyType="search"
        />
        {phases.length > 1 ? (
          <Chips
            items={[{ key: 'all' as const, label: 'Tous' }, ...phases.map((p) => ({ key: p, label: phaseLabel[p] }))]}
            value={phase}
            onChange={setPhase}
          />
        ) : null}
        {sentence ? <NetBanner text={sentence} /> : !online ? <NetBanner text="Hors ligne. Vos chantiers restent consultables ; ce que vous ajoutez partira dès que vous captez." /> : null}

        {sites.isLoading ? <Loading /> : null}
        {sites.error && !sites.data ? <ErrorText text={(sites.error as Error).message} /> : null}
        <View style={{ gap: space.s3 }}>
          {items.map((site) => (
            <SiteCard key={site.id} site={site} onPress={() => router.push({ pathname: '/chantiers/[id]', params: { id: site.id } })} />
          ))}
        </View>
        {sites.data && items.length === 0 ? (
          <Empty text={q || phase !== 'all' ? 'Aucun chantier ne correspond.' : 'Vous n’êtes encore sur aucun chantier. Votre responsable vous y ajoutera.'} />
        ) : null}
      </ScrollView>
      {canCreate ? (
        <View style={[s.actionbar, { paddingBottom: space.s3 }]}>
          {/* Pas d'action jaune ici : l'écran sert à entrer dans un chantier. */}
          <Button kind="night" label="Nouveau chantier" onPress={() => router.push('/chantiers/nouveau')} disabled={!online} />
        </View>
      ) : null}
    </View>
  );
}
