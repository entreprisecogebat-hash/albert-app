<?php

namespace App\Service;

use App\Entity\Site;
use App\Entity\SiteMember;
use App\Entity\User;
use App\Repository\SiteMemberRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Uuid;

/**
 * Droits par chantier (F-22). Un utilisateur ne voit un chantier que s'il en est membre ;
 * un administrateur de l'entreprise voit tous les chantiers de son entreprise.
 */
final class SiteAccess
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SiteMemberRepository $members,
    ) {}

    public function site(string $id): Site
    {
        if (!Uuid::isValid($id)) {
            throw new NotFoundHttpException('Chantier introuvable.');
        }
        // Le filtre tenant s'applique : un chantier d'une autre entreprise est introuvable.
        $site = $this->em->find(Site::class, Uuid::fromString($id));
        if (!$site) {
            throw new NotFoundHttpException('Chantier introuvable.');
        }
        return $site;
    }

    /** Membre du chantier, ou administrateur (traite comme un responsable de chantier). */
    public function member(Site $site, User $user): SiteMember
    {
        if ($site->getCompany()->getId()->toRfc4122() !== $user->getCompany()->getId()->toRfc4122()) {
            throw new NotFoundHttpException('Chantier introuvable.');
        }
        $m = $this->members->findMembership($site, $user);
        if ($m) {
            return $m;
        }
        if ($user->isAdmin() && !$user->isClient()) {
            // Membre virtuel, non persiste
            return new SiteMember($site, $user, SiteMember::ROLE_MANAGER);
        }
        throw new AccessDeniedHttpException("Vous n'avez pas accès à ce chantier.");
    }

    public function requireManager(SiteMember $m): void
    {
        if (!$m->isManager()) {
            throw new AccessDeniedHttpException('Réservé aux responsables du chantier.');
        }
    }

    public function requireStaff(SiteMember $m): void
    {
        if ($m->isClient()) {
            throw new AccessDeniedHttpException("Cette action est réservée à l'équipe.");
        }
    }
}
