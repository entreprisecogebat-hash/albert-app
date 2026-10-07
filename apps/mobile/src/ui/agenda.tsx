import { fmt, type Appointment } from '@albert/shared';
import { CalendarClock } from 'lucide-react-native';
import { ymd } from '../lib/dates';
import { go } from '../lib/nav';
import { ListRow } from './blocks';
import { colors } from './theme';

export function AppointmentRow({ a, last, hideSite }: { a: Appointment; last?: boolean; hideSite?: boolean }) {
  return (
    <ListRow
      last={last}
      icon={<CalendarClock size={20} strokeWidth={1.75} color={colors.ink2} />}
      meta={[fmt.time(a.startsAt), a.endsAt ? fmt.time(a.endsAt) : null].filter(Boolean).join(' – ')}
      title={a.title}
      sub={[hideSite ? null : a.site?.name, a.contact?.name, a.location].filter(Boolean).join(' · ') || null}
      onPress={a.site && !hideSite ? () => go(`/chantiers/${a.site!.id}`) : a.contact ? () => go(`/contacts/${a.contact!.id}`) : undefined}
    />
  );
}

export function groupByDay(items: Appointment[]): [string, Appointment[]][] {
  const map = new Map<string, Appointment[]>();
  for (const a of [...items].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    const k = ymd(new Date(a.startsAt));
    map.set(k, [...(map.get(k) ?? []), a]);
  }
  return [...map.entries()];
}
