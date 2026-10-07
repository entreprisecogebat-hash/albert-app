import { uuid, type AssistantProposal, type ReserveKind } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { AudioLines, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { addDays, chipDay, ymd } from '../lib/dates';
import { appendFile } from '../lib/files';
import { go } from '../lib/nav';
import { useOnline } from '../lib/network';
import { Label } from '../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea, TextButton, s } from '../ui/components';
import { colors, font, radius, space, t } from '../ui/theme';

type Fields = AssistantProposal['fields'];

const CONFIRM: Record<AssistantProposal['action'], string> = {
  site: 'Créer le chantier',
  task: 'Créer la tâche',
  appointment: 'Ajouter à l’agenda',
  message: 'Envoyer à l’équipe',
  reserve: 'Signaler',
  unknown: 'Comprendre',
};

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/**
 * Commande dictée à Albert (appui long sur +). Albert dit ce qu'il a entendu et ce qu'il propose ;
 * rien n'est créé avant « Créer ». Chaque champ se corrige, et la commande peut aussi s'écrire.
 */
export default function CommandScreen() {
  const params = useLocalSearchParams<{ uri?: string; ms?: string; mime?: string; name?: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [f, setF] = useState<Fields>({});
  const [typed, setTyped] = useState('');
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api.sites.list() });
  const mySites = (sites.data?.items ?? []).filter((x) => x.role !== 'client' && x.status === 'active');

  const understand = useMutation({
    mutationFn: async (input: { uri: string; mime: string; name: string } | { text: string }) => {
      if ('text' in input) return api.assistant.command({ text: input.text });
      const form = new FormData();
      await appendFile(form, input.uri, input.name, input.mime);
      return api.assistant.command(form);
    },
    onSuccess: (p) => {
      setProposal(p);
      setF(p.fields);
      setTyped(p.action === 'unknown' ? p.transcript : '');
    },
  });

  // L'enregistrement part dès l'ouverture de l'écran.
  useEffect(() => {
    if (params.uri && online) understand.mutate({ uri: params.uri, mime: params.mime ?? 'audio/mp4', name: params.name ?? 'commande.m4a' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.uri, online]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const set = (patch: Fields) => setF((x) => ({ ...x, ...patch }));

  const create = useMutation({
    mutationFn: async (): Promise<string> => {
      const a = proposal!.action;
      if (a === 'site') {
        const site = await api.sites.create({ name: f.name!.trim(), address: f.address!.trim(), clientName: f.clientName?.trim() || undefined });
        qc.invalidateQueries({ queryKey: ['sites'] });
        return `/chantiers/${site.id}`;
      }
      if (a === 'task') {
        await api.tasks.create(f.siteId!, { title: f.title!.trim(), dueOn: f.dueOn ?? null, assigneeId: f.assigneeId ?? null });
        qc.invalidateQueries({ queryKey: ['tasks'] });
        qc.invalidateQueries({ queryKey: ['today'] });
        return `/chantiers/${f.siteId}/taches`;
      }
      if (a === 'appointment') {
        await api.appointments.create({ title: f.title!.trim(), startsAt: f.startsAt!, endsAt: f.endsAt ?? null, siteId: f.siteId ?? null });
        qc.invalidateQueries({ queryKey: ['appointments'] });
        qc.invalidateQueries({ queryKey: ['today'] });
        return '/agenda';
      }
      if (a === 'message') {
        const site = await api.sites.get(f.siteId!);
        const channel = site.channels.find((c) => c.kind === 'internal');
        if (!channel) throw new Error('Ce chantier n’a pas de conversation d’équipe.');
        await api.channels.send(channel.id, f.body!.trim(), uuid());
        qc.invalidateQueries({ queryKey: ['messages', channel.id] });
        return `/chantiers/${f.siteId}/messages/internal`;
      }
      const r = await api.reserves.create(f.siteId!, { kind: (f.kind ?? 'reserve') as ReserveKind, title: f.title!.trim(), dueOn: f.dueOn ?? null, assigneeId: f.assigneeId ?? null });
      qc.invalidateQueries({ queryKey: ['reserves'] });
      return `/reserves/${r.id}`;
    },
    onSuccess: (path) => {
      qc.invalidateQueries({ queryKey: ['feed', f.siteId] });
      if (!router.canGoBack()) return router.replace(path as Href);
      router.back();
      setTimeout(() => go(path), 50);
    },
  });

  const a = proposal?.action;
  const ready = !!proposal && a !== 'unknown' && (
    a === 'site' ? !!f.name?.trim() && !!f.address?.trim()
      : a === 'appointment' ? !!f.title?.trim() && !!f.startsAt
        : a === 'message' ? !!f.siteId && !!f.body?.trim()
          : !!f.siteId && !!f.title?.trim()
  );

  const listening = understand.isPending;
  const action = a && a !== 'unknown'
    ? <Button label={CONFIRM[a]} onPress={() => create.mutate()} busy={create.isPending} disabled={!online || !ready} />
    : <Button label="Comprendre" onPress={() => understand.mutate({ text: typed.trim() })} busy={listening} disabled={!online || !typed.trim()} />;

  return (
    <Screen back={close} title="Commande vocale" subtitle={params.ms ? `Enregistrée · ${Math.max(1, Math.round(Number(params.ms) / 1000))} s` : 'Dites ou écrivez ce qu’Albert doit faire'}
      right={<Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} strokeWidth={1.75} color={colors.ink} /></Pressable>}
      action={action}>
      {!online ? <NetBanner text="Hors ligne. Albert a besoin du réseau pour comprendre la commande." /> : null}

      {listening ? (
        <View style={[s.card, { alignItems: 'center', gap: space.s3, paddingVertical: space.s6 }]}>
          <AudioLines size={32} strokeWidth={2} color={colors.ink} />
          <Text style={t.statement}>Albert écoute…</Text>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : null}

      {understand.error ? (
        <View style={{ gap: space.s2 }}>
          <ErrorText text={(understand.error as Error).message} />
          {params.uri ? <TextButton label="Réessayer" onPress={() => understand.mutate({ uri: params.uri!, mime: params.mime ?? 'audio/mp4', name: params.name ?? 'commande.m4a' })} /> : null}
        </View>
      ) : null}

      {proposal && proposal.transcript ? (
        <View style={{ gap: space.s1 }}>
          <Label>Albert a entendu</Label>
          <Text style={[t.body, { fontStyle: 'italic', color: colors.ink2 }]}>« {proposal.transcript} »</Text>
        </View>
      ) : null}

      {proposal && a !== 'unknown' ? (
        <View style={{ gap: space.s4 }}>
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.r2, padding: space.s4, borderWidth: 1, borderColor: colors.accent }}>
            <Text style={[t.mention, { color: colors.ink2 }]}>Albert propose</Text>
            <Text style={t.statement}>{proposal.summary}</Text>
          </View>

          {a === 'site' ? (
            <>
              <Labeled label="Nom du chantier"><Field value={f.name ?? ''} onChangeText={(v) => set({ name: v })} placeholder="Ex. Maison Zazoun" /></Labeled>
              <Labeled label="Client (facultatif)"><Field value={f.clientName ?? ''} onChangeText={(v) => set({ clientName: v })} placeholder="Ex. M. et Mme Zazoun" /></Labeled>
              <Labeled label={f.address ? 'Adresse' : 'Adresse (à compléter)'}><Field value={f.address ?? ''} onChangeText={(v) => set({ address: v })} placeholder="Ex. 12 rue des Lilas, Levallois" autoFocus={!f.address} /></Labeled>
            </>
          ) : null}

          {a === 'task' || a === 'reserve' || a === 'appointment' ? (
            <Labeled label={a === 'appointment' ? 'Objet' : a === 'reserve' ? 'Ce qui ne va pas' : 'Tâche'}>
              <Field value={f.title ?? ''} onChangeText={(v) => set({ title: v })} />
            </Labeled>
          ) : null}

          {a === 'reserve' ? (
            <Chips value={(f.kind ?? 'reserve') as ReserveKind} onChange={(k) => set({ kind: k })}
              items={[{ key: 'reserve', label: 'Réserve' }, { key: 'sav', label: 'SAV' }, { key: 'garantie', label: 'Garantie' }]} />
          ) : null}

          {a === 'message' ? (
            <Labeled label="Message"><TextArea value={f.body ?? ''} onChangeText={(v) => set({ body: v })} /></Labeled>
          ) : null}

          {a !== 'site' ? (
            <View>
              <Label>{a === 'appointment' ? 'Chantier (facultatif)' : f.siteId ? 'Chantier' : 'Sur quel chantier ?'}</Label>
              <Chips value={f.siteId ?? 'none'} onChange={(k) => set({ siteId: k === 'none' ? null : k, siteName: mySites.find((x) => x.id === k)?.name ?? null })}
                items={[...(a === 'appointment' ? [{ key: 'none', label: 'Aucun' }] : []), ...mySites.map((x) => ({ key: x.id, label: x.name }))]} />
            </View>
          ) : null}

          {a === 'task' || a === 'reserve' ? (
            <View>
              <Label>Pour quand</Label>
              <DayChips value={f.dueOn ?? null} onChange={(d) => set({ dueOn: d })} allowNone />
            </View>
          ) : null}

          {a === 'appointment' ? <When f={f} set={set} /> : null}

          {(a === 'task' || a === 'reserve') && f.assigneeId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Text style={[t.body, { flex: 1 }]}>Pour {f.assigneeName}</Text>
              <TextButton label="Retirer" onPress={() => set({ assigneeId: null, assigneeName: null })} />
            </View>
          ) : null}

          <ErrorText text={create.error ? (create.error as Error).message : null} />
        </View>
      ) : null}

      {proposal?.action === 'unknown' ? <Text style={t.secondary}>{proposal.summary}</Text> : null}

      {!listening && (!proposal || a === 'unknown') ? (
        <Labeled label={proposal ? 'Reformulez' : 'Écrire la commande'}>
          <TextArea value={typed} onChangeText={setTyped} placeholder="Ex. Nouveau chantier pour Zazoun, 12 rue des Lilas à Levallois" />
        </Labeled>
      ) : null}
    </Screen>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

/** Deux semaines de jours à choisir, avec le jour proposé par Albert s'il est plus loin. */
function DayChips({ value, onChange, allowNone }: { value: string | null; onChange: (d: string | null) => void; allowNone?: boolean }) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const items = [...(allowNone ? [{ key: 'none', label: 'Sans date' }] : []), ...days.map((d) => ({ key: ymd(d), label: chipDay(d) }))];
  if (value && !items.some((x) => x.key === value)) items.push({ key: value, label: chipDay(new Date(`${value}T12:00:00`)) });
  return <Chips value={value ?? 'none'} onChange={(k) => onChange(k === 'none' ? null : k)} items={items} />;
}

/** Jour et heure du rendez-vous (une heure par défaut). */
function When({ f, set }: { f: Fields; set: (p: Fields) => void }) {
  const start = f.startsAt ? new Date(f.startsAt) : null;
  const day = start ? ymd(start) : null;
  const hour = start ? start.getHours() : 8;
  const minute = start ? start.getMinutes() : 0;
  const update = (d: string | null, h: number, m: number) => {
    if (!d) return set({ startsAt: null, endsAt: null });
    const s = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    set({ startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 3600_000).toISOString() });
  };
  return (
    <>
      <View>
        <Label>Jour</Label>
        <DayChips value={day} onChange={(d) => update(d, hour, minute)} />
      </View>
      <View>
        <Label>Heure</Label>
        <Chips value={String(hour)} onChange={(h) => update(day, Number(h), 0)}
          items={[...new Set([...HOURS, hour])].sort((x, y) => x - y).map((h) => ({ key: String(h), label: h === hour && minute ? `${h} h ${String(minute).padStart(2, '0')}` : `${h} h` }))} />
      </View>
      {!start ? <Text style={[t.small, { fontFamily: font.sans500 }]}>Choisissez le jour du rendez-vous.</Text> : null}
    </>
  );
}
