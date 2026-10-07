<?php

namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<User> */
class UserRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    /** @return list<User> */
    public function search(?string $q, ?string $kind): array
    {
        $qb = $this->createQueryBuilder('u')->orderBy('u.lastName')->addOrderBy('u.firstName');
        if ($q) {
            $qb->andWhere('LOWER(u.firstName) LIKE :q OR LOWER(u.lastName) LIKE :q OR u.phone LIKE :q OR LOWER(u.jobTitle) LIKE :q')
                ->setParameter('q', '%'.mb_strtolower($q).'%');
        }
        if ($kind) {
            $qb->andWhere('u.kind = :k')->setParameter('k', $kind);
        }
        return $qb->getQuery()->getResult();
    }
}
