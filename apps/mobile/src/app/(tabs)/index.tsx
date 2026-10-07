import { durationLabel, fmt, type TodayItem, type TodayKind } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  AlertTriangle, CalendarClock, CheckSquare, Clock, FileText, HandCoins, MessageSquare, PenLine, ReceiptEuro, ShoppingCart, UserRound, Wrench,
} from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { currentFix } from '../../lib/location';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { useNow } from '../../lib/now';
import { Figure, ListCard, ListRow, SectionTitle } from '../../ui/blocks';
import { Button, Empty, ErrorText, Loading, NetBanner, NightTag, s } from '../../ui/components';
import { colors, font, space, t } from '../../ui/theme';

const ICON: Record<TodayKind, typeof Clock> = {
  clock_open: Clock,
  task_overdue: CheckSquare,
  task_today: CheckSquare,
  client_waiting: MessageSquare,
  reserve_overdue: AlertTriangle,
  reserve_open: Wrench,
  appointment: CalendarClock,
  intervention_unsigned: PenLine,
  document_new: FileText,
  invoice_overdue: ReceiptEuro,
  quote_pending: HandCoins,
  expense_due: ShoppingCart,
};

/**
 * Aujourd'hui (F-18) : ce qui demande votre attention, dans l'ordre.
 * Calculé par des règles simples côté serveur, sans IA par défaut (CDC 4.2).
 */
export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['today'], queryFn: () => api.today(), refetchInterval: online ? 60_000 : false });
  const d = today.data;
  const open = d?.clock.open ?? null;
  const now = useNow(!!open);

  const clockOut = useMutation({
    mutationFn: async () => {
      const fix = await currentFix();
      return api.clock.out({ at: new Date().toISOString(), latitude: fix?.latitude, longitude: fix?.longitude, accuracy: fix?.accuracy });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['clock'] });
    },
  });

  const items = [...(d?.items ?? [])].sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === 'high' ? -1 : 1));
  const isStaff = me?.kind !== 'client';
  const runningMin = open ? Math.max(0, Math.floor((now - new Date(open.startedAt).getTime()) / 60000)) : 0;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <View style={{ flex: 1 }}>
          <Text style={t.appbar}>{d?.greeting ?? `Bonjour ${me?.firstName ?? ''}`}</Text>
          <Text style={[t.mention, { marginTop: 2 }]}>{todayLabel()} · {me?.company.name}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Mon compte" onPress={() => router.push('/compte')}
          style={{ alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <UserRound size={22} strokeWidth={1.75} color={colors.ink} />
          <Text style={[t.small, { fontSize: 12, color: colors.ink2 }]}>Compte</Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.view}
        contentContainerStyle={[s.content, { paddingBottom: 32 }]}
        refreshControl={<RefreshControl refreshing={today.isRefetching} onRefresh={() => today.refetch()} tintColor={colors.ink3} />}
      >
        {!online ? <NetBanner text="Hors ligne. Voici la dernière version de votre journée enregistrée sur le téléphone." /> : null}
        {today.isLoading ? <Loading /> : null}
        {today.error && !d ? <ErrorText text={(today.error as Error).message} /> : null}

        {d ? <Text style={t.statement}>{d.summary}</Text> : null}

        {/* Pointage : le seul jaune de l'écran, quand une journée est en cours */}
        {isStaff && open ? (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Clock size={22} strokeWidth={1.75} color={colors.ink} />
              <View style={{ flex: 1 }}>
                <Text style={t.bodyStrong}>Sur {open.siteName} depuis {fmt.time(open.startedAt)}</Text>
                <Text style={[t.secondary, { marginTop: 2 }]}>Pointage en cours</Text>
              </View>
              <Text style={{ fontFamily: font.mono500, fontSize: 20, color: colors.ink }}>{durationLabel(runningMin)}</Text>
            </View>
            <Button label="Terminer ma journée" onPress={() => clockOut.mutate()} busy={clockOut.isPending} disabled={!online}
              style={{ marginTop: space.s4 }} />
            <ErrorText text={clockOut.error ? (clockOut.error as Error).message : null} />
          </View>
        ) : null}

        {d && items.length > 0 ? (
          <View>
            <SectionTitle>À traiter</SectionTitle>
            <ListCard>
              {items.map((it, i) => <TodayRow key={it.id} item={it} last={i === items.length - 1} />)}
            </ListCard>
          </View>
        ) : d ? <Empty text="Rien d’urgent. Bonne journée sur les chantiers." /> : null}

        {d && d.appointments.length > 0 ? (
          <View>
            <SectionTitle>Rendez-vous du jour</SectionTitle>
            <ListCard>
              {d.appointments.map((a, i) => (
                <ListRow key={a.id} last={i === d.appointments.length - 1}
                  icon={<CalendarClock size={20} strokeWidth={1.75} color={colors.ink2} />}
                  meta={[fmt.time(a.startsAt), a.endsAt ? fmt.time(a.endsAt) : null].filter(Boolean).join(' – ')}
                  title={a.title}
                  sub={[a.site?.name, a.contact?.name, a.location].filter(Boolean).join(' · ') || null}
                  onPress={a.site ? () => go(`/chantiers/${a.site!.id}`) : undefined}
                />
              ))}
            </ListCard>
          </View>
        ) : null}

        {d && isStaff ? (
          <View style={[s.card, { flexDirection: 'row', gap: space.s3 }]}>
            <Figure value={String(d.stats.activeSites)} label="chantiers en cours" />
            <Figure value={String(d.stats.openTasks)} label="tâches ouvertes" />
            <Figure value={String(d.stats.openReserves)} label="réserves et SAV" />
          </View>
        ) : null}

        {d ? (
          <Text style={[t.small, { textAlign: 'center' }]}>
            {d.generatedBy === 'ai' ? 'Priorités proposées par Albert (IA).' : 'Priorités calculées par Albert à partir de vos chantiers.'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TodayRow({ item, last }: { item: TodayItem; last: boolean }) {
  const Icon = ICON[item.kind] ?? FileText;
  const late = item.kind === 'task_overdue' || item.kind === 'reserve_overdue' || item.kind === 'invoice_overdue' || item.kind === 'expense_due';
  return (
    <ListRow
      last={last}
      icon={<Icon size={20} strokeWidth={1.75} color={late ? colors.alerte : colors.ink2} />}
      meta={[item.site?.name, item.at ? fmt.relative(item.at) : null].filter(Boolean).join(' · ') || null}
      title={item.title}
      sub={item.subtitle}
      accent={item.kind === 'client_waiting' ? colors.client : undefined}
      right={item.urgency === 'high' ? <NightTag label={item.kind === 'invoice_overdue' ? 'À relancer' : late ? 'En retard' : 'Urgent'} /> : undefined}
      onPress={() => go(item.link)}
    />
  );
}


function todayLabel(): string {
  const d = new Date();
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
