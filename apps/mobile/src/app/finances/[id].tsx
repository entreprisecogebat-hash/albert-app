import {
  expenseCategoryLabel, financeKindLabel, financeStatusText, fmt, paymentMethodLabel, reminderChannelLabel, vatRates,
  type FinanceDetail, type FinanceStatus, type PaymentMethod, type ReminderChannel,
} from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { BellRing, FileText, HandCoins, Mail, Phone, ReceiptEuro } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { addDays, dmy, due, dueFor, parseDmy, ymd } from '../../lib/dates';
import { go } from '../../lib/nav';
import { useOnline } from '../../lib/network';
import { Label, ListCard, ListRow, SectionTitle } from '../../ui/blocks';
import {
  Button, Chips, ErrorText, Field, KvRow, Loading, NetBanner, NightTag, Screen, StateTag, TextArea, TextButton, s,
} from '../../ui/components';
import { Amount, PaidBar } from '../../ui/money';
import { colors, space, t } from '../../ui/theme';

type Panel = null | 'payment' | 'reminder' | 'invoice';

const METHODS: PaymentMethod[] = ['virement', 'cheque', 'carte', 'especes', 'autre'];
const CHANNELS: ReminderChannel[] = ['telephone', 'email', 'sms', 'courrier'];

/**
 * Une pièce financière : ce qu'elle vaut, ce qui est payé, ce qu'il reste à faire.
 * Une seule action jaune, la plus probable selon l'état ; le reste en actions secondaires.
 */
export default function FinanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['finance', id], queryFn: () => api.finances.get(id) });
  const f = q.data;
  const isClient = me?.kind === 'client';
  const contact = useQuery({
    queryKey: ['contact', f?.contact?.id],
    queryFn: () => api.contacts.get(f!.contact!.id),
    enabled: !!f?.contact && !isClient,
  });

  const [panel, setPanel] = useState<Panel>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Paiement
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(ymd(new Date()));
  const [payDateText, setPayDateText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('virement');
  const [payNote, setPayNote] = useState('');
  // Relance
  const [channel, setChannel] = useState<ReminderChannel>('telephone');
  const [remNote, setRemNote] = useState('');
  // Acompte ou situation
  const [pct, setPct] = useState('30');
  const [pctText, setPctText] = useState('');

  const refresh = (x: FinanceDetail) => {
    qc.setQueryData(['finance', id], x);
    qc.invalidateQueries({ queryKey: ['finances'] });
    qc.invalidateQueries({ queryKey: ['site', x.siteId] });
    qc.invalidateQueries({ queryKey: ['feed', x.siteId] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };

  const setStatus = useMutation({ mutationFn: (status: FinanceStatus) => api.finances.update(id, { status }), onSuccess: refresh });
  const pay = useMutation({
    mutationFn: () => api.finances.addPayment(id, {
      amount: fmt.parseMoney(payAmount)!,
      paidOn: (payDateText ? parseDmy(payDateText) : payDate)!,
      method,
      note: payNote.trim() || null,
    }),
    onSuccess: (x) => { refresh(x); setPanel(null); setPayNote(''); },
  });
  const unpay = useMutation({ mutationFn: (paymentId: string) => api.finances.removePayment(paymentId), onSuccess: refresh });
  const remind = useMutation({
    mutationFn: () => api.finances.addReminder(id, { channel, note: remNote.trim() || null }),
    onSuccess: (x) => { refresh(x); setPanel(null); setRemNote(''); },
  });
  const invoice = useMutation({
    mutationFn: (percent?: number) => api.finances.invoiceFromQuote(id, percent == null ? {} : { percent }),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['finance', id] });
      qc.invalidateQueries({ queryKey: ['finances'] });
      qc.invalidateQueries({ queryKey: ['site', x.siteId] });
      setPanel(null);
      router.push(`/finances/${x.id}` as Href);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.finances.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finances'] });
      if (f) qc.invalidateQueries({ queryKey: ['site', f.siteId] });
      router.back();
    },
  });

  const openPanel = (p: Panel) => {
    if (p === 'payment' && f) setPayAmount(String(f.remaining / 100).replace('.', ','));
    setPanel(p);
  };

  const canEdit = !!f?.canEdit && !isClient;
  const payable = !!f && (f.kind === 'facture' ? f.status === 'sent' || f.status === 'partially_paid' : f.kind === 'depense' && f.status !== 'paid');
  const remindable = !!f && !isClient && ((f.kind === 'facture' && payable) || (f.kind === 'devis' && f.status === 'sent'));
  const left = f?.kind === 'devis' && f.invoicedPercent != null ? Math.max(0, 1 - f.invoicedPercent) : 1;
  const pctValue = pctText ? Number(pctText.replace(',', '.')) : Number(pct);
  const pctOk = Number.isFinite(pctValue) && pctValue > 0 && pctValue <= Math.round(left * 1000) / 10;
  const payCents = fmt.parseMoney(payAmount);
  const payDateOk = !payDateText || !!parseDmy(payDateText);

  /** L'action jaune : soit celle du panneau ouvert, soit la suite logique de la pièce. */
  let action: ReactNode = undefined;
  if (f && canEdit) {
    const busy = setStatus.isPending || pay.isPending || remind.isPending || invoice.isPending;
    if (panel === 'payment') {
      action = <Button label="Enregistrer le paiement" onPress={() => pay.mutate()} busy={busy} disabled={!online || payCents == null || payCents <= 0 || !payDateOk} />;
    } else if (panel === 'reminder') {
      action = <Button label="Noter la relance" onPress={() => remind.mutate()} busy={busy} disabled={!online} />;
    } else if (panel === 'invoice') {
      action = <Button label={`Créer la facture de ${fmt.percent(pctValue / 100)}`} onPress={() => invoice.mutate(pctValue)} busy={busy} disabled={!online || !pctOk} />;
    } else if (f.kind === 'devis' && f.status === 'draft') {
      action = <Button label="Marquer comme envoyé" onPress={() => setStatus.mutate('sent')} busy={busy} disabled={!online} />;
    } else if (f.kind === 'devis' && f.status === 'sent') {
      action = <Button label="Le client a accepté" onPress={() => setStatus.mutate('accepted')} busy={busy} disabled={!online} />;
    } else if (f.kind === 'devis' && f.status === 'accepted' && left > 0) {
      action = <Button label="Facturer un acompte ou une situation" onPress={() => openPanel('invoice')} disabled={!online} />;
    } else if (f.kind === 'facture' && f.status === 'draft') {
      action = <Button label="Émettre la facture" onPress={() => setStatus.mutate('sent')} busy={busy} disabled={!online} />;
    } else if (payable) {
      action = <Button label="Enregistrer un paiement" onPress={() => openPanel('payment')} disabled={!online} />;
    }
  }
  if (!action && f?.documentId) {
    action = <Button kind={canEdit ? 'night' : 'primary'} label="Ouvrir la pièce jointe" onPress={() => go(`/documents/${f.documentId}`)} />;
  }

  const kindTitle = f ? `${financeKindLabel[f.kind]}${f.number ? ` ${f.number}` : f.kind === 'facture' ? ' (brouillon)' : ''}` : 'Pièce';

  return (
    <Screen back title={kindTitle} subtitle={f?.siteName} action={action}>
      {!online ? <NetBanner text="Hors ligne. Montants enregistrés sur votre téléphone ; les changements attendront le réseau." /> : null}
      {q.isLoading ? <Loading /> : null}
      {q.error && !f ? <ErrorText text={(q.error as Error).message} /> : null}
      {f ? (
        <>
          {/* L'essentiel : quoi, combien, où on en est */}
          <View style={s.card}>
            <Text style={t.appbar}>{f.title}</Text>
            <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap', alignItems: 'center' }}>
              <StateTag on={f.status !== 'draft' && f.status !== 'paid' && f.status !== 'refused'} label={financeStatusText(f.kind, f.status)} />
              {f.overdue ? (
                <View style={{ marginTop: space.s2 }}>
                  <NightTag label={f.kind === 'facture' ? 'Échue, à relancer' : f.kind === 'devis' ? 'Sans réponse' : 'En retard'} />
                </View>
              ) : null}
            </View>
            <View style={{ marginTop: space.s4 }}>
              <Amount cents={f.amountTtc} size={28} strong />
              <Text style={t.small}>TTC · {fmt.money(f.amountHt)} HT + {fmt.money(f.amountVat)} de TVA ({vatLabel(f.vatRate)})</Text>
            </View>
            {f.kind !== 'devis' && f.status !== 'draft' ? (
              <View style={{ marginTop: space.s4 }}>
                <PaidBar paid={f.paid} total={f.amountTtc}
                  label={f.remaining <= 0 ? `Soldée : ${fmt.money(f.paid)} payés.` : `${fmt.money(f.paid)} payés, reste ${fmt.money(f.remaining)}.`} />
              </View>
            ) : null}
          </View>

          <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            {f.issuedOn ? <KvRow k={f.kind === 'devis' ? 'Date du devis' : 'Date'} v={due(f.issuedOn)} /> : null}
            {f.dueOn ? (
              <KvRow k={f.kind === 'devis' ? 'Valable jusqu’au' : 'Échéance'} v={due(f.dueOn)}
                small={f.overdue ? (f.kind === 'devis' ? 'Validité dépassée' : 'Dépassée') : null} />
            ) : null}
            {f.category ? <KvRow k="Catégorie" v={expenseCategoryLabel[f.category]} /> : null}
            {f.kind === 'devis' && f.invoicedPercent != null && f.status === 'accepted' ? (
              <KvRow k="Déjà facturé" v={fmt.percent(f.invoicedPercent)} small={left > 0 ? `Reste ${fmt.percent(left)} à facturer` : 'Devis entièrement facturé'} />
            ) : null}
            <KvRow k="Saisi par" v={f.createdBy?.fullName ?? '—'} small={fmt.exact(f.createdAt)} last />
          </View>

          {/* Panneaux d'action : un à la fois, le bouton jaune valide */}
          {panel === 'payment' ? (
            <View style={[s.card, { gap: space.s4 }]}>
              <Text style={t.statement}>{f.kind === 'depense' ? 'Paiement au fournisseur' : 'Paiement reçu'}</Text>
              <View>
                <Label>Montant TTC</Label>
                <Field value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" accessibilityLabel="Montant du paiement en euros"
                  icon={<Text style={[t.body, { color: colors.ink3 }]}>€</Text>} />
                {payAmount && payCents == null ? <ErrorText text="Montant à saisir en euros, par exemple 4 200,00." /> : null}
                {payCents != null && payCents > f.remaining ? <Text style={[t.small, { marginTop: space.s1 }]}>C’est plus que le reste dû ({fmt.money(f.remaining)}).</Text> : null}
              </View>
              <View>
                <Label>Date</Label>
                <Chips value={payDateText ? 'text' : payDate} onChange={(k) => { if (k === 'text') setPayDateText(dmy(new Date())); else { setPayDate(k); setPayDateText(''); } }}
                  items={[{ key: ymd(new Date()), label: 'Aujourd’hui' }, { key: ymd(addDays(new Date(), -1)), label: 'Hier' }, { key: 'text', label: 'Autre date' }]} />
                {payDateText ? <Field style={{ marginTop: space.s2 }} value={payDateText} onChangeText={setPayDateText} placeholder="JJ/MM/AAAA" accessibilityLabel="Date du paiement" /> : null}
                {!payDateOk ? <ErrorText text="Date à saisir sous la forme JJ/MM/AAAA." /> : null}
              </View>
              <View>
                <Label>Moyen</Label>
                <Chips value={method} onChange={setMethod} items={METHODS.map((m) => ({ key: m, label: paymentMethodLabel[m] }))} />
              </View>
              <TextArea value={payNote} onChangeText={setPayNote} placeholder="Note (facultatif) : n° de chèque, référence du virement…" accessibilityLabel="Note du paiement" />
              <ErrorText text={pay.error ? (pay.error as Error).message : null} />
              <TextButton label="Annuler" onPress={() => setPanel(null)} />
            </View>
          ) : null}

          {panel === 'reminder' ? (
            <View style={[s.card, { gap: space.s4 }]}>
              <Text style={t.statement}>{f.kind === 'devis' ? 'Relance du devis' : 'Relance de paiement'}</Text>
              <View>
                <Label>Comment</Label>
                <Chips value={channel} onChange={setChannel} items={CHANNELS.map((c) => ({ key: c, label: reminderChannelLabel[c] }))} />
              </View>
              <TextArea value={remNote} onChangeText={setRemNote} placeholder="Ce qui a été dit ou promis (facultatif)" accessibilityLabel="Note de relance" />
              <Text style={t.small}>Albert note la relance, avec la date et votre nom. Il n’envoie rien à votre place.</Text>
              <ErrorText text={remind.error ? (remind.error as Error).message : null} />
              <TextButton label="Annuler" onPress={() => setPanel(null)} />
            </View>
          ) : null}

          {panel === 'invoice' ? (
            <View style={[s.card, { gap: space.s4 }]}>
              <Text style={t.statement}>Acompte ou situation de travaux</Text>
              <View>
                <Label>Part du devis à facturer</Label>
                <Chips value={pctText ? '' : pct} onChange={(k) => { setPct(k); setPctText(''); }}
                  items={['30', '40', '50'].map((v) => ({ key: v, label: `${v} %` }))} />
                <Field style={{ marginTop: space.s2 }} value={pctText} onChangeText={setPctText} keyboardType="decimal-pad"
                  placeholder={`Autre pourcentage, jusqu’à ${Math.round(left * 1000) / 10}`} accessibilityLabel="Pourcentage à facturer"
                  icon={<Text style={[t.body, { color: colors.ink3 }]}>%</Text>} />
              </View>
              {Number.isFinite(pctValue) && pctValue > 0 ? (
                <Text style={t.secondary}>
                  Soit <Text style={{ color: colors.ink }}>{fmt.money(Math.round((f.amountHt * pctValue) / 100))}</Text> HT,{' '}
                  {fmt.money(Math.round((f.amountTtc * pctValue) / 100))} TTC. La facture est créée en brouillon.
                </Text>
              ) : null}
              {!pctOk && pctValue > 0 ? <ErrorText text={`Il reste ${fmt.percent(left)} du devis à facturer.`} /> : null}
              <ErrorText text={invoice.error ? (invoice.error as Error).message : null} />
              <TextButton label="Annuler" onPress={() => setPanel(null)} />
            </View>
          ) : null}

          {/* Actions secondaires, selon l'état */}
          {canEdit && panel === null ? (
            <View style={{ gap: space.s2 }}>
              {f.kind === 'devis' && f.status === 'sent' ? (
                <Button kind="ghost" label="Le client a refusé" onPress={() => setStatus.mutate('refused')} disabled={!online} />
              ) : null}
              {f.kind === 'devis' && f.status === 'accepted' && left > 0 ? (
                <Button kind="ghost" label={`Facturer le solde (${fmt.percent(left)})`} onPress={() => invoice.mutate(undefined)} busy={invoice.isPending} disabled={!online} />
              ) : null}
              {remindable ? (
                <Button kind={f.overdue ? 'night' : 'ghost'} label="Noter une relance" iconLeft={<BellRing size={20} strokeWidth={1.75} color={f.overdue ? colors.nightInk : colors.ink} />}
                  onPress={() => openPanel('reminder')} disabled={!online} />
              ) : null}
              {(f.kind === 'devis' && (f.status === 'accepted' || f.status === 'refused')) ? (
                <TextButton label="Revenir à « Envoyé »" onPress={() => setStatus.mutate('sent')} />
              ) : null}
              {f.status === 'draft' ? (
                confirmDelete ? (
                  <Button kind="ghost" label="Confirmer : supprimer ce brouillon" onPress={() => remove.mutate()} busy={remove.isPending} disabled={!online} />
                ) : (
                  <TextButton label="Supprimer le brouillon" color={colors.alerte} onPress={() => setConfirmDelete(true)} />
                )
              ) : null}
              <ErrorText text={(setStatus.error ?? remove.error) ? ((setStatus.error ?? remove.error) as Error).message : null} />
            </View>
          ) : null}

          {/* Le tiers */}
          {f.contact ? (
            <View>
              <SectionTitle>{f.kind === 'depense' ? 'Fournisseur' : 'Client'}</SectionTitle>
              <ListCard>
                <ListRow title={f.contact.name} sub={contact.data?.companyName ?? null}
                  onPress={isClient ? undefined : () => go(`/contacts/${f.contact!.id}`)} last={!contact.data?.phone && !contact.data?.email} />
                {contact.data?.phone ? (
                  <ListRow icon={<Phone size={20} strokeWidth={1.75} color={colors.ink2} />} title={`Appeler ${contact.data.phoneDisplay ?? contact.data.phone}`}
                    onPress={() => Linking.openURL(`tel:${contact.data!.phone}`)} last={!contact.data.email} />
                ) : null}
                {contact.data?.email ? (
                  <ListRow icon={<Mail size={20} strokeWidth={1.75} color={colors.ink2} />} title={`Écrire à ${contact.data.email}`}
                    onPress={() => Linking.openURL(`mailto:${contact.data!.email}?subject=${encodeURIComponent(`${financeKindLabel[f.kind]} ${f.number ?? ''} · ${f.siteName}`.trim())}`)} last />
                ) : null}
              </ListCard>
            </View>
          ) : null}

          {/* Liens : pièce jointe, devis d'origine, factures issues du devis */}
          {f.documentId || f.quoteId || f.invoices.length > 0 ? (
            <View>
              <SectionTitle>Liée à</SectionTitle>
              <ListCard>
                {f.documentId ? (
                  <ListRow icon={<FileText size={20} strokeWidth={1.75} color={colors.ink2} />} title="Pièce jointe" sub="Le document dans le chantier, avec ses versions."
                    onPress={() => go(`/documents/${f.documentId}`)} last={!f.quoteId && f.invoices.length === 0} />
                ) : null}
                {f.quoteId ? (
                  <ListRow icon={<HandCoins size={20} strokeWidth={1.75} color={colors.ink2} />} title="Devis d’origine"
                    onPress={() => go(`/finances/${f.quoteId}`)} last={f.invoices.length === 0} />
                ) : null}
                {f.invoices.map((x, i) => (
                  <ListRow key={x.id} icon={<ReceiptEuro size={20} strokeWidth={1.75} color={colors.ink2} />}
                    meta={x.number ?? 'Facture brouillon'} title={x.title}
                    right={<View style={{ alignItems: 'flex-end' }}><Amount cents={x.amountTtc} size={15} /><StateTag on={x.status === 'sent' || x.status === 'partially_paid'} label={financeStatusText(x.kind, x.status)} /></View>}
                    onPress={() => go(`/finances/${x.id}`)} last={i === f.invoices.length - 1} />
                ))}
              </ListCard>
            </View>
          ) : null}

          {/* Paiements */}
          {f.payments.length > 0 ? (
            <View>
              <SectionTitle>{`Paiements · ${fmt.money(f.paid)}`}</SectionTitle>
              <ListCard>
                {f.payments.map((p, i) => (
                  <ListRow key={p.id} meta={`${due(p.paidOn)} · ${paymentMethodLabel[p.method]}`} title={fmt.money(p.amount)}
                    sub={[p.note, p.createdBy ? `Noté par ${p.createdBy.fullName}` : null].filter(Boolean).join(' · ') || null}
                    right={canEdit ? <TextButton label="Retirer" onPress={() => unpay.mutate(p.id)} /> : undefined}
                    last={i === f.payments.length - 1} />
                ))}
              </ListCard>
            </View>
          ) : null}

          {/* Relances */}
          {!isClient && f.reminders.length > 0 ? (
            <View>
              <SectionTitle>{fmt.plural(f.reminders.length, 'relance')}</SectionTitle>
              <ListCard>
                {f.reminders.map((r, i) => (
                  <ListRow key={r.id} icon={<BellRing size={20} strokeWidth={1.75} color={colors.ink2} />}
                    meta={`${fmt.exact(r.at)}${r.by ? ` · ${r.by.fullName}` : ''}`} title={reminderChannelLabel[r.channel]} sub={r.note}
                    last={i === f.reminders.length - 1} />
                ))}
              </ListCard>
            </View>
          ) : null}

          {f.notes ? (
            <View>
              <SectionTitle>Notes</SectionTitle>
              <View style={s.card}><Text style={t.body}>{f.notes}</Text></View>
            </View>
          ) : null}

          <Text style={[t.mention, { paddingHorizontal: space.s1 }]}>
            {f.dueOn && f.remaining > 0 && f.kind !== 'devis' && f.status !== 'draft' ? `À payer ${dueFor(f.dueOn)}. ` : ''}
            Suivi de chantier, pas une comptabilité certifiée.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

function vatLabel(bps: number): string {
  return vatRates.find((r) => r.bps === bps)?.label.replace(/ \(.*\)$/, '') ?? `${bps / 100} %`;
}
