<?php

namespace App\Service;

use App\Api\ApiProblem;
use App\Api\Input;
use App\Api\Presenter;
use App\Controller\DocumentController;
use App\Entity\ActivityEvent;
use App\Entity\Contact;
use App\Entity\Document;
use App\Entity\FinanceEntry;
use App\Entity\FinancePayment;
use App\Entity\FinanceReminder;
use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Uuid;

/**
 * Finances du chantier : devis, factures, depenses, paiements, relances.
 *
 * Droits (CDC section 3, "finances") :
 *  - responsable du chantier et administrateur : tout voir, tout gerer ;
 *  - equipe (compagnon, sous-traitant) : aucun acces ;
 *  - client : lecture seule de ses devis et factures emis (ni brouillons, ni depenses, ni relances, ni notes).
 *
 * Numerotation :
 *  - devis   D-AAAA-NNNN attribue des la creation, brouillon compris (un devis brouillon efface laisse un trou :
 *    sans consequence, la loi n'impose la continuite qu'aux factures) ;
 *  - facture F-AAAA-NNNN attribue uniquement a l'emission (brouillon -> envoyee), dans la transaction de
 *    l'emission : compteur incremente par UPDATE ... RETURNING (verrou de ligne jusqu'au commit). Si l'emission
 *    echoue, la transaction est annulee et le numero n'est pas consomme : suite continue, sans trou ni doublon.
 */
final class FinanceService
{
    public const MODE_MANAGE = 'manage';
    public const MODE_CLIENT = 'client';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Presenter $present,
        private readonly SiteAccess $access,
        private readonly UserSites $userSites,
        private readonly ActivityRecorder $activity,
    ) {}

    /** 'manage', 'client' (lecture seule) ou null (pas d'acces aux finances) */
    public static function mode(SiteMember $m): ?string
    {
        if ($m->isManager()) {
            return self::MODE_MANAGE;
        }
        return $m->isClient() ? self::MODE_CLIENT : null;
    }

    public static function canManage(SiteMember $m): bool
    {
        return $m->isManager();
    }

    /** Types d'evenements du fil a masquer pour ce membre */
    public static function hiddenFeedTypes(SiteMember $m): array
    {
        return $m->isManager() ? [] : ActivityEvent::FINANCE_TYPES;
    }

    /** Site + mode, ou 403 si l'utilisateur n'a pas acces aux finances de ce chantier. */
    public function siteMode(Site $site, User $user): string
    {
        $mode = self::mode($this->access->member($site, $user));
        if ($mode === null) {
            throw new AccessDeniedHttpException('Les finances du chantier sont réservées aux responsables.');
        }
        return $mode;
    }

    /** @return array{0: FinanceEntry, 1: string} la piece et le mode d'acces */
    public function entry(string $id, User $user): array
    {
        $f = Uuid::isValid($id) ? $this->em->find(FinanceEntry::class, Uuid::fromString($id)) : null;
        if (!$f) {
            throw new NotFoundHttpException('Pièce introuvable.');
        }
        $mode = $this->siteMode($f->getSite(), $user);
        if ($mode === self::MODE_CLIENT && !self::clientSees($f)) {
            throw new NotFoundHttpException('Pièce introuvable.');
        }
        return [$f, $mode];
    }

    public static function clientSees(FinanceEntry $f): bool
    {
        return !$f->isExpense() && !$f->isDraft();
    }

    public function requireManage(string $mode): void
    {
        if ($mode !== self::MODE_MANAGE) {
            throw new AccessDeniedHttpException('Vous pouvez consulter cette pièce, pas la modifier.');
        }
    }

    // ------------------------------------------------------------------ lecture

    /**
     * Pieces visibles, filtrees. Sans chantier : tous les chantiers ou j'ai acces aux finances (archives compris).
     *
     * @return list<array{0: FinanceEntry, 1: string}>
     */
    public function list(User $user, array $q): array
    {
        if (!empty($q['siteId'])) {
            $site = $this->access->site($q['siteId']);
            $modes = [(string) $site->getId() => $this->siteMode($site, $user)];
            $sites = [$site];
        } else {
            $modes = [];
            $sites = [];
            foreach ($this->userSites->memberships($user, true) as $sid => $m) {
                if (($mode = self::mode($m)) !== null) {
                    $modes[$sid] = $mode;
                    $sites[] = $m->getSite();
                }
            }
            // Un membre de l'equipe qui ne dirige aucun chantier n'a pas acces aux finances : 403 plutot qu'une liste vide.
            if (!$modes && !$user->isClient()) {
                throw new AccessDeniedHttpException('Les finances sont réservées aux responsables de chantier.');
            }
        }
        if (!$sites) {
            return [];
        }
        $qb = $this->em->createQueryBuilder()->select('f', 's', 'c')->from(FinanceEntry::class, 'f')
            ->join('f.site', 's')->leftJoin('f.contact', 'c')
            ->where('f.site IN (:sites)')->setParameter('sites', $sites);
        if (!empty($q['kind'])) {
            if (!in_array($q['kind'], FinanceEntry::KINDS, true)) {
                throw ApiProblem::validation(['kind' => 'Type de pièce inconnu.']);
            }
            $qb->andWhere('f.kind = :k')->setParameter('k', $q['kind']);
        }
        if (!empty($q['contactId'])) {
            $qb->andWhere('c.id = :cid')->setParameter('cid', Uuid::isValid($q['contactId']) ? Uuid::fromString($q['contactId'])->toRfc4122() : '00000000-0000-0000-0000-000000000000');
        }
        $status = $q['status'] ?? null;
        $statuses = ['draft', 'sent', 'accepted', 'refused', 'partially_paid', 'paid', 'to_pay'];
        if ($status && !in_array($status, [...$statuses, 'unpaid', 'overdue'], true)) {
            throw ApiProblem::validation(['status' => 'Statut inconnu.']);
        }
        if ($status && in_array($status, $statuses, true)) {
            $qb->andWhere('f.status = :st')->setParameter('st', $status);
        }
        $rows = $qb->getQuery()->getResult();
        $today = new \DateTimeImmutable('today');
        $out = [];
        foreach ($rows as $f) {
            /** @var FinanceEntry $f */
            $mode = $modes[(string) $f->getSite()->getId()];
            if ($mode === self::MODE_CLIENT && !self::clientSees($f)) {
                continue;
            }
            if ($status === 'unpaid' && !(($f->isInvoice() && !$f->isDraft() && $f->getRemaining() > 0 && $f->isOpen()) || ($f->isExpense() && $f->isOpen()))) {
                continue;
            }
            if ($status === 'overdue' && !$f->isOverdue($today)) {
                continue;
            }
            $out[] = [$f, $mode];
        }
        usort($out, function (array $a, array $b) use ($today) {
            /** @var FinanceEntry $x */
            /** @var FinanceEntry $y */
            [$x, $y] = [$a[0], $b[0]];
            if ($x->isOverdue($today) !== $y->isOverdue($today)) {
                return $x->isOverdue($today) ? -1 : 1;
            }
            $dx = $x->getIssuedOn() ?? $x->getCreatedAt();
            $dy = $y->getIssuedOn() ?? $y->getCreatedAt();
            return [$dy->format('Y-m-d'), $y->getCreatedAt()] <=> [$dx->format('Y-m-d'), $x->getCreatedAt()];
        });
        return $out;
    }

    /** @param list<array{0: FinanceEntry, 1: string}> $rows */
    public function summary(array $rows): array
    {
        $s = ['quotedHt' => 0, 'quotesPendingHt' => 0, 'invoicedHt' => 0, 'invoicedTtc' => 0, 'paidTtc' => 0, 'outstandingTtc' => 0,
            'overdueTtc' => 0, 'expensesHt' => 0, 'expensesToPayTtc' => 0];
        $clientOnly = $rows !== [] && !array_filter($rows, fn ($r) => $r[1] === self::MODE_MANAGE);
        $today = new \DateTimeImmutable('today');
        foreach ($rows as [$f]) {
            /** @var FinanceEntry $f */
            if ($f->isQuote()) {
                if ($f->getStatus() === FinanceEntry::STATUS_ACCEPTED) {
                    $s['quotedHt'] += $f->getAmountHt();
                } elseif ($f->getStatus() === FinanceEntry::STATUS_SENT) {
                    $s['quotesPendingHt'] += $f->getAmountHt();
                }
            } elseif ($f->isInvoice()) {
                if ($f->isDraft()) {
                    continue;
                }
                $s['invoicedHt'] += $f->getAmountHt();
                $s['invoicedTtc'] += $f->getAmountTtc();
                $s['paidTtc'] += $f->getPaid();
                $s['outstandingTtc'] += max(0, $f->getRemaining());
                if ($f->isOverdue($today)) {
                    $s['overdueTtc'] += max(0, $f->getRemaining());
                }
            } else {
                $s['expensesHt'] += $f->getAmountHt();
                $s['expensesToPayTtc'] += max(0, $f->getRemaining());
            }
        }
        // La marge n'a de sens que pour l'entreprise : le client ne voit pas les depenses.
        $s['marginHt'] = $clientOnly ? 0 : $s['quotedHt'] - $s['expensesHt'];
        $s['marginRate'] = !$clientOnly && $s['quotedHt'] > 0 ? round($s['marginHt'] / $s['quotedHt'], 4) : null;
        return $s;
    }

    public function detail(FinanceEntry $f, string $mode): array
    {
        $client = $mode === self::MODE_CLIENT;
        $payments = $this->em->getRepository(FinancePayment::class)->findBy(['entry' => $f], ['paidOn' => 'ASC', 'createdAt' => 'ASC']);
        $reminders = $client ? [] : $this->em->getRepository(FinanceReminder::class)->findBy(['entry' => $f], ['at' => 'ASC']);
        $invoices = [];
        $percent = null;
        if ($f->isQuote()) {
            $list = $this->invoicesOf($f);
            if ($client) {
                $list = array_values(array_filter($list, fn (FinanceEntry $i) => !$i->isDraft()));
            }
            $invoices = array_map(fn (FinanceEntry $i) => $this->present->financeRef($i), $list);
            $percent = $f->getAmountHt() > 0 ? round($this->invoicedHt($f) / $f->getAmountHt(), 4) : null;
        }
        return $this->present->financeEntry($f, $client) + [
            'payments' => array_map(fn (FinancePayment $p) => $this->present->financePayment($p), $payments),
            'reminders' => array_map(fn (FinanceReminder $r) => $this->present->financeReminder($r), $reminders),
            'invoices' => $invoices,
            'invoicedPercent' => $percent,
            'canEdit' => !$client,
        ];
    }

    /** @return list<FinanceEntry> factures etablies a partir de ce devis, dans l'ordre */
    public function invoicesOf(FinanceEntry $quote): array
    {
        return $this->em->getRepository(FinanceEntry::class)->findBy(['quote' => $quote, 'kind' => FinanceEntry::KIND_INVOICE], ['createdAt' => 'ASC']);
    }

    /** HT deja facture sur un devis (brouillons compris : ils seront emis) */
    public function invoicedHt(FinanceEntry $quote): int
    {
        return array_sum(array_map(fn (FinanceEntry $i) => $i->getAmountHt(), $this->invoicesOf($quote)));
    }

    // ------------------------------------------------------------------ ecriture

    public function create(Site $site, User $user, Input $in): FinanceEntry
    {
        $kind = $in->oneOf('kind', FinanceEntry::KINDS);
        if ($kind === null) {
            throw ApiProblem::validation(['kind' => 'Choisissez devis, facture ou dépense.']);
        }
        $f = new FinanceEntry($site, $kind, $in->required('title', 'Le libellé', 200), $user);
        $f->setAmounts($this->amount($in, 'amountHt', true), $this->vatRate($in, true));
        $this->applyCommon($f, $in);
        if ($f->isExpense()) {
            $f->setNumber($in->string('number', null, 60));
            $f->setCategory($in->oneOf('category', FinanceEntry::CATEGORIES, 'autre'));
            $f->setIssuedOn($in->day('issuedOn') ?? new \DateTimeImmutable('today'));
        } elseif ($f->isQuote()) {
            $f->setNumber($this->nextNumber($site, 'D', $in->day('issuedOn') ?? new \DateTimeImmutable('today')));
        }
        if ($f->isInvoice() && $in->has('quoteId')) {
            $f->setQuote($this->quoteFor($site, $in->uuid('quoteId')));
        }
        $this->em->persist($f);

        $status = $in->string('status');
        if ($status !== null && $status !== $f->getStatus()) {
            $this->changeStatus($f, $status, $user);
        }
        return $f;
    }

    public function update(FinanceEntry $f, User $user, Input $in): void
    {
        if ($f->isIssuedInvoice()) {
            // Regle francaise : une facture emise ne se modifie pas (numero, montants, taux, libelle, date).
            foreach (['amountHt', 'vatRate', 'number', 'title', 'issuedOn', 'quoteId', 'kind', 'category'] as $k) {
                if ($in->has($k) && !$this->sameValue($f, $k, $in)) {
                    throw new ApiProblem('Une facture émise ne se modifie plus : numéro, libellé et montants sont figés. Établissez un avoir pour la corriger.', 409, 'invoice_locked');
                }
            }
        }
        if ($in->has('kind') && $in->string('kind') !== $f->getKind()) {
            throw ApiProblem::validation(['kind' => 'Le type d’une pièce ne change pas. Créez une nouvelle pièce.']);
        }
        if ($in->has('title')) {
            $f->setTitle($in->required('title', 'Le libellé', 200));
        }
        if ($in->has('amountHt') || $in->has('vatRate')) {
            $f->setAmounts($in->has('amountHt') ? $this->amount($in, 'amountHt', true) : $f->getAmountHt(), $in->has('vatRate') ? $this->vatRate($in, true) : $f->getVatRate());
            if ($f->getPaid() > $f->getAmountTtc()) {
                throw ApiProblem::validation(['amountHt' => 'Le montant ne peut pas être inférieur aux paiements déjà enregistrés.']);
            }
            $f->applyPaid($f->getPaid());
        }
        if ($in->has('number') && $f->isExpense()) {
            $f->setNumber($in->string('number', null, 60));
        }
        if ($in->has('category') && $f->isExpense()) {
            $f->setCategory($in->oneOf('category', FinanceEntry::CATEGORIES, 'autre'));
        }
        if ($in->has('issuedOn') && !$f->isIssuedInvoice()) {
            $f->setIssuedOn($in->day('issuedOn'));
        }
        if ($in->has('quoteId') && $f->isInvoice() && !$f->isIssuedInvoice()) {
            $f->setQuote($this->quoteFor($f->getSite(), $in->uuid('quoteId')));
        }
        $this->applyCommon($f, $in);
        if ($in->has('status')) {
            $status = $in->string('status');
            if ($status !== null && $status !== $f->getStatus()) {
                $this->changeStatus($f, $status, $user);
            }
        }
        $f->touch();
    }

    /** Champs modifiables a tout moment : notes, echeance, tiers, piece jointe. */
    private function applyCommon(FinanceEntry $f, Input $in): void
    {
        if ($in->has('notes')) {
            $f->setNotes($in->string('notes', null, 4000));
        }
        if ($in->has('dueOn')) {
            $f->setDueOn($in->day('dueOn'));
        }
        if ($in->has('contactId')) {
            $cid = $in->uuid('contactId');
            $contact = $cid ? $this->em->find(Contact::class, $cid) : null;
            if ($cid && (!$contact || $contact->getCompany() !== $f->getCompany())) {
                throw ApiProblem::validation(['contactId' => 'Contact introuvable.']);
            }
            $f->setContact($contact);
        }
        if ($in->has('documentId')) {
            $did = $in->uuid('documentId');
            $doc = $did ? $this->em->find(Document::class, $did) : null;
            if ($did && (!$doc || $doc->getSite() !== $f->getSite())) {
                throw ApiProblem::validation(['documentId' => 'Ce document n’est pas dans ce chantier.']);
            }
            $f->setDocument($doc);
        }
    }

    private function sameValue(FinanceEntry $f, string $k, Input $in): bool
    {
        return match ($k) {
            'amountHt' => $in->int('amountHt') === $f->getAmountHt(),
            'vatRate' => $in->int('vatRate') === $f->getVatRate(),
            'number' => $in->string('number') === $f->getNumber(),
            'title' => $in->string('title') === $f->getTitle(),
            'issuedOn' => $in->day('issuedOn')?->format('Y-m-d') === $f->getIssuedOn()?->format('Y-m-d'),
            'quoteId' => $in->string('quoteId') === ($f->getQuote() ? (string) $f->getQuote()->getId() : null),
            'kind' => $in->string('kind') === $f->getKind(),
            'category' => $in->string('category') === $f->getCategory(),
            default => false,
        };
    }

    /**
     * Changements de statut permis :
     *  - devis : brouillon, envoye, accepte, refuse (dans n'importe quel ordre, sauf retour au brouillon une fois facture) ;
     *  - facture : brouillon -> envoyee (attribue le numero) ; "payee" enregistre le solde ;
     *  - depense : "payee" enregistre le solde, "a payer" retire les paiements n'est pas permis (supprimer le paiement).
     */
    public function changeStatus(FinanceEntry $f, string $status, User $user, ?\DateTimeImmutable $at = null): void
    {
        $at ??= new \DateTimeImmutable();
        $today = $at->setTime(0, 0);
        if ($f->isQuote()) {
            if (!in_array($status, FinanceEntry::MANUAL_STATUSES[FinanceEntry::KIND_QUOTE], true)) {
                throw ApiProblem::validation(['status' => 'Statut non permis pour un devis.']);
            }
            if ($status === FinanceEntry::STATUS_DRAFT && $this->invoicesOf($f)) {
                throw new ApiProblem('Ce devis est déjà facturé : il ne repasse pas en brouillon.', 409, 'quote_invoiced');
            }
            if ($status === FinanceEntry::STATUS_SENT || ($status !== FinanceEntry::STATUS_DRAFT && !$f->getSentAt())) {
                $f->setSentAt($f->getSentAt() ?? $at);
                $f->setIssuedOn($f->getIssuedOn() ?? $today);
                $f->setDueOn($f->getDueOn() ?? $f->getIssuedOn()->modify('+30 days'));
            }
            $f->setStatus($status);
            if ($status === FinanceEntry::STATUS_ACCEPTED) {
                $this->activity->record($f->getSite(), ActivityEvent::QUOTE_ACCEPTED, $user,
                    sprintf('Devis %s accepté', $f->getNumber()),
                    sprintf('%s · %s HT', $f->getTitle(), self::euros($f->getAmountHt())),
                    ['financeId' => (string) $f->getId()], Document::VISIBILITY_TEAM, $at);
            }
            return;
        }
        if ($status === FinanceEntry::STATUS_PAID && ($f->isExpense() || $f->isIssuedInvoice())) {
            if ($f->getRemaining() > 0) {
                $this->addPayment($f, $user, $f->getRemaining(), $today, 'virement', 'Solde enregistré en une fois.', $at);
            }
            return;
        }
        if ($f->isInvoice() && $f->isDraft() && $status === FinanceEntry::STATUS_SENT) {
            $this->issueInvoice($f, $user, $at);
            return;
        }
        if ($f->isInvoice() && !$f->isDraft() && $status === FinanceEntry::STATUS_DRAFT) {
            throw new ApiProblem('Une facture émise ne repasse pas en brouillon. Établissez un avoir pour l’annuler.', 409, 'invoice_locked');
        }
        throw ApiProblem::validation(['status' => $f->isExpense()
            ? 'Une dépense passe à « payée » en enregistrant son paiement.'
            : 'Le statut de paiement se met à jour en enregistrant les paiements.']);
    }

    /** Emission : numero continu F-AAAA-NNNN, date, echeance a 30 jours par defaut. */
    public function issueInvoice(FinanceEntry $f, User $user, ?\DateTimeImmutable $at = null): void
    {
        $at ??= new \DateTimeImmutable();
        if ($f->getAmountHt() <= 0) {
            throw ApiProblem::validation(['amountHt' => 'Une facture à zéro ne peut pas être émise.']);
        }
        $issued = $f->getIssuedOn() ?? $at->setTime(0, 0);
        $f->setIssuedOn($issued);
        $f->setNumber($this->nextNumber($f->getSite(), 'F', $issued));
        $f->setStatus(FinanceEntry::STATUS_SENT);
        $f->setSentAt($at);
        $f->setDueOn($f->getDueOn() ?? $issued->modify('+30 days'));
        $f->applyPaid($f->getPaid());
        $this->activity->record($f->getSite(), ActivityEvent::INVOICE_SENT, $user,
            sprintf('Facture %s émise', $f->getNumber()),
            sprintf('%s · %s TTC, à régler avant le %s', $f->getTitle(), self::euros($f->getAmountTtc()), DocumentController::frDate($f->getDueOn())),
            ['financeId' => (string) $f->getId()], Document::VISIBILITY_TEAM, $at);
    }

    public function addPayment(FinanceEntry $f, User $user, int $amount, \DateTimeImmutable $paidOn, string $method, ?string $note, ?\DateTimeImmutable $at = null): FinancePayment
    {
        if (!$f->isExpense() && !$f->isIssuedInvoice()) {
            throw ApiProblem::validation(['amount' => $f->isQuote() ? 'Un paiement s’enregistre sur une facture, pas sur un devis.' : 'Émettez la facture avant d’enregistrer un paiement.']);
        }
        if ($amount <= 0) {
            throw ApiProblem::validation(['amount' => 'Le montant du paiement doit être positif.']);
        }
        if ($amount > $f->getRemaining()) {
            throw ApiProblem::validation(['amount' => sprintf('Le paiement dépasse le reste à %s (%s).', $f->isExpense() ? 'payer' : 'encaisser', self::euros(max(0, $f->getRemaining())))]);
        }
        if (!in_array($method, FinancePayment::METHODS, true)) {
            throw ApiProblem::validation(['method' => 'Mode de paiement inconnu.']);
        }
        $p = new FinancePayment($f, $amount, $paidOn, $method, $note, $user, $at);
        $this->em->persist($p);
        $f->applyPaid($f->getPaid() + $amount);
        $f->touch($at);
        if ($f->isInvoice()) {
            $this->activity->record($f->getSite(), ActivityEvent::PAYMENT_RECEIVED, $user,
                sprintf('Paiement reçu : %s', self::euros($amount)),
                sprintf('Facture %s%s', $f->getNumber(), $f->getStatus() === FinanceEntry::STATUS_PAID ? ', soldée.' : sprintf(', reste %s.', self::euros($f->getRemaining()))),
                ['financeId' => (string) $f->getId()], Document::VISIBILITY_TEAM,
                $at ?? $paidOn->setTime((int) date('G'), (int) date('i')));
        }
        return $p;
    }

    public function removePayment(FinancePayment $p): FinanceEntry
    {
        $f = $p->getEntry();
        $this->em->remove($p);
        $f->applyPaid($f->getPaid() - $p->getAmount());
        $f->touch();
        return $f;
    }

    public function addReminder(FinanceEntry $f, User $user, string $channel, ?string $note, ?\DateTimeImmutable $at = null): FinanceReminder
    {
        $relanceable = ($f->isIssuedInvoice() && $f->getRemaining() > 0) || ($f->isQuote() && $f->getStatus() === FinanceEntry::STATUS_SENT);
        if (!$relanceable) {
            throw ApiProblem::validation(['channel' => 'Seule une facture impayée ou un devis en attente se relance.']);
        }
        if (!in_array($channel, FinanceReminder::CHANNELS, true)) {
            throw ApiProblem::validation(['channel' => 'Choisissez appel, email, courrier ou SMS.']);
        }
        $r = new FinanceReminder($f, $channel, $note, $user, $at);
        $this->em->persist($r);
        $f->onReminder($r->getAt());
        $f->touch($at);
        return $r;
    }

    /**
     * Facture brouillon depuis un devis accepte. Avec un pourcentage : acompte (premiere facture) ou situation ;
     * sans pourcentage : le solde restant. Jamais plus de 100 % du devis.
     */
    public function invoiceFromQuote(FinanceEntry $quote, User $user, ?int $percent, ?string $title): FinanceEntry
    {
        if (!$quote->isQuote() || $quote->getStatus() !== FinanceEntry::STATUS_ACCEPTED) {
            throw new ApiProblem('Seul un devis accepté se facture.', 409, 'quote_not_accepted');
        }
        $existing = $this->invoicesOf($quote);
        $done = array_sum(array_map(fn (FinanceEntry $i) => $i->getAmountHt(), $existing));
        $total = $quote->getAmountHt();
        if ($percent !== null) {
            if ($percent < 1 || $percent > 100) {
                throw ApiProblem::validation(['percent' => 'Le pourcentage va de 1 à 100.']);
            }
            $amount = intdiv($total * $percent + 50, 100);
            if ($done + $amount > $total) {
                throw ApiProblem::validation(['percent' => sprintf('Ce devis serait facturé à plus de 100 %% (déjà %s %% facturé).', self::pct($done, $total))]);
            }
            if (!$existing) {
                $label = sprintf('Acompte %d %%', $percent);
            } else {
                $n = count(array_filter($existing, fn (FinanceEntry $i) => str_starts_with($i->getTitle(), 'Situation'))) + 1;
                $label = sprintf('Situation n°%d (%d %%)', $n, $percent);
            }
        } else {
            $amount = $total - $done;
            if ($amount <= 0) {
                throw ApiProblem::validation(['percent' => 'Ce devis est déjà entièrement facturé.']);
            }
            $label = $existing ? 'Solde' : 'Facture';
        }
        $inv = new FinanceEntry($quote->getSite(), FinanceEntry::KIND_INVOICE, $title ?: sprintf('%s – %s', $label, $quote->getTitle()), $user);
        $inv->setAmounts($amount, $quote->getVatRate());
        $inv->setQuote($quote);
        $inv->setContact($quote->getContact());
        $this->em->persist($inv);
        return $inv;
    }

    public function delete(FinanceEntry $f): void
    {
        $hasPayments = (bool) $this->em->getRepository(FinancePayment::class)->count(['entry' => $f]);
        if ($f->isExpense() ? $hasPayments : !$f->isDraft()) {
            throw new ApiProblem($f->isExpense()
                ? 'Cette dépense a des paiements : supprimez-les d’abord.'
                : 'Seul un brouillon s’efface. Un devis ou une facture émis restent dans l’historique.', 409, 'not_draft');
        }
        if ($f->isQuote() && $this->invoicesOf($f)) {
            throw new ApiProblem('Ce devis a des factures : il ne s’efface pas.', 409, 'quote_invoiced');
        }
        $this->em->remove($f);
    }

    /**
     * Numero suivant pour l'entreprise : D-2026-0012, F-2026-0034.
     * UPDATE ... RETURNING verrouille la ligne du compteur jusqu'a la fin de la transaction en cours.
     */
    public function nextNumber(Site $site, string $letter, \DateTimeImmutable $on): string
    {
        $prefix = sprintf('%s-%s', $letter, $on->format('Y'));
        $conn = $this->em->getConnection();
        $company = $site->getCompany()->getId()->toRfc4122();
        $conn->executeStatement(
            'INSERT INTO finance_sequence (id, company_id, prefix, last) VALUES (:id, :c, :p, 0) ON CONFLICT (company_id, prefix) DO NOTHING',
            ['id' => Uuid::v7()->toRfc4122(), 'c' => $company, 'p' => $prefix],
        );
        $n = (int) $conn->fetchOne(
            'UPDATE finance_sequence SET last = last + 1 WHERE company_id = :c AND prefix = :p RETURNING last',
            ['c' => $company, 'p' => $prefix],
        );
        return sprintf('%s-%04d', $prefix, $n);
    }

    private function quoteFor(Site $site, ?Uuid $id): ?FinanceEntry
    {
        if ($id === null) {
            return null;
        }
        $q = $this->em->find(FinanceEntry::class, $id);
        if (!$q || !$q->isQuote() || $q->getSite() !== $site) {
            throw ApiProblem::validation(['quoteId' => 'Ce devis n’est pas dans ce chantier.']);
        }
        return $q;
    }

    private function amount(Input $in, string $k, bool $required): int
    {
        $v = $in->all()[$k] ?? null;
        if ($v === null || $v === '') {
            if ($required) {
                throw ApiProblem::validation([$k => 'Le montant est obligatoire.']);
            }
            return 0;
        }
        if (!is_int($v) && !(is_string($v) && preg_match('/^\d+$/', $v)) && !(is_float($v) && floor($v) === $v)) {
            throw ApiProblem::validation([$k => 'Montant invalide (en centimes).']);
        }
        $v = (int) $v;
        if ($v < 0 || $v > 100_000_000_00) {
            throw ApiProblem::validation([$k => 'Montant hors limites.']);
        }
        return $v;
    }

    private function vatRate(Input $in, bool $required): int
    {
        $v = $in->int('vatRate');
        if ($v === null) {
            if ($required) {
                throw ApiProblem::validation(['vatRate' => 'Choisissez le taux de TVA.']);
            }
            return 2000;
        }
        if (!in_array($v, FinanceEntry::VAT_RATES, true)) {
            throw ApiProblem::validation(['vatRate' => 'Taux de TVA non pris en charge (20, 10, 5,5 ou 0 %).']);
        }
        return $v;
    }

    // ------------------------------------------------------------------ export

    /** CSV pour le comptable : separateur ;, BOM UTF-8, montants en euros avec virgule. */
    public function csv(array $rows): string
    {
        $kinds = ['devis' => 'Devis', 'facture' => 'Facture', 'depense' => 'Dépense'];
        $statuses = ['draft' => 'Brouillon', 'sent' => 'Envoyé', 'accepted' => 'Accepté', 'refused' => 'Refusé',
            'partially_paid' => 'Payé en partie', 'paid' => 'Payé', 'to_pay' => 'À payer'];
        $out = fopen('php://temp', 'w+');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Type', 'Numéro', 'Date', 'Chantier', 'Tiers', 'Libellé', 'HT', 'TVA', 'TTC', 'Payé', 'Reste', 'Statut', 'Échéance'], ';');
        foreach ($rows as [$f]) {
            /** @var FinanceEntry $f */
            fputcsv($out, [
                $kinds[$f->getKind()],
                $f->getNumber() ?? '',
                ($f->getIssuedOn() ?? $f->getCreatedAt())->format('d/m/Y'),
                $f->getSite()->getName(),
                $f->getContact()?->getName() ?? '',
                $f->getTitle(),
                self::csvAmount($f->getAmountHt()),
                self::csvAmount($f->getAmountVat()),
                self::csvAmount($f->getAmountTtc()),
                self::csvAmount($f->getPaid()),
                self::csvAmount($f->isQuote() ? 0 : $f->getRemaining()),
                $statuses[$f->getStatus()] ?? $f->getStatus(),
                $f->getDueOn()?->format('d/m/Y') ?? '',
            ], ';');
        }
        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);
        return $csv;
    }

    public static function csvAmount(int $cents): string
    {
        return ($cents < 0 ? '-' : '').intdiv(abs($cents), 100).','.str_pad((string) (abs($cents) % 100), 2, '0', STR_PAD_LEFT);
    }

    /** "12 480,50 €" */
    public static function euros(int $cents): string
    {
        $s = number_format(abs($cents) / 100, abs($cents) % 100 === 0 ? 0 : 2, ',', "\u{202F}");
        return ($cents < 0 ? '−' : '').$s."\u{00A0}€";
    }

    private static function pct(int $part, int $total): string
    {
        return $total > 0 ? (string) round($part * 100 / $total) : '0';
    }
}
