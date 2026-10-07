import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, space } from './theme';

/** Écran nuit de connexion : quadrillage de plan, mot-symbole Albert et sa barre jaune. */
export function LoginFrame({ welcome, children }: { welcome: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.night }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Grid />
      </View>
      <ScrollView
        contentContainerStyle={[st.wrap, { paddingTop: insets.top + space.s7, paddingBottom: insets.bottom + space.s7 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Wordmark />
          <View style={{ marginTop: space.s6 }}>{welcome}</View>
        </View>
        <View style={{ gap: space.s4 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Wordmark({ size = 52 }: { size?: number }) {
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.display700, fontSize: size, lineHeight: size, letterSpacing: -0.035 * size, color: colors.nightInk }}>Albert</Text>
      <View style={{ height: Math.round(size * 0.23), backgroundColor: colors.accent, marginTop: space.s1 }} />
    </View>
  );
}

function Grid() {
  const lines = [];
  for (let i = 1; i < 30; i++) {
    lines.push(<View key={`v${i}`} style={[st.v, { left: i * 48 }]} />);
    lines.push(<View key={`h${i}`} style={[st.h, { top: i * 48 }]} />);
  }
  return <View style={{ flex: 1, overflow: 'hidden' }}>{lines}</View>;
}

export const loginText = StyleSheet.create({
  welcome: { fontFamily: font.display600, fontSize: 24, lineHeight: 30, letterSpacing: -0.48, color: colors.nightInk },
  hint: { fontFamily: font.sans400, fontSize: 16, lineHeight: 23, color: colors.night3 },
  note: { fontFamily: font.sans400, fontSize: 14, lineHeight: 21, color: colors.night3 },
  err: { fontFamily: font.sans500, fontSize: 15, lineHeight: 22, color: colors.nightInk, backgroundColor: 'rgba(200,68,46,0.9)', borderRadius: 8, padding: 12 },
});

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: space.s5, gap: space.s7 },
  v: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  h: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
});
