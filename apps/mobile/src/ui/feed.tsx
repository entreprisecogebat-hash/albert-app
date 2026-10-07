import { fmt, phaseLabel, type FeedItem, type OutboxEntry, type SiteCard as SiteCardT } from '@albert/shared';
import { Image } from 'expo-image';
import { Archive, Calendar, CalendarClock, Camera, CheckSquare, FileText, Flag, LogIn, LogOut, MessageSquare, PenLine, PencilLine, Settings2, Share2, UserPlus, Clock, Wrench, HandCoins, ReceiptEuro, BanknoteArrowDown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DocumentPayload, MessagePayload, PhotoPayload } from '../lib/outbox';
import { ClientTag, Dot, NightTag, s as cs } from './components';
import { Cover, Pill, Progress } from './kit';
import { colors, font, radius, space, t } from './theme';

/* ---------- Carte chantier : la photo, l'état en un coup d'oeil, ce qui demande une action. ---------- */

export function SiteCard({ site, onPress }: { site: SiteCardT; onPress: () => void }) {
  const phaseTone = site.phase === 'pendant' ? 'accent' : site.phase === 'apres' ? 'sync' : 'neutral';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Chantier ${site.name}`} onPress={onPress}
      style={({ pressed }) => [st.site, pressed && { transform: [{ scale: 0.99 }], backgroundColor: colors.bg }]}>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <Cover uri={site.cover} name={site.name} size={72} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s2 }}>
            <Text style={[t.cardTitle, { flex: 1 }]} numberOfLines={2}>{site.name}</Text>
            {site.newCount > 0 ? (
              <View style={st.newDot} accessibilityLabel={fmt.plural(site.newCount, 'nouveauté')}>
                <Text style={st.newDotText}>{site.newCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[t.small, { marginTop: 2 }]} numberOfLines={1}>{site.address}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.s2 }}>
            <Pill small tone={phaseTone} label={site.status === 'archived' ? 'Archivé' : phaseLabel[site.phase]} />
            {site.alerts > 0 ? <Pill small tone="alerte" label={`${site.alerts} en retard`} /> : null}
            {site.awaitingReply ? <Pill small tone="client" label="Client en attente" /> : null}
          </View>
        </View>
      </View>
      {site.progress ? (
        <View style={{ marginTop: space.s4 }}>
          <Progress value={site.progress.value} label={site.progress.label} />
        </View>
      ) : null}
      {site.nextAppointment || site.lastActivity ? (
        <View style={st.foot}>
          {site.nextAppointment ? (
            <Text style={[t.small, { color: colors.ink2 }]} numberOfLines={1}>
              <Text style={{ fontFamily: font.sans600 }}>Prochain RDV · </Text>{site.nextAppointment.title}, {fmt.relative(site.nextAppointment.startsAt).toLowerCase()}
            </Text>
          ) : site.lastActivity ? (
            <Text style={[t.small, { color: colors.ink2 }]} numberOfLines={1}>
              {site.lastActivity.text} {fmt.relative(site.lastActivity.at).toLowerCase()}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/* ---------- Fil : photos, documents, messages et événements dans un fil unique ---------- */

const ICON = {
  photos_added: Camera,
  document_added: FileText,
  document_version: FileText,
  document_reclassified: PencilLine,
  message: MessageSquare,
  member_added: UserPlus,
  site_created: Flag,
  note: Calendar,
  task_done: CheckSquare,
  clock_in: LogIn,
  clock_out: LogOut,
  intervention_signed: PenLine,
  reserve_opened: Wrench,
  reserve_updated: Wrench,
  appointment: CalendarClock,
  phase_changed: Settings2,
  doe_generated: Archive,
  share_created: Share2,
  quote_accepted: HandCoins,
  invoice_sent: ReceiptEuro,
  payment_received: BanknoteArrowDown,
} as const;

const KIND_WORD: Record<string, string> = {
  document_added: 'Document',
  document_version: 'Nouvelle version',
  document_reclassified: 'Classement corrigé',
  note: 'Événement',
  site_created: 'Chantier',
  member_added: 'Équipe',
  task_done: 'Tâche faite',
  clock_in: 'Pointage',
  clock_out: 'Pointage',
  intervention_signed: 'Fiche d’intervention',
  reserve_opened: 'Réserve',
  reserve_updated: 'Réserve',
  appointment: 'Rendez-vous',
  phase_changed: 'Chantier',
  doe_generated: 'DOE',
  share_created: 'Partage',
  quote_accepted: 'Devis accepté',
  invoice_sent: 'Facture',
  payment_received: 'Paiement reçu',
};

export function FeedRow({ item, onPress, last }: { item: FeedItem; onPress?: () => void; last?: boolean }) {
  const Icon = ICON[item.type] ?? FileText;
  const isClient = item.type === 'message' && item.channel === 'client';
  const who = item.actor?.fullName;
  const meta = [fmt.relative(item.occurredAt), item.type === 'photos_added' || item.type === 'message' ? who : (who ?? KIND_WORD[item.type])]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [st.item, !last && st.itemRule, isClient && st.itemClient, pressed && { backgroundColor: colors.bg }]}>
      <View style={st.ic}><Icon size={20} strokeWidth={1.75} color={colors.ink2} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={t.meta}>{meta}</Text>
        {isClient ? (
          <View style={{ flexDirection: 'row', gap: space.s2, marginTop: space.s1, flexWrap: 'wrap' }}>
            <ClientTag />
            {item.awaitingReply ? <NightTag label="Réponse attendue" /> : null}
          </View>
        ) : null}
        <Text style={[st.ttl, isClient && { marginTop: space.s2 }]}>{item.type === 'message' ? item.body : item.title}</Text>
        {item.type === 'photos_added' ? (
          <>
            {item.caption ? <Text style={st.sub}>{item.caption}</Text> : null}
            <View style={st.thumbs}>
              {(item.photos ?? []).slice(0, 4).map((p) => (
                <Image key={p.id} source={{ uri: p.thumbUrl }} style={st.thumb} contentFit="cover" transition={150} accessibilityLabel="Photo du chantier" />
              ))}
              {(item.photos?.length ?? 0) > 4 ? (
                <View style={[st.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={t.value}>+{(item.photos?.length ?? 0) - 4}</Text>
                </View>
              ) : null}
            </View>
            <Text style={st.geo}>
              {[item.located ? addressHint(item) : 'Sans position', fmt.takenRange(item.takenFrom, item.takenTo)].filter(Boolean).join(', ')}
            </Text>
          </>
        ) : item.type !== 'message' && item.subtitle ? (
          <Text style={st.sub}>{item.subtitle}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Mention discrète de la position : "Localisées" + coordonnées courtes. */
function addressHint(item: FeedItem): string {
  if (item.latitude === undefined || item.longitude === undefined) return 'Localisées';
  return `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`;
}

/* ---------- Éléments encore sur le téléphone ---------- */

export function PendingRow({ entry, last }: { entry: OutboxEntry; last?: boolean }) {
  let title = '';
  let sub = entry.failed ? (entry.lastError ?? "Le serveur a refusé cet envoi.") : 'Enregistré sur le téléphone. Partira dès que vous captez.';
  let Icon = FileText;
  if (entry.kind === 'photo') {
    const p = entry.payload as PhotoPayload;
    title = p.caption ? `Photo · ${p.caption}` : 'Photo';
    Icon = Camera;
  } else if (entry.kind === 'document') {
    const p = entry.payload as DocumentPayload;
    title = p.title ?? p.filename;
    if (!entry.failed) sub = `${p.statement} ${sub}`;
  } else {
    const p = entry.payload as MessagePayload;
    title = p.body;
    Icon = MessageSquare;
  }
  return (
    <View style={[st.item, !last && st.itemRule]}>
      <View style={st.ic}>{entry.failed ? <Icon size={20} strokeWidth={1.75} color={colors.alerte} /> : <Clock size={20} strokeWidth={1.75} color={colors.ink3} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={t.meta}>{fmt.relative(entry.createdAt)} · {entry.failed ? 'Non envoyé' : 'En attente de réseau'}</Text>
        <Text style={st.ttl} numberOfLines={2}>{title}</Text>
        <Text style={[st.sub, entry.failed && { color: colors.alerte }]}>{sub}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  site: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule, borderRadius: radius.r3, padding: space.s3, paddingBottom: space.s4 },
  foot: { marginTop: space.s3, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.rule },
  newDot: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  newDotText: { fontFamily: font.sans600, fontSize: 12, color: colors.nightInk },
  row1: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  last: { flexDirection: 'row', gap: space.s2, marginTop: space.s3, alignItems: 'flex-start' },
  item: { flexDirection: 'row', gap: space.s4, paddingVertical: space.s4, minHeight: 56 },
  itemRule: { borderBottomWidth: 1, borderBottomColor: colors.rule },
  itemClient: { borderLeftWidth: 3, borderLeftColor: colors.client, marginLeft: -space.s4, paddingLeft: 13 },
  ic: { width: 40, height: 40, borderRadius: radius.r1, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' },
  ttl: { fontFamily: font.sans600, fontSize: 17, lineHeight: 22, color: colors.ink, marginTop: 3 },
  sub: { ...t.secondary, marginTop: space.s1 },
  geo: { ...t.small, marginTop: space.s2 },
  thumbs: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },
  thumb: { width: 58, height: 58, borderRadius: radius.r1, borderWidth: 1, borderColor: colors.rule2, backgroundColor: colors.bg2 },
});

export const feedCard = [cs.card, { paddingVertical: 0 }];
