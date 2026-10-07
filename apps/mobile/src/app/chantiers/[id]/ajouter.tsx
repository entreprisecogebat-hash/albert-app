import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, FileText, Images, MessageSquare, Camera, CheckSquare, Clock, Euro, PenLine, Wrench } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { Button, Screen, s } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/** Ajouter à un chantier. L'action la plus fréquente, la photo, est le bouton principal. */
export default function AddScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const name = site.data?.name ?? 'ce chantier';

  return (
    <Screen
      back
      title={`Ajouter à ${name}`}
      action={
        <Button
          label="Prendre des photos"
          iconLeft={<Camera size={22} strokeWidth={1.75} color={colors.ink} />}
          onPress={() => router.replace({ pathname: '/chantiers/[id]/photos', params: { id, source: 'camera' } })}
        />
      }
    >
      <View style={[s.card, { paddingVertical: 0 }]}>
        <Choice
          icon={<FileText size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Déposer un document"
          sub="Plan, devis, facture, PV. Albert le range tout seul."
          onPress={() => router.replace({ pathname: '/chantiers/[id]/document', params: { id } })}
        />
        <Choice
          icon={<Images size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Choisir des photos"
          sub="Depuis la galerie du téléphone."
          onPress={() => router.replace({ pathname: '/chantiers/[id]/photos', params: { id, source: 'library' } })}
        />
        <Choice
          icon={<MessageSquare size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Écrire à l’équipe"
          sub="Un message dans le canal interne du chantier."
          onPress={() => router.replace({ pathname: '/chantiers/[id]/messages/[kind]', params: { id, kind: 'internal' } })}
          last
        />
      </View>
      <View style={[s.card, { paddingVertical: 0 }]}>
        <Choice
          icon={<CheckSquare size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Une tâche"
          sub="Ce qu’il reste à faire, pour qui, pour quand."
          onPress={() => { router.back(); go(`/chantiers/${id}/taches`); }}
        />
        <Choice
          icon={<Wrench size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Une réserve ou un SAV"
          sub="Un défaut à reprendre, avec sa trace."
          onPress={() => { router.back(); go(`/chantiers/${id}/reserve-nouvelle`); }}
        />
        <Choice
          icon={<PenLine size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Une fiche d’intervention"
          sub="Ce qui a été fait, signé par le client sur le téléphone."
          onPress={() => { router.back(); go(`/chantiers/${id}/intervention-nouvelle`); }}
        />
        <Choice
          icon={<Clock size={22} strokeWidth={1.75} color={colors.ink2} />}
          title="Mon pointage"
          sub="Arrivée ou départ du chantier."
          onPress={() => { router.back(); go(`/chantiers/${id}/pointage`); }}
          last={!site.data?.canSeeFinances}
        />
        {site.data?.canSeeFinances ? (
          <Choice
            icon={<Euro size={22} strokeWidth={1.75} color={colors.ink2} />}
            title="Devis, facture ou dépense"
            sub="Le montant, l’échéance et le paiement, suivis jusqu’au solde."
            onPress={() => { router.back(); go(`/chantiers/${id}/finance-nouvelle`); }}
            last
          />
        ) : null}
      </View>
      <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
        Sans réseau, tout est enregistré sur votre téléphone et part dès que vous captez.
      </Text>
    </Screen>
  );
}

function Choice({ icon, title, sub, onPress, last }: { icon: ReactNode; title: string; sub: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.s4, paddingVertical: space.s4, minHeight: 72 },
        !last && { borderBottomWidth: 1, borderBottomColor: colors.rule }, pressed && { backgroundColor: colors.bg }]}>
      <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={t.bodyStrong}>{title}</Text>
        <Text style={[t.secondary, { marginTop: 2 }]}>{sub}</Text>
      </View>
      <ChevronRight size={20} strokeWidth={1.75} color={colors.ink3} />
    </Pressable>
  );
}
