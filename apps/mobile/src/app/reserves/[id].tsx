import { fmt, reserveKindLabel, reserveStatusLabel, type ReserveStatus } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { History } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { due } from '../../lib/dates';
import { useOnline } from '../../lib/network';
import { Label, ListCard, ListRow } from '../../ui/blocks';
import { Button, Chips, ClientTag, ErrorText, KvRow, Loading, NetBanner, NightTag, Screen, StateTag, TextArea, s } from '../../ui/components';
import { colors, radius, space, t } from '../../ui/theme';

const NEXT: Record<ReserveStatus, ReserveStatus> = { open: 'in_progress', in_progress: 'done', done: 'open' };
const ACTION: Record<ReserveStatus, string> = { in_progress: 'Passer en cours', done: 'Lever la réserve', open: 'Rouvrir' };

/** Une réserve : ce qui a été constaté, qui s'en charge, et chaque étape datée. */
export default function ReserveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const { me } = useAuth();
  const qc = useQueryClient();
  const res = useQuery({ queryKey: ['reserve', id], queryFn: () => api.reserves.get(id) });
  const r = res.data;
  const [target, setTarget] = useState<ReserveStatus | null>(null);
  const [note, setNote] = useState('');
  const staff = me?.kind !== 'client';
  const next = target ?? (r ? NEXT[r.status] : 'in_progress');

  const update = useMutation({
    mutationFn: () => api.reserves.update(id, { status: next, note: note.trim() || null }),
    onSuccess: (x) => {
      qc.setQueryData(['reserve', id], x);
      qc.invalidateQueries({ queryKey: ['reserves', x.siteId] });
      qc.invalidateQueries({ queryKey: ['site', x.siteId] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setNote('');
      setTarget(null);
    },
  });
  const comment = useMutation({
    mutationFn: () => api.reserves.update(id, { note: note.trim() }),
    onSuccess: (x) => {
      qc.setQueryData(['reserve', id], x);
      setNote('');
    },
  });

  return (
    <Screen back title={r ? reserveKindLabel[r.kind] : 'Réserve'} subtitle={r?.siteName}
      action={r && staff ? <Button label={ACTION[next]} onPress={() => update.mutate()} busy={update.isPending} disabled={!online} />
        : r && !staff ? <Button kind="night" label="Ajouter un commentaire" onPress={() => comment.mutate()} busy={comment.isPending} disabled={!online || !note.trim()} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. Fiche enregistrée sur votre téléphone." /> : null}
      {res.isLoading ? <Loading /> : null}
      {res.error && !r ? <ErrorText text={(res.error as Error).message} /> : null}
      {r ? (
        <>
          <View style={s.card}>
            <Text style={t.appbar}>{r.title}</Text>
            <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap', alignItems: 'center' }}>
              {r.status === 'done' ? <StateTag on={false} label="Levée" /> : <StateTag on label={reserveStatusLabel[r.status]} />}
              {r.overdue && r.status !== 'done' ? <View style={{ marginTop: space.s2 }}><NightTag label="En retard" /></View> : null}
              {r.visibility === 'client' && staff ? <View style={{ marginTop: space.s2 }}><ClientTag /></View> : null}
            </View>
            {r.description ? <Text style={[t.body, { marginTop: space.s3 }]}>{r.description}</Text> : null}
          </View>

          <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            {r.location ? <KvRow k="Où" v={r.location} /> : null}
            <KvRow k="Signalée" v={fmt.day(r.reportedAt)} small={r.reportedBy?.fullName} />
            {r.dueOn ? <KvRow k="À lever pour" v={due(r.dueOn)} /> : null}
            <KvRow k="Confiée à" v={r.assignee?.fullName ?? 'Personne'} />
            <KvRow k="Levée" v={r.doneAt ? fmt.day(r.doneAt) : 'Pas encore'} last />
          </View>

          {r.photos.length > 0 ? (
            <View>
              <Label>Photos</Label>
              <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' }}>
                {r.photos.map((p) => (
                  <Image key={p.id} source={{ uri: p.thumbUrl }} style={{ width: 96, height: 96, borderRadius: radius.r1, backgroundColor: colors.bg2 }}
                    contentFit="cover" accessibilityLabel="Photo de la réserve" />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: space.s3 }}>
            {staff ? (
              <View>
                <Label>Nouveau statut</Label>
                <Chips value={next} onChange={setTarget}
                  items={(['open', 'in_progress', 'done'] as const).filter((st) => st !== r.status).map((st) => ({ key: st, label: reserveStatusLabel[st] }))} />
              </View>
            ) : null}
            <TextArea value={note} onChangeText={setNote} placeholder={staff ? 'Commentaire (facultatif) : ce qui a été fait' : 'Votre commentaire'} accessibilityLabel="Commentaire" />
            <ErrorText text={(update.error ?? comment.error) ? ((update.error ?? comment.error) as Error).message : null} />
          </View>

          {r.history.length > 0 ? (
            <View>
              <Label>Historique</Label>
              <ListCard>
                {r.history.map((h, i) => (
                  <ListRow key={h.id} last={i === r.history.length - 1}
                    icon={<History size={20} strokeWidth={1.75} color={colors.ink3} />}
                    meta={`${fmt.exact(h.at)}${h.actor ? ` · ${h.actor.fullName}` : ''}`}
                    title={h.status ? reserveStatusLabel[h.status] : 'Commentaire'}
                    sub={h.note}
                  />
                ))}
              </ListCard>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
