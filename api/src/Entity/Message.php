<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'message')]
#[ORM\Index(columns: ['channel_id', 'created_at'])]
class Message implements TenantOwned
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Company $company;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Channel $channel;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $author;

    #[ORM\Column(type: Types::TEXT)]
    private string $body;

    /** Heure d'ecriture sur le telephone (un message ecrit hors ligne garde son heure). */
    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $receivedAt;

    #[ORM\Column(type: 'uuid', unique: true, nullable: true)]
    private ?Uuid $clientId;

    /** Note vocale jointe au message (le corps porte alors un libelle lisible partout). */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $audioKey = null;

    #[ORM\Column(length: 60, nullable: true)]
    private ?string $audioMime = null;

    #[ORM\Column(nullable: true)]
    private ?int $audioDurationMs = null;

    public function __construct(Channel $channel, ?User $author, string $body, ?Uuid $clientId, ?\DateTimeImmutable $writtenAt = null)
    {
        $this->id = Uuid::v7();
        $this->company = $channel->getCompany();
        $this->channel = $channel;
        $this->author = $author;
        $this->body = $body;
        $this->clientId = $clientId;
        $this->receivedAt = new \DateTimeImmutable();
        // Une heure d'ecriture dans le futur n'est pas credible : on borne a la reception.
        $this->createdAt = ($writtenAt && $writtenAt < $this->receivedAt) ? $writtenAt : $this->receivedAt;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getChannel(): Channel { return $this->channel; }
    public function getAuthor(): ?User { return $this->author; }
    public function getBody(): string { return $this->body; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getReceivedAt(): \DateTimeImmutable { return $this->receivedAt; }
    public function getClientId(): ?Uuid { return $this->clientId; }
    public function getAudioKey(): ?string { return $this->audioKey; }
    public function getAudioMime(): ?string { return $this->audioMime; }
    public function getAudioDurationMs(): ?int { return $this->audioDurationMs; }

    public function attachAudio(string $key, string $mime, int $durationMs): void
    {
        $this->audioKey = $key;
        $this->audioMime = $mime;
        $this->audioDurationMs = $durationMs;
    }
}
