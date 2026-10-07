import { phaseLabel, type SitePhase } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { addDays, chipDay, due, ymd } from '../../../lib/dates';
import { useOnline } from '../../../lib/network';
import { Label } from '../../../ui/blocks';
import { Button, Chips, ErrorText, NetBanner, Screen, TextButton, s } from '../../../ui/components';
import { colors, radius, space, t } from '../../../ui/theme';

const PHASES: { key: SitePhase; sub: string }[] = [
  { key: 'avant', sub: 'Prospect, devis, préparation, rendez-vous.' },
  { key: 'pendant', sub: 'Travaux en cours : photos, pointage, interventions.' },
  { key: 'apres', sub: 'Réception faite : réserves, SAV, garanties, DOE.' },
];

/** Phase du chantier et archivage (F-14). Réservé aux responsables. */
export default function SiteSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const d = site.data;
  const [phase, setPhase] = useState<SitePhase>('pendant');
  const [delivered, setDelivered] = useState<string>('none');
  useEffect(() => {
    if (d) {
      setPhase(d.phase);
      setDelivered(d.deliveredOn ?? 'none');
    }
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (x: Awaited<ReturnType<typeof api.siteAdmin.update>>) => {
    qc.setQueryData(['site', id], x);
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['feed', id] });
  };
  const save = useMutation({
    mutationFn: () => api.siteAdmin.update(id, { phase, deliveredOn: phase === 'apres' && delivered !== 'none' ? delivered : phase === 'apres' ? ymd(new Date()) : null }),
    onSuccess: done,
  });
  const archive = useMutation({
    mutationFn: () => api.siteAdmin.update(id, { status: d?.status === 'archived' ? 'active' : 'archived' }),
    onSuccess: done,
  });

  const recent = [-7, -3, -1, 0].map((n) => addDays(new Date(), n));
  const deliveredChoices = [
    ...(d?.deliveredOn && !recent.some((x) => ymd(x) === d.deliveredOn) ? [{ key: d.deliveredOn, label: due(d.deliveredOn) }] : []),
    ...recent.map((x) => ({ key: ymd(x), label: chipDay(x) })),
  ];

  return (
    <Screen back title="Phase et archivage" subtitle={d?.name}
      action={<Button label="Enregistrer la phase" onPress={() => save.mutate()} busy={save.isPending} disabled={!online || !d?.canManage} />}>
      {!online ? <NetBanner text="Hors ligne. Les réglages demandent du réseau." /> : null}
      <View>
        <Label>Où en est le chantier</Label>
        <View style={{ gap: space.s2 }}>
          {PHASES.map((p) => {
            const on = phase === p.key;
            return (
              <Pressable key={p.key} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPhase(p.key)}
                style={[{ minHeight: 68, padding: space.s4, borderRadius: radius.r1, borderWidth: 1, borderColor: colors.rule2, backgroundColor: colors.paper },
                  on && { borderColor: colors.ink, borderWidth: 2, padding: space.s4 - 1 }]}>
                <Text style={t.bodyStrong}>{phaseLabel[p.key]}</Text>
                <Text style={[t.secondary, { marginTop: 2 }]}>{p.sub}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {phase === 'apres' ? (
        <View>
          <Label>Date de réception</Label>
          <Chips value={delivered === 'none' ? ymd(new Date()) : delivered} onChange={setDelivered} items={deliveredChoices} />
          <Text style={[t.small, { marginTop: space.s2 }]}>Point de départ des garanties : parfait achèvement 1 an, biennale 2 ans, décennale 10 ans.</Text>
        </View>
      ) : null}
      <ErrorText text={save.error ? (save.error as Error).message : null} />

      <View style={s.card}>
        <Text style={t.bodyStrong}>{d?.status === 'archived' ? 'Chantier archivé' : 'Archiver le chantier'}</Text>
        <Text style={[t.secondary, { marginTop: space.s1 }]}>
          {d?.status === 'archived'
            ? 'Il n’apparaît plus dans les chantiers en cours. Tout reste conservé et consultable.'
            : 'Le chantier sort de la liste des chantiers en cours. Documents, photos et journal sont conservés.'}
        </Text>
        <TextButton label={d?.status === 'archived' ? 'Sortir des archives' : 'Archiver'} onPress={() => archive.mutate()} color={colors.ink} />
        <ErrorText text={archive.error ? (archive.error as Error).message : null} />
      </View>
    </Screen>
  );
}
