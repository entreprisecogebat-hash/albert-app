import { Tabs, router } from 'expo-router';
import { Building2, CalendarDays, LayoutDashboard, Plus, Users } from 'lucide-react-native';
import { Platform, Pressable, View } from 'react-native';
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
            <Pressable accessibilityRole="button" accessibilityLabel="Ajouter : photo, pointage, tâche, message" onPress={() => router.push('/ajouter')}
              style={({ pressed }) => [{ flex: 1, alignItems: 'center', justifyContent: 'center' }, pressed && { transform: [{ scale: 0.94 }] }]}>
              {/* Plus gros que les onglets et à moitié hors de la barre : c'est l'action principale de l'app. */}
              <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
                marginTop: -36, borderWidth: 4, borderColor: colors.paper }}>
                <Plus size={32} strokeWidth={2.5} color={colors.ink} />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: ic(Users), href: staff ? undefined : null }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ic(CalendarDays), href: staff ? undefined : null }} />
    </Tabs>
  );
}
