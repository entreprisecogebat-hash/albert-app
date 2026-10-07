import { durationLabel, fmt, uuid, type TimeEntry } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { LogIn, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { addDays } from '../../../lib/dates';
import { currentFix } from '../../../lib/location';
import { useOnline } from '../../../lib/network';
import { useNow } from '../../../lib/now';
import { Figure, ListCard, ListRow, SectionTitle } from '../../../ui/blocks';
import { Button, Empty, ErrorText, Loading, NetBanner, Screen, s } from '../../../ui/components';
import { colors, font, space, t } from '../../../ui/theme';

/**
 * Pointage virtuel (F-10, F-11) : j'arrive, je repars. La position est notée si le
 * téléphone l'accepte ; sans position, le pointage est enregistré quand même.
 */
export default function ClockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const { me } = useAuth();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const state = useQuery({ queryKey: ['clock'], queryFn: () => api.clock.state() });
  const monday = startOfWeek(new Date());
  const entries = useQuery({ queryKey: ['time-entries', id], queryFn: () => api.clock.entries(id, monday.toISOString()) });
  const [note, setNote] = useState<string | null>(null);

  const open = state.data?.open ?? null;
  const hereOpen = open?.siteId === id;
  const elsewhere = open && !hereOpen ? open : null;
  const now = useNow(!!open);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['clock'] });
    qc.invalidateQueries({ queryKey: ['time-entries', id] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };

  const clock = useMutation({
    mutationFn: async () => {
      setNote('Relevé de la position…');
      const fix = await currentFix();
      setNote(fix ? `Position relevée à ${Math.round(fix.accuracy ?? 0)} m près.` : 'Pointage sans position : le téléphone ne l’a pas donnée.');
      const input = { at: new Date().toISOString(), latitude: fix?.latitude, longitude: fix?.longitude, accuracy: fix?.accuracy, clientId: uuid() };
      // Pointer ici ferme d'abord un pointage resté ouvert sur un autre chantier
      if (hereOpen) return api.clock.out(input);
      if (elsewhere) await api.clock.out(input);
      return api.clock.in(id, input);
    },
    onSuccess: refresh,
    onError: () => setNote(null),
  });

  const items = entries.data?.items ?? [];
  const mine = items.filter((e) => e.user.id === me?.id);
  const manager = site.data?.canManage;
  const runningMin = open ? Math.max(0, Math.floor((now - new Date(open.startedAt).getTime()) / 60000)) : 0;

  return (
    <Screen back title="Pointage" subtitle={site.data?.name}
      action={
        <Button
          label={hereOpen ? 'Terminer ma journée' : elsewhere ? `Quitter ${elsewhere.siteName} et pointer ici` : 'Pointer mon arrivée'}
          onPress={() => clock.mutate()} busy={clock.isPending} disabled={!online || state.isLoading}
          iconLeft={!hereOpen && !clock.isPending ? <LogIn size={22} strokeWidth={1.75} color={colors.ink} /> : undefined}
        />
      }>
      {!online ? <NetBanner text="Hors ligne. Le pointage demande du réseau ; réessayez dès que vous captez." /> : null}

      <View style={s.card}>
        {state.isLoading ? <Loading /> : hereOpen && open ? (
          <>
            <Text style={t.mention}>Vous êtes pointé sur ce chantier</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s3, marginTop: space.s2 }}>
              <Text style={{ fontFamily: font.mono500, fontSize: 32, lineHeight: 38, color: colors.ink }}>{durationLabel(runningMin)}</Text>
              <Text style={t.secondary}>depuis {fmt.time(open.startedAt)}</Text>
            </View>
            {open.startDistance != null ? <Text style={[t.small, { marginTop: space.s2 }]}>Arrivée à {formatDistance(open.startDistance)} du chantier.</Text> : null}
          </>
        ) : (
          <>
            <Text style={t.bodyStrong}>{elsewhere ? `Pointé sur ${elsewhere.siteName} depuis ${fmt.time(elsewhere.startedAt)}` : 'Pas de pointage en cours'}</Text>
            <Text style={[t.secondary, { marginTop: space.s1 }]}>
              Pointez en arrivant et en repartant. Les heures servent au suivi du chantier, pas à la paie.
            </Text>
          </>
        )}
        {note ? (
          <View style={{ flexDirection: 'row', gap: space.s2, marginTop: space.s3, alignItems: 'center' }}>
            <MapPin size={16} strokeWidth={1.75} color={colors.ink3} />
            <Text style={[t.small, { flex: 1 }]}>{note}</Text>
          </View>
        ) : null}
        <ErrorText text={clock.error ? (clock.error as Error).message : null} />
      </View>

      {state.data ? (
        <View style={[s.card, { flexDirection: 'row', gap: space.s3 }]}>
          <Figure value={durationLabel(state.data.todayMinutes + (open ? runningMin : 0)) || '0 min'} label="aujourd’hui, tous chantiers" />
          <Figure value={durationLabel(state.data.weekMinutes + (open ? runningMin : 0)) || '0 min'} label="cette semaine" />
        </View>
      ) : null}

      {entries.isLoading ? <Loading /> : null}
      {entries.error && !entries.data ? <ErrorText text={(entries.error as Error).message} /> : null}
      {entries.data ? (
        <View>
          <SectionTitle>{manager ? `Équipe cette semaine · ${durationLabel(entries.data.totalMinutes) || '0 min'}` : 'Mes pointages cette semaine'}</SectionTitle>
          {(manager ? items : mine).length ? (
            <ListCard>
              {(manager ? items : mine).map((e, i, arr) => <EntryRow key={e.id} e={e} last={i === arr.length - 1} showWho={!!manager} />)}
            </ListCard>
          ) : <Empty text="Aucun pointage cette semaine." />}
        </View>
      ) : null}
    </Screen>
  );
}

function EntryRow({ e, last, showWho }: { e: TimeEntry; last: boolean; showWho: boolean }) {
  const range = `${fmt.time(e.startedAt)} – ${e.endedAt ? fmt.time(e.endedAt) : 'en cours'}`;
  return (
    <ListRow last={last}
      meta={`${fmt.relative(e.startedAt).replace(/, \d+:\d+$/, '')} · ${range}`}
      title={showWho ? e.user.fullName : e.endedAt ? durationLabel(e.minutes) : 'En cours'}
      sub={[showWho ? (e.endedAt ? durationLabel(e.minutes) : 'En cours') : null,
        e.startLatitude == null ? 'Sans position' : e.startDistance != null ? `Arrivée à ${formatDistance(e.startDistance)}` : 'Position notée',
        e.note].filter(Boolean).join(' · ')}
    />
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // lundi = 0
  return addDays(d, -day);
}
