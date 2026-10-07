<?php

namespace App\Repository;

use App\Entity\ActivityEvent;
use App\Entity\Document;
use App\Entity\Site;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<ActivityEvent> */
class ActivityEventRepository extends ServiceEntityRepository
{
    public const FILTERS = [
        'photos' => [ActivityEvent::PHOTOS_ADDED],
        'documents' => [ActivityEvent::DOCUMENT_ADDED, ActivityEvent::DOCUMENT_VERSION, ActivityEvent::DOCUMENT_RECLASSIFIED, ActivityEvent::INTERVENTION_SIGNED, ActivityEvent::DOE_GENERATED],
        'messages' => [ActivityEvent::MESSAGE],
    ];

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ActivityEvent::class);
    }

    /** @return list<ActivityEvent> du plus recent au plus ancien */
    /** @param list<string> $excludeTypes types masques (les evenements financiers pour qui n'y a pas acces) */
    public function feed(Site $site, bool $clientOnly, ?string $filter, ?\DateTimeImmutable $before, int $limit = 30, array $excludeTypes = []): array
    {
        $qb = $this->createQueryBuilder('e')
            ->leftJoin('e.actor', 'a')->addSelect('a')
            ->where('e.site = :s')->setParameter('s', $site)
            ->orderBy('e.occurredAt', 'DESC')->addOrderBy('e.id', 'DESC')
            ->setMaxResults($limit);
        if ($clientOnly) {
            $qb->andWhere('e.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
        }
        if ($excludeTypes) {
            $qb->andWhere('e.type NOT IN (:excluded)')->setParameter('excluded', $excludeTypes);
        }
        if ($filter && isset(self::FILTERS[$filter])) {
            $qb->andWhere('e.type IN (:types)')->setParameter('types', self::FILTERS[$filter]);
        }
        if ($before) {
            $qb->andWhere('e.occurredAt < :b')->setParameter('b', $before);
        }
        return $qb->getQuery()->getResult();
    }

    public function countSince(Site $site, \DateTimeImmutable $since, bool $clientOnly, ?string $excludeActorId, array $excludeTypes = []): int
    {
        $qb = $this->createQueryBuilder('e')->select('COUNT(e.id)')
            ->leftJoin('e.actor', 'a')
            ->where('e.site = :s')->andWhere('e.recordedAt > :since')
            ->setParameter('s', $site)->setParameter('since', $since);
        if ($excludeTypes) {
            $qb->andWhere('e.type NOT IN (:excluded)')->setParameter('excluded', $excludeTypes);
        }
        if ($clientOnly) {
            $qb->andWhere('e.visibility = :v')->setParameter('v', Document::VISIBILITY_CLIENT);
        }
        if ($excludeActorId) {
            $qb->andWhere('a.id IS NULL OR a.id != :me')->setParameter('me', $excludeActorId);
        }
        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function latest(Site $site, bool $clientOnly, array $excludeTypes = []): ?ActivityEvent
    {
        return $this->feed($site, $clientOnly, null, null, 1, $excludeTypes)[0] ?? null;
    }

    /** Evenements lies a un document (pour l'ecran "Je prouve") */
    public function forDocument(Document $doc): array
    {
        return $this->createQueryBuilder('e')
            ->where('e.site = :s')->setParameter('s', $doc->getSite())
            ->andWhere('e.documentRef = :d')
            ->setParameter('d', $doc->getId(), 'uuid')
            ->orderBy('e.occurredAt', 'DESC')
            ->getQuery()->getResult();
    }
}
