<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Une version deposee d'un document. Immuable : c'est la preuve.
 * clientId : identifiant genere par le telephone, rend le rejeu hors ligne idempotent.
 */
#[ORM\Entity]
#[ORM\Table(name: 'document_version')]
#[ORM\Index(columns: ['company_id', 'sha256'])]
class DocumentVersion implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Document $document;

    #[ORM\Column]
    private int $number;

    /** Indice lu sur le document s'il existe (V3, Ind. B) ; sinon "V{number}" */
    #[ORM\Column(length: 20)]
    private string $label;

    #[ORM\Column(length: 255)]
    private string $fileKey;

    #[ORM\Column(length: 255)]
    private string $originalName;

    #[ORM\Column(length: 120)]
    private string $mimeType;

    #[ORM\Column(type: Types::BIGINT)]
    private string $size;

    #[ORM\Column(length: 64)]
    private string $sha256;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $comment;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $uploadedBy;

    #[ORM\Column]
    private \DateTimeImmutable $uploadedAt;

    #[ORM\Column(type: 'uuid', unique: true, nullable: true)]
    private ?Uuid $clientId;

    public function __construct(
        Document $document,
        int $number,
        string $label,
        string $fileKey,
        string $originalName,
        string $mimeType,
        int $size,
        string $sha256,
        ?string $comment,
        ?User $uploadedBy,
        ?Uuid $clientId,
        ?\DateTimeImmutable $uploadedAt = null,
    ) {
        $this->id = Uuid::v7();
        $this->company = $document->getCompany();
        $this->document = $document;
        $this->number = $number;
        $this->label = $label;
        $this->fileKey = $fileKey;
        $this->originalName = $originalName;
        $this->mimeType = $mimeType;
        $this->size = (string) $size;
        $this->sha256 = $sha256;
        $this->comment = $comment ?: null;
        $this->uploadedBy = $uploadedBy;
        $this->clientId = $clientId;
        $this->uploadedAt = $uploadedAt ?? new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getDocument(): Document { return $this->document; }
    public function getNumber(): int { return $this->number; }
    public function getLabel(): string { return $this->label; }
    public function getFileKey(): string { return $this->fileKey; }
    public function getOriginalName(): string { return $this->originalName; }
    public function getMimeType(): string { return $this->mimeType; }
    public function getSize(): int { return (int) $this->size; }
    public function getSha256(): string { return $this->sha256; }
    public function getComment(): ?string { return $this->comment; }
    public function getUploadedBy(): ?User { return $this->uploadedBy; }
    public function getUploadedAt(): \DateTimeImmutable { return $this->uploadedAt; }
    public function getClientId(): ?Uuid { return $this->clientId; }
}
