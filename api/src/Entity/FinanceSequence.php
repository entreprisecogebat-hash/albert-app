<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Compteur de numerotation par entreprise, par type et par annee ("F-2026", "D-2026").
 * Lu et incremente sous verrou de ligne (SELECT ... FOR UPDATE) : deux emissions simultanees
 * ne peuvent pas obtenir le meme numero, et un numero n'est consomme qu'a l'emission.
 */
#[ORM\Entity]
#[ORM\Table(name: 'finance_sequence')]
#[ORM\UniqueConstraint(columns: ['company_id', 'prefix'])]
class FinanceSequence implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\Column(length: 12)]
    private string $prefix;

    #[ORM\Column]
    private int $last = 0;

    public function __construct(Company $company, string $prefix)
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->prefix = $prefix;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getPrefix(): string { return $this->prefix; }
    public function next(): int { return ++$this->last; }
    public function getLast(): int { return $this->last; }
}
