<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/** Dossier de l'arborescence d'un chantier (F-02), cree depuis le modele de l'entreprise. */
#[ORM\Entity]
#[ORM\Table(name: 'folder')]
#[ORM\Index(columns: ['site_id'])]
class Folder implements TenantOwned
{
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
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Folder $parent;

    #[ORM\Column(length: 120)]
    private string $name;

    /** plans, devis, factures, pv, photos, administratif, divers, ou custom */
    #[ORM\Column(length: 30)]
    private string $kind;

    #[ORM\Column]
    private int $position;

    public function __construct(Site $site, string $name, string $kind, int $position = 0, ?Folder $parent = null)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->name = $name;
        $this->kind = $kind;
        $this->position = $position;
        $this->parent = $parent;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getParent(): ?Folder { return $this->parent; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getKind(): string { return $this->kind; }
    public function getPosition(): int { return $this->position; }
}
