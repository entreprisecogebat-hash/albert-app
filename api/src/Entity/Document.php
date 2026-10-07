<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Un document de chantier et son historique de versions (F-03, F-04).
 * La "version en cours" fait foi ; les precedentes restent consultables comme preuve.
 */
#[ORM\Entity(repositoryClass: \App\Repository\DocumentRepository::class)]
#[ORM\Table(name: 'document')]
#[ORM\Index(columns: ['site_id', 'updated_at'])]
#[ORM\Index(columns: ['site_id', 'normalized_title'])]
class Document implements TenantOwned
{
    public const TYPES = ['plan', 'devis', 'facture', 'pv', 'photo', 'administratif', 'autre'];
    public const VISIBILITY_TEAM = 'team';
    public const VISIBILITY_CLIENT = 'client';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Site $site;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private Folder $folder;

    #[ORM\Column(length: 200)]
    private string $title;

    /** Titre sans indice de version, sans accents, en minuscules : sert a reconnaitre une nouvelle version. */
    #[ORM\Column(length: 200)]
    private string $normalizedTitle;

    #[ORM\Column(length: 20)]
    private string $type;

    #[ORM\Column(length: 10)]
    private string $visibility = self::VISIBILITY_TEAM;

    #[ORM\OneToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?DocumentVersion $currentVersion = null;

    #[ORM\Column]
    private int $versionsCount = 0;

    /** rule | fingerprint | title | user | default : comment Albert l'a classe */
    #[ORM\Column(length: 12)]
    private string $classifiedBy = 'default';

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    /** Fiche CRM liee (F-03, F-07) : fournisseur du devis, client de la facture... */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Contact $contact = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Site $site, Folder $folder, string $title, string $normalizedTitle, string $type, ?User $createdBy)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->folder = $folder;
        $this->title = $title;
        $this->normalizedTitle = $normalizedTitle;
        $this->setType($type);
        $this->createdBy = $createdBy;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = $this->createdAt;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getFolder(): Folder { return $this->folder; }
    public function setFolder(Folder $f): void { $this->folder = $f; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $t, string $normalized): void { $this->title = $t; $this->normalizedTitle = $normalized; }
    public function getNormalizedTitle(): string { return $this->normalizedTitle; }
    public function getType(): string { return $this->type; }
    public function setType(string $type): void { $this->type = in_array($type, self::TYPES, true) ? $type : 'autre'; }
    public function getVisibility(): string { return $this->visibility; }
    public function setVisibility(string $v): void { $this->visibility = $v === self::VISIBILITY_CLIENT ? $v : self::VISIBILITY_TEAM; }
    public function isVisibleToClient(): bool { return $this->visibility === self::VISIBILITY_CLIENT; }
    public function getCurrentVersion(): ?DocumentVersion { return $this->currentVersion; }
    public function getVersionsCount(): int { return $this->versionsCount; }
    public function getClassifiedBy(): string { return $this->classifiedBy; }
    public function setClassifiedBy(string $v): void { $this->classifiedBy = $v; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getContact(): ?Contact { return $this->contact; }
    public function setContact(?Contact $c): void { $this->contact = $c; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }

    public function nextVersionNumber(): int { return $this->versionsCount + 1; }

    public function addVersion(DocumentVersion $v): void
    {
        $this->versionsCount = max($this->versionsCount, $v->getNumber());
        $this->currentVersion = $v;
        $this->updatedAt = $v->getUploadedAt();
    }
}
