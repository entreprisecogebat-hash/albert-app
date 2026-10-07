<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Canal de messagerie d'un chantier (F-19, F-20).
 * Deux canaux par chantier : "internal" pour l'equipe, "client" partage avec le maitre d'ouvrage.
 */
#[ORM\Entity]
#[ORM\Table(name: 'channel')]
#[ORM\UniqueConstraint(columns: ['site_id', 'kind'])]
class Channel implements TenantOwned
{
    public const KIND_INTERNAL = 'internal';
    public const KIND_CLIENT = 'client';

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

    /** "Reponse attendue" : le client a ecrit et personne de l'equipe n'a encore repondu. */
    #[ORM\Column]
    private bool $awaitingReply = false;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastMessageAt = null;

    public function __construct(Site $site, string $kind)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->kind = $kind === self::KIND_CLIENT ? self::KIND_CLIENT : self::KIND_INTERNAL;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getKind(): string { return $this->kind; }
    public function isClient(): bool { return $this->kind === self::KIND_CLIENT; }
    public function isAwaitingReply(): bool { return $this->awaitingReply; }
    public function getLastMessageAt(): ?\DateTimeImmutable { return $this->lastMessageAt; }

    public function onMessage(Message $m): void
    {
        $this->lastMessageAt = $m->getCreatedAt();
        if ($this->isClient()) {
            $this->awaitingReply = $m->getAuthor()?->isClient() ?? false;
        }
    }
}
