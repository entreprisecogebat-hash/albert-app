import { durationLabel, interventionStatusLabel } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { PenLine } from 'lucide-react-native';
import { Text } from 'react-native';
import { api } from '../../../lib/api';
import { due } from '../../../lib/dates';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { ListCard, ListRow } from '../../../ui/blocks';
import { Button, Empty, ErrorText, Loading, NetBanner, NightTag, Screen, StateTag } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/** Fiches d'intervention du chantier (F-12) : ce qui a été fait, signé par le client. */
export default function InterventionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const list = useQuery({ queryKey: ['interventions', id], queryFn: () => api.interventions.list(id) });
  const items = list.data?.items ?? [];
  const isClient = site.data?.role === 'client';

  return (
    <Screen back title="Fiches d’intervention" subtitle={site.data?.name}
      action={!isClient ? <Button label="Nouvelle fiche" onPress={() => go(`/chantiers/${id}/intervention-nouvelle`)} disabled={!online} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. Les fiches déjà ouvertes restent consultables." /> : null}
      {list.isLoading ? <Loading /> : null}
      {list.error && !list.data ? <ErrorText text={(list.error as Error).message} /> : null}
      {items.length > 0 ? (
        <ListCard>
          {items.map((x, i) => (
            <ListRow key={x.id} last={i === items.length - 1}
              icon={<PenLine size={20} strokeWidth={1.75} color={colors.ink2} />}
              meta={[x.number, due(x.interventionOn), durationLabel(x.minutes) || null].filter(Boolean).join(' · ')}
              title={x.title}
              sub={x.status === 'signed' ? `Signée par ${x.signerName}` : x.technicians}
              right={x.status === 'signed' ? <StateTag on={false} label={interventionStatusLabel.signed} /> : <NightTag label={interventionStatusLabel.draft} />}
              onPress={() => go(`/interventions/${x.id}`)}
            />
          ))}
        </ListCard>
      ) : list.data ? <Empty text="Aucune fiche d’intervention sur ce chantier." /> : null}
      <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
        Une fois signée par le client, la fiche est rangée en PDF dans les documents du chantier.
      </Text>
    </Screen>
  );
}
