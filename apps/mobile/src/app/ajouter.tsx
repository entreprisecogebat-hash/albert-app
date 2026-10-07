import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CheckSquare, FileText, LogIn, MessageSquare, PenLine, Wrench, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { go } from '../lib/nav';
import { Loading } from '../ui/components';
import { ActionRow, Cover, Panel, Pill, Progress, type Tone } from '../ui/kit';
import { colors, font, radius, space, t } from '../ui/theme';

type Action = 'photo' | 'pointer' | 'tache' | 'message' | 'document' | 'reserve' | 'intervention';

const ACTIONS: { key: Action; label: string; sub: string; icon: (c: string) => ReactNode; tone: Tone }[] = [
  { key: 'photo', label: 'Prendre des photos', sub: 'Horodatées et situées, rangées dans le fil.', icon: (c) => <Camera size={22} strokeWidth={2} color={c} />, tone: 'accent' },
  { key: 'pointer', label: 'Pointer mon arrivée', sub: 'Début de journée sur un chantier.', icon: (c) => <LogIn size={22} strokeWidth={2} color={c} />, tone: 'sync' },
  { key: 'tache', label: 'Créer une tâche', sub: 'Pour vous ou quelqu’un de l’équipe.', icon: (c) => <CheckSquare size={22} strokeWidth={2} color={c} />, tone: 'neutral' },
  { key: 'message', label: 'Écrire à l’équipe', sub: 'Dans la conversation du chantier.', icon: (c) => <MessageSquare size={22} strokeWidth={2} color={c} />, tone: 'client' },
  { key: 'document', label: 'Déposer un document', sub: 'Plan, devis, facture : Albert le range.', icon: (c) => <FileText size={22} strokeWidth={2} color={c} />, tone: 'neutral' },
  { key: 'reserve', label: 'Signaler une réserve', sub: 'Réserve, SAV ou garantie.', icon: (c) => <Wrench size={22} strokeWidth={2} color={c} />, tone: 'alerte' },
  { key: 'intervention', label: 'Fiche d’intervention', sub: 'À faire signer au client.', icon: (c) => <PenLine size={22} strokeWidth={2} color={c} />, tone: 'neutral' },
];

const TONE_INK: Record<Tone, string> = { alerte: '#9C3221', client: '#0B6E75', sync: '#1F7A37', accent: '#7A5B00', night: colors.ink, neutral: colors.ink2 };

/**
 * Ajouter, depuis n'importe où : d'abord quoi, puis sur quel chantier.
 * Deux gestes au plus, et le chantier où l'on est pointé est proposé en premier.
 */
export default function QuickAddScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ action?: Action }>();
  const action = ACTIONS.find((a) => a.key === params.action) ?? null;
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const clock = useQuery({ queryKey: ['clock'], queryFn: () => api.clock.state() });

  const current = clock.data?.open?.siteId;
  const list = (sites.data?.items ?? [])
    .filter((s) => s.role !== 'client' && s.status === 'active')
    .sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : a.phase === 'pendant' && b.phase !== 'pendant' ? -1 : b.phase === 'pendant' && a.phase !== 'pendant' ? 1 : 0));

  const open = (siteId: string) => {
    const paths: Record<Action, string> = {
      photo: `/chantiers/${siteId}/photos?source=camera`,
      pointer: `/chantiers/${siteId}/pointage`,
      tache: `/chantiers/${siteId}/taches`,
      message: `/chantiers/${siteId}/messages/internal`,
      document: `/chantiers/${siteId}/document`,
      reserve: `/chantiers/${siteId}/reserve-nouvelle`,
      intervention: `/chantiers/${siteId}/intervention-nouvelle`,
    };
    router.back();
    setTimeout(() => go(paths[action!.key]), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s4, paddingVertical: space.s3, gap: space.s3 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.display700, fontSize: 26, letterSpacing: -0.6, color: colors.ink }}>
            {action ? action.label : 'Ajouter'}
          </Text>
          <Text style={t.secondary}>{action ? 'Sur quel chantier ?' : 'Que voulez-vous faire ?'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => router.back()} hitSlop={8}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
          <X size={22} strokeWidth={2} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.s4, paddingBottom: 48 + insets.bottom, gap: space.s4 }}>
        {!action ? (
          <Panel padded={false}>
            {ACTIONS.map((a, i) => (
              <ActionRow key={a.key} last={i === ACTIONS.length - 1} tone={a.tone} icon={a.icon(TONE_INK[a.tone])}
                title={a.label} sub={a.sub} onPress={() => router.setParams({ action: a.key })} />
            ))}
          </Panel>
        ) : (
          <>
            {sites.isLoading ? <Loading /> : null}
            {list.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${action.label} sur ${s.name}`} onPress={() => open(s.id)}
                style={({ pressed }) => [{ flexDirection: 'row', gap: space.s3, alignItems: 'center', padding: space.s3, backgroundColor: colors.paper,
                  borderRadius: radius.r3, borderWidth: s.id === current ? 2 : 1, borderColor: s.id === current ? colors.accent : colors.rule },
                  pressed && { backgroundColor: colors.bg }]}>
                <Cover uri={s.cover} name={s.name} size={60} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontFamily: font.sans600, fontSize: 17, color: colors.ink }} numberOfLines={1}>{s.name}</Text>
                  <Text style={t.small} numberOfLines={1}>{s.address}</Text>
                  {s.id === current ? <Pill small tone="sync" label="Vous y êtes pointé" /> : s.progress ? <Progress value={s.progress.value} height={4} /> : null}
                </View>
              </Pressable>
            ))}
            {sites.data && list.length === 0 ? <Text style={[t.secondary, { textAlign: 'center' }]}>Vous n’êtes sur aucun chantier en cours.</Text> : null}
            {!params.action ? null : (
              <Pressable accessibilityRole="button" onPress={() => router.setParams({ action: undefined })} style={{ alignSelf: 'center', padding: space.s3 }}>
                <Text style={{ fontFamily: font.sans600, fontSize: 15, color: colors.ink2, textDecorationLine: 'underline' }}>Choisir une autre action</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
