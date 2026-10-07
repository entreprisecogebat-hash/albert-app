<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Notification in-app (F-21). Doublee d'un push si le telephone est enregistre. */
#[ORM\Entity]
#[ORM\Table(name: 'notification')]
#[ORM\Index(columns: ['user_id', 'created_at'])]
class Notification implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Site $site;

    #[ORM\Column(length: 30)]
    private string $type;

    #[ORM\Column(length: 160)]
    private string $title;

    #[ORM\Column(length: 255)]
    private string $body;

    /** Ou emmener l'utilisateur quand il touche la notification */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $link;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $readAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $user, ?Site $site, string $type, string $title, string $body, ?string $link)
    {
        $this->id = Uuid::v7();
        $this->company = $user->getCompany();
        $this->user = $user;
        $this->site = $site;
        $this->type = $type;
        $this->title = $title;
        $this->body = $body;
        $this->link = $link;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getUser(): User { return $this->user; }
    public function getSite(): ?Site { return $this->site; }
    public function getType(): string { return $this->type; }
    public function getTitle(): string { return $this->title; }
    public function getBody(): string { return $this->body; }
    public function getLink(): ?string { return $this->link; }
    public function getReadAt(): ?\DateTimeImmutable { return $this->readAt; }
    public function markRead(): void { $this->readAt ??= new \DateTimeImmutable(); }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
