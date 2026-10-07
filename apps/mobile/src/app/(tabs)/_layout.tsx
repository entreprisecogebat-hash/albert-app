import { Tabs } from 'expo-router';
import { Building2, CalendarDays, Sun, Users } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { colors, font } from '../../ui/theme';

/**
 * Quatre onglets, au pouce : la journée, les chantiers, le carnet d'adresses, l'agenda.
 * Pas de jaune ici : l'onglet actif est en encre, le jaune reste à l'action de l'écran.
 * Le client ne voit que sa journée et ses chantiers.
 */
export default function TabsLayout() {
  const { me } = useAuth();
  const insets = useSafeAreaInsets();
  const staff = me?.kind !== 'client';
  const ic = (Icon: typeof Sun) => ({ focused }: { focused: boolean }) => (
    <Icon size={24} strokeWidth={focused ? 2.25 : 1.75} color={focused ? colors.ink : colors.ink3} />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
        tabBarLabelStyle: { fontFamily: font.sans500, fontSize: 13 },
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.rule2,
          height: 64 + (Platform.OS === 'web' ? 0 : insets.bottom),
          paddingTop: 6,
          paddingBottom: Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8),
        },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Aujourd’hui', tabBarIcon: ic(Sun) }} />
      <Tabs.Screen name="chantiers" options={{ title: 'Chantiers', tabBarIcon: ic(Building2) }} />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts', tabBarIcon: ic(Users), href: staff ? undefined : null }} />
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ic(CalendarDays), href: staff ? undefined : null }} />
    </Tabs>
  );
}
