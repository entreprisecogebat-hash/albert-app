import { classifiedByLabel, financeKindLabel, financeStatusText, fmt, type ShareLink } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { Euro, History, Link2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { go, shareLink } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { ListCard, ListRow, SectionTitle } from '../../ui/blocks';
import { Button, ErrorText, Loading, NetBanner, Screen, StateTag, TextButton, s } from '../../ui/components';
import { colors, font, space, t } from '../../ui/theme';

/**
 * Je prouve : l'écran qu'on ouvre le jour où quelqu'un conteste.
 * Tout est daté, attribué, dans l'ordre.
 */
export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => api.documents.get(id) });
  const d = doc.data;
  // Accès aux finances du chantier : décide si l'on propose d'enregistrer ce devis ou cette facture.
  const site = useQuery({ queryKey: ['site', d?.siteId], queryFn: () => api.sites.get(d!.siteId), enabled: !!d && !d.finance && (d.type === 'devis' || d.type === 'facture') });

  async function open(url: string) {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url);
    }
  }

  return (
    <Screen
      back
      title="Document"
      action={d?.current ? (
        <View>
          <Button label="Ouvrir le document" onPress={() => open(d.current!.url)} disabled={!online} />
          {d.canEdit ? (
            <TextButton label="Déposer une nouvelle version" onPress={() => router.push({ pathname: '/chantiers/[id]/document', params: { id: d.siteId, documentId: d.id } })} />
          ) : null}
        </View>
      ) : undefined}
      contentStyle={{ paddingBottom: 190 }}
    >
      {doc.isLoading ? <Loading /> : null}
      {doc.error && !d ? <ErrorText text={(doc.error as Error).message} /> : null}
      {d ? (
        <>
          <View style={s.card}>
            <Text style={[t.appbar]}>{d.title}</Text>
            {d.current ? <StateTag on label={`Version ${d.current.label.replace(/^V/, '')}, en cours`} /> : null}
            <Text style={[t.secondary, { color: colors.ink3, marginTop: space.s2 }]}>
              {d.siteName} / {d.folder.name}
              {d.current ? ` · ${d.current.mimeType.split('/')[1]?.toUpperCase()}, ${fmt.bytes(d.current.size)}` : ''}
            </Text>
            <Text style={[t.small, { marginTop: space.s2 }]}>
              {classifiedByLabel[d.classifiedBy]} · {d.visibility === 'client' ? 'Visible aussi par le client' : 'Visible par l’équipe'}
            </Text>
          </View>

          <View>
            <Text style={[t.mention, { marginBottom: space.s2 }]}>Historique des versions</Text>
            <View style={[s.card, { paddingVertical: 0 }]}>
              {d.versions.map((v, i) => (
                <View key={v.id} style={[{ flexDirection: 'row', gap: space.s4, paddingVertical: space.s4 }, i < d.versions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.rule }]}>
                  <Text style={{ fontFamily: font.mono500, fontSize: 15, color: colors.ink, width: 46, paddingTop: 2 }}>{v.label}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={t.secondary}>
                      Déposée {fmt.exact(v.uploadedAt)}{v.uploadedBy ? ` par ${v.uploadedBy.fullName}` : ''}
                    </Text>
                    {v.comment ? <Text style={[t.secondary, { color: colors.ink, marginTop: space.s1 }]}>« {v.comment} »</Text> : null}
                    <Text style={[t.value, { fontSize: 11, marginTop: space.s1 }]} numberOfLines={1}>{v.originalName} · empreinte {v.sha256.slice(0, 12)}</Text>
                    {v.isCurrent ? <StateTag on label="Version en cours" /> : (
                      <TextButton label="Ouvrir cette version" onPress={() => open(v.url)} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {d.contact ? (
            <ListCard>
              <ListRow icon={<UserRound size={20} strokeWidth={1.75} color={colors.ink2} />} meta="Fiche liée" title={d.contact.name}
                onPress={() => go(`/contacts/${d.contact!.id}`)} last />
            </ListCard>
          ) : null}

          {d.finance ? (
            <ListCard>
              <ListRow icon={<Euro size={20} strokeWidth={1.75} color={colors.ink2} />}
                meta={`${financeKindLabel[d.finance.kind]}${d.finance.number ? ` ${d.finance.number}` : ''} · ${financeStatusText(d.finance.kind, d.finance.status)}`}
                title={d.finance.title} sub={`${fmt.money(d.finance.amountTtc)} TTC`}
                onPress={() => go(`/finances/${d.finance!.id}`)} last />
            </ListCard>
          ) : site.data?.canSeeFinances ? (
            <View>
              {/* Un devis ou une facture déposé devient une pièce suivie : montant, échéance, paiement (F-07). */}
              <Button kind="ghost" label={d.type === 'devis' ? 'Enregistrer comme devis' : 'Enregistrer comme facture ou dépense'}
                iconLeft={<Euro size={20} strokeWidth={1.75} color={colors.ink} />}
                onPress={() => go(`/chantiers/${d.siteId}/finance-nouvelle?documentId=${d.id}&kind=${d.type === 'devis' ? 'devis' : 'depense'}`)}
                disabled={!online} />
              <Text style={[t.small, { marginTop: space.s1, paddingHorizontal: space.s1 }]}>
                Pour suivre le montant, l’échéance et le paiement dans les finances du chantier.
              </Text>
            </View>
          ) : null}

          {d.canEdit ? <Shares documentId={d.id} title={d.title} online={online} /> : null}

          {d.history.length > 0 ? (
            <View>
              <Text style={[t.mention, { marginBottom: space.s2 }]}>Journal</Text>
              <View style={[s.card, { paddingVertical: 0 }]}>
                {d.history.map((h, i) => (
                  <View key={h.id} style={[{ flexDirection: 'row', gap: space.s3, alignItems: 'flex-start', minHeight: 56, paddingVertical: space.s3 }, i < d.history.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.rule }]}>
                    <History size={20} strokeWidth={1.75} color={colors.ink3} />
                    <View style={{ flex: 1 }}>
                      <Text style={t.meta}>{fmt.exact(h.occurredAt)}{h.actor ? ` · ${h.actor.fullName}` : ''}</Text>
                      <Text style={[t.secondary, { color: colors.ink }]}>{h.title}{h.subtitle ? `. ${h.subtitle}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {!online ? <NetBanner text="Hors ligne. Fiche enregistrée sur votre téléphone ; le fichier s’ouvrira au retour du réseau." /> : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Partager hors Albert (F-06) : un lien qui expire, sans compte, pour un client,
 * un architecte ou un fournisseur. Chaque ouverture est comptée.
 */
function Shares({ documentId, title, online }: { documentId: string; title: string; online: boolean }) {
  const qc = useQueryClient();
  const [said, setSaid] = useState<string | null>(null);
  const shares = useQuery({ queryKey: ['shares', documentId], queryFn: () => api.shares.list(documentId), enabled: online });
  const send = async (x: ShareLink) => {
    const r = await shareLink(x.url, title);
    setSaid(r === 'copied' ? 'Lien copié. Collez-le dans un mail ou un SMS.' : r === 'shared' ? null : `Lien : ${x.url}`);
  };
  const create = useMutation({
    mutationFn: () => api.shares.create(documentId, 7),
    onSuccess: async (x) => {
      qc.invalidateQueries({ queryKey: ['shares', documentId] });
      await send(x);
    },
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => api.shares.revoke(shareId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', documentId] }),
  });
  const active = (shares.data?.items ?? []).filter((x) => x.active);

  return (
    <View>
      <SectionTitle>Partager hors Albert</SectionTitle>
      <View style={[s.card, { gap: space.s2 }]}>
        <Text style={t.secondary}>Un lien valable 7 jours, sans compte à créer. Vous pouvez le couper à tout moment.</Text>
        <Button kind="night" label="Créer un lien de partage" onPress={() => create.mutate()} busy={create.isPending} disabled={!online}
          iconLeft={<Link2 size={20} strokeWidth={1.75} color={colors.nightInk} />} />
        {said ? <Text style={t.small} selectable>{said}</Text> : null}
        <ErrorText text={(create.error ?? revoke.error) ? ((create.error ?? revoke.error) as Error).message : null} />
        {active.map((x) => (
          <View key={x.id} style={{ borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space.s2 }}>
            <Text style={t.secondary}>
              Créé {fmt.relative(x.createdAt).toLowerCase()}{x.createdBy ? ` par ${x.createdBy.firstName}` : ''} · expire le {fmt.day(x.expiresAt)} · {x.views ? fmt.plural(x.views, 'ouverture') : 'pas encore ouvert'}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.s5 }}>
              <TextButton label="Envoyer" onPress={() => send(x)} />
              <TextButton label="Couper le lien" onPress={() => revoke.mutate(x.id)} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
