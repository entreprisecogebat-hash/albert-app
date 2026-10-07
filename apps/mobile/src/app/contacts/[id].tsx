import { contactKindLabel, docTypeLabel, fmt } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, FileText, Mail, MapPin, Phone } from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { AppointmentRow } from '../../ui/agenda';
import { ListCard, ListRow, SectionTitle } from '../../ui/blocks';
import { Button, ErrorText, Loading, NetBanner, Screen, StateTag, s } from '../../ui/components';
import { colors, space, t } from '../../ui/theme';

/** Fiche contact (F-03) : coordonnées, chantiers, documents et rendez-vous liés. */
export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.contacts.get(id) });
  const c = contact.data;

  return (
    <Screen back title={c?.name ?? 'Contact'} subtitle={c?.companyName && c.companyName !== c.name ? c.companyName : c?.jobTitle}
      action={c?.phone ? <Button label={`Appeler ${c.phoneDisplay ?? c.phone}`} onPress={() => Linking.openURL(`tel:${c.phone}`)}
        iconLeft={<Phone size={22} strokeWidth={1.75} color={colors.ink} />} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. Fiche enregistrée sur votre téléphone." /> : null}
      {contact.isLoading ? <Loading /> : null}
      {contact.error && !c ? <ErrorText text={(contact.error as Error).message} /> : null}
      {c ? (
        <>
          <StateTag on={false} label={contactKindLabel[c.kind]} />
          <ListCard>
            {c.email ? (
              <ListRow icon={<Mail size={20} strokeWidth={1.75} color={colors.ink2} />} title={c.email} sub="Écrire un e-mail"
                onPress={() => Linking.openURL(`mailto:${c.email}`)} />
            ) : null}
            {c.address ? (
              <ListRow icon={<MapPin size={20} strokeWidth={1.75} color={colors.ink2} />} title={c.address} sub="Ouvrir le plan"
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address!)}`)} />
            ) : null}
            {c.phone ? (
              <ListRow icon={<Phone size={20} strokeWidth={1.75} color={colors.ink2} />} title={c.phoneDisplay ?? c.phone} sub="Envoyer un SMS"
                onPress={() => Linking.openURL(`sms:${c.phone}`)} last />
            ) : null}
          </ListCard>
          {c.notes ? (
            <View style={s.card}>
              <Text style={t.mention}>Notes</Text>
              <Text style={[t.body, { marginTop: space.s1 }]}>{c.notes}</Text>
            </View>
          ) : null}

          {c.sites.length > 0 ? (
            <View>
              <SectionTitle>Chantiers</SectionTitle>
              <ListCard>
                {c.sites.map((x, i) => (
                  <ListRow key={x.id} last={i === c.sites.length - 1} icon={<Building2 size={20} strokeWidth={1.75} color={colors.ink2} />}
                    title={x.name} onPress={() => go(`/chantiers/${x.id}`)} />
                ))}
              </ListCard>
            </View>
          ) : null}

          {c.appointments.length > 0 ? (
            <View>
              <SectionTitle>Rendez-vous</SectionTitle>
              <ListCard>{c.appointments.map((a, i) => <AppointmentRow key={a.id} a={a} last={i === c.appointments.length - 1} />)}</ListCard>
            </View>
          ) : null}

          {c.documents.length > 0 ? (
            <View>
              <SectionTitle>Documents liés</SectionTitle>
              <ListCard>
                {c.documents.map((d, i) => (
                  <ListRow key={d.id} last={i === c.documents.length - 1} icon={<FileText size={20} strokeWidth={1.75} color={colors.ink2} />}
                    meta={[docTypeLabel[d.type], d.current?.label, fmt.relative(d.updatedAt)].filter(Boolean).join(' · ')}
                    title={d.title} sub={d.siteName}
                    onPress={() => router.push({ pathname: '/documents/[id]', params: { id: d.id } })} />
                ))}
              </ListCard>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Button kind="ghost" label="Prendre rendez-vous" onPress={() => go(`/agenda/nouveau?contactId=${c.id}${c.sites[0] ? `&siteId=${c.sites[0].id}` : ''}`)} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
