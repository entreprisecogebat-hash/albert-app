import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../../lib/api';
import { addDays, chipDay, parseHm, ymd } from '../../../lib/dates';
import { useOnline } from '../../../lib/network';
import { Label } from '../../../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea } from '../../../ui/components';
import { space } from '../../../ui/theme';

/** Nouvelle fiche d'intervention (F-12) : on remplit sur place, le client signe à l'écran suivant. */
export default function NewInterventionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const days = [-2, -1, 0].map((n) => addDays(new Date(), n));
  const [day, setDay] = useState(ymd(new Date()));
  const [title, setTitle] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [materials, setMaterials] = useState('');
  const [duration, setDuration] = useState('');
  const [technicians, setTechnicians] = useState('');
  // « 2:30 », « 3h », « 3h15 » ou « 3 » (heures)
  const raw = duration.trim();
  const hm = raw ? parseHm(/^\d{1,2}$/.test(raw) ? `${raw}:00` : raw) : null;
  const durationError = raw && !hm ? 'Durée au format 2:30 ou 3h.' : null;

  const create = useMutation({
    mutationFn: () => api.interventions.create(id, {
      interventionOn: day,
      title: title.trim(),
      workDone: workDone.trim(),
      materials: materials.trim() || null,
      minutes: hm ? hm[0] * 60 + hm[1] : null,
      technicians: technicians.trim() || null,
    }),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['interventions', id] });
      qc.invalidateQueries({ queryKey: ['site', id] });
      router.replace(`/interventions/${x.id}` as Href);
    },
  });

  return (
    <Screen back title="Nouvelle fiche" subtitle={site.data?.name}
      action={<Button label="Passer à la signature" onPress={() => create.mutate()} busy={create.isPending}
        disabled={!online || !title.trim() || !workDone.trim() || !!durationError} />}>
      {!online ? <NetBanner text="Hors ligne. La fiche pourra être enregistrée dès que vous captez." /> : null}
      <View>
        <Label>Date de l’intervention</Label>
        <Chips value={day} onChange={setDay} items={days.map((d) => ({ key: ymd(d), label: chipDay(d) }))} />
      </View>
      <View>
        <Label>Objet</Label>
        <Field value={title} onChangeText={setTitle} placeholder="Ex. Recherche de fuite salle de bains" accessibilityLabel="Objet de l’intervention" />
      </View>
      <View>
        <Label>Travaux réalisés</Label>
        <TextArea value={workDone} onChangeText={setWorkDone} placeholder="Ce qui a été fait, constaté, laissé en l’état" style={{ minHeight: 120 }} accessibilityLabel="Travaux réalisés" />
      </View>
      <View>
        <Label>Matériel et fournitures (facultatif)</Label>
        <TextArea value={materials} onChangeText={setMaterials} placeholder="Ex. 2 m de tube cuivre 14, 1 raccord" accessibilityLabel="Matériel" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <View style={{ flex: 1 }}>
          <Label>Durée</Label>
          <Field value={duration} onChangeText={setDuration} placeholder="2:30" keyboardType="numbers-and-punctuation" accessibilityLabel="Durée" />
        </View>
        <View style={{ flex: 2 }}>
          <Label>Intervenants</Label>
          <Field value={technicians} onChangeText={setTechnicians} placeholder="Ex. Mehdi, Lucas" accessibilityLabel="Intervenants" />
        </View>
      </View>
      <ErrorText text={durationError ?? (create.error ? (create.error as Error).message : null)} />
    </Screen>
  );
}
