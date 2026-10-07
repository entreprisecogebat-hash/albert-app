<?php

namespace App\Service;

use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Les chantiers d'un utilisateur et son role sur chacun, pour les vues transversales
 * (tableau du jour, toutes les taches, toutes les reserves, agenda).
 * Un administrateur de l'equipe est responsable de tous les chantiers de son entreprise.
 */
final class UserSites
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /** @return array<string, SiteMember> siteId => appartenance (virtuelle pour l'administrateur) */
    public function memberships(User $user, bool $includeArchived = false): array
    {
        $qb = $this->em->createQueryBuilder()
            ->select('m', 's')->from(SiteMember::class, 'm')->join('m.site', 's')
            ->where('m.user = :u')->setParameter('u', $user);
        if (!$includeArchived) {
            $qb->andWhere('s.status = :st')->setParameter('st', Site::STATUS_ACTIVE);
        }
        $out = [];
        foreach ($qb->getQuery()->getResult() as $m) {
            $out[(string) $m->getSite()->getId()] = $m;
        }
        if ($user->isAdmin() && !$user->isClient()) {
            $qb = $this->em->createQueryBuilder()->select('s')->from(Site::class, 's')
                ->where('s.company = :c')->setParameter('c', $user->getCompany());
            if (!$includeArchived) {
                $qb->andWhere('s.status = :st')->setParameter('st', Site::STATUS_ACTIVE);
            }
            foreach ($qb->getQuery()->getResult() as $site) {
                $id = (string) $site->getId();
                if (!isset($out[$id]) || !$out[$id]->isManager()) {
                    $out[$id] = new SiteMember($site, $user, SiteMember::ROLE_MANAGER);
                }
            }
        }
        return $out;
    }

    /** @return list<Site> */
    public function sites(User $user, bool $includeArchived = false): array
    {
        return array_values(array_map(fn (SiteMember $m) => $m->getSite(), $this->memberships($user, $includeArchived)));
    }
}
