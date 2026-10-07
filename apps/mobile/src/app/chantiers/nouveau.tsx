import { ApiError } from '@albert/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { Button, ErrorText, Field, Screen } from '../../ui/components';
import { space, t } from '../../ui/theme';

/** Ouverture d'un chantier depuis le terrain. L'arborescence et les deux canaux sont créés tout seuls. */
export default function NewSiteScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const create = useMutation({
    mutationFn: () => api.sites.create({ name, address, clientName: clientName || undefined }),
    onSuccess: (site) => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      router.replace({ pathname: '/chantiers/[id]', params: { id: site.id } });
    },
  });
  const err = create.error instanceof ApiError ? create.error : null;

  return (
    <Screen back title="Nouveau chantier" action={<Button label="Ouvrir le chantier" onPress={() => create.mutate()} busy={create.isPending} disabled={!name.trim() || !address.trim()} />}>
      <View>
        <Text style={[t.mention, { marginBottom: space.s2 }]}>Nom du chantier</Text>
        <Field value={name} onChangeText={setName} placeholder="Villa Marceau" autoFocus accessibilityLabel="Nom du chantier" />
        <ErrorText text={err?.fields.name} />
      </View>
      <View>
        <Text style={[t.mention, { marginBottom: space.s2 }]}>Adresse</Text>
        <Field value={address} onChangeText={setAddress} placeholder="18 rue Marceau, Levallois" accessibilityLabel="Adresse" />
        <ErrorText text={err?.fields.address} />
      </View>
      <View>
        <Text style={[t.mention, { marginBottom: space.s2 }]}>Client (facultatif)</Text>
        <Field value={clientName} onChangeText={setClientName} placeholder="Mme Lefèvre" accessibilityLabel="Client" />
      </View>
      <ErrorText text={err && !Object.keys(err.fields).length ? err.message : null} />
      <Text style={t.mention}>Les dossiers Plans, Devis, Factures, PV, Photos et les canaux Équipe et Client sont créés automatiquement.</Text>
    </Screen>
  );
}
