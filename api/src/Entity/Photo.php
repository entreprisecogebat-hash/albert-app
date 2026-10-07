<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Photo horodatee et geolocalisee (F-09).
 * takenAt et les coordonnees viennent du telephone au moment de la prise, pas de l'envoi :
 * une photo prise en sous-sol a 9:42 et envoyee a 11:10 reste datee de 9:42.
 * batchId regroupe les photos prises ensemble ("4 photos" dans le fil).
 */
#[ORM\Entity]
#[ORM\Table(name: 'photo')]
#[ORM\Index(columns: ['site_id', 'taken_at'])]
#[ORM\Index(columns: ['batch_id'])]
class Photo implements TenantOwned
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

    #[ORM\Column(type: 'uuid')]
    private Uuid $batchId;

    #[ORM\Column(length: 255)]
    private string $fileKey;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $thumbKey = null;

    #[ORM\Column(length: 60)]
    private string $mimeType;

    #[ORM\Column(type: Types::BIGINT)]
    private string $size;

    #[ORM\Column(length: 64)]
    private string $sha256;

    #[ORM\Column(nullable: true)]
    private ?int $width = null;

    #[ORM\Column(nullable: true)]
    private ?int $height = null;

    #[ORM\Column]
    private \DateTimeImmutable $takenAt;

    #[ORM\Column(nullable: true)]
    private ?float $latitude;

    #[ORM\Column(nullable: true)]
    private ?float $longitude;

    #[ORM\Column(nullable: true)]
    private ?float $accuracy;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $caption;

    #[ORM\Column(length: 10)]
    private string $visibility = Document::VISIBILITY_TEAM;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $uploadedBy;

    #[ORM\Column]
    private \DateTimeImmutable $uploadedAt;

    #[ORM\Column(type: 'uuid', unique: true, nullable: true)]
    private ?Uuid $clientId;

    public function __construct(
        Site $site,
        Uuid $batchId,
        string $fileKey,
        string $mimeType,
        int $size,
        string $sha256,
        \DateTimeImmutable $takenAt,
        ?float $latitude,
        ?float $longitude,
        ?float $accuracy,
        ?string $caption,
        string $visibility,
        ?User $uploadedBy,
        ?Uuid $clientId,
    ) {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->batchId = $batchId;
        $this->fileKey = $fileKey;
        $this->mimeType = $mimeType;
        $this->size = (string) $size;
        $this->sha256 = $sha256;
        $this->takenAt = $takenAt;
        $this->latitude = $latitude;
        $this->longitude = $longitude;
        $this->accuracy = $accuracy;
        $this->caption = $caption ?: null;
        $this->visibility = $visibility === Document::VISIBILITY_CLIENT ? $visibility : Document::VISIBILITY_TEAM;
        $this->uploadedBy = $uploadedBy;
        $this->clientId = $clientId;
        $this->uploadedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getBatchId(): Uuid { return $this->batchId; }
    public function getFileKey(): string { return $this->fileKey; }
    public function getThumbKey(): ?string { return $this->thumbKey; }
    public function setThumbnail(string $key, int $width, int $height): void { $this->thumbKey = $key; $this->width = $width; $this->height = $height; }
    public function getMimeType(): string { return $this->mimeType; }
    public function getSize(): int { return (int) $this->size; }
    public function getSha256(): string { return $this->sha256; }
    public function getWidth(): ?int { return $this->width; }
    public function getHeight(): ?int { return $this->height; }
    public function getTakenAt(): \DateTimeImmutable { return $this->takenAt; }
    public function getLatitude(): ?float { return $this->latitude; }
    public function getLongitude(): ?float { return $this->longitude; }
    public function getAccuracy(): ?float { return $this->accuracy; }
    public function getCaption(): ?string { return $this->caption; }
    public function getVisibility(): string { return $this->visibility; }
    public function getUploadedBy(): ?User { return $this->uploadedBy; }
    public function getUploadedAt(): \DateTimeImmutable { return $this->uploadedAt; }
    public function getClientId(): ?Uuid { return $this->clientId; }
}
