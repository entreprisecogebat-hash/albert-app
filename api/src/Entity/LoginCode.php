<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Code a 6 chiffres envoye par SMS. Seule son empreinte est stockee. */
#[ORM\Entity]
#[ORM\Table(name: 'login_code')]
#[ORM\Index(columns: ['phone'])]
class LoginCode
{
    public const TTL = '+10 minutes';
    public const MAX_ATTEMPTS = 5;

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(length: 20)]
    private string $phone;

    #[ORM\Column(length: 255)]
    private string $codeHash;

    #[ORM\Column]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column]
    private int $attempts = 0;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $consumedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $phone, string $code)
    {
        $this->id = Uuid::v7();
        $this->phone = $phone;
        $this->codeHash = password_hash($code, PASSWORD_DEFAULT);
        $this->createdAt = new \DateTimeImmutable();
        $this->expiresAt = $this->createdAt->modify(self::TTL);
    }

    public function getPhone(): string { return $this->phone; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function isUsable(): bool
    {
        return $this->consumedAt === null
            && $this->attempts < self::MAX_ATTEMPTS
            && $this->expiresAt > new \DateTimeImmutable();
    }

    public function verify(string $code): bool
    {
        if (!$this->isUsable()) {
            return false;
        }
        ++$this->attempts;
        if (password_verify($code, $this->codeHash)) {
            $this->consumedAt = new \DateTimeImmutable();
            return true;
        }
        return false;
    }
}
