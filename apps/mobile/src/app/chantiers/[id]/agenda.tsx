import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { api } from '../../../lib/api';
import { addDays, longDay } from '../../../lib/dates';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { AppointmentRow, groupByDay } from '../../../ui/agenda';
import { ListCard, SectionTitle } from '../../../ui/blocks';
import { Button, Empty, ErrorText, Loading, NetBanner, Screen } from '../../../ui/components';

/** Rendez-vous du chantier : visites, réunions, livraisons. Les 60 prochains jours. */
export default function SiteAgendaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const from = addDays(new Date(), 0);
  const list = useQuery({
    queryKey: ['appointments', 'site', id],
    queryFn: () => api.appointments.list({ siteId: id, from: from.toISOString(), to: addDays(from, 60).toISOString() }),
  });
  const days = useMemo(() => groupByDay(list.data?.items ?? []), [list.data]);
  const isClient = site.data?.role === 'client';

  return (
    <Screen back title="Rendez-vous" subtitle={site.data?.name}
      action={!isClient ? <Button label="Nouveau rendez-vous" onPress={() => go(`/agenda/nouveau?siteId=${id}`)} disabled={!online} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. Agenda enregistré sur votre téléphone." /> : null}
      {list.isLoading ? <Loading /> : null}
      {list.error && !list.data ? <ErrorText text={(list.error as Error).message} /> : null}
      {days.map(([key, items]) => (
        <View key={key}>
          <SectionTitle>{longDay(new Date(`${key}T12:00:00`))}</SectionTitle>
          <ListCard>{items.map((a, i) => <AppointmentRow key={a.id} a={a} hideSite last={i === items.length - 1} />)}</ListCard>
        </View>
      ))}
      {list.data && days.length === 0 ? <Empty text="Aucun rendez-vous prévu sur ce chantier." /> : null}
    </Screen>
  );
}
