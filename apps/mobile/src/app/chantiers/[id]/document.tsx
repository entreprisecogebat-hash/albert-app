import {
  docTypeLabel,
  fmt,
  previewOffline,
  uuid,
  type ClassificationProposal,
  type Document,
  type DocumentType,
  type Folder,
} from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../lib/api';
import { keepForUpload, sha256OfUri } from '../../../lib/files';
import { isOnline, useOnline } from '../../../lib/network';
import { enqueue, useOutbox, type DocumentPayload } from '../../../lib/outbox';
import { Button, ErrorText, KvRow, Loading, NetBanner, Screen, TextArea, TextButton, VisibilitySeg, s } from '../../../ui/components';
import { colors, font, radius, space, t } from '../../../ui/theme';

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

/** Ce qu'Albert a reconnu, en ligne (serveur) ou hors ligne (règles et documents en cache). */
interface Reading {
  statement: string;
  title: string;
  type: DocumentType;
  folder: Pick<Folder, 'id' | 'name' | 'kind'> | null;
  versionLabel: string;
  replaces: { id: string; label: string | null; at: string | null } | null;
  duplicate: ClassificationProposal['duplicateOf'];
}

/**
 * Je dépose. Albert a déjà fait le classement et le présente comme un constat.
 * Il reste à confirmer. Chaque ligne se corrige d'un geste.
 */
export default function DocumentScreen() {
  const { id, documentId } = useLocalSearchParams<{ id: string; documentId?: string }>();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { outbox } = useOutbox();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const docs = useQuery({ queryKey: ['documents', id], queryFn: () => api.documents.list(id) });
  const target = useQuery({ queryKey: ['document', documentId], queryFn: () => api.documents.get(documentId!), enabled: !!documentId });

  const [file, setFile] = useState<Picked | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [override, setOverride] = useState<{ type?: DocumentType; folder?: Folder; title?: string }>({});
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<'team' | 'client'>('team');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState<'type' | 'folder' | null>(null);

  async function pick() {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
    if (r.canceled || !r.assets?.[0]) {
      if (!file) router.back();
      return;
    }
    const a = r.assets[0];
    const picked = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size ?? null };
    setFile(picked);
    setOverride({});
    setReading(null);
    read(picked);
  }

  async function read(p: Picked) {
    const sha = await sha256OfUri(p.uri);
    if (isOnline()) {
      try {
        const prop = await api.documents.analyze(id, p.name, sha ?? undefined, p.mimeType);
        setReading({
          statement: prop.statement,
          title: prop.title,
          type: prop.type,
          folder: prop.folder,
          versionLabel: prop.versionLabel,
          replaces: prop.newVersionOf ? { id: prop.newVersionOf.id, label: prop.newVersionOf.currentLabel, at: prop.newVersionOf.currentUploadedAt } : null,
          duplicate: prop.duplicateOf,
        });
        if (prop.newVersionOf) {
          const known = docs.data?.items.find((d) => d.id === prop.newVersionOf!.id);
          if (known) setVisibility(known.visibility);
        }
        return;
      } catch {
        /* réseau perdu en route : lecture hors ligne */
      }
    }
    const known: Document[] = docs.data?.items ?? [];
    const pv = previewOffline(p.name, known, p.mimeType);
    const folder = site.data?.folders.find((f) => f.kind === pv.folderKind) ?? site.data?.folders.find((f) => f.kind === 'divers') ?? null;
    const prev = pv.newVersionOf ? known.find((d) => d.id === pv.newVersionOf!.id) : undefined;
    setReading({
      statement: pv.statement,
      title: pv.title,
      type: pv.type,
      folder,
      versionLabel: pv.versionLabel,
      replaces: prev ? { id: prev.id, label: prev.current?.label ?? null, at: prev.current?.uploadedAt ?? null } : null,
      duplicate: null,
    });
    if (prev) setVisibility(prev.visibility);
  }

  useEffect(() => {
    pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nouvelle version explicite (depuis la fiche document) : le rattachement est connu.
  const explicit = target.data;
  const replaces = explicit ? { id: explicit.id, label: explicit.current?.label ?? null, at: explicit.current?.uploadedAt ?? null } : reading?.replaces ?? null;
  const type = override.type ?? explicit?.type ?? reading?.type ?? 'autre';
  const folder = override.folder ?? explicit?.folder ?? reading?.folder ?? null;
  const title = explicit?.title ?? reading?.title ?? '';

  async function save() {
    if (!file || !reading) return;
    if (reading.duplicate) {
      router.replace({ pathname: '/documents/[id]', params: { id: reading.duplicate.documentId } });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entryId = uuid();
      const payload: DocumentPayload = {
        fileUri: keepForUpload(file.uri, entryId, file.name),
        filename: file.name,
        mimeType: file.mimeType,
        size: file.size,
        comment: comment.trim() || undefined,
        visibility,
        documentId: replaces?.id,
        statement: reading.statement,
        folderName: folder?.name ?? 'Divers',
        title: override.title ?? (replaces ? undefined : title),
        ...(override.type ? { type: override.type } : {}),
        ...(override.folder ? { folderId: override.folder.id } : {}),
      };
      await enqueue(outbox, { id: entryId, kind: 'document', siteId: id, payload });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer ce document sur le téléphone.");
    } finally {
      setSaving(false);
    }
  }

  const statement = reading?.duplicate
    ? reading.statement
    : override.type
      ? `Classé comme ${docTypeLabel[override.type].toLowerCase()}.`
      : reading?.statement;

  return (
    <Screen
      back
      title={`Ajouter à ${site.data?.name ?? 'ce chantier'}`}
      action={
        <View>
          <Button label={reading?.duplicate ? 'Voir le document' : 'Enregistrer'} onPress={save} busy={saving} disabled={!reading} />
          {!reading?.duplicate ? <TextButton label="Corriger le classement" onPress={() => setCorrecting('folder')} /> : null}
        </View>
      }
      contentStyle={{ gap: space.s5, paddingBottom: 180 + insets.bottom }}
    >
      {file ? (
        <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Choisir un autre fichier"
          style={{ flexDirection: 'row', gap: space.s4, alignItems: 'center', padding: space.s3, paddingHorizontal: space.s4, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.rule2, borderRadius: radius.r2 }}>
          <View style={{ width: 48, height: 48, borderRadius: radius.r1, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} strokeWidth={1.75} color={colors.ink2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sans600, fontSize: 16, lineHeight: 21, color: colors.ink }}>{file.name}</Text>
            <Text style={[t.value, { fontSize: 12, marginTop: 3 }]}>
              {[file.mimeType.split('/')[1]?.toUpperCase(), file.size ? fmt.bytes(file.size) : null, 'déposé il y a quelques secondes'].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      ) : (
        <Loading />
      )}

      {file && !reading ? <Loading /> : null}
      {reading ? (
        <View>
          <Text style={t.statement}>{statement}</Text>
          {!reading.duplicate ? (
            <View style={[s.card, { padding: 0, marginTop: space.s4, overflow: 'hidden' }]}>
              <KvRow k="Type" v={docTypeLabel[type]} onPress={() => setCorrecting('type')} />
              <KvRow k="Dossier" v={`${site.data?.name ?? ''} / ${folder?.name ?? 'Divers'}`} onPress={() => setCorrecting('folder')} />
              <KvRow
                k="Version"
                v={replaces ? reading.versionLabel : 'V1'}
                small={replaces?.label && replaces.at ? `remplace la ${replaces.label} du ${fmt.day(replaces.at)}` : replaces ? null : 'nouveau document'}
                last
              />
            </View>
          ) : (
            <Text style={[t.secondary, { marginTop: space.s3 }]}>
              Déposé {fmt.exact(reading.duplicate.uploadedAt)}. Rien n’est ajouté en double.
            </Text>
          )}
        </View>
      ) : null}

      {reading && !reading.duplicate ? (
        <>
          <TextArea value={comment} onChangeText={setComment} placeholder="Ajouter un commentaire pour l’équipe" accessibilityLabel="Ajouter un commentaire pour l’équipe" />
          <VisibilitySeg value={visibility} onChange={setVisibility} />
        </>
      ) : null}

      {!online ? <NetBanner text="Hors ligne. Le document est enregistré sur votre téléphone et partira dès que vous captez." /> : null}
      <ErrorText text={error} />

      <CorrectionSheet
        open={correcting !== null}
        mode={correcting ?? 'folder'}
        folders={site.data?.folders ?? []}
        currentType={type}
        currentFolderId={folder?.id}
        onClose={() => setCorrecting(null)}
        onType={(tp) => { setOverride((o) => ({ ...o, type: tp })); setCorrecting(null); }}
        onFolder={(f) => { setOverride((o) => ({ ...o, folder: f })); setCorrecting(null); }}
      />
    </Screen>
  );
}

const TYPES = Object.keys(docTypeLabel) as DocumentType[];

function CorrectionSheet(props: {
  open: boolean;
  mode: 'type' | 'folder';
  folders: Folder[];
  currentType: DocumentType;
  currentFolderId?: string;
  onClose: () => void;
  onType: (t: DocumentType) => void;
  onFolder: (f: Folder) => void;
}) {
  const insets = useSafeAreaInsets();
  const rows = props.mode === 'type'
    ? TYPES.map((tp) => ({ key: tp, label: docTypeLabel[tp], on: tp === props.currentType, press: () => props.onType(tp) }))
    : props.folders.map((f) => ({ key: f.id, label: f.name, on: f.id === props.currentFolderId, press: () => props.onFolder(f) }));
  return (
    <Modal visible={props.open} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(44,49,56,0.38)' }} onPress={props.onClose} accessibilityLabel="Fermer" />
      <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: radius.r3, borderTopRightRadius: radius.r3, paddingTop: space.s5, paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s4, maxHeight: '70%' }}>
        <Text style={[t.section, { marginBottom: space.s3 }]}>{props.mode === 'type' ? 'Quel type de document ?' : 'Dans quel dossier ?'}</Text>
        <ScrollView>
          {rows.map((r, i) => (
            <Pressable key={r.key} accessibilityRole="radio" accessibilityState={{ checked: r.on }} onPress={r.press}
              style={({ pressed }) => [{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.s3 }, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.rule }, pressed && { backgroundColor: colors.bg }]}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: r.on ? 7 : 1.5, borderColor: r.on ? colors.ink : colors.rule2 }} />
              <Text style={[t.body, { lineHeight: 22 }]}>{r.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
