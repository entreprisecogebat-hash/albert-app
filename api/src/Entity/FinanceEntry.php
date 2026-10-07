<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Piece financiere d'un chantier : devis, facture ou depense (reprise de l'app Android 0.2).
 *
 * Montants en centimes entiers, TVA en points de base (2000 = 20 %), arrondi commercial au centime.
 * Les totaux (TVA, TTC, paye) sont stockes pour trier et filtrer en base ; ils sont recalcules
 * a chaque modification du HT, du taux ou des paiements. Suivi operationnel, pas une comptabilite certifiee.
 *
 * Statuts :
 *  - devis   : draft -> sent -> accepted | refused
 *  - facture : draft -> sent -> partially_paid -> paid (recalcule a chaque paiement)
 *  - depense : to_pay -> paid (recalcule a chaque paiement)
 *
 * Numerotation : voir FinanceNumbering.
 */
#[ORM\Entity]
#[ORM\Table(name: 'finance_entry')]
#[ORM\Index(columns: ['site_id', 'kind'])]
#[ORM\Index(columns: ['company_id', 'kind', 'status'])]
// Un numero de devis ou de facture est unique dans l'entreprise ; la reference d'un fournisseur peut se repeter.
#[ORM\UniqueConstraint(name: 'finance_number_unique', columns: ['company_id', 'kind', 'number'], options: ['where' => "kind IN ('devis', 'facture') AND number IS NOT NULL"])]
class FinanceEntry implements TenantOwned
{
    public const KIND_QUOTE = 'devis';
    public const KIND_INVOICE = 'facture';
    public const KIND_EXPENSE = 'depense';
    public const KINDS = [self::KIND_QUOTE, self::KIND_INVOICE, self::KIND_EXPENSE];

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SENT = 'sent';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_REFUSED = 'refused';
    public const STATUS_PARTIALLY_PAID = 'partially_paid';
    public const STATUS_PAID = 'paid';
    public const STATUS_TO_PAY = 'to_pay';

    /** Statuts qu'on peut choisir a la main, par type (les statuts de paiement sont calcules) */
    public const MANUAL_STATUSES = [
        self::KIND_QUOTE => [self::STATUS_DRAFT, self::STATUS_SENT, self::STATUS_ACCEPTED, self::STATUS_REFUSED],
        self::KIND_INVOICE => [self::STATUS_DRAFT, self::STATUS_SENT],
        self::KIND_EXPENSE => [self::STATUS_TO_PAY],
    ];

    public const CATEGORIES = ['materiaux', 'sous_traitance', 'location', 'main_oeuvre', 'autre'];
    public const VAT_RATES = [2000, 1000, 550, 0];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Site $site;

    #[ORM\Column(length: 10)]
    private string $kind;

    /** D-2026-0012, F-2026-0034, ou la reference du fournisseur pour une depense */
    #[ORM\Column(length: 60, nullable: true)]
    private ?string $number = null;

    #[ORM\Column(length: 200)]
    private string $title;

    #[ORM\Column(length: 16)]
    private string $status;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $category = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Contact $contact = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Document $document = null;

    /** Pour une facture : le devis d'origine (acompte, situation, solde) */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?FinanceEntry $quote = null;

    #[ORM\Column(type: Types::BIGINT)]
    private int|string $amountHt = 0;

    #[ORM\Column]
    private int $vatRate = 2000;

    #[ORM\Column(type: Types::BIGINT)]
    private int|string $amountVat = 0;

    #[ORM\Column(type: Types::BIGINT)]
    private int|string $amountTtc = 0;

    #[ORM\Column(type: Types::BIGINT)]
    private int|string $paid = 0;

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $issuedOn = null;

    /** Echeance de paiement ; pour un devis, fin de validite */
    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $dueOn = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column]
    private int $remindersCount = 0;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastReminderAt = null;

    /** Moment de l'envoi au client (devis, facture) : sert a reperer un devis reste sans reponse */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Site $site, string $kind, string $title, ?User $createdBy, ?\DateTimeImmutable $createdAt = null)
    {
        if (!in_array($kind, self::KINDS, true)) {
            throw new \InvalidArgumentException('Type de piece inconnu : '.$kind);
        }
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->kind = $kind;
        $this->title = $title;
        $this->status = $kind === self::KIND_EXPENSE ? self::STATUS_TO_PAY : self::STATUS_DRAFT;
        $this->createdBy = $createdBy;
        $this->createdAt = $createdAt ?? new \DateTimeImmutable();
        $this->updatedAt = $this->createdAt;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getKind(): string { return $this->kind; }
    public function isQuote(): bool { return $this->kind === self::KIND_QUOTE; }
    public function isInvoice(): bool { return $this->kind === self::KIND_INVOICE; }
    public function isExpense(): bool { return $this->kind === self::KIND_EXPENSE; }
    public function isDraft(): bool { return $this->status === self::STATUS_DRAFT; }
    /** Facture emise : numero, montants et taux figes (une facture ne se modifie pas, elle s'annule par un avoir). */
    public function isIssuedInvoice(): bool { return $this->isInvoice() && !$this->isDraft(); }

    public function getNumber(): ?string { return $this->number; }
    public function setNumber(?string $v): void { $this->number = $v ?: null; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): void { $this->title = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getCategory(): ?string { return $this->category; }
    public function setCategory(?string $v): void { $this->category = $v; }
    public function getContact(): ?Contact { return $this->contact; }
    public function setContact(?Contact $c): void { $this->contact = $c; }
    public function getDocument(): ?Document { return $this->document; }
    public function setDocument(?Document $d): void { $this->document = $d; }
    public function getQuote(): ?FinanceEntry { return $this->quote; }
    public function setQuote(?FinanceEntry $q): void { $this->quote = $q; }

    public function getAmountHt(): int { return (int) $this->amountHt; }
    public function getVatRate(): int { return $this->vatRate; }
    public function getAmountVat(): int { return (int) $this->amountVat; }
    public function getAmountTtc(): int { return (int) $this->amountTtc; }
    public function getPaid(): int { return (int) $this->paid; }
    public function getRemaining(): int { return $this->getAmountTtc() - $this->getPaid(); }

    /** HT et taux ; TVA = arrondi commercial de HT x taux, TTC = HT + TVA. */
    public function setAmounts(int $amountHt, int $vatRate): void
    {
        $this->amountHt = $amountHt;
        $this->vatRate = $vatRate;
        $this->amountVat = self::vat($amountHt, $vatRate);
        $this->amountTtc = $amountHt + (int) $this->amountVat;
    }

    /** Arrondi commercial (demi a l'ecart de zero) au centime, en arithmetique entiere. */
    public static function vat(int $amountHt, int $vatRate): int
    {
        $num = $amountHt * $vatRate;
        $sign = $num < 0 ? -1 : 1;
        return $sign * intdiv(abs($num) + 5000, 10000);
    }

    /**
     * Somme des paiements et statut de paiement. Un brouillon reste brouillon ;
     * une facture emise passe a "payee en partie" puis "payee", et revient a "envoyee" si on retire les paiements.
     */
    public function applyPaid(int $paid): void
    {
        $this->paid = $paid;
        if ($this->isInvoice() && !$this->isDraft()) {
            $this->status = match (true) {
                $paid <= 0 => self::STATUS_SENT,
                $paid >= $this->getAmountTtc() => self::STATUS_PAID,
                default => self::STATUS_PARTIALLY_PAID,
            };
        }
        if ($this->isExpense()) {
            $this->status = $paid >= $this->getAmountTtc() && $this->getAmountTtc() > 0 ? self::STATUS_PAID : self::STATUS_TO_PAY;
        }
    }

    public function getIssuedOn(): ?\DateTimeImmutable { return $this->issuedOn; }
    public function setIssuedOn(?\DateTimeImmutable $v): void { $this->issuedOn = $v; }
    public function getDueOn(): ?\DateTimeImmutable { return $this->dueOn; }
    public function setDueOn(?\DateTimeImmutable $v): void { $this->dueOn = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v ?: null; }
    public function getRemindersCount(): int { return $this->remindersCount; }
    public function getLastReminderAt(): ?\DateTimeImmutable { return $this->lastReminderAt; }
    public function onReminder(\DateTimeImmutable $at): void
    {
        ++$this->remindersCount;
        if (!$this->lastReminderAt || $at > $this->lastReminderAt) {
            $this->lastReminderAt = $at;
        }
    }
    public function getSentAt(): ?\DateTimeImmutable { return $this->sentAt; }
    public function setSentAt(?\DateTimeImmutable $v): void { $this->sentAt = $v; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(?\DateTimeImmutable $at = null): void { $this->updatedAt = $at ?? new \DateTimeImmutable(); }

    /** Reste a encaisser (facture emise) ou a payer (depense) */
    public function isOpen(): bool
    {
        return match ($this->kind) {
            self::KIND_INVOICE => in_array($this->status, [self::STATUS_DRAFT, self::STATUS_SENT, self::STATUS_PARTIALLY_PAID], true),
            self::KIND_EXPENSE => $this->status === self::STATUS_TO_PAY,
            default => in_array($this->status, [self::STATUS_DRAFT, self::STATUS_SENT], true),
        };
    }

    /**
     * Facture emise ou depense echue et non soldee ; devis envoye reste sans reponse apres sa validite.
     */
    public function isOverdue(?\DateTimeImmutable $today = null): bool
    {
        $today ??= new \DateTimeImmutable('today');
        if ($this->dueOn === null || $this->dueOn >= $today) {
            return false;
        }
        return match ($this->kind) {
            self::KIND_INVOICE => in_array($this->status, [self::STATUS_SENT, self::STATUS_PARTIALLY_PAID], true),
            self::KIND_EXPENSE => $this->status === self::STATUS_TO_PAY,
            default => $this->status === self::STATUS_SENT,
        };
    }
}
