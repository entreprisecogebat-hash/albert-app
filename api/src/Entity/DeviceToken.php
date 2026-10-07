<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Jeton de notification push d'un telephone (Expo, qui relaie vers APNs et FCM). */
#[ORM\Entity]
#[ORM\Table(name: 'device_token')]
class DeviceToken implements TenantOwned
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

    #[ORM\Column(length: 255, unique: true)]
    private string $token;

    #[ORM\Column(length: 10)]
    private string $platform;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(User $user, string $token, string $platform)
    {
        $this->id = Uuid::v7();
        $this->company = $user->getCompany();
        $this->user = $user;
        $this->token = $token;
        $this->platform = $platform;
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getCompany(): Company { return $this->company; }
    public function getUser(): User { return $this->user; }
    public function getToken(): string { return $this->token; }
    public function reassign(User $user, string $platform): void
    {
        $this->user = $user;
        $this->company = $user->getCompany();
        $this->platform = $platform;
        $this->updatedAt = new \DateTimeImmutable();
    }
}
