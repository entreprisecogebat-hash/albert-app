<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Historique d'une reserve ou d'une demande SAV : append-only. */
#[ORM\Entity]
#[ORM\Table(name: 'reserve_event')]
#[ORM\Index(columns: ['reserve_id', 'at'])]
class ReserveEvent implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Reserve $reserve;

    #[ORM\Column]
    private \DateTimeImmutable $at;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $actor;

    /** Nouveau statut si le statut a change */
    #[ORM\Column(length: 12, nullable: true)]
    private ?string $status;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $note;

    public function __construct(Reserve $reserve, ?User $actor, ?string $status, ?string $note, ?\DateTimeImmutable $at = null)
    {
        $this->id = Uuid::v7();
        $this->company = $reserve->getCompany();
        $this->reserve = $reserve;
        $this->actor = $actor;
        $this->status = $status;
        $this->note = $note;
        $this->at = $at ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getReserve(): Reserve { return $this->reserve; }
    public function getAt(): \DateTimeImmutable { return $this->at; }
    public function getActor(): ?User { return $this->actor; }
    public function getStatus(): ?string { return $this->status; }
    public function getNote(): ?string { return $this->note; }
}
