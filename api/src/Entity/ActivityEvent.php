<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Fil d'activite horodate du chantier (F-08). Append-only : on n'efface ni ne modifie un evenement.
 * C'est le journal qui sert de preuve : qui, quoi, quand, dans l'ordre.
 */
#[ORM\Entity(repositoryClass: \App\Repository\ActivityEventRepository::class)]
#[ORM\Table(name: 'activity_event')]
#[ORM\Index(columns: ['site_id', 'occurred_at'])]
#[ORM\Index(columns: ['document_ref'])]
class ActivityEvent implements TenantOwned
{
    public const PHOTOS_ADDED = 'photos_added';
    public const DOCUMENT_ADDED = 'document_added';
    public const DOCUMENT_VERSION = 'document_version';
    public const DOCUMENT_RECLASSIFIED = 'document_reclassified';
    public const MESSAGE = 'message';
    public const MEMBER_ADDED = 'member_added';
    public const SITE_CREATED = 'site_created';
    public const NOTE = 'note';
    public const TASK_DONE = 'task_done';
    public const CLOCK_IN = 'clock_in';
    public const CLOCK_OUT = 'clock_out';
    public const INTERVENTION_SIGNED = 'intervention_signed';
    public const RESERVE_OPENED = 'reserve_opened';
    public const RESERVE_UPDATED = 'reserve_updated';
    public const APPOINTMENT = 'appointment';
    public const PHASE_CHANGED = 'phase_changed';
    public const DOE_GENERATED = 'doe_generated';
    public const SHARE_CREATED = 'share_created';
    public const QUOTE_ACCEPTED = 'quote_accepted';
    public const INVOICE_SENT = 'invoice_sent';
    public const PAYMENT_RECEIVED = 'payment_received';
    /** Evenements financiers : visibles seulement de ceux qui ont acces aux finances du chantier */
    public const FINANCE_TYPES = [self::QUOTE_ACCEPTED, self::INVOICE_SENT, self::PAYMENT_RECEIVED];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Site $site;

    #[ORM\Column(length: 30)]
    private string $type;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $actor;

    #[ORM\Column(length: 255)]
    private string $title;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $subtitle;

    /** Identifiants des objets lies (documentId, versionId, batchId, messageId, channel...) */
    #[ORM\Column(type: Types::JSON)]
    private array $payload;

    #[ORM\Column(length: 10)]
    private string $visibility;

    /** Quand c'est arrive sur le chantier */
    #[ORM\Column]
    private \DateTimeImmutable $occurredAt;

    /** Quand le serveur l'a recu */
    #[ORM\Column]
    private \DateTimeImmutable $recordedAt;

    /**
     * Cle de regroupement : les photos d'un meme lot arrivent une par une (surtout au retour du reseau)
     * mais ne forment qu'un evenement "4 photos".
     */
    #[ORM\Column(length: 80, unique: true, nullable: true)]
    private ?string $groupKey;

    /** Document concerne, pour retrouver tout son historique (ecran "Je prouve") */
    #[ORM\Column(type: 'uuid', nullable: true)]
    private ?Uuid $documentRef = null;

    public function __construct(
        Site $site,
        string $type,
        ?User $actor,
        string $title,
        ?string $subtitle,
        array $payload,
        string $visibility,
        \DateTimeImmutable $occurredAt,
        ?string $groupKey = null,
    ) {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->type = $type;
        $this->actor = $actor;
        $this->title = $title;
        $this->subtitle = $subtitle;
        $this->payload = $payload;
        $this->visibility = $visibility === Document::VISIBILITY_CLIENT ? $visibility : Document::VISIBILITY_TEAM;
        $this->occurredAt = $occurredAt;
        $this->recordedAt = new \DateTimeImmutable();
        $this->groupKey = $groupKey;
        if (isset($payload['documentId'])) {
            $this->documentRef = Uuid::fromString($payload['documentId']);
        }
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getType(): string { return $this->type; }
    public function getActor(): ?User { return $this->actor; }
    public function getTitle(): string { return $this->title; }
    public function getSubtitle(): ?string { return $this->subtitle; }
    public function getPayload(): array { return $this->payload; }
    public function getVisibility(): string { return $this->visibility; }
    public function getOccurredAt(): \DateTimeImmutable { return $this->occurredAt; }
    public function getRecordedAt(): \DateTimeImmutable { return $this->recordedAt; }
    public function getGroupKey(): ?string { return $this->groupKey; }

    /** Seul usage autorise de modification : agreger un lot de photos arrivees en plusieurs fois. */
    public function mergeBatch(string $title, array $payload, \DateTimeImmutable $occurredAt): void
    {
        $this->title = $title;
        $this->payload = $payload;
        if ($occurredAt < $this->occurredAt) {
            $this->occurredAt = $occurredAt;
        }
    }
}
