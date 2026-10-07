import { fmt } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { openUrl, shareLink } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { ListCard, ListRow, SectionTitle } from '../../../ui/blocks';
import { Button, ErrorText, Loading, NetBanner, Screen, StateTag, TextButton, s } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/**
 * Dossier des ouvrages exécutés (F-13) et transmission (F-14) : Albert assemble
 * plans, PV, fiches d'intervention, réserves et photos en un PDF, plus une archive.
 */
export default function DoeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const doe = useQuery({ queryKey: ['doe', id], queryFn: () => api.doe.get(id) });
  const [said, setSaid] = useState<string | null>(null);
  const d = doe.data;

  const generate = useMutation({
    mutationFn: () => api.doe.generate(id),
    onSuccess: (x) => {
      qc.setQueryData(['doe', id], x);
      qc.invalidateQueries({ queryKey: ['feed', id] });
      qc.invalidateQueries({ queryKey: ['site', id] });
    },
  });
  const share = useMutation({
    mutationFn: () => api.doe.share(id),
    onSuccess: async (x) => {
      qc.setQueryData(['doe', id], x);
      if (x.share) {
        const r = await shareLink(x.share.url, `DOE · ${site.data?.name ?? ''}`);
        setSaid(r === 'copied' ? 'Lien copié. Collez-le dans un mail ou un SMS.' : r === 'shared' ? 'Lien partagé.' : `Lien : ${x.share.url}`);
      }
    },
  });

  const total = d?.sections.reduce((n, x) => n + x.count, 0) ?? 0;
  const canManage = site.data?.canManage;

  return (
    <Screen back title="DOE" subtitle={site.data?.name}
      action={canManage ? (
        <Button label={d?.documentId ? 'Mettre à jour le DOE' : 'Générer le DOE'} onPress={() => generate.mutate()} busy={generate.isPending} disabled={!online || total === 0} />
      ) : undefined}>
      {!online ? <NetBanner text="Hors ligne. La génération du DOE demande du réseau." /> : null}
      {doe.isLoading ? <Loading /> : null}
      {doe.error && !d ? <ErrorText text={(doe.error as Error).message} /> : null}

      {d ? (
        <>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
              <Archive size={24} strokeWidth={1.75} color={colors.ink} />
              <Text style={[t.cardTitle, { flex: 1 }]}>Dossier des ouvrages exécutés</Text>
            </View>
            {d.generatedAt ? <StateTag on={false} label={`Généré ${fmt.exact(d.generatedAt)}`} /> : <StateTag on={false} label="Pas encore généré" />}
            <Text style={[t.secondary, { marginTop: space.s3 }]}>
              Remis au client à la réception, et utile à la revente du bien. Albert reprend la dernière version de chaque pièce.
            </Text>
          </View>

          <View>
            <SectionTitle>{`Contenu · ${fmt.plural(total, 'pièce')}`}</SectionTitle>
            <ListCard>
              {d.sections.map((x, i) => (
                <ListRow key={x.key} last={i === d.sections.length - 1}
                  icon={x.count > 0 ? <Check size={20} strokeWidth={2} color={colors.sync} /> : undefined}
                  title={x.label}
                  sub={x.count > 0 ? fmt.plural(x.count, 'élément') : 'Rien pour le moment'}
                />
              ))}
            </ListCard>
          </View>

          {d.documentId || d.zipUrl ? (
            <View style={[s.card, { gap: space.s2 }]}>
              {d.documentId ? <Button kind="night" label="Ouvrir le PDF du DOE" onPress={() => router.push({ pathname: '/documents/[id]', params: { id: d.documentId! } })} /> : null}
              {d.zipUrl ? <Button kind="ghost" label="Télécharger toutes les pièces (ZIP)" onPress={() => openUrl(d.zipUrl!)} disabled={!online} /> : null}
              {canManage && d.documentId ? (
                <TextButton label={d.share?.active ? 'Partager à nouveau le lien de transmission' : 'Créer un lien de transmission (30 jours)'} onPress={() => share.mutate()} />
              ) : null}
              {d.share?.active ? (
                <Text style={t.small}>Lien actif jusqu’au {fmt.day(d.share.expiresAt)} · {fmt.plural(d.share.views, 'consultation')}</Text>
              ) : null}
              {said ? <Text style={t.small} selectable>{said}</Text> : null}
              <ErrorText text={share.error ? (share.error as Error).message : null} />
            </View>
          ) : null}
          <ErrorText text={generate.error ? (generate.error as Error).message : null} />
          {!canManage ? <Text style={t.mention}>Le DOE est généré par le responsable du chantier.</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}
