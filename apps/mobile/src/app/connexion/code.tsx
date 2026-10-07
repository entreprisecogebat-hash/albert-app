import { ApiError } from '@albert/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LoginFrame, loginText } from '../../ui/login';
import { colors, font, radius, space } from '../../ui/theme';

/** Le code se remplit tout seul depuis le SMS. Aucun bouton à presser. */
export default function CodeScreen() {
  const { phone, display, dev } = useLocalSearchParams<{ phone: string; display: string; dev?: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(30);
  const [devCode, setDevCode] = useState(dev || '');
  const input = useRef<TextInput>(null);
  const busy = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (code.length !== 6 || busy.current) return;
    busy.current = true;
    setError(null);
    api.auth
      .verify(phone, code, `${Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Navigateur'}`)
      .then((r) => signIn(r.token, r.user))
      .then(() => router.replace('/'))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
        setCode('');
      })
      .finally(() => {
        busy.current = false;
      });
  }, [code, phone, signIn]);

  async function resend() {
    setError(null);
    try {
      const r = await api.auth.requestCode(phone);
      setDevCode(r.devCode ?? '');
      setWait(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    }
  }

  const digits = code.padEnd(6, ' ').split('');

  return (
    <LoginFrame
      welcome={
        <View>
          <Text style={loginText.welcome}>Entrez le code reçu par SMS</Text>
          <View style={st.sent}>
            <Text style={loginText.hint}>Code envoyé au {display}</Text>
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
              <Text style={[loginText.hint, { color: colors.nightInk, textDecorationLine: 'underline' }]}>Modifier</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Saisir le code à 6 chiffres">
        <View style={st.otp}>
          {digits.map((d, i) => (
            <View key={i} style={[st.cell, i === code.length && st.cellActive]}>
              <Text style={st.digit}>{d.trim()}</Text>
              {i === code.length ? <View style={st.caret} /> : null}
            </View>
          ))}
        </View>
        {/* Champ réel, invisible : reçoit le remplissage automatique du SMS */}
        <TextInput
          ref={input}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          autoFocus
          maxLength={6}
          style={st.hidden}
          accessibilityLabel="Code de connexion"
        />
      </Pressable>
      {error ? <Text style={loginText.err}>{error}</Text> : null}
      {devCode ? <Text style={st.dev}>Développement : pas de vrai SMS. Code : {devCode}</Text> : null}
      <Text style={loginText.note}>Le code se remplit tout seul depuis le SMS. Aucun bouton à presser.</Text>
      <Pressable disabled={wait > 0} onPress={resend} style={st.resend} accessibilityRole="button">
        <Text style={[loginText.hint, { fontFamily: font.sans500, fontSize: 15, textDecorationLine: 'underline', textAlign: 'center' }]}>
          {wait > 0 ? `Renvoyer le code dans ${wait} s` : 'Renvoyer le code'}
        </Text>
      </Pressable>
    </LoginFrame>
  );
}

const st = StyleSheet.create({
  sent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.s4, gap: space.s3 },
  otp: { flexDirection: 'row', gap: space.s2 },
  cell: {
    flex: 1, height: 68, borderWidth: 1, borderColor: colors.ruleNight, borderRadius: radius.r1, backgroundColor: colors.night2,
    alignItems: 'center', justifyContent: 'center',
  },
  cellActive: { borderColor: colors.nightInk, borderWidth: 2 },
  digit: { fontFamily: font.mono400, fontSize: 28, color: colors.nightInk },
  caret: { position: 'absolute', width: 2, height: 28, backgroundColor: colors.accent },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  dev: { fontFamily: font.mono400, fontSize: 13, color: colors.night3, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.ruleNight, borderRadius: radius.r1, padding: space.s3 },
  resend: { minHeight: 48, justifyContent: 'center' },
});
