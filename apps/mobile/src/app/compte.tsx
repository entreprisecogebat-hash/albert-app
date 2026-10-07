import { outboxSentence } from '@albert/shared';
import { Text, View } from 'react-native';
import { API_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/network';
import { useOutbox } from '../lib/outbox';
import { Button, KvRow, NetBanner, Screen, TextButton, s } from '../ui/components';
import { space, t } from '../ui/theme';

export default function AccountScreen() {
  const { me, signOut } = useAuth();
  const online = useOnline();
  const { outbox, state } = useOutbox();
  const sentence = outboxSentence(state, online);

  return (
    <Screen back title="Mon compte" action={<Button kind="ghost" label="Se déconnecter" onPress={signOut} />}>
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <KvRow k="Nom" v={me?.fullName ?? ''} />
        <KvRow k="Fonction" v={me?.jobTitle ?? (me?.kind === 'client' ? 'Client' : 'Équipe')} />
        <KvRow k="Entreprise" v={me?.company.name ?? ''} />
        <KvRow k="Téléphone" v={me?.phoneDisplay ?? ''} last />
      </View>

      <View>
        <Text style={[t.mention, { marginBottom: space.s2 }]}>Sur ce téléphone</Text>
        {sentence ? <NetBanner text={sentence} /> : <NetBanner kind="done" text="Tout est à jour sur le serveur." />}
        {state.failed > 0 ? (
          <View style={{ marginTop: space.s2 }}>
            <Text style={t.secondary}>{state.failed > 1 ? `${state.failed} envois refusés par le serveur.` : '1 envoi refusé par le serveur.'} Le détail apparaît dans le fil du chantier.</Text>
            <TextButton label="Réessayer" onPress={() => outbox.retryFailed()} />
          </View>
        ) : null}
      </View>
      <Text style={[t.small, { textAlign: 'center' }]}>Albert V1 · serveur {API_URL.replace(/^https?:\/\//, '')}</Text>
    </Screen>
  );
}
