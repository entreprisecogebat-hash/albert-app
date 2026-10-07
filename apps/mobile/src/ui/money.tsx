import { expenseCategoryLabel, financeKindLabel, financeStatusText, fmt, type FinanceEntry } from '@albert/shared';
import { BanknoteArrowDown, HandCoins, ReceiptEuro, ShoppingCart } from 'lucide-react-native';
import { Text, View, type TextStyle } from 'react-native';
import { go } from '../lib/nav';
import { dueFor } from '../lib/dates';
import { ListRow } from './blocks';
import { NightTag, StateTag } from './components';
import { colors, font, radius, space, t } from './theme';

/* ---------------------------------------------------------------------------
 * Briques des finances : montants en IBM Plex Mono, statut toujours écrit,
 * le retard en étiquette nuit. Pas de rouge ni de vert : le texte suffit.
 * ------------------------------------------------------------------------- */

/** Montant en chiffres mono. */
export function Amount({ cents, size = 17, strong, style }: { cents: number; size?: number; strong?: boolean; style?: TextStyle }) {
  return (
    <Text style={[{ fontFamily: strong ? font.mono500 : font.mono400, fontSize: size, lineHeight: Math.round(size * 1.3), color: colors.ink }, style]}>
      {fmt.money(cents)}
    </Text>
  );
}

/** Barre payé / total, avec la phrase qui la dit. */
export function PaidBar({ paid, total, label }: { paid: number; total: number; label?: string }) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
      <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.bg2, overflow: 'hidden', borderWidth: 1, borderColor: colors.rule }}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: colors.night }} />
      </View>
      {label ? <Text style={[t.small, { marginTop: space.s1 }]}>{label}</Text> : null}
    </View>
  );
}

const KIND_ICON = { devis: HandCoins, facture: ReceiptEuro, depense: ShoppingCart } as const;

/** Étiquette de statut d'une pièce : retard en nuit, soldé en gris, le reste écrit. */
export function FinanceTag({ f }: { f: FinanceEntry }) {
  if (f.overdue) {
    return <NightTag label={f.kind === 'facture' ? 'À relancer' : f.kind === 'devis' ? 'Sans réponse' : 'En retard'} />;
  }
  // Nuit = il reste quelque chose à faire (envoyé, à payer, payé en partie) ; gris = brouillon ou terminé.
  const done = f.status === 'paid' || f.status === 'accepted' || f.status === 'refused';
  return <StateTag on={!done && f.status !== 'draft'} label={financeStatusText(f.kind, f.status)} />;
}

/** Ligne de liste : numéro et tiers en mention, libellé, montant TTC, payé. */
export function FinanceRow({ f, last, showSite }: { f: FinanceEntry; last: boolean; showSite?: boolean }) {
  const Icon = f.status === 'paid' && f.kind !== 'devis' ? BanknoteArrowDown : KIND_ICON[f.kind];
  const who = f.contact?.name ?? (f.kind === 'depense' && f.category ? expenseCategoryLabel[f.category] : null);
  const meta = [f.number ?? financeKindLabel[f.kind], showSite ? f.siteName : null, who].filter(Boolean).join(' · ');
  const partly = (f.kind === 'facture' || f.kind === 'depense') && f.paid > 0 && f.remaining > 0;
  const sub = partly
    ? `${fmt.money(f.paid)} payés, reste ${fmt.money(f.remaining)}`
    : f.dueOn && f.remaining > 0 && f.kind !== 'devis' && f.status !== 'draft'
      ? `À payer ${dueFor(f.dueOn)}`
      : f.kind === 'devis' && f.status === 'sent' && f.dueOn
        ? `Valable jusqu’au ${dueFor(f.dueOn).replace(/^pour (le )?/, '')}`
        : null;
  return (
    <ListRow
      last={last}
      icon={<Icon size={20} strokeWidth={1.75} color={f.overdue ? colors.alerte : colors.ink2} />}
      meta={meta}
      title={f.title}
      sub={sub}
      strike={f.status === 'refused'}
      right={
        <View style={{ alignItems: 'flex-end', gap: space.s1 }}>
          <Amount cents={f.amountTtc} size={16} strong />
          <FinanceTag f={f} />
        </View>
      }
      onPress={() => go(`/finances/${f.id}`)}
    />
  );
}
