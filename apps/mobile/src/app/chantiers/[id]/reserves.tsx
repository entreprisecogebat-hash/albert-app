import { reserveKindLabel, reserveStatusLabel, type Reserve, type ReserveStatus } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../../../lib/api';
import { dueFor } from '../../../lib/dates';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { ListCard, ListRow } from '../../../ui/blocks';
import { Button, Chips, Empty, ErrorText, Loading, NetBanner, NightTag, Screen, StateTag } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/** Réserves, SAV et garanties du chantier (F-15) : ce qui reste à reprendre, et sa trace. */
export default function ReservesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const list = useQuery({ queryKey: ['reserves', id], queryFn: () => api.reserves.list({ siteId: id }) });
  const [status, setStatus] = useState<ReserveStatus>('open');
  const all = list.data?.items ?? [];
  const items = all.filter((r) => r.status === status).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.reportedAt.localeCompare(a.reportedAt));
  const count = (st: ReserveStatus) => all.filter((r) => r.status === st).length;
  const isClient = site.data?.role === 'client';

  return (
    <Screen back title="Réserves et SAV" subtitle={site.data?.name}
      action={<Button label={isClient ? 'Signaler un problème' : 'Nouvelle réserve'} onPress={() => go(`/chantiers/${id}/reserve-nouvelle`)} disabled={!online} />}>
      {!online ? <NetBanner text="Hors ligne. Liste enregistrée sur votre téléphone." /> : null}
      <Chips value={status} onChange={setStatus}
        items={(['open', 'in_progress', 'done'] as const).map((st) => ({ key: st, label: `${reserveStatusLabel[st]} · ${count(st)}` }))} />
      {list.isLoading ? <Loading /> : null}
      {list.error && !list.data ? <ErrorText text={(list.error as Error).message} /> : null}
      {items.length > 0 ? (
        <ListCard>
          {items.map((r, i) => <ReserveRow key={r.id} r={r} last={i === items.length - 1} />)}
        </ListCard>
      ) : list.data ? <Empty text={status === 'done' ? 'Aucune réserve levée pour le moment.' : 'Rien à reprendre ici.'} /> : null}
      <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
        Chaque changement est daté et attribué : la liste sert de preuve à la levée des réserves.
      </Text>
    </Screen>
  );
}

function ReserveRow({ r, last, showSite }: { r: Reserve; last: boolean; showSite?: boolean }) {
  const Icon = r.status === 'done' ? CheckCircle2 : r.overdue ? AlertTriangle : Wrench;
  return (
    <ListRow last={last}
      icon={<Icon size={20} strokeWidth={1.75} color={r.overdue && r.status !== 'done' ? colors.alerte : colors.ink2} />}
      meta={[reserveKindLabel[r.kind], showSite ? r.siteName : null, r.location, r.dueOn ? `À lever ${dueFor(r.dueOn)}` : null].filter(Boolean).join(' · ')}
      title={r.title}
      sub={r.assignee ? `Confiée à ${r.assignee.fullName}` : null}
      strike={r.status === 'done'}
      accent={r.visibility === 'client' ? colors.client : undefined}
      right={r.status === 'done' ? <StateTag on={false} label="Levée" /> : r.overdue ? <NightTag label="En retard" /> : undefined}
      onPress={() => go(`/reserves/${r.id}`)}
    />
  );
}
