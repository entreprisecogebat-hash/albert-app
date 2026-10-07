import { roleLabel, type SiteRole } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Phone, UserRound } from 'lucide-react-native';
import { Linking, Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { useOnline } from '../../../lib/network';
import { ListCard, ListRow, SectionTitle } from '../../../ui/blocks';
import { ClientTag, Empty, ErrorText, Loading, NetBanner, Screen } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

const ORDER: SiteRole[] = ['manager', 'worker', 'client'];

/** Qui est sur le chantier. Les droits se règlent dans le back-office, chantier par chantier (F-22). */
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.sites.members(id) });
  const items = members.data?.items ?? [];

  return (
    <Screen back title="Équipe" subtitle={site.data?.name}>
      {!online ? <NetBanner text="Hors ligne. Liste enregistrée sur votre téléphone." /> : null}
      {members.isLoading ? <Loading /> : null}
      {members.error && !members.data ? <ErrorText text={(members.error as Error).message} /> : null}
      {ORDER.map((role) => {
        const group = items.filter((m) => m.role === role);
        if (!group.length) return null;
        return (
          <View key={role}>
            <SectionTitle>{role === 'client' ? 'Client' : role === 'manager' ? 'Responsables du chantier' : 'Équipe'}</SectionTitle>
            <ListCard>
            {group.map((m, i) => (
              <ListRow key={m.user.id} last={i === group.length - 1}
                icon={<UserRound size={20} strokeWidth={1.75} color={colors.ink2} />}
                title={m.user.fullName}
                sub={m.user.jobTitle ?? roleLabel[m.role]}
                right={m.user.phone ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Appeler ${m.user.fullName}`} onPress={() => Linking.openURL(`tel:${m.user.phone}`)}
                    style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Phone size={22} strokeWidth={1.75} color={colors.ink} />
                  </Pressable>
                ) : m.role === 'client' ? <ClientTag /> : undefined}
              />
            ))}
            </ListCard>
          </View>
        );
      })}
      {members.data && items.length === 0 ? <Empty text="Personne sur ce chantier pour le moment." /> : null}
      <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
        Les accès se règlent chantier par chantier, dans le back-office.
      </Text>
    </Screen>
  );
}
