<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Fiche d'intervention (F-12) : redigee sur le telephone, signee au doigt par le client.
 * A la signature, un PDF est genere et range dans le chantier ; la fiche ne se modifie plus.
 */
#[ORM\Entity]
#[ORM\Table(name: 'intervention')]
#[ORM\UniqueConstraint(columns: ['company_id', 'number'])]
#[ORM\Index(columns: ['site_id', 'intervention_on'])]
class Intervention implements TenantOwned
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SIGNED = 'signed';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Site $site;

    /** FI-2026-0007, numerotation continue par entreprise et par annee */
    #[ORM\Column(length: 20)]
    private string $number;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    private \DateTimeImmutable $interventionOn;

    #[ORM\Column(length: 200)]
    private string $title;

    #[ORM\Column(type: Types::TEXT)]
    private string $workDone;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $materials = null;

    #[ORM\Column(nullable: true)]
    private ?int $minutes = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $technicians = null;

    #[ORM\Column(length: 10)]
    private string $status = self::STATUS_DRAFT;

    #[ORM\Column(length: 160, nullable: true)]
    private ?string $signerName = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $signedAt = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $signatureKey = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Document $document = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $author;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Site $site, string $number, \DateTimeImmutable $on, string $title, string $workDone, ?User $author)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->number = $number;
        $this->interventionOn = $on;
        $this->title = $title;
        $this->workDone = $workDone;
        $this->author = $author;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getNumber(): string { return $this->number; }
    public function getInterventionOn(): \DateTimeImmutable { return $this->interventionOn; }
    public function setInterventionOn(\DateTimeImmutable $v): void { $this->interventionOn = $v; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): void { $this->title = $v; }
    public function getWorkDone(): string { return $this->workDone; }
    public function setWorkDone(string $v): void { $this->workDone = $v; }
    public function getMaterials(): ?string { return $this->materials; }
    public function setMaterials(?string $v): void { $this->materials = $v ?: null; }
    public function getMinutes(): ?int { return $this->minutes; }
    public function setMinutes(?int $v): void { $this->minutes = $v !== null && $v > 0 ? $v : null; }
    public function getTechnicians(): ?string { return $this->technicians; }
    public function setTechnicians(?string $v): void { $this->technicians = $v ?: null; }
    public function getStatus(): string { return $this->status; }
    public function isSigned(): bool { return $this->status === self::STATUS_SIGNED; }
    public function getSignerName(): ?string { return $this->signerName; }
    public function getSignedAt(): ?\DateTimeImmutable { return $this->signedAt; }
    public function getSignatureKey(): ?string { return $this->signatureKey; }
    public function getDocument(): ?Document { return $this->document; }
    public function getAuthor(): ?User { return $this->author; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $v): void { $this->createdAt = $v; }

    public function sign(string $signerName, string $signatureKey, \DateTimeImmutable $at): void
    {
        $this->status = self::STATUS_SIGNED;
        $this->signerName = $signerName;
        $this->signatureKey = $signatureKey;
        $this->signedAt = $at;
    }

    public function attachDocument(Document $d): void { $this->document = $d; }
}
