import { contactKindLabel, type ContactKind } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { Building, Search, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { ListCard, ListRow } from '../../ui/blocks';
import { Button, Chips, Empty, ErrorText, Field, Loading, NetBanner, s } from '../../ui/components';
import { colors, space, t } from '../../ui/theme';

const KINDS: ContactKind[] = ['client', 'prospect', 'fournisseur', 'sous_traitant', 'partenaire'];

/** Le carnet d'adresses de l'entreprise (F-03) : clients, prospects, fournisseurs, partenaires. */
export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ContactKind | 'all'>('all');
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.contacts.list() });

  // Filtre local : la recherche marche aussi sans réseau.
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (contacts.data?.items ?? [])
      .filter((c) => kind === 'all' || c.kind === kind)
      .filter((c) => !needle || `${c.name} ${c.companyName ?? ''} ${c.email ?? ''} ${c.phone ?? ''} ${c.sites.map((x) => x.name).join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [contacts.data, q, kind]);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <View style={{ flex: 1 }}>
          <Text style={t.appbar}>Contacts</Text>
          <Text style={[t.mention, { marginTop: 2 }]}>
            {contacts.data ? `${contacts.data.items.length} fiches · clients, fournisseurs, partenaires` : 'Clients, fournisseurs, partenaires'}
          </Text>
        </View>
      </View>
      <ScrollView
        style={s.view}
        contentContainerStyle={[s.content, { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={contacts.isRefetching} onRefresh={() => contacts.refetch()} tintColor={colors.ink3} />}
      >
        <Field icon={<Search size={22} strokeWidth={1.75} color={colors.ink3} />} value={q} onChangeText={setQ}
          placeholder="Nom, société, chantier" accessibilityLabel="Rechercher un contact" returnKeyType="search" />
        <Chips items={[{ key: 'all' as const, label: 'Tous' }, ...KINDS.map((k) => ({ key: k, label: contactKindLabel[k] }))]} value={kind} onChange={setKind} />
        {!online ? <NetBanner text="Hors ligne. Les fiches déjà consultées restent disponibles." /> : null}
        {contacts.isLoading ? <Loading /> : null}
        {contacts.error && !contacts.data ? <ErrorText text={(contacts.error as Error).message} /> : null}
        {items.length > 0 ? (
          <ListCard>
            {items.map((c, i) => (
              <ListRow key={c.id} last={i === items.length - 1}
                icon={c.companyName && c.companyName === c.name ? <Building size={20} strokeWidth={1.75} color={colors.ink2} /> : <UserRound size={20} strokeWidth={1.75} color={colors.ink2} />}
                meta={contactKindLabel[c.kind]}
                title={c.name}
                sub={[c.companyName !== c.name ? c.companyName : null, c.sites.map((x) => x.name).join(', ') || null].filter(Boolean).join(' · ') || null}
                onPress={() => go(`/contacts/${c.id}`)}
              />
            ))}
          </ListCard>
        ) : contacts.data ? <Empty text={q || kind !== 'all' ? 'Aucun contact ne correspond.' : 'Aucun contact pour le moment.'} /> : null}
      </ScrollView>
      <View style={[s.actionbar, { paddingBottom: space.s3 }]}>
        <Button kind="night" label="Nouveau contact" onPress={() => go('/contacts/nouveau')} disabled={!online} />
      </View>
    </View>
  );
}
