import { fmt } from '@albert/shared';
import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, floating, font, radius, space, t } from './theme';

/* ---------------------------------------------------------------------------
 * Albert 2 : la grammaire visuelle.
 *
 *  - Un bandeau nuit en tête des écrans pivots (Accueil, Chantier) : c'est la signature d'Albert,
 *    comme le panneau de chantier. Le jaune casque y souligne la marque et l'avancement.
 *  - Le corps est une feuille blanche qui remonte sur le bandeau : on voit d'abord les chiffres.
 *  - Les statuts sont des pastilles teintées, toujours avec un mot (jamais une couleur seule).
 *  - Une seule action jaune par écran ; les raccourcis sont ronds, en encre.
 * ------------------------------------------------------------------------- */

export type Tone = 'alerte' | 'client' | 'sync' | 'accent' | 'night' | 'neutral';

const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  alerte: { bg: colors.alerteSoft, fg: '#9C3221', dot: colors.alerte },
  client: { bg: colors.clientSoft, fg: '#0B6E75', dot: colors.client },
  sync: { bg: colors.syncSoft, fg: '#1F7A37', dot: colors.sync },
  accent: { bg: colors.accentSoft, fg: '#7A5B00', dot: colors.accent },
  night: { bg: colors.night, fg: colors.nightInk, dot: colors.accent },
  neutral: { bg: colors.nightSoft, fg: colors.ink2, dot: colors.ink3 },
};

export function toneColors(tone: Tone) {
  return TONE[tone];
}

/* ---------- Bandeau nuit ---------- */

export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.hero, { paddingTop: insets.top + space.s3 }, style]}>
      {children}
    </View>
  );
}

/** Le mot « Albert » et son trait jaune, en petit, en tête du bandeau. */
export function Wordmark({ dark = true }: { dark?: boolean }) {
  return (
    <View accessibilityRole="header" accessibilityLabel="Albert">
      <Text style={{ fontFamily: font.display700, fontSize: 20, lineHeight: 22, letterSpacing: -0.6, color: dark ? colors.nightInk : colors.ink }}>Albert</Text>
      <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 3 }} />
    </View>
  );
}

/** Feuille blanche qui remonte sur le bandeau. */
export function Sheet({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[st.sheet, style]}>{children}</View>;
}

/* ---------- Chiffres clés ---------- */

export function Kpi({ value, label, tone, icon, onPress, hint }: {
  value: string;
  label: string;
  tone?: Tone;
  icon?: ReactNode;
  onPress?: () => void;
  hint?: string | null;
}) {
  const c = tone ? TONE[tone] : null;
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {icon ? <View style={[st.kpiIcon, c ? { backgroundColor: c.bg } : null]}>{icon}</View> : <View />}
        {onPress ? <ChevronRight size={16} strokeWidth={2} color={colors.ink3} /> : null}
      </View>
      <Text style={st.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.kpiLabel} numberOfLines={2}>{label}</Text>
      {hint ? <Text style={[st.kpiHint, c ? { color: c.fg } : null]} numberOfLines={1}>{hint}</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress}
        style={({ pressed }) => [st.kpi, pressed && { backgroundColor: colors.bg }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={st.kpi}>{body}</View>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <View style={st.kpiGrid}>{children}</View>;
}

/* ---------- Avancement ---------- */

export function Progress({ value, label, dark, height = 6 }: { value: number; label?: string | null; dark?: boolean; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} accessibilityLabel={label ?? undefined}>
      <View style={{ height, borderRadius: height, backgroundColor: dark ? 'rgba(255,255,255,0.16)' : colors.bg2, overflow: 'hidden' }}>
        <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: height, backgroundColor: colors.accent }} />
      </View>
      {label ? <Text style={[t.small, { marginTop: 6 }, dark && { color: colors.night3 }]}>{label}</Text> : null}
    </View>
  );
}

/** Avant, pendant, après : où en est le chantier. */
export function PhaseSteps({ phase, dark }: { phase: 'avant' | 'pendant' | 'apres'; dark?: boolean }) {
  const steps: { key: typeof phase; label: string }[] = [
    { key: 'avant', label: 'Avant' },
    { key: 'pendant', label: 'Chantier' },
    { key: 'apres', label: 'Après' },
  ];
  const idx = steps.findIndex((s) => s.key === phase);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Phase : ${steps[idx]?.label}`}>
      {steps.map((s, i) => {
        const done = i < idx;
        const on = i === idx;
        return (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[
              st.step,
              on && { backgroundColor: colors.accent, borderColor: colors.accent },
              done && { backgroundColor: dark ? 'rgba(255,255,255,0.22)' : colors.nightSoft, borderColor: 'transparent' },
              !on && !done && { borderColor: dark ? 'rgba(255,255,255,0.28)' : colors.rule2 },
            ]}>
              <Text style={[st.stepText, on && { color: colors.ink }, !on && { color: dark ? colors.night3 : colors.ink3 }]}>{s.label}</Text>
            </View>
            {i < steps.length - 1 ? <View style={{ width: 10, height: 1, backgroundColor: dark ? 'rgba(255,255,255,0.28)' : colors.rule2 }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ---------- Pastilles ---------- */

export function Pill({ label, tone = 'neutral', icon, small }: { label: string; tone?: Tone; icon?: ReactNode; small?: boolean }) {
  const c = TONE[tone];
  return (
    <View style={[st.pill, { backgroundColor: c.bg }, small && { paddingHorizontal: 8, paddingVertical: 2 }]}>
      {icon ?? (tone !== 'neutral' && tone !== 'night' ? <View style={[st.pillDot, { backgroundColor: c.dot }]} /> : null)}
      <Text style={[st.pillText, { color: c.fg }, small && { fontSize: 12 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ---------- Personnes ---------- */

const AVATAR_TINTS = ['#FFE07A', '#BFE9EC', '#CDEBD3', '#F3D1C8', '#D9DCE1', '#E8D9F2'];

export function initials(name: string): string {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ name, size = 32, ring }: { name: string; size?: number; ring?: string }) {
  const tint = AVATAR_TINTS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <View accessibilityLabel={name} style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center',
      borderWidth: ring ? 2 : 0, borderColor: ring,
    }}>
      <Text style={{ fontFamily: font.sans600, fontSize: size * 0.38, color: colors.ink }}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ names, max = 3, size = 28, dark = true }: { names: string[]; max?: number; size?: number; dark?: boolean }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${names.length} personnes : ${names.join(', ')}`}>
      {shown.map((n, i) => <Avatar key={n + i} name={n} size={size} />)}
      {rest > 0 ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? colors.night2 : colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.sans600, fontSize: 11, color: dark ? colors.nightInk : colors.ink2 }}>+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Raccourcis ---------- */

export function QuickAction({ icon, label, onPress, primary, disabled }: { icon: ReactNode; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [st.qa, pressed && { transform: [{ scale: 0.96 }] }, disabled && { opacity: 0.4 }]}>
      <View style={[st.qaCircle, primary && { backgroundColor: colors.accent, borderColor: colors.accent }]}>{icon}</View>
      <Text style={st.qaLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function QuickActions({ children }: { children: ReactNode }) {
  return <View style={st.qaRow}>{children}</View>;
}

/* ---------- Sections ---------- */

export function Section({ title, action, onAction, children, style }: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ gap: space.s3 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Text style={st.sectionTitle}>{title}</Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
            <Text style={st.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Carte blanche à coins doux, sans bordure lourde. */
export function Panel({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  return <View style={[st.panel, padded && { padding: space.s4 }, style]}>{children}</View>;
}

/** Ligne d'action : tuile d'icône teintée, titre, sous-titre, pastille ou chevron. */
export function ActionRow({ icon, tone = 'neutral', title, sub, meta, right, onPress, last }: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  sub?: string | null;
  meta?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = TONE[tone];
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [st.arow, !last && st.arowRule, pressed && { backgroundColor: colors.bg }]}>
      <View style={[st.arowIcon, { backgroundColor: tone === 'night' ? colors.nightSoft : c.bg }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {meta ? <Text style={st.arowMeta} numberOfLines={1}>{meta}</Text> : null}
        <Text style={st.arowTitle} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={st.arowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} strokeWidth={1.75} color={colors.ink3} /> : null)}
    </Pressable>
  );
}

/* ---------- Onglets segmentés ---------- */

export function Segmented<K extends string>({ items, value, onChange }: { items: { key: K; label: string; badge?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={st.seg} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)}
            style={[st.segItem, on && st.segOn]}>
            <Text style={[st.segText, on && { color: colors.ink }]} numberOfLines={1}>{it.label}</Text>
            {it.badge ? <View style={st.segBadge}><Text style={st.segBadgeText}>{it.badge}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Carrousel horizontal ---------- */

export function Rail({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.s4, flexGrow: 0 }}
      contentContainerStyle={{ gap: space.s3, paddingHorizontal: space.s4 }}>
      {children}
    </ScrollView>
  );
}

/** Vignette de chantier : la photo, ou un aplat nuit avec les initiales en jaune. */
export function Cover({ uri, name, size = 56, width, height, rounded = radius.r2 }: {
  uri?: string | null; name: string; size?: number; width?: number | `${number}%`; height?: number; rounded?: number;
}) {
  const w = width ?? size;
  const h = height ?? size;
  const box = { width: w, height: h, borderRadius: rounded } as const;
  if (uri) {
    return <Image source={{ uri }} style={[box, { backgroundColor: colors.bg2 }]} contentFit="cover" accessibilityLabel={`Photo du chantier ${name}`} />;
  }
  return (
    <View style={[box, { backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', right: -18, bottom: -18, width: 72, height: 72, borderRadius: 36, borderWidth: 10, borderColor: 'rgba(255,203,17,0.18)' }} />
      <Text style={{ fontFamily: font.display700, fontSize: Math.min(h, typeof w === 'number' ? w : h) * 0.34, color: colors.accent }}>{initials(name)}</Text>
    </View>
  );
}

/** 203 450 € -> « 203 k€ » ; 8 400 € -> « 8 400 € » */
export function compactMoney(cents: number): string {
  const eur = Math.round(cents / 100);
  if (Math.abs(eur) >= 100_000) return `${Math.round(eur / 1000)} k€`;
  if (Math.abs(eur) >= 10_000) return `${(eur / 1000).toFixed(1).replace('.', ',')} k€`;
  return fmt.money(eur * 100, { decimals: false });
}

export const kit = StyleSheet.create({
  heroTitle: { fontFamily: font.display700, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: colors.nightInk },
  heroSub: { fontFamily: font.sans400, fontSize: 15, lineHeight: 21, color: colors.night3 },
  heroIconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
});

const st = StyleSheet.create({
  hero: { backgroundColor: colors.night, paddingHorizontal: space.s4, paddingBottom: space.s7 + space.s4 },
  sheet: { marginTop: -space.s7, paddingHorizontal: space.s4, gap: space.s6 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 },
  kpi: {
    flexBasis: '46%', flexGrow: 1, minHeight: 116, padding: space.s4, borderRadius: radius.r3, backgroundColor: colors.paper,
    ...floating,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.nightSoft, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontFamily: font.display700, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: colors.ink, marginTop: space.s3 },
  kpiLabel: { fontFamily: font.sans500, fontSize: 14, lineHeight: 18, color: colors.ink2, marginTop: 2 },
  kpiHint: { fontFamily: font.sans600, fontSize: 12, lineHeight: 16, color: colors.ink3, marginTop: 4 },

  step: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  stepText: { fontFamily: font.sans600, fontSize: 12, lineHeight: 16 },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: font.sans600, fontSize: 13, lineHeight: 17 },

  qaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s2 },
  qa: { flex: 1, alignItems: 'center', gap: 6, minHeight: 76 },
  qaCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2,
    alignItems: 'center', justifyContent: 'center',
  },
  qaLabel: { fontFamily: font.sans500, fontSize: 13, lineHeight: 16, color: colors.ink2 },

  sectionTitle: { fontFamily: font.display700, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: colors.ink },
  sectionAction: { fontFamily: font.sans600, fontSize: 15, color: colors.ink2, textDecorationLine: 'underline' },

  panel: { backgroundColor: colors.paper, borderRadius: radius.r3, borderWidth: 1, borderColor: colors.rule },

  arow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingVertical: space.s3, paddingHorizontal: space.s4, minHeight: 64 },
  arowRule: { borderBottomWidth: 1, borderBottomColor: colors.rule },
  arowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  arowMeta: { fontFamily: font.sans500, fontSize: 12, lineHeight: 16, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
  arowTitle: { fontFamily: font.sans600, fontSize: 16, lineHeight: 21, color: colors.ink, marginTop: 1 },
  arowSub: { fontFamily: font.sans400, fontSize: 14, lineHeight: 19, color: colors.ink2, marginTop: 2 },

  seg: { flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segOn: { backgroundColor: colors.paper, ...floating },
  segText: { fontFamily: font.sans600, fontSize: 15, color: colors.ink3 },
  segBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.alerte, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segBadgeText: { fontFamily: font.sans600, fontSize: 11, color: '#fff' },
});
