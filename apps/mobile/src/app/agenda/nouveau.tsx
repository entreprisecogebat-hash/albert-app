import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../lib/api';
import { addDays, chipDay, parseHm, ymd } from '../../lib/dates';
import { useOnline } from '../../lib/network';
import { Label } from '../../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea } from '../../ui/components';
import { space } from '../../ui/theme';

/** Nouveau rendez-vous dans l'agenda partagé : visite, réunion de chantier, livraison. */
export default function NewAppointmentScreen() {
  const params = useLocalSearchParams<{ siteId?: string; contactId?: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.contacts.list() });
  const days = Array.from({ length: 14 }, (_, n) => addDays(new Date(), n));
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(ymd(addDays(new Date(), 1)));
  const [start, setStart] = useState('9:00');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [site, setSite] = useState(params.siteId ?? 'none');
  const [contact, setContact] = useState(params.contactId ?? 'none');

  const s = parseHm(start);
  const e = end.trim() ? parseHm(end) : null;
  const timeError = !s ? 'Heure de début au format 9:00.' : end.trim() && !e ? 'Heure de fin au format 10:30.' : e && s && e[0] * 60 + e[1] <= s[0] * 60 + s[1] ? 'La fin doit être après le début.' : null;
  const at = (hm: [number, number]) => {
    const d = new Date(`${day}T00:00:00`);
    d.setHours(hm[0], hm[1], 0, 0);
    return d.toISOString();
  };

  // Le contact proposé en premier : ceux du chantier choisi
  const allContacts = contacts.data?.items ?? [];
  const contactChoices = (site === 'none' ? allContacts : allContacts.filter((c) => c.sites.some((x) => x.id === site) || c.id === contact)).slice(0, 12);

  const create = useMutation({
    mutationFn: () => api.appointments.create({
      title: title.trim(),
      startsAt: at(s!),
      endsAt: e ? at(e) : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      siteId: site === 'none' ? null : site,
      contactId: contact === 'none' ? null : contact,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      if (site !== 'none') qc.invalidateQueries({ queryKey: ['site', site] });
      if (contact !== 'none') qc.invalidateQueries({ queryKey: ['contact', contact] });
      router.back();
    },
  });

  return (
    <Screen back title="Nouveau rendez-vous"
      action={<Button label="Ajouter à l’agenda" onPress={() => create.mutate()} busy={create.isPending} disabled={!online || !title.trim() || !!timeError} />}>
      {!online ? <NetBanner text="Hors ligne. L’ajout sera possible dès que vous captez." /> : null}
      <View>
        <Label>Objet</Label>
        <Field value={title} onChangeText={setTitle} placeholder="Ex. Visite de fin de chantier" accessibilityLabel="Objet du rendez-vous" />
      </View>
      <View>
        <Label>Jour</Label>
        <Chips value={day} onChange={setDay} items={days.map((d) => ({ key: ymd(d), label: chipDay(d) }))} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.s3 }}>
        <View style={{ flex: 1 }}>
          <Label>Début</Label>
          <Field value={start} onChangeText={setStart} placeholder="9:00" keyboardType="numbers-and-punctuation" accessibilityLabel="Heure de début" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Fin (facultatif)</Label>
          <Field value={end} onChangeText={setEnd} placeholder="10:30" keyboardType="numbers-and-punctuation" accessibilityLabel="Heure de fin" />
        </View>
      </View>
      <ErrorText text={timeError} />
      {(sites.data?.items.length ?? 0) > 0 ? (
        <View>
          <Label>Chantier</Label>
          <Chips value={site} onChange={setSite} items={[{ key: 'none', label: 'Aucun' }, ...(sites.data?.items ?? []).map((x) => ({ key: x.id, label: x.name }))]} />
        </View>
      ) : null}
      {contactChoices.length > 0 ? (
        <View>
          <Label>Avec</Label>
          <Chips value={contact} onChange={setContact} items={[{ key: 'none', label: 'Personne' }, ...contactChoices.map((c) => ({ key: c.id, label: c.name }))]} />
        </View>
      ) : null}
      <View>
        <Label>Lieu (facultatif)</Label>
        <Field value={location} onChangeText={setLocation} placeholder="Sur le chantier, si vide" accessibilityLabel="Lieu" />
      </View>
      <View>
        <Label>Notes (facultatif)</Label>
        <TextArea value={notes} onChangeText={setNotes} placeholder="Ex. Apporter les échantillons de carrelage" accessibilityLabel="Notes" />
      </View>
      <ErrorText text={create.error ? (create.error as Error).message : null} />
    </Screen>
  );
}
