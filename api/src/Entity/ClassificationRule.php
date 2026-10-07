<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Regle de depot (etape 01 du classement, gratuite) : un motif sur le nom du fichier
 * donne le type du document et son dossier. Ecrites au cadrage, editables au back-office.
 * Chaque correction d'un utilisateur peut devenir une nouvelle regle (source = "learned").
 */
#[ORM\Entity]
#[ORM\Table(name: 'classification_rule')]
class ClassificationRule implements TenantOwned
{
    /** Regles livrees par defaut, ordre = priorite. Motifs insensibles a la casse et aux accents. */
    public const DEFAULTS = [
        ['pattern' => '\b(plan|plans|calepinage|coupe|facade|elevation|niveau|r\+?\d|dwg|archi)\b', 'type' => 'plan', 'folderKind' => 'plans'],
        ['pattern' => '\b(devis|dqe|dpgf|chiffrage|proposition)\b', 'type' => 'devis', 'folderKind' => 'devis'],
        ['pattern' => '\b(facture|fact|fa|avoir|situation)\b', 'type' => 'facture', 'folderKind' => 'factures'],
        ['pattern' => '\b(pv|proces[ -]?verbal|compte[ -]?rendu|cr|reception|reserves?|osr|os)\b', 'type' => 'pv', 'folderKind' => 'pv'],
        ['pattern' => '\b(kbis|attestation|assurance|decennale|urssaf|contrat|dict|ppsps|doe)\b', 'type' => 'administratif', 'folderKind' => 'administratif'],
    ];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    /** Expression reguliere (sans delimiteurs), appliquee au nom de fichier normalise */
    #[ORM\Column(length: 255)]
    private string $pattern;

    #[ORM\Column(length: 20)]
    private string $type;

    #[ORM\Column(length: 30)]
    private string $folderKind;

    #[ORM\Column]
    private int $priority;

    /** default | admin | learned */
    #[ORM\Column(length: 10)]
    private string $source;

    #[ORM\Column]
    private int $hits = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Company $company, string $pattern, string $type, string $folderKind, int $priority, string $source = 'admin')
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->pattern = $pattern;
        $this->type = $type;
        $this->folderKind = $folderKind;
        $this->priority = $priority;
        $this->source = $source;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getPattern(): string { return $this->pattern; }
    public function getType(): string { return $this->type; }
    public function getFolderKind(): string { return $this->folderKind; }
    public function getPriority(): int { return $this->priority; }
    public function getSource(): string { return $this->source; }
    public function getHits(): int { return $this->hits; }
    public function hit(): void { ++$this->hits; }
    public function update(string $pattern, string $type, string $folderKind, int $priority): void
    {
        $this->pattern = $pattern;
        $this->type = $type;
        $this->folderKind = $folderKind;
        $this->priority = $priority;
    }

    public function matches(string $normalizedName): bool
    {
        $re = '~'.str_replace('~', '\~', $this->pattern).'~iu';
        return @preg_match($re, $normalizedName) === 1;
    }

    public static function isValidPattern(string $pattern): bool
    {
        return @preg_match('~'.str_replace('~', '\~', $pattern).'~iu', '') !== false;
    }
}
