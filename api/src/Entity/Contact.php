<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Fiche CRM (F-01, F-03) : prospect, client, fournisseur, partenaire ou sous-traitant.
 * Reservee a l'equipe : un client ne voit jamais le carnet d'adresses de l'entreprise.
 */
#[ORM\Entity]
#[ORM\Table(name: 'contact')]
#[ORM\Index(columns: ['company_id', 'kind'])]
#[ORM\Index(columns: ['company_id', 'email'])]
#[ORM\Index(columns: ['company_id', 'phone'])]
class Contact implements TenantOwned
{
    public const KINDS = ['prospect', 'client', 'fournisseur', 'partenaire', 'sous_traitant'];

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\Column(length: 20)]
    private string $kind;

    #[ORM\Column(length: 160)]
    private string $name;

    #[ORM\Column(length: 160, nullable: true)]
    private ?string $companyName = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $jobTitle = null;

    /** E.164 si le numero est reconnu, sinon tel que saisi */
    #[ORM\Column(length: 40, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(length: 180, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $address = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $notes = null;

    /** @var Collection<int, Site> */
    #[ORM\ManyToMany(targetEntity: Site::class)]
    #[ORM\JoinTable(name: 'contact_site')]
    #[ORM\JoinColumn(onDelete: 'CASCADE')]
    #[ORM\InverseJoinColumn(onDelete: 'CASCADE')]
    private Collection $sites;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Company $company, string $kind, string $name)
    {
        $this->id = Uuid::v7();
        $this->company = $company;
        $this->setKind($kind);
        $this->name = $name;
        $this->sites = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = $this->createdAt;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getKind(): string { return $this->kind; }
    public function setKind(string $v): void { $this->kind = in_array($v, self::KINDS, true) ? $v : 'client'; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getCompanyName(): ?string { return $this->companyName; }
    public function setCompanyName(?string $v): void { $this->companyName = $v ?: null; }
    public function getJobTitle(): ?string { return $this->jobTitle; }
    public function setJobTitle(?string $v): void { $this->jobTitle = $v ?: null; }
    public function getPhone(): ?string { return $this->phone; }
    public function setPhone(?string $v): void { $this->phone = $v ?: null; }
    public function getEmail(): ?string { return $this->email; }
    public function setEmail(?string $v): void { $this->email = $v ? mb_strtolower($v) : null; }
    public function getAddress(): ?string { return $this->address; }
    public function setAddress(?string $v): void { $this->address = $v ?: null; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): void { $this->notes = $v ?: null; }

    /** @return list<Site> */
    public function getSites(): array { return array_values($this->sites->toArray()); }
    public function addSite(Site $s): void
    {
        if (!$this->sites->contains($s)) {
            $this->sites->add($s);
        }
    }
    /** @param list<Site> $sites */
    public function setSites(array $sites): void
    {
        $this->sites->clear();
        foreach ($sites as $s) {
            $this->addSite($s);
        }
    }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
