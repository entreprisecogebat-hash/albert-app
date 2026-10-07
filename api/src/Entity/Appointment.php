<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Rendez-vous de l'agenda partage (F-01 RDV, F-03) : visite, reunion de chantier, metre, livraison. */
#[ORM\Entity]
#[ORM\Table(name: 'appointment')]
#[ORM\Index(columns: ['company_id', 'starts_at'])]
class Appointment implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Site $site = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Contact $contact = null;

    #[ORM\Column(length: 200)]
    private string $title;

    #[ORM\Column]
    private \DateTimeImmutable $startsAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endsAt = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $location = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Company $company, string $title, \DateTimeImmutable $startsAt, ?User $createdBy)
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->title = $title;
        $this->startsAt = $startsAt;
        $this->createdBy = $createdBy;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): ?Site { return $this->site; }
    public function setSite(?Site $s): void { $this->site = $s; }
    public function getContact(): ?Contact { return $this->contact; }
    public function setContact(?Contact $c): void { $this->contact = $c; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): void { $this->title = $v; }
    public function getStartsAt(): \DateTimeImmutable { return $this->startsAt; }
    public function setStartsAt(\DateTimeImmutable $v): void { $this->startsAt = $v; }
    public function getEndsAt(): ?\DateTimeImmutable { return $this->endsAt; }
    public function setEndsAt(?\DateTimeImmutable $v): void { $this->endsAt = $v; }
    public function getLocation(): ?string { return $this->location; }
    public function setLocation(?string $v): void { $this->location = $v ?: null; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v ?: null; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
