<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Un chantier (F-01). */
#[ORM\Entity(repositoryClass: \App\Repository\SiteRepository::class)]
#[ORM\Table(name: 'site')]
#[ORM\Index(columns: ['company_id', 'status'])]
class Site implements TenantOwned
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_ARCHIVED = 'archived';
    /** Les trois temps du CDC : avant (etude, devis, RDV), pendant (travaux), apres (reception, SAV, garanties) */
    public const PHASE_BEFORE = 'avant';
    public const PHASE_DURING = 'pendant';
    public const PHASE_AFTER = 'apres';
    public const PHASES = [self::PHASE_BEFORE, self::PHASE_DURING, self::PHASE_AFTER];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\Column(length: 160)]
    private string $name;

    #[ORM\Column(length: 255)]
    private string $address;

    #[ORM\Column(length: 40, nullable: true)]
    private ?string $reference = null;

    #[ORM\Column(length: 160, nullable: true)]
    private ?string $clientName = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $startedOn = null;

    #[ORM\Column(nullable: true)]
    private ?float $latitude = null;

    #[ORM\Column(nullable: true)]
    private ?float $longitude = null;

    #[ORM\Column(length: 10)]
    private string $status = self::STATUS_ACTIVE;

    #[ORM\Column(length: 10, options: ['default' => 'pendant'])]
    private string $phase = self::PHASE_DURING;

    /** Date de reception : point de depart des garanties (parfait achevement, biennale, decennale) */
    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $deliveredOn = null;

    /**
     * Dernier DOE genere (F-13) : identifiant du PDF range dans le chantier et cle de l'archive ZIP.
     * Simple reference (pas de cle etrangere) pour eviter un cycle chantier <-> document.
     */
    #[ORM\Column(type: 'uuid', nullable: true)]
    private ?Uuid $doeDocumentId = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $doeZipKey = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $doeGeneratedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** Derniere activite, maintenue par ActivityRecorder pour trier "Mes chantiers". */
    #[ORM\Column]
    private \DateTimeImmutable $lastActivityAt;

    public function __construct(Company $company, string $name, string $address)
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->name = $name;
        $this->address = $address;
        $this->createdAt = new \DateTimeImmutable();
        $this->lastActivityAt = $this->createdAt;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getAddress(): string { return $this->address; }
    public function setAddress(string $v): void { $this->address = $v; }
    public function getReference(): ?string { return $this->reference; }
    public function setReference(?string $v): void { $this->reference = $v ?: null; }
    public function getClientName(): ?string { return $this->clientName; }
    public function setClientName(?string $v): void { $this->clientName = $v ?: null; }
    public function getStartedOn(): ?\DateTimeImmutable { return $this->startedOn; }
    public function setStartedOn(?\DateTimeImmutable $v): void { $this->startedOn = $v; }
    public function getLatitude(): ?float { return $this->latitude; }
    public function getLongitude(): ?float { return $this->longitude; }
    public function setCoordinates(?float $lat, ?float $lng): void { $this->latitude = $lat; $this->longitude = $lng; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v === self::STATUS_ARCHIVED ? $v : self::STATUS_ACTIVE; }
    public function isArchived(): bool { return $this->status === self::STATUS_ARCHIVED; }
    public function getPhase(): string { return $this->phase; }
    public function setPhase(string $v): void { $this->phase = in_array($v, self::PHASES, true) ? $v : self::PHASE_DURING; }
    public function getDeliveredOn(): ?\DateTimeImmutable { return $this->deliveredOn; }
    public function setDeliveredOn(?\DateTimeImmutable $v): void { $this->deliveredOn = $v; }
    public function getDoeDocumentId(): ?Uuid { return $this->doeDocumentId; }
    public function getDoeZipKey(): ?string { return $this->doeZipKey; }
    public function getDoeGeneratedAt(): ?\DateTimeImmutable { return $this->doeGeneratedAt; }
    public function setDoe(Document $doc, ?string $zipKey, \DateTimeImmutable $at): void
    {
        $this->doeDocumentId = $doc->getId();
        $this->doeZipKey = $zipKey;
        $this->doeGeneratedAt = $at;
    }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getLastActivityAt(): \DateTimeImmutable { return $this->lastActivityAt; }
    public function touchActivity(\DateTimeImmutable $at): void
    {
        if ($at > $this->lastActivityAt) {
            $this->lastActivityAt = $at;
        }
    }
}
