import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { s } from './components';
import { colors, font, radius, space, t } from './theme';

/* ---------------------------------------------------------------------------
 * Blocs partagés par les modules du chantier (tâches, pointage, interventions,
 * réserves, agenda, contacts). Même grammaire que le fil : une ligne, une icône,
 * un titre, une mention, et un statut toujours écrit en toutes lettres.
 * ------------------------------------------------------------------------- */

/** Intitulé de section, en mention, au-dessus d'une carte. */
export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s2, paddingHorizontal: space.s1 }}>
      <Text style={t.mention}>{children}</Text>
      {right}
    </View>
  );
}

/** Carte qui contient une liste de lignes. */
export function ListCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, { paddingVertical: 0 }, style]}>{children}</View>;
}

export function ListRow({
  icon,
  title,
  sub,
  meta,
  right,
  onPress,
  last,
  strike,
  accent,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string | null;
  meta?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  /** Tâche faite, réserve levée : barré discret */
  strike?: boolean;
  /** Filet gauche (teal = visible par le client, terracotta = en retard) */
  accent?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        st.row,
        !last && st.rule,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent, marginLeft: -space.s4, paddingLeft: 13 } : null,
        pressed && { backgroundColor: colors.bg },
      ]}
    >
      {icon ? <View style={st.ic}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {meta ? <Text style={t.meta}>{meta}</Text> : null}
        <Text style={[st.title, meta ? { marginTop: 3 } : null, strike && { textDecorationLine: 'line-through', color: colors.ink3 }]}>{title}</Text>
        {sub ? <Text style={[t.secondary, { marginTop: space.s1 }]}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <ChevronRight size={18} strokeWidth={1.75} color={colors.ink3} style={{ alignSelf: 'center' }} /> : null}
    </Pressable>
  );
}

/** Tuile de module sur la fiche chantier : icône, nom, compteur écrit. */
export function ModuleTile({ icon, label, count, onPress }: { icon: ReactNode; label: string; count?: string | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count}` : label} onPress={onPress}
      style={({ pressed }) => [st.tile, pressed && { backgroundColor: colors.bg }]}>
      {icon}
      <Text style={[t.bodyStrong, { fontSize: 16, lineHeight: 20, marginTop: space.s2 }]} numberOfLines={2}>{label}</Text>
      {count ? <Text style={[t.small, { marginTop: 2 }]} numberOfLines={1}>{count}</Text> : null}
    </Pressable>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={st.grid}>{children}</View>;
}

/** Libellé de champ de formulaire. */
export function Label({ children }: { children: string }) {
  return <Text style={[t.mention, { marginBottom: space.s2 }]}>{children}</Text>;
}

/** Grand chiffre pour les totaux (heures, compteurs). Mono, comme les heures du fil. */
export function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: font.mono500, fontSize: 22, lineHeight: 28, color: colors.ink }}>{value}</Text>
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s4, paddingVertical: space.s4, minHeight: 56, alignItems: 'flex-start' },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.rule },
  ic: { width: 40, height: 40, borderRadius: radius.r1, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.sans600, fontSize: 17, lineHeight: 22, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  tile: {
    width: '46%', flexGrow: 1, minHeight: 96, padding: space.s4, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r2,
  },
});
