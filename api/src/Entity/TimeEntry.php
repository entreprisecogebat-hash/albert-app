<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Pointage virtuel (F-10, F-11) : arrivee et depart sur un chantier, avec la position du telephone.
 * Un seul pointage ouvert par personne. La distance au chantier est calculee a l'arrivee.
 */
#[ORM\Entity]
#[ORM\Table(name: 'time_entry')]
#[ORM\Index(columns: ['user_id', 'started_at'])]
#[ORM\Index(columns: ['site_id', 'started_at'])]
class TimeEntry implements TenantOwned
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
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column]
    private \DateTimeImmutable $startedAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endedAt = null;

    #[ORM\Column(nullable: true)]
    private ?float $startLatitude = null;

    #[ORM\Column(nullable: true)]
    private ?float $startLongitude = null;

    #[ORM\Column(nullable: true)]
    private ?float $startAccuracy = null;

    /** Distance au chantier a l'arrivee, en metres */
    #[ORM\Column(nullable: true)]
    private ?int $startDistance = null;

    #[ORM\Column(nullable: true)]
    private ?float $endLatitude = null;

    #[ORM\Column(nullable: true)]
    private ?float $endLongitude = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $note = null;

    /** Identifiants generes par le telephone : arrivee et depart rejouables hors ligne sans doublon */
    #[ORM\Column(type: 'uuid', unique: true, nullable: true)]
    private ?Uuid $clientId = null;

    #[ORM\Column(type: 'uuid', unique: true, nullable: true)]
    private ?Uuid $endClientId = null;

    public function __construct(Site $site, User $user, \DateTimeImmutable $startedAt, ?Uuid $clientId = null)
    {
        $this->id = Uuid::v7();
        $this->company = $site->getCompany();
        $this->site = $site;
        $this->user = $user;
        $this->startedAt = $startedAt;
        $this->clientId = $clientId;
    }

    public function getId(): Uuid { return $this->id; }
    public function getCompany(): Company { return $this->company; }
    public function getSite(): Site { return $this->site; }
    public function getUser(): User { return $this->user; }
    public function getStartedAt(): \DateTimeImmutable { return $this->startedAt; }
    public function getEndedAt(): ?\DateTimeImmutable { return $this->endedAt; }
    public function isOpen(): bool { return $this->endedAt === null; }
    public function getStartLatitude(): ?float { return $this->startLatitude; }
    public function getStartLongitude(): ?float { return $this->startLongitude; }
    public function getStartAccuracy(): ?float { return $this->startAccuracy; }
    public function getStartDistance(): ?int { return $this->startDistance; }
    public function getEndLatitude(): ?float { return $this->endLatitude; }
    public function getEndLongitude(): ?float { return $this->endLongitude; }
    public function getNote(): ?string { return $this->note; }
    public function setNote(?string $v): void { $this->note = $v ?: null; }
    public function getClientId(): ?Uuid { return $this->clientId; }
    public function getEndClientId(): ?Uuid { return $this->endClientId; }

    public function setStart(?float $lat, ?float $lng, ?float $accuracy, ?int $distance): void
    {
        $this->startLatitude = $lat;
        $this->startLongitude = $lng;
        $this->startAccuracy = $accuracy;
        $this->startDistance = $distance;
    }

    public function close(\DateTimeImmutable $at, ?float $lat = null, ?float $lng = null, ?Uuid $clientId = null): void
    {
        // Un depart avant l'arrivee n'est pas credible : on borne.
        $this->endedAt = $at < $this->startedAt ? $this->startedAt : $at;
        $this->endLatitude = $lat;
        $this->endLongitude = $lng;
        $this->endClientId = $clientId;
    }

    /** Duree en minutes ; un pointage ouvert compte jusqu'a $now. */
    public function minutes(?\DateTimeImmutable $now = null): int
    {
        $end = $this->endedAt ?? $now ?? new \DateTimeImmutable();
        return max(0, intdiv($end->getTimestamp() - $this->startedAt->getTimestamp(), 60));
    }
}
