import { fmt, uuid, type ChannelSummary, type Message } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useOnline } from '../../../../lib/network';
import { enqueue, useOutbox, type MessagePayload } from '../../../../lib/outbox';
import { Button, ClientTag, Empty, Loading, NetBanner, Screen, s } from '../../../../ui/components';
import { colors, font, radius, space, t } from '../../../../ui/theme';

/**
 * Messagerie de chantier (F-19, F-20). Deux canaux : l'équipe, et le client.
 * Le filet teal dit, sans une ligne d'explication, ce que le client voit.
 */
export default function MessagesScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: 'internal' | 'client' }>();
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const online = useOnline();
  const { outbox, state } = useOutbox();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const channel = site.data?.channels.find((c) => c.kind === kind);
  const messages = useQuery({
    queryKey: ['messages', channel?.id],
    queryFn: () => api.channels.messages(channel!.id),
    enabled: !!channel,
    refetchInterval: online ? 15_000 : false,
  });
  const iAmStaff = me?.kind !== 'client';
  const summary = useQuery({
    queryKey: ['summary', channel?.id],
    queryFn: () => api.summaries.channel(channel!.id),
    enabled: !!channel && iAmStaff,
    staleTime: 5 * 60_000,
  });
  const [body, setBody] = useState('');
  const scroll = useRef<ScrollView>(null);

  const pending = outbox.forSite(id).filter((e) => e.kind === 'message' && (e.payload as MessagePayload).channelId === channel?.id);
  const items = messages.data?.items ?? [];
  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
  }, [items.length, pending.length]);
  void state;

  async function send() {
    const text = body.trim();
    if (!text || !channel) return;
    setBody('');
    await enqueue(outbox, { id: uuid(), kind: 'message', siteId: id, payload: { channelId: channel.id, channelKind: channel.kind, body: text } satisfies MessagePayload });
  }

  const isClientChannel = kind === 'client';
  const iAmClient = me?.kind === 'client';
  const title = isClientChannel ? (iAmClient ? 'Échanges avec l’équipe' : 'Canal client') : 'Messages de l’équipe';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={title} subtitle={site.data?.name} scroll={false} contentStyle={{ padding: 0, gap: 0 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.s4, gap: space.s3, paddingBottom: space.s4 }} style={{ flex: 1 }}>
          {isClientChannel && !iAmClient ? (
            <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'center' }}>
              <ClientTag />
              <Text style={[t.mention, { flex: 1 }]}>Le client lit et écrit dans cette conversation.</Text>
            </View>
          ) : null}
          {!online ? <NetBanner text="Hors ligne. Vos messages partiront dès que vous captez." /> : null}
          {summary.data && summary.data.messagesCount > 2 ? <SummaryCard sum={summary.data} /> : null}
          {messages.isLoading ? <Loading /> : null}
          {messages.data && items.length === 0 && pending.length === 0 ? <Empty text="Aucun message pour le moment." /> : null}
          {items.map((m) => <Bubble key={m.id} m={m} clientChannel={isClientChannel} />)}
          {pending.map((e) => (
            <Bubble key={e.id} pending clientChannel={isClientChannel}
              m={{ id: e.id, body: (e.payload as MessagePayload).body, createdAt: e.createdAt, mine: true, author: null } as unknown as Message} />
          ))}
        </ScrollView>
        <View style={[s.actionbar, { position: 'relative', paddingBottom: Math.max(insets.bottom, space.s3), flexDirection: 'row', gap: space.s2, alignItems: 'flex-end' }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={isClientChannel && !iAmClient ? 'Répondre au client' : 'Écrire un message'}
            placeholderTextColor={colors.ink3}
            multiline
            accessibilityLabel="Votre message"
            style={{ flex: 1, minHeight: 56, maxHeight: 140, paddingHorizontal: space.s4, paddingTop: 16, paddingBottom: 14, fontFamily: font.sans400, fontSize: 17, color: colors.ink, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r1, backgroundColor: colors.paper }}
          />
          <Button label="Envoyer" onPress={send} disabled={!body.trim() || !channel} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, pending, clientChannel }: { m: Message; pending?: boolean; clientChannel: boolean }) {
  const mine = m.mine;
  const fromClient = m.author?.kind === 'client';
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
      <Text style={[t.meta, { textAlign: mine ? 'right' : 'left', marginBottom: 4 }]}>
        {pending ? 'En attente de réseau' : `${mine ? 'Vous' : m.author?.fullName ?? 'Albert'} · ${fmt.relative(m.createdAt)}`}
      </Text>
      <View
        style={{
          backgroundColor: mine ? colors.paper : colors.bg2,
          borderWidth: 1,
          borderColor: colors.rule2,
          borderRadius: radius.r2,
          paddingHorizontal: space.s4,
          paddingVertical: space.s3,
          opacity: pending ? 0.6 : 1,
          ...(clientChannel && fromClient ? { borderLeftWidth: 3, borderLeftColor: colors.client } : null),
        }}
      >
        <Text style={[t.body, { lineHeight: 24 }]}>{m.body}</Text>
      </View>
    </View>
  );
}

/** Résumé des échanges (F-17) : ce qu'il faut savoir avant de lire tout le fil. Replié par défaut. */
function SummaryCard({ sum }: { sum: ChannelSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r2 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s4, minHeight: 56 }}>
        <Sparkles size={20} strokeWidth={1.75} color={colors.ink2} />
        <View style={{ flex: 1 }}>
          <Text style={[t.bodyStrong, { fontSize: 16 }]}>Résumé des échanges</Text>
          <Text style={t.small}>
            {fmt.plural(sum.messagesCount, 'message')}
            {sum.openQuestions.length ? ` · ${fmt.plural(sum.openQuestions.length, 'question ouverte', 'questions ouvertes')}` : ''}
          </Text>
        </View>
        {open ? <ChevronUp size={20} strokeWidth={1.75} color={colors.ink3} /> : <ChevronDown size={20} strokeWidth={1.75} color={colors.ink3} />}
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space.s4, paddingBottom: space.s4, gap: space.s3 }}>
          <Text style={[t.body, { lineHeight: 24 }]}>{sum.text}</Text>
          {sum.openQuestions.length > 0 ? (
            <View>
              <Text style={[t.mention, { marginBottom: space.s1 }]}>Sans réponse</Text>
              {sum.openQuestions.map((q, i) => (
                <Text key={i} style={[t.secondary, { color: colors.ink, marginTop: 2 }]}>« {q.body} » · {q.author}, {fmt.relative(q.at).toLowerCase()}</Text>
              ))}
            </View>
          ) : null}
          {sum.keyPoints.length > 0 ? (
            <View>
              <Text style={[t.mention, { marginBottom: space.s1 }]}>Points clés</Text>
              {sum.keyPoints.map((k, i) => <Text key={i} style={[t.secondary, { color: colors.ink, marginTop: 2 }]}>• {k}</Text>)}
            </View>
          ) : null}
          <Text style={t.small}>
            {sum.participants.length ? `Entre ${sum.participants.join(', ')}. ` : ''}
            {sum.generatedBy === 'ai' ? 'Rédigé par Albert (IA).' : 'Établi par Albert à partir des messages.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
