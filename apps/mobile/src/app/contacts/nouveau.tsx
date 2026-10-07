import { contactKindLabel, fmt, type ContactKind } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../lib/api';
import { useOnline } from '../../lib/network';
import { Label } from '../../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea } from '../../ui/components';

const KINDS: ContactKind[] = ['prospect', 'client', 'fournisseur', 'sous_traitant', 'partenaire'];

/** Nouveau contact (F-01, F-03). Seul le nom est obligatoire. */
export default function NewContactScreen() {
  const { siteId } = useLocalSearchParams<{ siteId?: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const [kind, setKind] = useState<ContactKind>('prospect');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [site, setSite] = useState<string>(siteId ?? 'none');
  const phoneError = phone.trim() && !fmt.normalizePhone(phone) ? 'Numéro incomplet.' : null;
  const emailError = email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? 'Adresse e-mail incomplète.' : null;

  const create = useMutation({
    mutationFn: () => api.contacts.create({
      kind,
      name: name.trim(),
      companyName: companyName.trim() || null,
      phone: phone.trim() ? fmt.normalizePhone(phone) : null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      siteIds: site === 'none' ? [] : [site],
    }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      router.replace(`/contacts/${c.id}` as Href);
    },
  });

  return (
    <Screen back title="Nouveau contact"
      action={<Button label="Enregistrer le contact" onPress={() => create.mutate()} busy={create.isPending} disabled={!online || !name.trim() || !!phoneError || !!emailError} />}>
      {!online ? <NetBanner text="Hors ligne. L’enregistrement sera possible dès que vous captez." /> : null}
      <View>
        <Label>Type</Label>
        <Chips value={kind} onChange={setKind} items={KINDS.map((k) => ({ key: k, label: contactKindLabel[k] }))} />
      </View>
      <View>
        <Label>Nom</Label>
        <Field value={name} onChangeText={setName} placeholder="Ex. Mme Durand, ou Point P Levallois" autoCapitalize="words" accessibilityLabel="Nom" />
      </View>
      <View>
        <Label>Société (facultatif)</Label>
        <Field value={companyName} onChangeText={setCompanyName} placeholder="Ex. SCI Les Tilleuls" accessibilityLabel="Société" />
      </View>
      <View>
        <Label>Téléphone</Label>
        <Field value={phone} onChangeText={setPhone} placeholder="06 12 34 56 78" keyboardType="phone-pad" accessibilityLabel="Téléphone" />
        <ErrorText text={phoneError} />
      </View>
      <View>
        <Label>E-mail</Label>
        <Field value={email} onChangeText={setEmail} placeholder="nom@exemple.fr" keyboardType="email-address" autoCapitalize="none" accessibilityLabel="E-mail" />
        <ErrorText text={emailError} />
      </View>
      <View>
        <Label>Adresse</Label>
        <Field value={address} onChangeText={setAddress} placeholder="Rue, ville" accessibilityLabel="Adresse" />
      </View>
      {(sites.data?.items.length ?? 0) > 0 ? (
        <View>
          <Label>Chantier lié</Label>
          <Chips value={site} onChange={setSite} items={[{ key: 'none', label: 'Aucun' }, ...(sites.data?.items ?? []).map((x) => ({ key: x.id, label: x.name }))]} />
        </View>
      ) : null}
      <View>
        <Label>Notes</Label>
        <TextArea value={notes} onChangeText={setNotes} placeholder="Ex. Préfère être appelée le matin" accessibilityLabel="Notes" />
      </View>
      <ErrorText text={create.error ? (create.error as Error).message : null} />
    </Screen>
  );
}
