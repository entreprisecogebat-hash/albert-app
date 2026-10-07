import { fmt, type Task } from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { CheckSquare, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { addDays, chipDay, due, ymd } from '../../../lib/dates';
import { useOnline } from '../../../lib/network';
import { Label, ListCard, SectionTitle } from '../../../ui/blocks';
import { Button, Chips, Empty, ErrorText, Field, Loading, NetBanner, NightTag, Screen, TextButton, s } from '../../../ui/components';
import { colors, font, space, t } from '../../../ui/theme';

/** Les tâches du chantier : ce qu'il reste à faire, qui s'en charge, pour quand. */
export default function TasksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const { me } = useAuth();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const tasks = useQuery({ queryKey: ['tasks', id], queryFn: () => api.tasks.list({ siteId: id }) });
  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.sites.members(id) });

  const [title, setTitle] = useState('');
  const [dueKey, setDueKey] = useState<string>('none');
  const [assignee, setAssignee] = useState<string>('none');
  const [urgent, setUrgent] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tasks', id] });
    qc.invalidateQueries({ queryKey: ['site', id] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };

  const create = useMutation({
    mutationFn: () => api.tasks.create(id, {
      title: title.trim(),
      dueOn: dueKey === 'none' ? null : dueKey,
      assigneeId: assignee === 'none' ? null : assignee,
      priority: urgent ? 'urgent' : 'normal',
    }),
    onSuccess: () => {
      setTitle('');
      setDueKey('none');
      setAssignee('none');
      setUrgent(false);
      refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (task: Task) => api.tasks.update(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
    onMutate: async (task) => {
      // Coche immédiate : le réseau suit
      await qc.cancelQueries({ queryKey: ['tasks', id] });
      qc.setQueryData<{ items: Task[] }>(['tasks', id], (old) => old && {
        items: old.items.map((x) => (x.id === task.id ? { ...x, status: x.status === 'done' ? 'todo' : 'done', doneAt: x.status === 'done' ? null : new Date().toISOString() } : x)),
      });
    },
    onSettled: refresh,
  });

  const all = tasks.data?.items ?? [];
  const todo = all.filter((x) => x.status === 'todo').sort(byUrgency);
  const done = all.filter((x) => x.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const staff = (members.data?.items ?? []).filter((m) => m.role !== 'client');
  const days = [0, 1, 2, 3, 4, 7].map((n) => addDays(new Date(), n));

  return (
    <Screen back title="Tâches" subtitle={site.data?.name}
      action={<Button label="Ajouter la tâche" onPress={() => create.mutate()} busy={create.isPending} disabled={!title.trim() || !online} />}>
      {!online ? <NetBanner text="Hors ligne. Les tâches affichées sont celles enregistrées sur votre téléphone." /> : null}

      <View style={[s.card, { gap: space.s3 }]}>
        <Field value={title} onChangeText={setTitle} placeholder="Nouvelle tâche, ex. Commander les plinthes" accessibilityLabel="Intitulé de la tâche"
          returnKeyType="done" onSubmitEditing={() => title.trim() && create.mutate()} />
        <View>
          <Label>Pour quand</Label>
          <Chips value={dueKey} onChange={setDueKey}
            items={[{ key: 'none', label: 'Sans date' }, ...days.map((d) => ({ key: ymd(d), label: chipDay(d) }))]} />
        </View>
        {staff.length > 0 ? (
          <View>
            <Label>Qui s’en charge</Label>
            <Chips value={assignee} onChange={setAssignee}
              items={[{ key: 'none', label: 'Personne' }, ...staff.map((m) => ({ key: m.user.id, label: m.user.id === me?.id ? 'Moi' : m.user.firstName }))]} />
          </View>
        ) : null}
        <Chips value={urgent ? 'urgent' : 'normal'} onChange={(k) => setUrgent(k === 'urgent')}
          items={[{ key: 'normal', label: 'Normale' }, { key: 'urgent', label: 'Urgent' }]} />
        <ErrorText text={create.error ? (create.error as Error).message : null} />
      </View>

      {tasks.isLoading ? <Loading /> : null}
      {tasks.error && !tasks.data ? <ErrorText text={(tasks.error as Error).message} /> : null}

      {tasks.data ? (
        <View>
          <SectionTitle>{todo.length ? fmt.plural(todo.length, 'tâche à faire', 'tâches à faire') : 'À faire'}</SectionTitle>
          {todo.length ? (
            <ListCard>{todo.map((x, i) => <TaskRow key={x.id} task={x} last={i === todo.length - 1} onToggle={() => toggle.mutate(x)} />)}</ListCard>
          ) : <Empty text="Tout est fait sur ce chantier." />}
        </View>
      ) : null}

      {done.length > 0 ? (
        <View>
          <SectionTitle right={<TextButton label={showDone ? 'Masquer' : 'Afficher'} onPress={() => setShowDone((v) => !v)} />}>
            {fmt.plural(done.length, 'tâche faite', 'tâches faites')}
          </SectionTitle>
          {showDone ? (
            <ListCard>{done.map((x, i) => <TaskRow key={x.id} task={x} last={i === done.length - 1} onToggle={() => toggle.mutate(x)} />)}</ListCard>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function byUrgency(a: Task, b: Task): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
  return (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
}

function TaskRow({ task, last, onToggle }: { task: Task; last: boolean; onToggle: () => void }) {
  const isDone = task.status === 'done';
  const meta = [
    task.dueOn ? (task.overdue && !isDone ? `En retard · ${due(task.dueOn)}` : due(task.dueOn)) : null,
    task.assignee?.fullName,
  ].filter(Boolean).join(' · ');
  return (
    <View style={[{ flexDirection: 'row', gap: space.s3, paddingVertical: space.s3, minHeight: 56, alignItems: 'flex-start' }, !last && { borderBottomWidth: 1, borderBottomColor: colors.rule }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel={isDone ? 'Marquer à faire' : 'Marquer comme faite'}
        onPress={onToggle} hitSlop={8} style={{ width: 48, height: 48, marginLeft: -space.s2, alignItems: 'center', justifyContent: 'center' }}>
        {isDone ? <CheckSquare size={26} strokeWidth={1.75} color={colors.sync} /> : <Square size={26} strokeWidth={1.75} color={colors.ink2} />}
      </Pressable>
      <View style={{ flex: 1, paddingTop: space.s2 }}>
        <Text style={[{ fontFamily: font.sans600, fontSize: 17, lineHeight: 22, color: colors.ink }, isDone && { textDecorationLine: 'line-through', color: colors.ink3 }]}>{task.title}</Text>
        {meta ? <Text style={[t.secondary, { marginTop: 2 }, task.overdue && !isDone && { color: colors.alerte }]}>{meta}</Text> : null}
        {task.notes ? <Text style={[t.small, { marginTop: 2 }]}>{task.notes}</Text> : null}
      </View>
      {task.priority === 'urgent' && !isDone ? <View style={{ paddingTop: space.s2 }}><NightTag label="Urgent" /></View> : null}
    </View>
  );
}
