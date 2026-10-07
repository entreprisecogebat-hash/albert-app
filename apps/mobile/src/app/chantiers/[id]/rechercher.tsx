import { fmt, searchFilters, type Document, type SearchKind, type SearchResult } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, FileText, MessageSquare, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { useOnline } from '../../../lib/network';
import { Chips, Empty, Field, Loading, NetBanner, Screen, StateTag, s } from '../../../ui/components';
import { colors, space, t } from '../../../ui/theme';

/** Je retrouve : une seule recherche sur tout le chantier, et les résultats disent lequel fait foi. */
export default function SearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const docsCache = useQuery({ queryKey: ['documents', id], queryFn: () => api.documents.list(id) });
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<SearchKind>('all');

  useEffect(() => {
    const tm = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(tm);
  }, [q]);

  const results = useQuery({
    queryKey: ['search', id, debounced, kind],
    queryFn: () => api.sites.search(id, debounced, kind),
    enabled: online,
  });

  // Sans réseau : recherche dans les documents déjà sur le téléphone.
  const offlineResults = useMemo<SearchResult[]>(() => {
    if (online) return [];
    const needle = debounced.toLowerCase();
    return (docsCache.data?.items ?? [])
      .filter((d) => (kind === 'all' || d.type === kind) && (!needle || d.title.toLowerCase().includes(needle) || d.current?.originalName.toLowerCase().includes(needle)))
      .map((d) => ({ kind: 'document' as const, at: d.updatedAt, document: d }));
  }, [online, debounced, kind, docsCache.data]);

  const items = online ? results.data?.items ?? [] : offlineResults;

  return (
    <Screen back title="Rechercher" subtitle={site.data?.name}>
      <Field
        icon={<Search size={22} strokeWidth={1.75} color={colors.ink3} />}
        value={q}
        onChangeText={setQ}
        placeholder="Plan, devis, photo, message…"
        accessibilityLabel="Rechercher"
        autoFocus
        returnKeyType="search"
      />
      <Chips items={searchFilters.map((f) => ({ key: f.kind, label: f.label }))} value={kind} onChange={setKind} />

      {online && results.isLoading ? <Loading /> : null}
      {items.length > 0 ? (
        <View style={[s.card, { paddingVertical: 0 }]}>
          {items.map((r, i) => <Result key={key(r, i)} r={r} siteId={id} last={i === items.length - 1} />)}
        </View>
      ) : (online ? results.data : true) ? (
        <Empty text={debounced ? 'Rien ne correspond sur ce chantier.' : 'Tapez un mot : titre, nom de fichier, légende ou message.'} />
      ) : null}

      <NetBanner
        kind={online ? 'info' : 'offline'}
        text={online
          ? `Recherche sur ${site.data?.name ?? 'ce chantier'}. Les documents déjà consultés restent accessibles sans réseau.`
          : 'Hors ligne. Recherche dans les documents enregistrés sur votre téléphone.'}
      />
    </Screen>
  );
}

function key(r: SearchResult, i: number): string {
  if (r.kind === 'document') return `d${r.document.id}`;
  if (r.kind === 'version') return `v${r.version.id}`;
  if (r.kind === 'message') return `m${r.message.id}`;
  return `p${r.photos[0]?.batchId ?? i}`;
}

function docMeta(d: Document, uploadedAt: string, by?: string | null): string {
  return `${d.folder.name} · Déposé ${fmt.ago(uploadedAt)}${by ? ` par ${by}` : ''}`;
}

function Result({ r, siteId, last }: { r: SearchResult; siteId: string; last: boolean }) {
  let Icon = FileText;
  let title = '';
  let meta = '';
  let state: { on: boolean; label: string } | null = null;
  let onPress = () => {};

  if (r.kind === 'document') {
    const d = r.document;
    title = `${d.title} ${d.current?.label ?? ''}`.trim();
    meta = docMeta(d, d.current?.uploadedAt ?? d.updatedAt, d.current?.uploadedBy?.fullName);
    state = { on: true, label: 'Version en cours' };
    onPress = () => router.push({ pathname: '/documents/[id]', params: { id: d.id } });
  } else if (r.kind === 'version') {
    title = `${r.document.title} ${r.version.label}`;
    meta = `${r.document.folder.name} · Déposé ${fmt.exact(r.version.uploadedAt)}${r.version.uploadedBy ? ` par ${r.version.uploadedBy.fullName}` : ''}`;
    state = { on: false, label: 'Remplacée' };
    onPress = () => router.push({ pathname: '/documents/[id]', params: { id: r.document.id } });
  } else if (r.kind === 'photos') {
    Icon = Camera;
    title = fmt.plural(r.photos.length, 'photo');
    meta = [r.caption, `Prises le ${fmt.day(r.at)}`].filter(Boolean).join(' · ');
    onPress = () => router.push({ pathname: '/photo', params: { siteId, batchId: r.photos[0]!.batchId } });
  } else {
    Icon = MessageSquare;
    title = `Message de ${r.message.author?.fullName ?? 'Albert'}`;
    meta = r.message.body;
    onPress = () => router.push({ pathname: '/chantiers/[id]/messages/[kind]', params: { id: siteId, kind: r.message.channelKind } });
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space.s4, paddingVertical: space.s4 }, !last && { borderBottomWidth: 1, borderBottomColor: colors.rule }, pressed && { backgroundColor: colors.bg }]}>
      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} strokeWidth={1.75} color={colors.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={t.bodyStrong}>{title}</Text>
        <Text style={[t.mention, { marginTop: 3 }]} numberOfLines={2}>{meta}</Text>
        {state ? <StateTag on={state.on} label={state.label} /> : null}
      </View>
    </Pressable>
  );
}
