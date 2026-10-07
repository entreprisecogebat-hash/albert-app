import { durationLabel, fmt } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { due } from '../../lib/dates';
import { useOnline } from '../../lib/network';
import { Label } from '../../ui/blocks';
import { Button, ErrorText, Field, KvRow, Loading, NetBanner, NightTag, Screen, StateTag, s } from '../../ui/components';
import { SignaturePad, type Strokes } from '../../ui/signature';
import { space, t } from '../../ui/theme';

/** Fiche d'intervention : relecture avec le client, puis signature au doigt (F-12). */
export default function InterventionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const { me } = useAuth();
  const qc = useQueryClient();
  const fiche = useQuery({ queryKey: ['intervention', id], queryFn: () => api.interventions.get(id) });
  const x = fiche.data;
  const [signer, setSigner] = useState('');
  const [sig, setSig] = useState<{ strokes: Strokes; width: number; height: number } | null>(null);

  const sign = useMutation({
    mutationFn: () => api.interventions.sign(id, { signerName: signer.trim(), strokes: sig!.strokes, width: sig!.width, height: sig!.height }),
    onSuccess: (res) => {
      qc.setQueryData(['intervention', id], res);
      qc.invalidateQueries({ queryKey: ['interventions', res.siteId] });
      qc.invalidateQueries({ queryKey: ['feed', res.siteId] });
      qc.invalidateQueries({ queryKey: ['site', res.siteId] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  const signed = x?.status === 'signed';
  const canSign = !!x && !signed && me?.kind !== 'client';
  const hasInk = !!sig && sig.strokes.some((st) => st.length > 1);
  const openPdf = () => {
    if (x?.documentId) router.push({ pathname: '/documents/[id]', params: { id: x.documentId } });
  };

  return (
    <Screen back title={x ? x.number : 'Fiche d’intervention'} subtitle={x?.siteName}
      action={signed ? (x?.documentId ? <Button label="Ouvrir le PDF signé" onPress={openPdf} /> : undefined)
        : canSign ? <Button label="Faire signer et enregistrer" onPress={() => sign.mutate()} busy={sign.isPending} disabled={!online || !signer.trim() || !hasInk} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. La signature sera possible dès que vous captez." /> : null}
      {fiche.isLoading ? <Loading /> : null}
      {fiche.error && !x ? <ErrorText text={(fiche.error as Error).message} /> : null}
      {x ? (
        <>
          <View style={s.card}>
            <Text style={t.appbar}>{x.title}</Text>
            {signed ? <StateTag on={false} label={`Signée par ${x.signerName}`} /> : <View style={{ marginTop: space.s2 }}><NightTag label="À signer" /></View>}
          </View>
          <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            <KvRow k="Date" v={due(x.interventionOn)} />
            {x.minutes ? <KvRow k="Durée" v={durationLabel(x.minutes)} /> : null}
            {x.technicians ? <KvRow k="Intervenants" v={x.technicians} /> : null}
            <KvRow k="Rédigée par" v={x.author?.fullName ?? '—'} small={fmt.exact(x.createdAt)} last />
          </View>
          <View>
            <Label>Travaux réalisés</Label>
            <View style={s.card}><Text style={t.body}>{x.workDone}</Text></View>
          </View>
          {x.materials ? (
            <View>
              <Label>Matériel et fournitures</Label>
              <View style={s.card}><Text style={t.body}>{x.materials}</Text></View>
            </View>
          ) : null}

          {signed ? (
            <View>
              <Label>Signature du client</Label>
              <View style={s.card}>
                {x.signatureUrl ? (
                  <Image source={{ uri: x.signatureUrl }} style={{ height: 120, width: '100%' }} contentFit="contain" accessibilityLabel={`Signature de ${x.signerName}`} />
                ) : null}
                <Text style={[t.secondary, { marginTop: space.s2 }]}>{x.signerName}{x.signedAt ? `, ${fmt.exact(x.signedAt)}` : ''}</Text>
                {x.documentId ? <Text style={[t.small, { marginTop: space.s1 }]}>Le PDF est rangé dans les documents du chantier, visible par le client.</Text> : null}
              </View>
            </View>
          ) : canSign ? (
            <View style={{ gap: space.s3 }}>
              <Text style={t.statement}>Faites relire la fiche au client, puis faites-le signer.</Text>
              <View>
                <Label>Nom du signataire</Label>
                <Field value={signer} onChangeText={setSigner} placeholder="Ex. Claire Lefèvre" autoCapitalize="words" accessibilityLabel="Nom du signataire" />
              </View>
              <SignaturePad onChange={(strokes, size) => setSig({ strokes: strokes.map((st) => [...st]), ...size })} />
              <ErrorText text={sign.error ? (sign.error as Error).message : null} />
            </View>
          ) : (
            <Text style={t.secondary}>Cette fiche attend la signature, sur le téléphone de l’équipe.</Text>
          )}
        </>
      ) : null}
    </Screen>
  );
}
