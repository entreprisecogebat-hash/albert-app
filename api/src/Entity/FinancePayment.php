<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Paiement recu (facture) ou regle (depense). La somme des paiements donne FinanceEntry::paid. */
#[ORM\Entity]
#[ORM\Table(name: 'finance_payment')]
#[ORM\Index(columns: ['entry_id'])]
class FinancePayment implements TenantOwned
{
    public const METHODS = ['virement', 'cheque', 'especes', 'carte', 'autre'];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private FinanceEntry $entry;

    #[ORM\Column(type: Types::BIGINT)]
    private int|string $amount;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    private \DateTimeImmutable $paidOn;

    #[ORM\Column(length: 10)]
    private string $method;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $note;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(FinanceEntry $entry, int $amount, \DateTimeImmutable $paidOn, string $method, ?string $note, ?User $createdBy, ?\DateTimeImmutable $createdAt = null)
    {
        $this->id = Uuid::v7();
        $this->company = $entry->getCompany();
        $this->entry = $entry;
        $this->amount = $amount;
        $this->paidOn = $paidOn;
        $this->method = in_array($method, self::METHODS, true) ? $method : 'autre';
        $this->note = $note ?: null;
        $this->createdBy = $createdBy;
        $this->createdAt = $createdAt ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getEntry(): FinanceEntry { return $this->entry; }
    public function getAmount(): int { return (int) $this->amount; }
    public function getPaidOn(): \DateTimeImmutable { return $this->paidOn; }
    public function getMethod(): string { return $this->method; }
    public function getNote(): ?string { return $this->note; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
