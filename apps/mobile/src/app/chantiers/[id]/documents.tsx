import { docTypeLabel, fmt } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText, Folder, FolderOpen } from 'lucide-react-native';
import { Text } from 'react-native';
import { api } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { ListCard, ListRow } from '../../../ui/blocks';
import { Button, ClientTag, Empty, ErrorText, Loading, NetBanner, Screen } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/**
 * L'arborescence du chantier (F-02) : les dossiers, puis leurs documents.
 * Un dossier ouvert = le même écran avec ?folderId=…
 */
export default function DocumentsScreen() {
  const { id, folderId } = useLocalSearchParams<{ id: string; folderId?: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const folders = useQuery({ queryKey: ['folders', id], queryFn: () => api.sites.folders(id), enabled: !folderId });
  const docs = useQuery({
    queryKey: ['documents', id, folderId],
    queryFn: () => api.documents.list(id, { folderId }),
    enabled: !!folderId,
  });
  const folder = (folders.data?.items ?? site.data?.folders ?? []).find((f) => f.id === folderId);
  const isClient = site.data?.role === 'client';

  if (!folderId) {
    const items = folders.data?.items ?? [];
    const total = items.reduce((n, f) => n + (f.documentsCount ?? 0), 0);
    return (
      <Screen back title="Documents" subtitle={site.data ? `${site.data.name} · ${fmt.plural(total, 'document')}` : null}
        action={!isClient ? <Button label="Déposer un document" onPress={() => router.push({ pathname: '/chantiers/[id]/document', params: { id } })} /> : undefined}>
        {!online ? <NetBanner text="Hors ligne. Les dossiers déjà ouverts restent consultables." /> : null}
        {folders.isLoading ? <Loading /> : null}
        {folders.error && !folders.data ? <ErrorText text={(folders.error as Error).message} /> : null}
        {items.length > 0 ? (
          <ListCard>
            {items.map((f, i) => (
              <ListRow key={f.id} last={i === items.length - 1}
                icon={(f.documentsCount ?? 0) > 0 ? <FolderOpen size={20} strokeWidth={1.75} color={colors.ink2} /> : <Folder size={20} strokeWidth={1.75} color={colors.ink3} />}
                title={f.name}
                sub={(f.documentsCount ?? 0) > 0 ? fmt.plural(f.documentsCount ?? 0, 'document') : 'Vide'}
                onPress={() => go(`/chantiers/${id}/documents?folderId=${f.id}`)}
              />
            ))}
          </ListCard>
        ) : folders.data ? <Empty text="Aucun dossier." /> : null}
        <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
          Albert range chaque document déposé dans le bon dossier et garde toutes ses versions.
        </Text>
      </Screen>
    );
  }

  const items = docs.data?.items ?? [];
  return (
    <Screen back title={folder?.name ?? 'Dossier'} subtitle={site.data?.name}>
      {!online ? <NetBanner text="Hors ligne. Liste enregistrée sur votre téléphone." /> : null}
      {docs.isLoading ? <Loading /> : null}
      {docs.error && !docs.data ? <ErrorText text={(docs.error as Error).message} /> : null}
      {items.length > 0 ? (
        <ListCard>
          {items.map((d, i) => (
            <ListRow key={d.id} last={i === items.length - 1}
              icon={<FileText size={20} strokeWidth={1.75} color={colors.ink2} />}
              meta={[d.current?.label, docTypeLabel[d.type], fmt.relative(d.updatedAt)].filter(Boolean).join(' · ')}
              title={d.title}
              sub={[d.versionsCount > 1 ? fmt.plural(d.versionsCount, 'version') : null, d.contact?.name].filter(Boolean).join(' · ') || null}
              accent={d.visibility === 'client' && !isClient ? colors.client : undefined}
              right={d.visibility === 'client' && !isClient ? <ClientTag /> : undefined}
              onPress={() => router.push({ pathname: '/documents/[id]', params: { id: d.id } })}
            />
          ))}
        </ListCard>
      ) : docs.data ? <Empty text="Ce dossier est vide." /> : null}
    </Screen>
  );
}
