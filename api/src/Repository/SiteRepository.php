<?php

namespace App\Repository;

use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<Site> */
class SiteRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Site::class);
    }

    /**
     * Les chantiers dont l'utilisateur est membre, les plus actifs en premier.
     * @return list<SiteMember> (site deja charge)
     */
    public function findForMember(User $user, ?string $q, bool $includeArchived = false): array
    {
        $qb = $this->getEntityManager()->createQueryBuilder()
            ->select('m', 's')
            ->from(SiteMember::class, 'm')
            ->join('m.site', 's')
            ->where('m.user = :u')->setParameter('u', $user)
            ->orderBy('s.lastActivityAt', 'DESC');
        if (!$includeArchived) {
            $qb->andWhere('s.status = :st')->setParameter('st', Site::STATUS_ACTIVE);
        }
        if ($q) {
            $qb->andWhere('LOWER(s.name) LIKE :q OR LOWER(s.address) LIKE :q OR LOWER(s.reference) LIKE :q')
                ->setParameter('q', '%'.mb_strtolower($q).'%');
        }
        return $qb->getQuery()->getResult();
    }

    /** @return list<Site> */
    public function adminSearch(?string $q, ?string $status): array
    {
        $qb = $this->createQueryBuilder('s')->orderBy('s.lastActivityAt', 'DESC');
        if ($q) {
            $qb->andWhere('LOWER(s.name) LIKE :q OR LOWER(s.address) LIKE :q OR LOWER(s.reference) LIKE :q OR LOWER(s.clientName) LIKE :q')
                ->setParameter('q', '%'.mb_strtolower($q).'%');
        }
        if ($status) {
            $qb->andWhere('s.status = :st')->setParameter('st', $status);
        }
        return $qb->getQuery()->getResult();
    }
}
