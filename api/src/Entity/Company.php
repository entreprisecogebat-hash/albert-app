<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Entreprise cliente d'Albert (le "tenant"). Cogebat, Patenotte, puis les abonnes.
 */
#[ORM\Entity]
#[ORM\Table(name: 'company')]
class Company
{
    /** Arborescence creee automatiquement a l'ouverture d'un chantier (F-02). */
    public const DEFAULT_FOLDER_TEMPLATE = [
        ['kind' => 'plans', 'name' => 'Plans'],
        ['kind' => 'devis', 'name' => 'Devis'],
        ['kind' => 'factures', 'name' => 'Factures'],
        ['kind' => 'pv', 'name' => 'PV et comptes rendus'],
        ['kind' => 'photos', 'name' => 'Photos'],
        ['kind' => 'administratif', 'name' => 'Administratif'],
        ['kind' => 'divers', 'name' => 'Divers'],
    ];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(length: 120)]
    private string $name;

    #[ORM\Column(length: 80, unique: true)]
    private string $slug;

    /** @var list<array{kind: string, name: string}> */
    #[ORM\Column(type: Types::JSON)]
    private array $folderTemplate = self::DEFAULT_FOLDER_TEMPLATE;

    /** Option IA (F-16, F-17), activable par entreprise. Hors V1 de base. */
    #[ORM\Column]
    private bool $aiEnabled = false;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $name, string $slug)
    {
        $this->id = Uuid::v7();
        $this->name = $name;
        $this->slug = $slug;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $name): void { $this->name = $name; }
    public function getSlug(): string { return $this->slug; }
    public function getFolderTemplate(): array { return $this->folderTemplate; }
    public function setFolderTemplate(array $template): void { $this->folderTemplate = array_values($template); }
    public function isAiEnabled(): bool { return $this->aiEnabled; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
