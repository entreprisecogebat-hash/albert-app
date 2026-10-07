<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Tache de chantier (F-07, F-18) : une chose a faire, pour quelqu'un, pour une date. Interne a l'equipe. */
#[ORM\Entity]
#[ORM\Table(name: 'task')]
#[ORM\Index(columns: ['site_id', 'status'])]
#[ORM\Index(columns: ['assignee_id', 'status'])]
class Task implements TenantOwned
{
    public const STATUS_TODO = 'todo';
    public const STATUS_DONE = 'done';
    public const PRIORITIES = ['normal', 'urgent'];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Site $site;

    #[ORM\Column(length: 200)]
    private string $title;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $dueOn = null;

    #[ORM\Column(length: 10)]
    private string $priority = 'normal';

    #[ORM\Column(length: 10)]
    private string $status = self::STATUS_TODO;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $assignee = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $doneAt = null;

    public function __construct(Site $site, string $title, ?User $createdBy, ?\DateTimeImmutable $createdAt = null)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->title = $title;
        $this->createdBy = $createdBy;
        $this->createdAt = $createdAt ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): void { $this->title = $v; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v ?: null; }
    public function getDueOn(): ?\DateTimeImmutable { return $this->dueOn; }
    public function setDueOn(?\DateTimeImmutable $v): void { $this->dueOn = $v; }
    public function getPriority(): string { return $this->priority; }
    public function setPriority(string $v): void { $this->priority = in_array($v, self::PRIORITIES, true) ? $v : 'normal'; }
    public function getStatus(): string { return $this->status; }
    public function isDone(): bool { return $this->status === self::STATUS_DONE; }
    public function setDone(bool $done, ?\DateTimeImmutable $at = null): void
    {
        $this->status = $done ? self::STATUS_DONE : self::STATUS_TODO;
        $this->doneAt = $done ? ($at ?? new \DateTimeImmutable()) : null;
    }
    public function getAssignee(): ?User { return $this->assignee; }
    public function setAssignee(?User $u): void { $this->assignee = $u; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getDoneAt(): ?\DateTimeImmutable { return $this->doneAt; }

    public function isOverdue(?\DateTimeImmutable $today = null): bool
    {
        $today ??= new \DateTimeImmutable('today');
        return !$this->isDone() && $this->dueOn !== null && $this->dueOn < $today;
    }
}
