import { fmt, type FinanceKind, type FinanceSummary } from '@albert/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { useOnline } from '../../../lib/network';
import { ListCard, SectionTitle } from '../../../ui/blocks';
import { Button, Chips, Empty, ErrorText, Loading, NetBanner, Screen, s } from '../../../ui/components';
import { Amount, FinanceRow, PaidBar } from '../../../ui/money';
import { colors, space, t } from '../../../ui/theme';

type Filter = 'all' | FinanceKind;

/**
 * Finances du chantier : ce qui est signé, facturé, encaissé, ce qui reste dû
 * et ce que le chantier a coûté. Suivi opérationnel, pas une comptabilité.
 */
export default function SiteFinancesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });
  const list = useQuery({ queryKey: ['finances', id], queryFn: () => api.finances.list({ siteId: id }) });
  const [filter, setFilter] = useState<Filter>('all');
  const manager = !!site.data?.canSeeFinances;
  const all = list.data?.items ?? [];
  // En retard d'abord, puis les plus récentes.
  const items = all
    .filter((f) => filter === 'all' || f.kind === filter)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.issuedOn ?? b.createdAt).localeCompare(a.issuedOn ?? a.createdAt));
  const count = (k: FinanceKind) => all.filter((f) => f.kind === k).length;
  const kinds: FinanceKind[] = manager ? ['devis', 'facture', 'depense'] : ['devis', 'facture'];
  const label: Record<FinanceKind, string> = { devis: 'Devis', facture: 'Factures', depense: 'Dépenses' };

  return (
    <Screen back title={manager ? 'Finances' : 'Devis et factures'} subtitle={site.data?.name}
      action={manager ? <Button label="Ajouter une pièce" onPress={() => go(`/chantiers/${id}/finance-nouvelle${filter === 'all' ? '' : `?kind=${filter}`}`)} disabled={!online} /> : undefined}>
      {!online ? <NetBanner text="Hors ligne. Ces montants sont la dernière version enregistrée sur votre téléphone." /> : null}
      {list.isLoading ? <Loading /> : null}
      {list.error && !list.data ? <ErrorText text={(list.error as Error).message} /> : null}

      {list.data && manager ? <Summary s={list.data.summary} /> : null}

      {list.data ? (
        <Chips value={filter} onChange={setFilter}
          items={[{ key: 'all' as Filter, label: `Tout · ${all.length}` }, ...kinds.map((k) => ({ key: k as Filter, label: `${label[k]} · ${count(k)}` }))]} />
      ) : null}

      {items.length > 0 ? (
        <ListCard>
          {items.map((f, i) => <FinanceRow key={f.id} f={f} last={i === items.length - 1} />)}
        </ListCard>
      ) : list.data ? (
        <Empty text={filter === 'all' ? 'Aucun devis, facture ou dépense sur ce chantier.' : `Aucun élément dans ${label[filter].toLowerCase()}.`} />
      ) : null}

      <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
        {manager
          ? 'Montants TTC sauf mention HT. Suivi de chantier, pas une comptabilité certifiée : l’export pour le comptable est dans le back-office.'
          : 'Les devis et factures que l’entreprise vous a envoyés pour ce chantier.'}
      </Text>
    </Screen>
  );
}

/** Synthèse lisible d'un coup d'œil : signé, facturé, encaissé, reste dû, dépenses, marge. */
function Summary({ s: x }: { s: FinanceSummary }) {
  return (
    <View style={[s.card, { gap: space.s4 }]}>
      <View style={{ flexDirection: 'row', gap: space.s4 }}>
        <Stat label="Devis acceptés HT" cents={x.quotedHt} />
        <Stat label="Facturé HT" cents={x.invoicedHt} />
      </View>
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.s2 }}>
          <Text style={t.mention}>Encaissé</Text>
          <Text style={t.mention}>
            <Text style={{ color: colors.ink }}>{fmt.money(x.paidTtc)}</Text> sur {fmt.money(x.invoicedTtc)} TTC
          </Text>
        </View>
        <PaidBar paid={x.paidTtc} total={x.invoicedTtc}
          label={x.outstandingTtc > 0
            ? `Reste à encaisser ${fmt.money(x.outstandingTtc)}${x.overdueTtc > 0 ? `, dont ${fmt.money(x.overdueTtc)} échus` : ''}.`
            : x.invoicedTtc > 0 ? 'Tout ce qui est facturé est encaissé.' : 'Rien de facturé pour le moment.'} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.s4, borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space.s4 }}>
        <Stat label="Dépenses HT" cents={x.expensesHt} sub={x.expensesToPayTtc > 0 ? `${fmt.money(x.expensesToPayTtc)} TTC à payer` : 'Tout est payé'} />
        <Stat label="Marge prévisionnelle HT" cents={x.marginHt}
          sub={x.marginRate != null ? `${fmt.percent(x.marginRate)} des devis acceptés` : 'Aucun devis accepté'} />
      </View>
      {x.quotesPendingHt > 0 ? (
        <Text style={t.small}>{fmt.money(x.quotesPendingHt)} HT de devis envoyés attendent une réponse.</Text>
      ) : null}
    </View>
  );
}

function Stat({ label, cents, sub }: { label: string; cents: number; sub?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Amount cents={cents} size={20} strong />
      <Text style={t.small}>{label}</Text>
      {sub ? <Text style={[t.small, { marginTop: 2 }]}>{sub}</Text> : null}
    </View>
  );
}
