import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { addDays, longDay } from '../../lib/dates';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { AppointmentRow, groupByDay } from '../../ui/agenda';
import { ListCard, SectionTitle } from '../../ui/blocks';
import { Button, Empty, ErrorText, Loading, NetBanner, s } from '../../ui/components';
import { colors, space, t } from '../../ui/theme';

/** Agenda partagé de l'entreprise, sur deux semaines, regroupé par jour. */
export default function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const from = addDays(new Date(), 0);
  const to = addDays(from, 14);
  const list = useQuery({
    queryKey: ['appointments', 'agenda'],
    queryFn: () => api.appointments.list({ from: from.toISOString(), to: to.toISOString() }),
  });

  const days = useMemo(() => groupByDay(list.data?.items ?? []), [list.data]);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <View style={{ flex: 1 }}>
          <Text style={t.appbar}>Agenda</Text>
          <Text style={[t.mention, { marginTop: 2 }]}>Les deux prochaines semaines, toute l’équipe</Text>
        </View>
      </View>
      <ScrollView
        style={s.view}
        contentContainerStyle={[s.content, { paddingBottom: 120 }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.ink3} />}
      >
        {!online ? <NetBanner text="Hors ligne. Agenda enregistré sur votre téléphone." /> : null}
        {list.isLoading ? <Loading /> : null}
        {list.error && !list.data ? <ErrorText text={(list.error as Error).message} /> : null}
        {days.map(([key, items]) => (
          <View key={key}>
            <SectionTitle>{longDay(new Date(`${key}T12:00:00`))}</SectionTitle>
            <ListCard>
              {items.map((a, i) => <AppointmentRow key={a.id} a={a} last={i === items.length - 1} />)}
            </ListCard>
          </View>
        ))}
        {list.data && days.length === 0 ? <Empty text="Aucun rendez-vous dans les deux prochaines semaines." /> : null}
      </ScrollView>
      <View style={[s.actionbar, { paddingBottom: space.s3 }]}>
        <Button label="Nouveau rendez-vous" onPress={() => go('/agenda/nouveau')} disabled={!online} />
      </View>
    </View>
  );
}
