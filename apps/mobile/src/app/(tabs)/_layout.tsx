import { Tabs, router } from 'expo-router';
import { Building2, CalendarDays, LayoutDashboard, Plus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, font } from '../../ui/theme';

/**
 * Quatre onglets et, au centre, le bouton jaune « Ajouter » : photo, pointage, tâche, message…
 * depuis n'importe quel écran, en deux gestes. Le client ne voit que l'accueil et ses chantiers.
 */
export default function TabsLayout() {
  const { me } = useAuth();
  const insets = useSafeAreaInsets();
  const staff = me?.kind !== 'client';
  const ic = (Icon: typeof Building2) => ({ focused }: { focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      <Icon size={24} strokeWidth={focused ? 2.25 : 1.75} color={focused ? colors.ink : colors.ink3} />
      <View style={{ width: 18, height: 3, borderRadius: 2, marginTop: 3, backgroundColor: focused ? colors.accent : 'transparent' }} />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
        tabBarLabelStyle: { fontFamily: font.sans600, fontSize: 12, marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.rule,
          height: 70 + (Platform.OS === 'web' ? 0 : insets.bottom),
          paddingTop: 8,
          paddingBottom: Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 10),
        },
        sceneStyle: { backgroundColor: colors.bg },
        // Le bouton par défaut pose sur Android un ripple sans bord, gris foncé, qui déborde en gros cercle noir.
        tabBarButton: ({ ref: _ref, href: _href, android_ripple: _ripple, pressOpacity: _opacity, hoverEffect: _hover, style, ...props }) => (
          <Pressable {...props} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]} />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: ic(LayoutDashboard) }} />
      <Tabs.Screen name="chantiers" options={{ title: 'Chantiers', tabBarIcon: ic(Building2) }} />
      <Tabs.Screen
        name="plus"
        options={{
          title: '',
          tabBarAccessibilityLabel: 'Ajouter',
          // Le client n'ajoute rien depuis la barre : pas de bouton (expo-router refuse href + tabBarButton ensemble).
          tabBarButton: () => !staff ? null : (
            <AddButton />
          ),
        }}
      />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: ic(Users), href: staff ? undefined : null }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ic(CalendarDays), href: staff ? undefined : null }} />
    </Tabs>
  );
}

/**
 * Bouton central. Appui court : le menu « Ajouter ». Appui long : il passe en nuit, une onde
 * jaune bat dedans et des cercles s'en échappent (façon Shazam) tant que le doigt reste posé.
 */
function AddButton() {
  const [holding, setHolding] = useState(false);
  // Hauteurs de départ des barres de l'onde, et deux cercles décalés d'une demi-période.
  const [bars] = useState(() => [0.45, 0.8, 1, 0.65, 0.4].map((v) => new Animated.Value(v)));
  const [rings] = useState(() => [new Animated.Value(0), new Animated.Value(0)]);

  useEffect(() => {
    if (!holding) return;
    const ease = Easing.inOut(Easing.quad);
    const anims = [
      ...bars.map((b, i) => Animated.loop(Animated.sequence([
        Animated.timing(b, { toValue: 1, duration: 220 + i * 70, easing: ease, useNativeDriver: true }),
        Animated.timing(b, { toValue: 0.3, duration: 260 + i * 50, easing: ease, useNativeDriver: true }),
      ]))),
      ...rings.map((r, i) => Animated.loop(Animated.sequence([
        Animated.delay(i * 700),
        Animated.timing(r, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay((1 - i) * 700),
      ]))),
    ];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [holding, bars, rings]);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ajouter : photo, pointage, tâche, message. Appui long : note vocale"
      onPress={() => router.push('/ajouter')}
      onLongPress={() => setHolding(true)}
      delayLongPress={300}
      onPressOut={() => setHolding(false)}
      style={({ pressed }) => [{ flex: 1, alignItems: 'center', justifyContent: 'center' }, pressed && !holding && { transform: [{ scale: 0.94 }] }]}>
      <View style={{ width: 66, height: 66, marginTop: -36, alignItems: 'center', justifyContent: 'center' }}>
        {holding ? rings.map((r, i) => (
          <Animated.View key={i} style={{ position: 'absolute', width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: colors.accent, pointerEvents: 'none',
            opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }} />
        )) : null}
        {/* Plus gros que les onglets et à moitié hors de la barre : c'est l'action principale de l'app. */}
        <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: holding ? colors.night : colors.accent, alignItems: 'center', justifyContent: 'center',
          borderWidth: 4, borderColor: colors.paper }}>
          {holding ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 }}>
              {bars.map((b, i) => (
                <Animated.View key={i} style={{ width: 4, height: 26, borderRadius: 2, backgroundColor: colors.accent, transform: [{ scaleY: b }] }} />
              ))}
            </View>
          ) : (
            <Plus size={32} strokeWidth={2.5} color={colors.ink} />
          )}
        </View>
      </View>
    </Pressable>
  );
}
