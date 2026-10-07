<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Lien de partage externe (F-06) : un document envoye a un client, un architecte ou un acquereur,
 * consultable sans compte jusqu'a expiration. Revocable a tout moment.
 */
#[ORM\Entity]
#[ORM\Table(name: 'share_link')]
class ShareLink implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Document $document;

    /** 32 octets aleatoires en base64url : le secret du lien */
    #[ORM\Column(length: 64, unique: true)]
    private string $token;

    #[ORM\Column]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $revokedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy;

    #[ORM\Column]
    private int $views = 0;

    public function __construct(Document $document, int $days, ?User $createdBy)
    {
        $this->id = Uuid::v7();
        $this->company = $document->getCompany();
        $this->document = $document;
        $this->token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $this->createdAt = new \DateTimeImmutable();
        $this->expiresAt = $this->createdAt->modify(sprintf('+%d days', max(1, $days)));
        $this->createdBy = $createdBy;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getDocument(): Document { return $this->document; }
    public function getToken(): string { return $this->token; }
    public function getExpiresAt(): \DateTimeImmutable { return $this->expiresAt; }
    /** Pour les tests et la demonstration */
    public function setExpiresAt(\DateTimeImmutable $v): void { $this->expiresAt = $v; }
    public function getRevokedAt(): ?\DateTimeImmutable { return $this->revokedAt; }
    public function revoke(): void { $this->revokedAt ??= new \DateTimeImmutable(); }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getViews(): int { return $this->views; }
    public function viewed(): void { ++$this->views; }
    public function isActive(): bool { return $this->revokedAt === null && $this->expiresAt > new \DateTimeImmutable(); }
}
