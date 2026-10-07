import { ApiError, fmt } from '@albert/shared';
import { router } from 'expo-router';
import { Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../lib/api';
import { useOnline } from '../../lib/network';
import { Button } from '../../ui/components';
import { LoginFrame, loginText } from '../../ui/login';
import { colors, font, radius, space, target } from '../../ui/theme';

/** J'arrive : son numéro, un code reçu par SMS, rien d'autre à retenir. */
export default function PhoneScreen() {
  const online = useOnline();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const e164 = fmt.normalizePhone(phone);
    if (!e164) {
      setError('Ce numéro ne semble pas valide. Vérifiez-le.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.auth.requestCode(e164);
      router.push({ pathname: '/connexion/code', params: { phone: r.phone, display: r.phoneDisplay, dev: r.devCode ?? '' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoginFrame welcome={<Text style={loginText.welcome}>Le carnet de chantier{'\n'}de vos équipes.</Text>}>
      <Text style={loginText.hint}>Entrez votre numéro de téléphone professionnel</Text>
      <View style={st.field}>
        <Smartphone size={22} strokeWidth={1.75} color={colors.night3} />
        <TextInput
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={submit}
          placeholder="06 12 34 56 78"
          placeholderTextColor={colors.night3}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          accessibilityLabel="Numéro de téléphone professionnel"
          style={st.input}
        />
      </View>
      {error ? <Text style={loginText.err}>{error}</Text> : null}
      <Button kind="paper" label={busy ? 'Envoi du code…' : 'Recevoir mon code pour me connecter'} onPress={submit} busy={busy} disabled={!online} />
      <Text style={loginText.note}>Aucun mot de passe à retenir. Vous restez connecté ensuite.</Text>
      <Text style={[loginText.note, { opacity: 0.75 }]}>
        {online ? 'La première connexion demande du réseau. Ensuite, Albert fonctionne même sans.' : 'Pas de réseau pour le moment. La première connexion en demande ; ensuite, Albert fonctionne même sans.'}
      </Text>
    </LoginFrame>
  );
}

const st = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: target.primary, paddingHorizontal: space.s4,
    backgroundColor: colors.night2, borderWidth: 1, borderColor: colors.ruleNight, borderRadius: radius.r1,
  },
  input: { flex: 1, fontFamily: font.mono400, fontSize: 19, letterSpacing: 0.4, color: colors.nightInk, minHeight: target.primary - 2, paddingVertical: 0 },
});
