<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Role d'un utilisateur sur un chantier (F-22, droits par chantier).
 *  - manager : conducteur de travaux, chef de chantier. Tout voir, tout gerer sur le chantier.
 *  - worker  : compagnon, sous-traitant. Voit et alimente le canal interne.
 *  - client  : maitre d'ouvrage. Ne voit que le canal client et ce qui lui est partage.
 */
#[ORM\Entity(repositoryClass: \App\Repository\SiteMemberRepository::class)]
#[ORM\Table(name: 'site_member')]
#[ORM\UniqueConstraint(columns: ['site_id', 'user_id'])]
class SiteMember implements TenantOwned
{
    public const ROLE_MANAGER = 'manager';
    public const ROLE_WORKER = 'worker';
    public const ROLE_CLIENT = 'client';
    public const ROLES = [self::ROLE_MANAGER, self::ROLE_WORKER, self::ROLE_CLIENT];

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
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 10)]
    private string $role;

    /** Pour calculer les "nouveautes" sur la carte chantier */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastSeenAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $addedAt;

    public function __construct(Site $site, User $user, string $role)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->user = $user;
        $this->setRole($role);
        $this->addedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getUser(): User { return $this->user; }
    public function getRole(): string { return $this->role; }
    public function setRole(string $role): void
    {
        if (!in_array($role, self::ROLES, true)) {
            throw new \InvalidArgumentException('Role inconnu : '.$role);
        }
        $this->role = $role;
    }
    public function isClient(): bool { return $this->role === self::ROLE_CLIENT; }
    public function isManager(): bool { return $this->role === self::ROLE_MANAGER; }
    /** Le client ne voit que ce qui est marque "visible aussi par le client". */
    public function seesTeamContent(): bool { return !$this->isClient(); }
    public function getLastSeenAt(): ?\DateTimeImmutable { return $this->lastSeenAt; }
    public function markSeen(): void { $this->lastSeenAt = new \DateTimeImmutable(); }
    public function getAddedAt(): \DateTimeImmutable { return $this->addedAt; }
}
