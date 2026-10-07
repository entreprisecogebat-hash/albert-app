import { durationLabel, fmt, type SiteCard, type TodayItem, type TodayKind } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  AlertTriangle, Building2, CalendarClock, Camera, CheckSquare, Clock, FileText, HandCoins, Hourglass, LogIn, LogOut, MessageSquare,
  PenLine, ReceiptEuro, ShoppingCart, UserRound, Wallet, Wrench,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { currentFix } from '../../lib/location';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { useNow } from '../../lib/now';
import { Empty, ErrorText, Loading, NetBanner } from '../../ui/components';
import {
  ActionRow, Avatar, Cover, Hero, Kpi, KpiGrid, Panel, Pill, Progress, QuickAction, QuickActions, Rail, Section, Sheet, Wordmark, compactMoney, kit, type Tone,
} from '../../ui/kit';
import { colors, font, radius, space, t } from '../../ui/theme';

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

/** Ce que dit la pastille d'un point, et sa teinte. Le mot porte le sens, la couleur aide à trier. */
function badge(it: TodayItem): { label: string; tone: Tone } | null {
  switch (it.kind) {
    case 'client_waiting': return { label: 'Client', tone: 'client' };
    case 'invoice_overdue': return { label: 'À relancer', tone: 'alerte' };
    case 'task_overdue':
    case 'reserve_overdue': return { label: 'En retard', tone: 'alerte' };
    case 'expense_due': return { label: it.urgency === 'high' ? 'En retard' : 'À payer', tone: it.urgency === 'high' ? 'alerte' : 'accent' };
    case 'intervention_unsigned': return { label: 'À signer', tone: 'accent' };
    case 'task_today': return { label: 'Aujourd’hui', tone: 'accent' };
    case 'quote_pending': return { label: 'Sans réponse', tone: 'neutral' };
    case 'document_new': return { label: 'Nouveau', tone: 'sync' };
    default: return null;
  }
}

function toneOf(it: TodayItem): Tone {
  return badge(it)?.tone ?? 'neutral';
}

/**
 * Accueil : le tableau de bord de la journée.
 * D'abord les chiffres qui comptent, puis les 3 choses à faire maintenant, puis l'agenda et les chantiers.
 * Le reste attend derrière « Tout voir » : on ne noie pas l'essentiel.
 */
export default function HomeScreen() {
  const { me } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const isStaff = me?.kind !== 'client';

  const today = useQuery({ queryKey: ['today'], queryFn: () => api.today(), refetchInterval: online ? 60_000 : false });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const managesSomething = (sites.data?.items ?? []).some((s) => s.role === 'manager') || !!me?.admin;
  const finances = useQuery({
    queryKey: ['finances', 'all'],
    queryFn: () => api.finances.list({}),
    enabled: isStaff && managesSomething,
    retry: false,
  });

  const d = today.data;
  const open = d?.clock.open ?? null;
  const now = useNow(!!open);
  const runningMin = open ? Math.max(0, Math.floor((now - new Date(open.startedAt).getTime()) / 60000)) : 0;

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

  const items = d?.items ?? [];
  const urgent = items.filter((i) => i.urgency === 'high' && i.kind !== 'clock_open');
  const later = items.filter((i) => i.urgency !== 'high' && i.kind !== 'clock_open' && i.kind !== 'appointment');
  const top = (urgent.length ? urgent : later).slice(0, 3);
  const rest = items.length - top.length - (open ? 1 : 0) - items.filter((i) => i.kind === 'appointment').length;
  const myCards = sites.data?.items ?? [];
  const activeCards = myCards.filter((s) => s.phase !== 'apres' || s.alerts > 0 || s.awaitingReply);
  const summary = finances.data?.summary;

  const refresh = () => {
    today.refetch();
    sites.refetch();
    if (finances.isFetched) finances.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={today.isRefetching} onRefresh={refresh} tintColor={colors.night3} />}
      >
        {/* ---------- Bandeau ---------- */}
        <Hero>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark />
            <Pressable accessibilityRole="button" accessibilityLabel="Mon compte" onPress={() => router.push('/compte')} hitSlop={8}>
              {me ? <Avatar name={me.fullName} size={40} ring="rgba(255,255,255,0.18)" /> : <UserRound size={22} color={colors.nightInk} />}
            </Pressable>
          </View>
          <Text style={[kit.heroTitle, { marginTop: space.s5 }]}>{d?.greeting ?? `Bonjour ${me?.firstName ?? ''}`}</Text>
          <Text style={[kit.heroSub, { marginTop: 4 }]}>{todayLabel()} · {me?.company.name}</Text>

          {isStaff && open ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s5, padding: space.s3, paddingLeft: space.s4,
              borderRadius: radius.r3, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sync }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.sans600, fontSize: 15, color: colors.nightInk }} numberOfLines={1}>Sur {open.siteName}</Text>
                <Text style={{ fontFamily: font.sans400, fontSize: 13, color: colors.night3 }}>Depuis {fmt.time(open.startedAt)} · {durationLabel(runningMin)}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => clockOut.mutate()} disabled={!online || clockOut.isPending}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill,
                  paddingHorizontal: space.s4, minHeight: 44 }, (pressed || clockOut.isPending) && { opacity: 0.8 }, !online && { opacity: 0.45 }]}>
                <LogOut size={18} strokeWidth={2} color={colors.ink} />
                <Text style={{ fontFamily: font.sans600, fontSize: 15, color: colors.ink }}>Départ</Text>
              </Pressable>
            </View>
          ) : null}
          <ErrorText text={clockOut.error ? (clockOut.error as Error).message : null} />
        </Hero>

        <Sheet>
          {/* ---------- Chiffres clés ---------- */}
          {d && isStaff ? (
            <KpiGrid>
              <Kpi icon={<AlertTriangle size={18} strokeWidth={2} color={urgent.length ? colors.alerte : colors.ink2} />} tone={urgent.length ? 'alerte' : undefined}
                value={String(urgent.length)} label={urgent.length > 1 ? 'points urgents' : 'point urgent'} hint={later.length ? `${later.length} autres à suivre` : null}
                onPress={() => setShowAll(true)} />
              <Kpi icon={<Building2 size={18} strokeWidth={2} color={colors.ink2} />} value={String(d.stats.activeSites)}
                label={d.stats.activeSites > 1 ? 'chantiers suivis' : 'chantier suivi'}
                hint={d.stats.clientWaiting ? `${d.stats.clientWaiting} client${d.stats.clientWaiting > 1 ? 's' : ''} en attente` : null}
                tone={d.stats.clientWaiting ? 'client' : undefined} onPress={() => router.push('/chantiers')} />
              {d.clock.weekMinutes > 0 || open ? (
                <Kpi icon={<Hourglass size={18} strokeWidth={2} color={colors.ink2} />} value={durationLabel(d.clock.weekMinutes)}
                  label="pointées cette semaine" hint={d.clock.todayMinutes ? `${durationLabel(d.clock.todayMinutes)} aujourd’hui` : null} />
              ) : (
                <Kpi icon={<CheckSquare size={18} strokeWidth={2} color={colors.ink2} />} value={String(d.stats.openTasks)}
                  label={d.stats.openTasks > 1 ? 'tâches ouvertes' : 'tâche ouverte'}
                  hint={d.stats.openReserves ? `${d.stats.openReserves} réserves et SAV` : null} />
              )}
              {summary ? (
                <Kpi icon={<Wallet size={18} strokeWidth={2} color={summary.overdueTtc ? colors.alerte : colors.ink2} />} tone={summary.overdueTtc ? 'alerte' : undefined}
                  value={compactMoney(summary.outstandingTtc)} label="à encaisser"
                  hint={summary.overdueTtc ? `${compactMoney(summary.overdueTtc)} en retard` : 'Rien en retard'} />
              ) : (
                <Kpi icon={<CheckSquare size={18} strokeWidth={2} color={colors.ink2} />} value={String(d.stats.openTasks)}
                  label={d.stats.openTasks > 1 ? 'tâches ouvertes' : 'tâche ouverte'}
                  hint={d.stats.openReserves ? `${d.stats.openReserves} réserves et SAV` : null} />
              )}
            </KpiGrid>
          ) : null}

          {/* Client : son chantier, en grand */}
          {!isStaff && myCards[0] ? <ClientSiteCard site={myCards[0]} /> : null}

          {!online ? <NetBanner text="Hors ligne. Voici la dernière version de votre journée enregistrée sur le téléphone." /> : null}
          {today.isLoading ? <Loading /> : null}
          {today.error && !d ? <ErrorText text={(today.error as Error).message} /> : null}

          {/* ---------- Raccourcis ---------- */}
          {isStaff ? (
            <QuickActions>
              <QuickAction primary icon={<Camera size={24} strokeWidth={2} color={colors.ink} />} label="Photo" onPress={() => go('/ajouter?action=photo')} />
              <QuickAction icon={open ? <LogOut size={22} strokeWidth={1.75} color={colors.ink} /> : <LogIn size={22} strokeWidth={1.75} color={colors.ink} />}
                label={open ? 'Départ' : 'Arrivée'} onPress={() => (open ? clockOut.mutate() : go('/ajouter?action=pointer'))} />
              <QuickAction icon={<CheckSquare size={22} strokeWidth={1.75} color={colors.ink} />} label="Tâche" onPress={() => go('/ajouter?action=tache')} />
              <QuickAction icon={<MessageSquare size={22} strokeWidth={1.75} color={colors.ink} />} label="Message" onPress={() => go('/ajouter?action=message')} />
            </QuickActions>
          ) : null}

          {/* ---------- À faire maintenant ---------- */}
          {d ? (
            <Section title={showAll ? 'Tout ce qui vous attend' : 'À faire maintenant'}
              action={showAll ? 'Réduire' : rest > 0 ? `Tout voir (${items.length - (open ? 1 : 0)})` : undefined}
              onAction={() => setShowAll((v) => !v)}>
              {items.length === 0 || (top.length === 0 && !showAll) ? (
                <Panel><Empty text="Rien d’urgent. Bonne journée sur les chantiers." /></Panel>
              ) : (
                <Panel padded={false}>
                  {(showAll ? items.filter((i) => i.kind !== 'clock_open') : top).map((it, i, arr) => (
                    <PriorityRow key={it.id} item={it} last={i === arr.length - 1} />
                  ))}
                </Panel>
              )}
            </Section>
          ) : null}

          {/* ---------- Agenda du jour ---------- */}
          {d && d.appointments.length > 0 ? (
            <Section title="Aujourd’hui" action={isStaff ? 'Agenda' : undefined} onAction={() => router.push('/agenda')}>
              <Panel padded={false}>
                {d.appointments.map((a, i) => {
                  const past = a.endsAt ? new Date(a.endsAt).getTime() < Date.now() : false;
                  return (
                    <Pressable key={a.id} accessibilityRole="button" disabled={!a.site} onPress={() => a.site && go(`/chantiers/${a.site.id}`)}
                      style={({ pressed }) => [{ flexDirection: 'row', gap: space.s4, padding: space.s4, alignItems: 'flex-start' },
                        i < d.appointments.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.rule }, pressed && { backgroundColor: colors.bg }, past && { opacity: 0.5 }]}>
                      <View style={{ width: 52 }}>
                        <Text style={{ fontFamily: font.display700, fontSize: 18, color: colors.ink }}>{fmt.time(a.startsAt)}</Text>
                        {a.endsAt ? <Text style={t.small}>{fmt.time(a.endsAt)}</Text> : null}
                      </View>
                      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: past ? colors.rule2 : colors.accent }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: font.sans600, fontSize: 16, lineHeight: 21, color: colors.ink }}>{a.title}</Text>
                        <Text style={[t.secondary, { marginTop: 2 }]} numberOfLines={2}>{[a.site?.name, a.contact?.name].filter(Boolean).join(' · ')}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </Panel>
            </Section>
          ) : null}

          {/* ---------- Mes chantiers ---------- */}
          {isStaff && activeCards.length > 0 ? (
            <Section title="Mes chantiers" action="Tous" onAction={() => router.push('/chantiers')}>
              <Rail>
                {activeCards.map((s) => <MiniSiteCard key={s.id} site={s} />)}
              </Rail>
            </Section>
          ) : null}

          {/* ---------- Trésorerie (responsables) ---------- */}
          {summary && (summary.invoicedTtc > 0 || summary.expensesToPayTtc > 0) ? (
            <Section title="Trésorerie">
              <Panel>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text style={t.mention}>Encaissé</Text>
                    <Text style={{ fontFamily: font.display700, fontSize: 24, color: colors.ink }}>{compactMoney(summary.paidTtc)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={t.mention}>Facturé TTC</Text>
                    <Text style={{ fontFamily: font.display700, fontSize: 18, color: colors.ink2 }}>{compactMoney(summary.invoicedTtc)}</Text>
                  </View>
                </View>
                <View style={{ marginTop: space.s3 }}>
                  <Progress value={summary.invoicedTtc ? summary.paidTtc / summary.invoicedTtc : 0} height={10} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s4 }}>
                  {summary.overdueTtc ? <Pill tone="alerte" label={`${compactMoney(summary.overdueTtc)} en retard`} /> : <Pill tone="sync" label="Aucun retard de paiement" />}
                  {summary.expensesToPayTtc ? <Pill tone="accent" label={`${compactMoney(summary.expensesToPayTtc)} à payer`} /> : null}
                  {summary.marginRate != null ? <Pill tone="neutral" label={`Marge prévue ${fmt.percent(summary.marginRate)}`} /> : null}
                </View>
              </Panel>
            </Section>
          ) : null}

          {d ? (
            <Text style={[t.small, { textAlign: 'center' }]}>
              {d.generatedBy === 'ai' ? 'Priorités proposées par Albert (IA).' : 'Priorités calculées par Albert à partir de vos chantiers.'}
            </Text>
          ) : null}
        </Sheet>
      </ScrollView>
    </View>
  );
}

function PriorityRow({ item, last }: { item: TodayItem; last: boolean }) {
  const Icon = ICON[item.kind] ?? FileText;
  const b = badge(item);
  const tone = toneOf(item);
  const tint = tone === 'alerte' ? colors.alerte : tone === 'client' ? '#0B6E75' : tone === 'accent' ? '#7A5B00' : colors.ink2;
  return (
    <ActionRow
      last={last}
      tone={tone}
      icon={<Icon size={20} strokeWidth={2} color={tint} />}
      meta={item.site?.name ?? null}
      title={item.title}
      sub={item.subtitle}
      right={b ? <Pill small tone={b.tone} label={b.label} /> : undefined}
      onPress={() => go(item.link)}
    />
  );
}

/** Carte compacte du carrousel : photo, nom, avancement, alertes. */
function MiniSiteCard({ site }: { site: SiteCard }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Chantier ${site.name}`} onPress={() => go(`/chantiers/${site.id}`)}
      style={({ pressed }) => [{ width: 232, backgroundColor: colors.paper, borderRadius: radius.r3, borderWidth: 1, borderColor: colors.rule, overflow: 'hidden' },
        pressed && { transform: [{ scale: 0.98 }] }]}>
      <View>
        <Cover uri={site.cover} name={site.name} width={232} height={112} rounded={0} />
        <View style={{ position: 'absolute', left: space.s3, top: space.s3, flexDirection: 'row', gap: 6 }}>
          {site.alerts > 0 ? <Pill small tone="alerte" label={`${site.alerts} en retard`} /> : null}
          {site.awaitingReply ? <Pill small tone="client" label="Client" /> : null}
        </View>
      </View>
      <View style={{ padding: space.s4, gap: space.s3 }}>
        <View>
          <Text style={{ fontFamily: font.display700, fontSize: 18, lineHeight: 22, color: colors.ink }} numberOfLines={1}>{site.name}</Text>
          <Text style={[t.small, { marginTop: 2 }]} numberOfLines={1}>{site.address}</Text>
        </View>
        {site.progress ? <Progress value={site.progress.value} label={site.progress.label} /> : <Text style={t.small}>Pas encore d’avancement</Text>}
      </View>
    </Pressable>
  );
}

/** Le client n'a qu'un chantier en tête : on le lui montre en grand. */
function ClientSiteCard({ site }: { site: SiteCard }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => go(`/chantiers/${site.id}`)}
      style={({ pressed }) => [{ backgroundColor: colors.paper, borderRadius: radius.r3, overflow: 'hidden', borderWidth: 1, borderColor: colors.rule },
        pressed && { opacity: 0.95 }]}>
      <Cover uri={site.cover} name={site.name} width="100%" height={160} rounded={0} />
      <View style={{ padding: space.s4, gap: space.s3 }}>
        <Text style={t.mention}>Votre chantier</Text>
        <Text style={{ fontFamily: font.display700, fontSize: 24, color: colors.ink }}>{site.name}</Text>
        <Text style={t.secondary}>{site.address}</Text>
        {site.nextAppointment ? (
          <Pill tone="accent" icon={<CalendarClock size={14} strokeWidth={2} color="#7A5B00" />}
            label={`${site.nextAppointment.title} · ${fmt.relative(site.nextAppointment.startsAt)}`} />
        ) : null}
        {site.newCount > 0 ? <Pill tone="sync" label={fmt.plural(site.newCount, 'nouveauté')} /> : null}
      </View>
    </Pressable>
  );
}

function todayLabel(): string {
  const d = new Date();
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
