<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Relance d'un client (facture impayee, devis sans reponse) : trace de qui a relance, quand, comment. */
#[ORM\Entity]
#[ORM\Table(name: 'finance_reminder')]
#[ORM\Index(columns: ['entry_id'])]
class FinanceReminder implements TenantOwned
{
    public const CHANNELS = ['telephone', 'email', 'courrier', 'sms'];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private FinanceEntry $entry;

    #[ORM\Column]
    private \DateTimeImmutable $at;

    #[ORM\Column(length: 10)]
    private string $channel;

    #[ORM\Column(length: 1000, nullable: true)]
    private ?string $note;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $by;

    public function __construct(FinanceEntry $entry, string $channel, ?string $note, ?User $by, ?\DateTimeImmutable $at = null)
    {
        $this->id = Uuid::v7();
        $this->company = $entry->getCompany();
        $this->entry = $entry;
        $this->channel = in_array($channel, self::CHANNELS, true) ? $channel : 'telephone';
        $this->note = $note ?: null;
        $this->by = $by;
        $this->at = $at ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getEntry(): FinanceEntry { return $this->entry; }
    public function getAt(): \DateTimeImmutable { return $this->at; }
    public function getChannel(): string { return $this->channel; }
    public function getNote(): ?string { return $this->note; }
    public function getBy(): ?User { return $this->by; }
}
