<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Jeton de session longue duree ("Vous restez connecte ensuite").
 * Seul le hash SHA-256 est stocke ; le jeton en clair n'est remis qu'une fois.
 */
#[ORM\Entity]
#[ORM\Table(name: 'api_token')]
class ApiToken
{
    public const TTL = '+180 days';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 64, unique: true)]
    private string $tokenHash;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $deviceName;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastUsedAt = null;

    private function __construct(User $user, string $tokenHash, ?string $deviceName)
    {
        $this->id = Uuid::v7();
        $this->user = $user;
        $this->tokenHash = $tokenHash;
        $this->deviceName = $deviceName;
        $this->createdAt = new \DateTimeImmutable();
        $this->expiresAt = $this->createdAt->modify(self::TTL);
    }

    /** @return array{0: self, 1: string} le jeton et sa valeur en clair */
    public static function issue(User $user, ?string $deviceName = null): array
    {
        $plain = 'alb_'.bin2hex(random_bytes(32));
        return [new self($user, hash('sha256', $plain), $deviceName), $plain];
    }

    public static function hashOf(string $plain): string { return hash('sha256', $plain); }

    public function getUser(): User { return $this->user; }
    public function isValid(): bool { return $this->expiresAt > new \DateTimeImmutable() && $this->user->isActive(); }
    public function touch(): void { $this->lastUsedAt = new \DateTimeImmutable(); }
}
