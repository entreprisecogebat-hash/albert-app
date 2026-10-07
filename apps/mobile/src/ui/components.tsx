import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, WifiOff, Check, Info } from 'lucide-react-native';
import { useRef, type ReactNode } from 'react';
import {
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, floating, font, radius, space, t, target } from './theme';

/** Icônes Lucide, trait 1,75 px pour tenir au soleil. */
export const icon = { size: 22, strokeWidth: 1.75, color: colors.ink };

/* ---------------------------------------------------------------------------
 * Écran : barre d'application, contenu qui défile, barre d'action fixe en bas.
 * Une action par écran, toujours au même endroit, atteignable au pouce.
 * ------------------------------------------------------------------------- */

export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  action,
  scroll = true,
  contentStyle,
}: {
  title: string;
  subtitle?: string | null;
  back?: boolean | (() => void);
  right?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={8}
            onPress={typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={s.back}
          >
            <ChevronLeft size={28} strokeWidth={1.75} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={t.appbar} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={[t.mention, { marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <Body
        style={s.view}
        contentContainerStyle={scroll ? [s.content, { paddingBottom: action ? 150 + insets.bottom : 32 + insets.bottom }, contentStyle] : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {scroll ? children : <View style={[s.content, { flex: 1 }, contentStyle]}>{children}</View>}
      </Body>
      {action ? <View style={[s.actionbar, { paddingBottom: Math.max(insets.bottom, space.s5) }]}>{action}</View> : null}
    </View>
  );
}

/* ---------- Boutons ---------- */

type BtnKind = 'primary' | 'night' | 'ghost' | 'paper';

/**
 * Le bouton jaune est l'action principale : un seul par écran. 56 px, utilisable avec des gants.
 * Le libellé dit ce qui va se passer, jamais "Valider" ni "OK".
 */
export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  iconLeft,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  busy?: boolean;
  iconLeft?: ReactNode;
  style?: ViewStyle;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (v: number) => Animated.timing(scale, { toValue: v, duration: 120, useNativeDriver: true }).start();
  const bg = { primary: colors.accent, night: colors.night, ghost: 'transparent', paper: colors.paper }[kind];
  const fg = kind === 'night' ? colors.nightInk : colors.ink;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled || !!busy }}
        disabled={disabled || busy}
        onPress={onPress}
        onPressIn={() => press(0.985)}
        onPressOut={() => press(1)}
        style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, kind === 'ghost' && s.btnGhost]}
      >
        {busy ? <ActivityIndicator color={fg} /> : iconLeft}
        <Text style={[t.button, { color: fg }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Action secondaire : texte souligné, 48 px. */
export function TextButton({ label, onPress, color = colors.ink2 }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.textBtn} hitSlop={4}>
      <Text style={[t.secondary, { color, fontFamily: font.sans500, fontSize: 16, textDecorationLine: 'underline' }]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Champs ---------- */

export function Field({ icon: ic, style, ...props }: TextInputProps & { icon?: ReactNode }) {
  return (
    <View style={[s.field, style as ViewStyle]}>
      {ic}
      <TextInput placeholderTextColor={colors.ink3} style={s.input} {...props} />
    </View>
  );
}

export function TextArea(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.ink3} multiline style={s.textarea} textAlignVertical="top" {...props} />;
}

/* ---------- Filtres : le filtre actif est nuit, le jaune est déjà pris ---------- */

export function Chips<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.s4 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)}
            style={[s.chip, on && { backgroundColor: colors.night, borderColor: colors.night }]}>
            <Text style={[s.chipText, on && { color: colors.nightInk }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Bandeau réseau : gris d'encre, phrase calme, aucun bouton ---------- */

export function NetBanner({ text, kind = 'offline' }: { text: string; kind?: 'offline' | 'info' | 'done' }) {
  return (
    <View style={s.net} accessibilityRole="text">
      {kind === 'done' ? <Check size={20} strokeWidth={2} color={colors.sync} />
        : kind === 'info' ? <Info size={20} strokeWidth={1.75} color={colors.ink3} />
        : <WifiOff size={20} strokeWidth={1.75} color={colors.ink3} />}
      <Text style={[t.mention, { color: colors.ink2, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/* ---------- Pastilles et étiquettes : toujours doublées d'un mot ---------- */

export function Dot({ color, style }: { color: string; style?: ViewStyle }) {
  return <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

export function NightTag({ label }: { label: string }) {
  return (
    <View style={s.nightTag}>
      <Text style={[t.tag, { color: colors.nightInk }]}>{label}</Text>
    </View>
  );
}

export function ClientTag() {
  return (
    <View style={s.clientTag}>
      <Dot color={colors.client} />
      <Text style={[t.tag, { color: colors.ink2, fontFamily: font.sans500 }]}>Canal client</Text>
    </View>
  );
}

export function StateTag({ on, label }: { on: boolean; label: string }) {
  return (
    <View style={[s.state, on ? { backgroundColor: colors.night } : { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.rule2 }]}>
      <Text style={[t.tag, { color: on ? colors.nightInk : colors.ink3 }]}>{label}</Text>
    </View>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
        style={({ pressed }) => [s.card, style, pressed && { backgroundColor: colors.bg }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

/** Ligne de classement : un constat déjà rempli, pas une question. On tape pour corriger. */
export function KvRow({ k, v, small, onPress, last }: { k: string; v: string; small?: string | null; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [s.kv, !last && s.kvRule, pressed && { backgroundColor: colors.bg }]}>
      <Text style={t.mention}>{k}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, flexShrink: 1 }}>
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          <Text style={[t.body, { fontFamily: font.sans500, lineHeight: 22, textAlign: 'right' }]}>{v}</Text>
          {small ? <Text style={[t.small, { textAlign: 'right' }]}>{small}</Text> : null}
        </View>
        {onPress ? <ChevronRight size={18} strokeWidth={1.75} color={colors.ink3} /> : null}
      </View>
    </Pressable>
  );
}

/** Choix de visibilité. La valeur par défaut est toujours la plus restrictive. */
export function VisibilitySeg({ value, onChange }: { value: 'team' | 'client'; onChange: (v: 'team' | 'client') => void }) {
  const opts = [
    { v: 'team' as const, st: "Visible par l'équipe", sd: 'Par défaut' },
    { v: 'client' as const, st: 'Visible aussi par le client', sd: 'Canal partagé' },
  ];
  return (
    <View>
      <Text style={[t.mention, { marginBottom: space.s2 }]}>Qui peut le voir</Text>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <Pressable key={o.v} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.v)}
              style={[s.seg, on && { borderColor: colors.ink, borderWidth: 2, padding: space.s3 - 1 }]}>
              <Text style={[t.bodyStrong, { fontSize: 16, lineHeight: 20 }]}>{o.st}</Text>
              <Text style={[t.small, { marginTop: 3 }]}>{o.sd}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[t.secondary, { textAlign: 'center', paddingVertical: space.s7 }]}>{text}</Text>;
}

export function Loading() {
  return <ActivityIndicator color={colors.ink3} style={{ paddingVertical: space.s7 }} />;
}

export function ErrorText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  // Le terracotta est la seule couleur de statut autorisée en texte : ce qui empêche de continuer.
  return <Text style={[t.mention, { color: colors.alerte, marginTop: space.s2 }]}>{text}</Text>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  appbar: {
    flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s3,
    borderBottomWidth: 1, borderBottomColor: colors.rule2, backgroundColor: colors.paper,
  },
  back: { width: target.min, height: target.min, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  view: { flex: 1, backgroundColor: colors.bg2 },
  content: { padding: space.s4, gap: space.s4 },
  actionbar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.s4, paddingTop: space.s3,
    backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.rule2, ...floating,
  },
  btn: {
    minHeight: target.primary, borderRadius: radius.pill, paddingHorizontal: space.s5, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: space.s2, borderWidth: 1, borderColor: 'transparent',
  },
  btnGhost: { borderColor: colors.rule2 },
  textBtn: { minHeight: target.secondary, alignItems: 'center', justifyContent: 'center' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: space.s3, minHeight: target.primary, paddingHorizontal: space.s4,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r1,
  },
  // Sur le web, le cadre du champ porte déjà le focus : pas de second contour
  input: { flex: 1, fontFamily: font.sans400, fontSize: 17, color: colors.ink, minHeight: target.primary - 2, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  textarea: {
    minHeight: 72, padding: space.s3, paddingHorizontal: space.s4, fontFamily: font.sans400, fontSize: 17, color: colors.ink,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r1,
  },
  chipsRow: { marginHorizontal: -space.s4, flexGrow: 0 },
  chip: {
    minHeight: target.min, paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.rule2,
    backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center',
  },
  chipText: { fontFamily: font.sans500, fontSize: 15, color: colors.ink2 },
  net: {
    flexDirection: 'row', gap: space.s3, alignItems: 'flex-start', paddingVertical: space.s3, paddingHorizontal: space.s4,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r1,
  },
  nightTag: { backgroundColor: colors.night, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  clientTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start',
  },
  state: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginTop: space.s2 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r2, padding: space.s4 },
  kv: { minHeight: 60, paddingVertical: space.s3, paddingHorizontal: space.s4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s4 },
  kvRule: { borderBottomWidth: 1, borderBottomColor: colors.rule },
  seg: { flex: 1, minHeight: 68, padding: space.s3, paddingHorizontal: space.s4, borderRadius: radius.r1, borderWidth: 1, borderColor: colors.rule2, backgroundColor: colors.paper },
});
