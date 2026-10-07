import {
  expenseCategoryLabel, financeKindLabel, fmt, vatRates,
  type Contact, type ExpenseCategory, type FinanceKind, type FinanceStatus,
} from '@albert/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Check, FileText, Search, UserRound } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../lib/api';
import { addDays, dmy, parseDmy, ymd } from '../../../lib/dates';
import { useOnline } from '../../../lib/network';
import { Label, ListCard, ListRow } from '../../../ui/blocks';
import { Button, Chips, ErrorText, Field, NetBanner, Screen, TextArea, s } from '../../../ui/components';
import { Amount } from '../../../ui/money';
import { colors, space, t } from '../../../ui/theme';

const CATEGORIES: ExpenseCategory[] = ['materiaux', 'sous_traitance', 'location', 'main_oeuvre', 'autre'];

/** Statut de départ proposé selon le type de pièce. */
const START: Record<FinanceKind, { key: FinanceStatus; label: string }[]> = {
  devis: [{ key: 'draft', label: 'Brouillon' }, { key: 'sent', label: 'Déjà envoyé' }],
  facture: [{ key: 'draft', label: 'Brouillon' }, { key: 'sent', label: 'Émise et envoyée' }],
  depense: [{ key: 'to_pay', label: 'À payer' }, { key: 'paid', label: 'Déjà payée' }],
};

/**
 * Nouveau devis, facture ou dépense. On tape le montant HT, Albert calcule TVA et TTC.
 * Paramètres : ?kind=devis|facture|depense, ?documentId= (pièce déjà déposée), ?quoteId= (facture d'un devis).
 */
export default function NewFinanceScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; documentId?: string; quoteId?: string }>();
  const id = params.id;
  const online = useOnline();
  const qc = useQueryClient();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api.sites.get(id) });

  const initialKind: FinanceKind = params.quoteId ? 'facture' : isKind(params.kind) ? params.kind : 'devis';
  const [kind, setKindRaw] = useState<FinanceKind>(initialKind);
  const [status, setStatus] = useState<FinanceStatus>(START[initialKind][0]!.key);
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [vat, setVat] = useState('2000');
  const [category, setCategory] = useState<ExpenseCategory>('materiaux');
  const [contactId, setContactId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(params.documentId ?? null);
  const [issued, setIssued] = useState<string>(ymd(new Date()));
  const [issuedText, setIssuedText] = useState('');
  const [dueKey, setDueKey] = useState<string>('30');
  const [dueText, setDueText] = useState('');
  const [notes, setNotes] = useState('');
  const [q, setQ] = useState('');

  const setKind = (k: FinanceKind) => {
    setKindRaw(k);
    setStatus(START[k][0]!.key);
    setDueKey(k === 'devis' ? '90' : '30');
  };

  // Pièce déjà déposée : on reprend son titre.
  const doc = useQuery({ queryKey: ['document', params.documentId], queryFn: () => api.documents.get(params.documentId!), enabled: !!params.documentId });
  // Facture d'un devis : on reprend le client, la TVA et le libellé.
  const quote = useQuery({ queryKey: ['finance', params.quoteId], queryFn: () => api.finances.get(params.quoteId!), enabled: !!params.quoteId });
  useEffect(() => {
    if (doc.data && !title) setTitle(doc.data.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.data]);
  useEffect(() => {
    const x = quote.data;
    if (!x) return;
    if (!title) setTitle(`Facture · ${x.title}`);
    setVat(String(x.vatRate));
    if (x.contact) setContactId(x.contact.id);
    if (!amount) setAmount(String((x.amountHt - Math.round(x.amountHt * (x.invoicedPercent ?? 0))) / 100).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.data]);

  const contacts = useQuery({ queryKey: ['contacts', 'all'], queryFn: () => api.contacts.list() });
  const docs = useQuery({ queryKey: ['documents', id], queryFn: () => api.documents.list(id) });

  // Contacts du chantier d'abord, puis les autres ; la recherche porte sur tout le carnet.
  const contactChoices = useMemo(() => {
    const all = contacts.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    const wanted = (c: Contact) => (kind === 'depense' ? ['fournisseur', 'sous_traitant', 'partenaire'] : ['client', 'prospect']).includes(c.kind);
    const onSite = (c: Contact) => c.sites.some((x) => x.id === id);
    const filtered = needle
      ? all.filter((c) => `${c.name} ${c.companyName ?? ''}`.toLowerCase().includes(needle))
      : all.filter((c) => onSite(c) || wanted(c));
    return filtered
      .sort((a, b) => Number(onSite(b)) - Number(onSite(a)) || Number(wanted(b)) - Number(wanted(a)) || a.name.localeCompare(b.name))
      .slice(0, needle ? 8 : 5);
  }, [contacts.data, q, kind, id]);
  const chosenContact = contacts.data?.items.find((c) => c.id === contactId) ?? null;

  const docChoices = (docs.data?.items ?? []).filter((d) => d.type === 'devis' || d.type === 'facture' || d.id === documentId).slice(0, 8);

  const cents = fmt.parseMoney(amount);
  const vatBps = Number(vat);
  const vatCents = cents != null ? fmt.vatOf(cents, vatBps) : null;

  const issuedOn = issuedText ? parseDmy(issuedText) : issued;
  const base = issuedOn ? new Date(`${issuedOn}T12:00:00`) : new Date();
  const dueOn = dueKey === 'none' ? null
    : dueKey === 'eom' ? ymd(new Date(base.getFullYear(), base.getMonth() + 1, 0))
      : dueKey === 'text' ? parseDmy(dueText)
        : ymd(addDays(base, Number(dueKey)));
  const dateError = (issuedText && !issuedOn) || (dueKey === 'text' && dueText && !dueOn) ? 'Date à saisir sous la forme JJ/MM/AAAA.' : null;

  const create = useMutation({
    mutationFn: () => api.finances.create(id, {
      kind,
      title: title.trim(),
      number: kind === 'depense' ? number.trim() || null : null,
      status,
      category: kind === 'depense' ? category : null,
      contactId,
      documentId,
      quoteId: params.quoteId ?? null,
      amountHt: cents!,
      vatRate: vatBps,
      issuedOn,
      dueOn,
      notes: notes.trim() || null,
    }),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ['finances'] });
      qc.invalidateQueries({ queryKey: ['site', id] });
      qc.invalidateQueries({ queryKey: ['today'] });
      if (documentId) qc.invalidateQueries({ queryKey: ['document', documentId] });
      if (params.quoteId) qc.invalidateQueries({ queryKey: ['finance', params.quoteId] });
      router.replace(`/finances/${f.id}` as Href);
    },
  });

  const ready = online && !!title.trim() && cents != null && cents >= 0 && !dateError && (dueKey !== 'text' || !!dueOn);

  return (
    <Screen back title={`Nouveau ${kind === 'devis' ? 'devis' : kind === 'facture' ? 'facture' : 'dépense'}`.replace('Nouveau facture', 'Nouvelle facture').replace('Nouveau dépense', 'Nouvelle dépense')}
      subtitle={site.data?.name}
      action={<Button label="Enregistrer" onPress={() => create.mutate()} busy={create.isPending} disabled={!ready} />}>
      {!online ? <NetBanner text="Hors ligne. L’enregistrement sera possible dès que vous captez." /> : null}

      {!params.quoteId ? (
        <View>
          <Label>Type de pièce</Label>
          <Chips value={kind} onChange={setKind} items={(['devis', 'facture', 'depense'] as const).map((k) => ({ key: k, label: financeKindLabel[k] }))} />
        </View>
      ) : quote.data ? (
        <Text style={t.secondary}>Facture établie à partir du devis {quote.data.number ?? quote.data.title}.</Text>
      ) : null}

      <View>
        <Label>Libellé</Label>
        <Field value={title} onChangeText={setTitle} accessibilityLabel="Libellé"
          placeholder={kind === 'devis' ? 'Ex. Étanchéité de la terrasse' : kind === 'facture' ? 'Ex. Situation de travaux n°2' : 'Ex. Membranes et relevés Point.P'} />
      </View>

      {kind === 'depense' ? (
        <>
          <View>
            <Label>Catégorie</Label>
            <Chips value={category} onChange={setCategory} items={CATEGORIES.map((c) => ({ key: c, label: expenseCategoryLabel[c] }))} />
          </View>
          <View>
            <Label>Référence du fournisseur (facultatif)</Label>
            <Field value={number} onChangeText={setNumber} placeholder="Ex. FA-458812" accessibilityLabel="Référence fournisseur" autoCapitalize="characters" />
          </View>
        </>
      ) : (
        <Text style={[t.small, { marginTop: -space.s2 }]}>
          {kind === 'devis' ? 'Le numéro D-AAAA-NNNN est donné à l’enregistrement.' : 'Le numéro F-AAAA-NNNN est donné à l’émission, sans trou dans la suite.'}
        </Text>
      )}

      <View>
        <Label>Montant HT</Label>
        <Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" accessibilityLabel="Montant hors taxes en euros"
          icon={<Text style={[t.body, { color: colors.ink3 }]}>€</Text>} />
        {amount && cents == null ? <ErrorText text="Montant à saisir en euros, par exemple 12 480,50." /> : null}
      </View>
      <View>
        <Label>TVA</Label>
        <Chips value={vat} onChange={setVat} items={vatRates.map((r) => ({ key: String(r.bps), label: r.label }))} />
      </View>
      {cents != null ? (
        <View style={[s.card, { flexDirection: 'row', gap: space.s4 }]}>
          <View style={{ flex: 1 }}>
            <Amount cents={vatCents ?? 0} />
            <Text style={t.small}>TVA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Amount cents={cents + (vatCents ?? 0)} size={20} strong />
            <Text style={t.small}>Total TTC</Text>
          </View>
        </View>
      ) : null}

      <View>
        <Label>{kind === 'depense' ? 'Fournisseur (facultatif)' : 'Client (facultatif)'}</Label>
        {chosenContact ? (
          <ListCard>
            <ListRow icon={<UserRound size={20} strokeWidth={1.75} color={colors.ink2} />} title={chosenContact.name}
              sub={chosenContact.companyName} right={<Text style={[t.small, { textDecorationLine: 'underline' }]}>Changer</Text>}
              onPress={() => setContactId(null)} last />
          </ListCard>
        ) : (
          <>
            <Field value={q} onChangeText={setQ} placeholder="Chercher dans les contacts" accessibilityLabel="Chercher un contact"
              icon={<Search size={20} strokeWidth={1.75} color={colors.ink3} />} />
            {contactChoices.length > 0 ? (
              <ListCard style={{ marginTop: space.s2 }}>
                {contactChoices.map((c, i) => (
                  <ListRow key={c.id} icon={<UserRound size={20} strokeWidth={1.75} color={colors.ink2} />} title={c.name}
                    sub={[c.companyName, c.sites.some((x) => x.id === id) ? 'Sur ce chantier' : null].filter(Boolean).join(' · ') || null}
                    onPress={() => setContactId(c.id)} last={i === contactChoices.length - 1} />
                ))}
              </ListCard>
            ) : null}
          </>
        )}
      </View>

      <View>
        <Label>{kind === 'depense' ? 'Date de la facture fournisseur' : kind === 'devis' ? 'Date du devis' : 'Date de la facture'}</Label>
        <Chips value={issuedText ? 'text' : issued} onChange={(k) => { if (k !== 'text') { setIssued(k); setIssuedText(''); } else setIssuedText(dmy(new Date())); }}
          items={[{ key: ymd(new Date()), label: 'Aujourd’hui' }, { key: ymd(addDays(new Date(), -1)), label: 'Hier' }, { key: 'text', label: 'Autre date' }]} />
        {issuedText ? (
          <Field style={{ marginTop: space.s2 }} value={issuedText} onChangeText={setIssuedText} placeholder="JJ/MM/AAAA" keyboardType="numbers-and-punctuation" accessibilityLabel="Date, au format jour mois année" />
        ) : null}
      </View>

      <View>
        <Label>{kind === 'devis' ? 'Valable jusqu’au' : 'Échéance de paiement'}</Label>
        <Chips value={dueKey} onChange={setDueKey}
          items={[
            { key: 'none', label: 'Sans' },
            ...(kind === 'devis' ? [{ key: '30', label: '30 jours' }, { key: '90', label: '3 mois' }] : [{ key: '0', label: 'À réception' }, { key: '30', label: '30 jours' }, { key: '45', label: '45 jours' }, { key: 'eom', label: 'Fin de mois' }]),
            { key: 'text', label: 'Autre date' },
          ]} />
        {dueKey === 'text' ? (
          <Field style={{ marginTop: space.s2 }} value={dueText} onChangeText={setDueText} placeholder="JJ/MM/AAAA" keyboardType="numbers-and-punctuation" accessibilityLabel="Échéance, au format jour mois année" />
        ) : dueOn ? <Text style={[t.small, { marginTop: space.s1 }]}>Le {dmy(new Date(`${dueOn}T12:00:00`))}.</Text> : null}
      </View>

      <View>
        <Label>Où en est-on</Label>
        <Chips value={status} onChange={setStatus} items={START[kind]} />
      </View>

      {docChoices.length > 0 ? (
        <View>
          <Label>Pièce jointe (facultatif)</Label>
          <ListCard>
            {docChoices.map((d, i) => {
              const on = d.id === documentId;
              return (
                <ListRow key={d.id} icon={<FileText size={20} strokeWidth={1.75} color={colors.ink2} />} title={d.title}
                  meta={d.folder.name} onPress={() => setDocumentId(on ? null : d.id)} last={i === docChoices.length - 1}
                  right={on ? <Check size={20} strokeWidth={2} color={colors.ink} /> : <View />} />
              );
            })}
          </ListCard>
        </View>
      ) : null}

      <View>
        <Label>Notes (facultatif)</Label>
        <TextArea value={notes} onChangeText={setNotes} placeholder="Conditions, acompte prévu, remarque…" accessibilityLabel="Notes" />
      </View>

      <ErrorText text={dateError ?? (create.error ? (create.error as Error).message : null)} />
    </Screen>
  );
}

function isKind(v: string | undefined): v is FinanceKind {
  return v === 'devis' || v === 'facture' || v === 'depense';
}
