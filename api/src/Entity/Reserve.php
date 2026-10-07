<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Reserve de reception, demande SAV ou appel en garantie (F-15).
 * Chaque changement d'etat laisse une trace (ReserveEvent) : c'est l'historique des actions realisees.
 */
#[ORM\Entity]
#[ORM\Table(name: 'reserve')]
#[ORM\Index(columns: ['site_id', 'status'])]
class Reserve implements TenantOwned
{
    public const KINDS = ['reserve', 'sav', 'garantie'];
    public const STATUS_OPEN = 'open';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_DONE = 'done';
    public const STATUSES = [self::STATUS_OPEN, self::STATUS_IN_PROGRESS, self::STATUS_DONE];

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

    #[ORM\Column(length: 200)]
    private string $title;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $description = null;

    /** Ou : "Salle de bain etage", "Terrasse, angle nord" */
    #[ORM\Column(length: 160, nullable: true)]
    private ?string $location = null;

    #[ORM\Column(length: 12)]
    private string $status = self::STATUS_OPEN;

    #[ORM\Column]
    private \DateTimeImmutable $reportedAt;

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $dueOn = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $doneAt = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $reportedBy;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $assignee = null;

    #[ORM\Column(length: 10)]
    private string $visibility = Document::VISIBILITY_CLIENT;

    /** Photos du constat (identifiants de Photo du meme chantier) */
    #[ORM\Column(type: Types::JSON)]
    private array $photoIds = [];

    public function __construct(Site $site, string $kind, string $title, ?User $reportedBy, ?\DateTimeImmutable $reportedAt = null)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->setKind($kind);
        $this->title = $title;
        $this->reportedBy = $reportedBy;
        $this->reportedAt = $reportedAt ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getKind(): string { return $this->kind; }
    public function setKind(string $v): void { $this->kind = in_array($v, self::KINDS, true) ? $v : 'reserve'; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): void { $this->title = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v ?: null; }
    public function getLocation(): ?string { return $this->location; }
    public function setLocation(?string $v): void { $this->location = $v ?: null; }
    public function getStatus(): string { return $this->status; }
    public function isDone(): bool { return $this->status === self::STATUS_DONE; }
    public function setStatus(string $v, ?\DateTimeImmutable $at = null): void
    {
        $this->status = in_array($v, self::STATUSES, true) ? $v : self::STATUS_OPEN;
        $this->doneAt = $this->status === self::STATUS_DONE ? ($at ?? new \DateTimeImmutable()) : null;
    }
    public function getReportedAt(): \DateTimeImmutable { return $this->reportedAt; }
    public function getDueOn(): ?\DateTimeImmutable { return $this->dueOn; }
    public function setDueOn(?\DateTimeImmutable $v): void { $this->dueOn = $v; }
    public function getDoneAt(): ?\DateTimeImmutable { return $this->doneAt; }
    public function getReportedBy(): ?User { return $this->reportedBy; }
    public function getAssignee(): ?User { return $this->assignee; }
    public function setAssignee(?User $u): void { $this->assignee = $u; }
    public function getVisibility(): string { return $this->visibility; }
    public function setVisibility(string $v): void { $this->visibility = $v === Document::VISIBILITY_TEAM ? $v : Document::VISIBILITY_CLIENT; }
    public function isVisibleToClient(): bool { return $this->visibility === Document::VISIBILITY_CLIENT; }
    /** @return list<string> */
    public function getPhotoIds(): array { return $this->photoIds; }
    public function setPhotoIds(array $ids): void { $this->photoIds = array_values(array_unique($ids)); }

    public function isOverdue(?\DateTimeImmutable $today = null): bool
    {
        $today ??= new \DateTimeImmutable('today');
        return !$this->isDone() && $this->dueOn !== null && $this->dueOn < $today;
    }
}
