import { reserveKindLabel, type ReserveKind, type Visibility } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { addDays, chipDay, ymd } from '../../../lib/dates';
import { useOnline } from '../../../lib/network';
import { Label } from '../../../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea, VisibilitySeg } from '../../../ui/components';

/** Nouvelle réserve, demande de SAV ou mise en jeu d'une garantie (F-15). */
export default function NewReserveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const { me } = useAuth();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.sites.members(id), enabled: me?.kind !== 'client' });
  const isClient = me?.kind === 'client';
  const [kind, setKind] = useState<ReserveKind>(site.data?.phase === 'apres' ? 'sav' : 'reserve');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [dueKey, setDueKey] = useState('none');
  const [assignee, setAssignee] = useState('none');
  const [visibility, setVisibility] = useState<Visibility>(isClient ? 'client' : 'team');
  const staff = (members.data?.items ?? []).filter((m) => m.role !== 'client');
  const days = [1, 3, 7, 14, 30].map((n) => addDays(new Date(), n));

  const create = useMutation({
    mutationFn: () => api.reserves.create(id, {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      dueOn: dueKey === 'none' ? null : dueKey,
      assigneeId: assignee === 'none' ? null : assignee,
      visibility,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['reserves', id] });
      qc.invalidateQueries({ queryKey: ['site', id] });
      qc.invalidateQueries({ queryKey: ['today'] });
      router.replace(`/reserves/${r.id}` as Href);
    },
  });

  return (
    <Screen back title={isClient ? 'Signaler un problème' : 'Nouvelle réserve'} subtitle={site.data?.name}
      action={<Button label="Enregistrer" onPress={() => create.mutate()} busy={create.isPending} disabled={!online || !title.trim()} />}>
      {!online ? <NetBanner text="Hors ligne. L’enregistrement sera possible dès que vous captez." /> : null}
      <View>
        <Label>Type</Label>
        <Chips value={kind} onChange={setKind} items={(['reserve', 'sav', 'garantie'] as const).map((k) => ({ key: k, label: reserveKindLabel[k] }))} />
      </View>
      <View>
        <Label>Ce qui ne va pas</Label>
        <Field value={title} onChangeText={setTitle} placeholder="Ex. Joint de carrelage fissuré" accessibilityLabel="Intitulé" />
      </View>
      <View>
        <Label>Où (facultatif)</Label>
        <Field value={location} onChangeText={setLocation} placeholder="Ex. Salle de bains, étage" accessibilityLabel="Emplacement" />
      </View>
      <View>
        <Label>Détails (facultatif)</Label>
        <TextArea value={description} onChangeText={setDescription} placeholder="Ce qui a été constaté" accessibilityLabel="Détails" />
      </View>
      {!isClient ? (
        <>
          <View>
            <Label>À lever pour</Label>
            <Chips value={dueKey} onChange={setDueKey} items={[{ key: 'none', label: 'Sans date' }, ...days.map((d) => ({ key: ymd(d), label: chipDay(d) }))]} />
          </View>
          {staff.length > 0 ? (
            <View>
              <Label>Confiée à</Label>
              <Chips value={assignee} onChange={setAssignee} items={[{ key: 'none', label: 'Personne' }, ...staff.map((m) => ({ key: m.user.id, label: m.user.firstName }))]} />
            </View>
          ) : null}
          <VisibilitySeg value={visibility} onChange={setVisibility} />
        </>
      ) : null}
      <ErrorText text={create.error ? (create.error as Error).message : null} />
    </Screen>
  );
}
