<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Un utilisateur se connecte par son numero de telephone professionnel et un code SMS.
 * Aucun mot de passe. Pas d'inscription depuis l'application : un administrateur l'ajoute.
 */
#[ORM\Entity(repositoryClass: \App\Repository\UserRepository::class)]
#[ORM\Table(name: 'app_user')]
#[ORM\Index(columns: ['company_id'])]
class User implements UserInterface, TenantOwned
{
    public const KIND_STAFF = 'staff';
    public const KIND_CLIENT = 'client';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    /** Format E.164, ex. +33612345678 */
    #[ORM\Column(length: 20, unique: true)]
    private string $phone;

    #[ORM\Column(length: 80)]
    private string $firstName;

    #[ORM\Column(length: 80)]
    private string $lastName;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $jobTitle = null;

    /** staff = salarie de l'entreprise, client = maitre d'ouvrage invite sur un chantier */
    #[ORM\Column(length: 10)]
    private string $kind = self::KIND_STAFF;

    /** Acces au back-office d'administration */
    #[ORM\Column]
    private bool $admin = false;

    #[ORM\Column]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastLoginAt = null;

    public function __construct(Company $company, string $phone, string $firstName, string $lastName)
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->phone = $phone;
        $this->firstName = $firstName;
        $this->lastName = $lastName;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getPhone(): string { return $this->phone; }
    public function setPhone(string $phone): void { $this->phone = $phone; }
    public function getFirstName(): string { return $this->firstName; }
    public function setFirstName(string $v): void { $this->firstName = $v; }
    public function getLastName(): string { return $this->lastName; }
    public function setLastName(string $v): void { $this->lastName = $v; }
    public function getFullName(): string { return trim($this->firstName.' '.$this->lastName); }
    public function getJobTitle(): ?string { return $this->jobTitle; }
    public function setJobTitle(?string $v): void { $this->jobTitle = $v ?: null; }
    public function getKind(): string { return $this->kind; }
    public function setKind(string $kind): void { $this->kind = $kind === self::KIND_CLIENT ? self::KIND_CLIENT : self::KIND_STAFF; }
    public function isClient(): bool { return $this->kind === self::KIND_CLIENT; }
    public function isAdmin(): bool { return $this->admin; }
    public function setAdmin(bool $admin): void { $this->admin = $admin; }
    public function isActive(): bool { return $this->active; }
    public function setActive(bool $active): void { $this->active = $active; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getLastLoginAt(): ?\DateTimeImmutable { return $this->lastLoginAt; }
    public function touchLogin(): void { $this->lastLoginAt = new \DateTimeImmutable(); }

    public function getRoles(): array
    {
        $roles = ['ROLE_USER'];
        if ($this->admin && !$this->isClient()) {
            $roles[] = 'ROLE_ADMIN';
        }
        return $roles;
    }

    public function getUserIdentifier(): string { return $this->phone; }
    public function eraseCredentials(): void {}
}
