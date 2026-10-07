<?php

namespace App\Repository;

use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<SiteMember> */
class SiteMemberRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SiteMember::class);
    }

    public function findMembership(Site $site, User $user): ?SiteMember
    {
        return $this->findOneBy(['site' => $site, 'user' => $user]);
    }

    /** @return list<SiteMember> */
    public function forSite(Site $site): array
    {
        return $this->createQueryBuilder('m')
            ->join('m.user', 'u')->addSelect('u')
            ->where('m.site = :s')->setParameter('s', $site)
            ->orderBy('m.role')->addOrderBy('u.lastName')
            ->getQuery()->getResult();
    }

    /** @return list<SiteMember> */
    public function forUser(User $user): array
    {
        return $this->createQueryBuilder('m')
            ->join('m.site', 's')->addSelect('s')
            ->where('m.user = :u')->setParameter('u', $user)
            ->orderBy('s.name')
            ->getQuery()->getResult();
    }
}
